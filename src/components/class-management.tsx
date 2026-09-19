"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchClassesWithStreams, insertStream, updateStream as updateStreamDb, deleteStream as deleteStreamDb } from "@/lib/school-api";
import { readStoredJson, writeStoredJson } from "@/lib/preferences";
import { Skeleton, Spinner, ListRowSkeleton } from "@/components/loading";

interface Stream {
  id: string;
  name: string;
}

interface FormLevel {
  level: 1 | 2 | 3 | 4;
  label: string;
  classId?: string;
  streams: Stream[];
}

type ToastType = "success" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;

const FORM_LABELS = ["Form I", "Form II", "Form III", "Form IV"];

const DEFAULT_FORMS: FormLevel[] = [
  { level: 1, label: "Form I", streams: [{ id: "f1g", name: "General" }, { id: "f1v", name: "Vocational" }] },
  { level: 2, label: "Form II", streams: [{ id: "f2g", name: "General" }, { id: "f2v", name: "Vocational" }] },
  { level: 3, label: "Form III", streams: [{ id: "f3g", name: "General" }, { id: "f3v", name: "Vocational" }] },
  { level: 4, label: "Form IV", streams: [{ id: "f4g", name: "General" }, { id: "f4v", name: "Vocational" }] },
];

const STORAGE_KEY = "school-forms";

async function loadFormsFromDb(): Promise<FormLevel[]> {
  const rows = await fetchClassesWithStreams();
  return rows.map((row) => ({
    level: row.form_level,
    label: FORM_LABELS[row.form_level - 1] ?? `Form ${row.form_level}`,
    classId: row.id,
    streams: row.streams.map((s) => ({ id: s.id, name: s.name })),
  }));
}

function isValidForms(value: unknown): value is FormLevel[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && Array.isArray((item as { streams?: unknown }).streams));
}

function loadLocalFallback(): FormLevel[] {
  return readStoredJson<FormLevel[]>(STORAGE_KEY, DEFAULT_FORMS, isValidForms);
}

function persistLocal(forms: FormLevel[]) {
  writeStoredJson(STORAGE_KEY, forms);
}

export default function ClassManagement() {
  const [forms, setForms] = useState<FormLevel[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "add" | "update" | "delete">(null);
  const [activeForm, setActiveForm] = useState<1 | 2 | 3 | 4>(1);
  const [editingStream, setEditingStream] = useState<{ formLevel: 1 | 2 | 3 | 4; stream: Stream } | null>(null);
  const [addingStream, setAddingStream] = useState<1 | 2 | 3 | 4 | null>(null);
  const [streamName, setStreamName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ formLevel: 1 | 2 | 3 | 4; streamId: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    loadFormsFromDb()
      .then((rows) => {
        if (rows.length > 0) {
          setForms(rows);
          setDbMode(true);
        } else {
          setForms(loadLocalFallback());
          setDbMode(false);
        }
      })
      .catch(() => {
        setForms(loadLocalFallback());
        setDbMode(false);
      })
      .finally(() => setLoading(false));
    return () => { timersRef.current.forEach((t) => clearTimeout(t)); };
  }, []);

  function showToast(type: ToastType, message: string) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, 5000);
    timersRef.current.set(id, timer);
  }

  function dismissToast(id: number) {
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const persistLocalForms = useCallback((next: FormLevel[]) => {
    setForms(next);
    persistLocal(next);
  }, []);

  const current = forms.find((f) => f.level === activeForm);

  async function addStream() {
    if (!streamName.trim() || addingStream === null || saving) return;
    const name = streamName.trim();
    const newStream: Stream = { id: crypto.randomUUID(), name };
    setSaving("add");

    if (dbMode) {
      try {
        const row = await insertStream(current!.classId!, name);
        newStream.id = row.id;
        setForms(forms.map((f) => f.level === addingStream ? { ...f, streams: [...f.streams, newStream] } : f));
        showToast("success", `Stream "${name}" added successfully.`);
      } catch {
        showToast("warning", "Database unavailable. Stream not saved.");
      } finally {
        setSaving(null);
      }
    } else {
      persistLocalForms(forms.map((f) => f.level === addingStream ? { ...f, streams: [...f.streams, newStream] } : f));
      showToast("success", `Stream "${name}" added successfully.`);
      setSaving(null);
    }
    setStreamName("");
    setAddingStream(null);
  }

  async function updateStream() {
    if (!editingStream || !streamName.trim() || saving) return;
    const name = streamName.trim();
    setSaving("update");
    if (dbMode) {
      try {
        await updateStreamDb(editingStream.stream.id, name);
      } catch {
        showToast("warning", "Database unavailable. Stream not updated.");
        setSaving(null);
        setStreamName("");
        setEditingStream(null);
        return;
      }
    }
    const next = forms.map((f) =>
      f.level === editingStream.formLevel
        ? { ...f, streams: f.streams.map((s) => s.id === editingStream.stream.id ? { ...s, name } : s) }
        : f
    );
    setForms(next);
    if (!dbMode) persistLocal(next);
    setSaving(null);
    setStreamName("");
    setEditingStream(null);
    if (dbMode) showToast("success", `Stream updated to "${name}".`);
  }

  async function deleteStream() {
    if (!deleteConfirm || saving) return;
    const deleted = current?.streams.find((s) => s.id === deleteConfirm.streamId);
    setSaving("delete");
    if (dbMode) {
      try {
        await deleteStreamDb(deleteConfirm.streamId);
      } catch {
        showToast("warning", "Database unavailable. Stream not deleted.");
        setSaving(null);
        setDeleteConfirm(null);
        return;
      }
    }
    const next = forms.map((f) =>
      f.level === deleteConfirm.formLevel
        ? { ...f, streams: f.streams.filter((s) => s.id !== deleteConfirm.streamId) }
        : f
    );
    setForms(next);
    if (!dbMode) persistLocal(next);
    setSaving(null);
    setDeleteConfirm(null);
    showToast("warning", `Stream "${deleted?.name ?? "unknown"}" has been deleted.`);
  }

  function startEdit(formLevel: 1 | 2 | 3 | 4, stream: Stream) {
    setEditingStream({ formLevel, stream });
    setStreamName(stream.name);
    setAddingStream(null);
  }

  function startAdd(formLevel: 1 | 2 | 3 | 4) {
    setAddingStream(formLevel);
    setEditingStream(null);
    setStreamName("");
  }

  return (
    <>
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} onClick={() => dismissToast(t.id)}>
            <span className="toast-icon">
              {t.type === "success" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              )}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }}>&times;</button>
          </div>
        ))}
      </div>

      <div className="page-head">
        <div>
          <h2 className="page-title">Class Management</h2>
          <p className="page-sub">Manage streams for each form level.</p>
        </div>
        {dbMode && <span className="active-chip">● Database</span>}
        {!dbMode && forms.length > 0 && <span className="term-chip">Local</span>}
      </div>

      <div className="cm-tabs">
        {FORM_LABELS.map((label, i) => (
          <button
            key={label}
            className={`cm-tab${activeForm === i + 1 ? " cm-tab--active" : ""}`}
            onClick={() => setActiveForm((i + 1) as 1 | 2 | 3 | 4)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="module-loading">
          <div className="cm-form-card">
            <div className="cm-form-head">
              <div className="panel-head-skeleton">
                <Skeleton className="skeleton--title" />
                <Skeleton className="skeleton--sub" />
              </div>
              <Skeleton className="skeleton--badge" />
            </div>
            <ListRowSkeleton cols={3} />
            <ListRowSkeleton cols={3} />
          </div>
        </div>
      ) : (
        current && (
        <div className="cm-form-card">
          <div className="cm-form-head">
            <div>
              <h3 className="cm-form-title">{current.label} — Streams</h3>
              <p className="cm-form-sub">{current.streams.length} stream{current.streams.length !== 1 ? "s" : ""} configured</p>
            </div>
            <button className="cm-add-btn" onClick={() => startAdd(activeForm)}>
              + Add Stream
            </button>
          </div>

          <div className="cm-streams">
            {current.streams.map((stream) => (
              <div className="cm-stream" key={stream.id}>
                <span className="cm-stream-dot" />
                <span className="cm-stream-name">{stream.name}</span>
                <div className="cm-stream-actions">
                  <button className="cm-icon-btn cm-icon-btn--sm" title="Edit stream" onClick={() => startEdit(activeForm, stream)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                  <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger" title="Delete stream" onClick={() => setDeleteConfirm({ formLevel: activeForm, streamId: stream.id })}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {addingStream === activeForm && (
            <div className="cm-add-stream-row">
              <input
                className="cm-input cm-input--sm"
                type="text"
                placeholder="Stream name"
                value={streamName}
                onChange={(e) => setStreamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStream()}
                autoFocus
              />
              <button className={`cm-btn cm-btn--primary cm-btn--sm${saving === "add" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={addStream}>
                {saving === "add" ? <><Spinner size={14} /> Adding</> : "Add"}
              </button>
              <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={saving !== null} onClick={() => { setAddingStream(null); setStreamName(""); }}>Cancel</button>
            </div>
          )}
        </div>
      ))}

      {editingStream && (
        <div className="cm-modal-backdrop" onClick={() => { setEditingStream(null); setStreamName(""); }}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Edit Stream</h3>
            <input
              className="cm-input"
              type="text"
              value={streamName}
              onChange={(e) => setStreamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && updateStream()}
              autoFocus
            />
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => { setEditingStream(null); setStreamName(""); }}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${saving === "update" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={updateStream}>
                {saving === "update" ? <><Spinner size={14} /> Updating</> : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="cm-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Confirm Delete</h3>
            <p className="cm-modal-text">Are you sure you want to delete this stream? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--danger${saving === "delete" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={deleteStream}>
                {saving === "delete" ? <><Spinner size={14} /> Deleting</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}