"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchSubjects, insertSubject, updateSubject as updateSubjectDb, deleteSubjectRow } from "@/lib/school-api";
import { readStoredJson, writeStoredJson } from "@/lib/preferences";
import { Skeleton, Spinner, ListRowSkeleton } from "@/components/loading";

type ToastType = "success" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  type: "Compulsory" | "Optional";
  hasPractical: boolean;
  stream: "General" | "Vocational" | "Both";
}

const STORAGE_KEY = "school-subjects";

let toastId = 0;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const DEFAULT_SUBJECTS: Subject[] = [
  { id: "s1", code: "MAT", name: "Mathematics", type: "Compulsory", hasPractical: false, stream: "Both" },
  { id: "s2", code: "ENG", name: "English Language", type: "Compulsory", hasPractical: false, stream: "Both" },
  { id: "s3", code: "KIS", name: "Kiswahili", type: "Compulsory", hasPractical: false, stream: "Both" },
  { id: "s4", code: "BIO", name: "Biology", type: "Compulsory", hasPractical: true, stream: "Both" },
  { id: "s5", code: "PHY", name: "Physics", type: "Compulsory", hasPractical: true, stream: "Both" },
  { id: "s6", code: "CHE", name: "Chemistry", type: "Compulsory", hasPractical: true, stream: "Both" },
  { id: "s7", code: "HIS", name: "History & Civics", type: "Compulsory", hasPractical: false, stream: "Both" },
  { id: "s8", code: "GEO", name: "Geography", type: "Compulsory", hasPractical: false, stream: "Both" },
  { id: "s9", code: "AGR", name: "Agriculture", type: "Optional", hasPractical: true, stream: "Vocational" },
  { id: "s10", code: "BUS", name: "Business Studies", type: "Optional", hasPractical: false, stream: "Vocational" },
];

function isValidSubjects(value: unknown): value is Subject[] {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item === "object" &&
    typeof (item as { code?: unknown }).code === "string" &&
    typeof (item as { name?: unknown }).name === "string" &&
    typeof (item as { stream?: unknown }).stream === "string"
  );
}

function loadSubjects(): Subject[] {
  return readStoredJson<Subject[]>(STORAGE_KEY, DEFAULT_SUBJECTS, isValidSubjects);
}

function persistSubjects(subjects: Subject[]) {
  writeStoredJson(STORAGE_KEY, subjects);
}

function emptyForm(): Omit<Subject, "id"> {
  return { code: "", name: "", type: "Compulsory", hasPractical: false, stream: "Both" };
}

export default function SubjectManagement() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | "save" | "delete">(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    fetchSubjects()
      .then((rows) => {
        const mapped = rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          type: r.subject_type,
          hasPractical: r.has_practical,
          stream: r.stream,
        }));
        setSubjects(mapped);
        setDbMode(true);
      })
      .catch(() => {
        setSubjects(loadSubjects());
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

  const persist = useCallback((next: Subject[]) => {
    setSubjects(next);
    persistSubjects(next);
  }, []);

  const filtered = subjects.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  async function handleSave() {
    if (saving) return;
    if (!form.code.trim() || !form.name.trim()) {
      showToast("warning", "Subject code and name are required.");
      return;
    }
    const code = form.code.trim().toUpperCase();
    const payload = {
      code,
      name: form.name.trim(),
      subject_type: form.type,
      has_practical: form.hasPractical,
      stream: form.stream,
    };

    setSaving("save");
    if (editingId) {
      if (dbMode) {
        try {
          await updateSubjectDb(editingId, payload);
        } catch {
          showToast("warning", "Database unavailable. Subject not updated.");
          setSaving(null);
          return;
        }
      }
      persist(subjects.map((s) => s.id === editingId ? { ...s, ...form, code } : s));
      setSaving(null);
      showToast("success", `Subject "${payload.name}" updated.`);
    } else {
      const duplicate = subjects.some((s) => s.code.toUpperCase() === code);
      if (duplicate) {
        showToast("warning", `Subject code "${code}" already exists.`);
        setSaving(null);
        return;
      }
      if (dbMode) {
        try {
          const row = await insertSubject(payload);
          const newSubject: Subject = {
            id: row.id,
            code: row.code,
            name: row.name,
            type: row.subject_type,
            hasPractical: row.has_practical,
            stream: row.stream,
          };
          setSubjects([...subjects, newSubject]);
          setSaving(null);
          showToast("success", `Subject "${payload.name}" added.`);
          setForm(emptyForm());
          setEditingId(null);
          setShowForm(false);
          return;
        } catch {
          showToast("warning", "Database unavailable. Subject not saved.");
          setSaving(null);
          return;
        }
      }
      const newSubject: Subject = { id: generateId(), ...form, code };
      persist([...subjects, newSubject]);
      setSaving(null);
      showToast("success", `Subject "${payload.name}" added.`);
    }
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(subject: Subject) {
    setForm({ code: subject.code, name: subject.name, type: subject.type, hasPractical: subject.hasPractical, stream: subject.stream });
    setEditingId(subject.id);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    const deleted = subjects.find((s) => s.id === id);
    setSaving("delete");
    if (dbMode) {
      try {
        await deleteSubjectRow(id);
      } catch {
        showToast("warning", "Database unavailable. Subject not deleted.");
        setSaving(null);
        setDeleteConfirm(null);
        return;
      }
    }
    persist(subjects.filter((s) => s.id !== id));
    setSaving(null);
    setDeleteConfirm(null);
    showToast("warning", `Subject "${deleted?.name}" deleted.`);
  }

  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
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
          <h2 className="page-title">Subject Management</h2>
          <p className="page-sub">Register and manage all school subjects.</p>
        </div>
        <div className="page-head-right">
          {dbMode && <span className="active-chip">● Database</span>}
          {!dbMode && subjects.length > 0 && <span className="term-chip">Local</span>}
          <button className="sm-add-btn" onClick={openNew}>+ Add Subject</button>
        </div>
      </div>

      <div className="sm-search-bar">
        <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input className="sm-search" type="text" placeholder="Search by code or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="module-loading">
          <div className="sm-table-wrap">
            <div className="sm-table-skeleton">
              <ListRowSkeleton cols={4} />
              <ListRowSkeleton cols={4} />
              <ListRowSkeleton cols={4} />
              <ListRowSkeleton cols={4} />
              <ListRowSkeleton cols={4} />
            </div>
          </div>
        </div>
      ) : (
      <div className="sm-table-wrap">
        <table className="sm-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject Name</th>
              <th>Type</th>
              <th>Practical</th>
              <th>Stream</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="sm-empty">No subjects found.</td></tr>
            )}
            {filtered.map((subject) => (
              <tr key={subject.id}>
                <td><span className="sm-code">{subject.code}</span></td>
                <td className="sm-name">{subject.name}</td>
                <td>
                  <span className={`sm-badge sm-badge--${subject.type === "Compulsory" ? "compulsory" : "optional"}`}>
                    {subject.type}
                  </span>
                </td>
                <td>
                  <span className={`sm-badge sm-badge--${subject.hasPractical ? "practical" : "theory"}`}>
                    {subject.hasPractical ? "Theory+Practical (50/50)" : "Theory only"}
                  </span>
                </td>
                <td>
                  <span className={`sm-badge sm-badge--${subject.stream.toLowerCase()}`}>
                    {subject.stream}
                  </span>
                </td>
                <td>
                  <div className="sm-actions">
                    <button className="cm-icon-btn cm-icon-btn--sm" title="Edit" onClick={() => handleEdit(subject)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger" title="Delete" onClick={() => setDeleteConfirm(subject.id)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="cm-modal-backdrop" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">{editingId ? "Edit Subject" : "Add New Subject"}</h3>
              <p className="sm-modal-sub">{editingId ? `Updating ${form.name || "subject"}` : "Fill in the details to register a new subject."}</p>
            </div>

            <div className="sm-form-grid">
              <label className="sm-field">
                <span className="sm-field-label">Subject Code</span>
                <div className="sm-input-wrap">
                  <input className="sm-input sm-input--code" type="text" placeholder="e.g. MAT" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} autoFocus maxLength={10} />
                </div>
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Subject Name</span>
                <div className="sm-input-wrap">
                  <input className="sm-input" type="text" placeholder="e.g. Mathematics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Type</span>
                <div className="sm-input-wrap">
                  <select className="sm-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Subject["type"] })}>
                    <option value="Compulsory">Compulsory</option>
                    <option value="Optional">Optional</option>
                  </select>
                  <span className="sm-select-caret">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </span>
                </div>
              </label>
              <label className="sm-field">
                <span className="sm-field-label">Stream</span>
                <div className="sm-input-wrap">
                  <select className="sm-input" value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value as Subject["stream"] })}>
                    <option value="Both">Both Streams</option>
                    <option value="General">General Only</option>
                    <option value="Vocational">Vocational Only</option>
                  </select>
                  <span className="sm-select-caret">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </span>
                </div>
              </label>
              <div className="sm-field sm-field--toggle">
                <span className="sm-field-label">Practical Component</span>
                <label className="sm-toggle">
                  <input type="checkbox" checked={form.hasPractical} onChange={(e) => setForm({ ...form, hasPractical: e.target.checked })} />
                  <span className="sm-toggle-track">
                    <span className="sm-toggle-thumb" />
                  </span>
                  <span className="sm-toggle-text">{form.hasPractical ? "Yes" : "No"}</span>
                </label>
                <p className="sm-toggle-hint">Does this subject include a practical assessment?</p>
              </div>
            </div>

            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${saving === "save" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={handleSave}>
                {saving === "save" ? <><Spinner size={14} /> {editingId ? "Updating" : "Adding"}…</> : editingId ? "Update Subject" : "Add Subject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="cm-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Confirm Delete</h3>
            <p className="cm-modal-text">Are you sure you want to delete this subject? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--danger${saving === "delete" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={() => handleDelete(deleteConfirm)}>
                {saving === "delete" ? <><Spinner size={14} /> Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
