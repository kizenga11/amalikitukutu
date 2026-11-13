"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./teacher-assignments.css";
import {
  createNoteTopic,
  deleteNote,
  deleteNoteImage,
  deleteNoteTopic,
  fetchNoteAudience,
  fetchNoteContexts,
  fetchNoteTopics,
  fetchTeacherNoteFileUrl,
  renameNoteSubtopic,
  renameNoteTopic,
  saveNoteText,
  setNotePublished,
  updateNoteImageCaption,
  uploadNoteImage,
  uploadNotePdf,
} from "@/lib/study-notes-api";
import type { NoteAudienceRow, NoteContext, NoteImage, NoteTopicDetail } from "@/lib/study-notes-shared";
import { formatBytes, isNoteImageFile } from "@/lib/study-notes-shared";
import NoteContent from "@/components/note-content";

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TeacherStudyNotes() {
  const [contexts, setContexts] = useState<NoteContext[]>([]);
  const [topics, setTopics] = useState<NoteTopicDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // create topic
  const [showCreate, setShowCreate] = useState(false);
  const [formFilter, setFormFilter] = useState<string>("");
  const [ctxId, setCtxId] = useState(""); // teachingAssignmentId or ALL|subjectId|classId
  const [title, setTitle] = useState("");
  const [count, setCount] = useState("5");
  const [creating, setCreating] = useState(false);
  const [listFormFilter, setListFormFilter] = useState<string>("");

  // audience modal
  const [audNoteId, setAudNoteId] = useState<string | null>(null);
  const [audLoading, setAudLoading] = useState(false);
  const [audRows, setAudRows] = useState<NoteAudienceRow[]>([]);
  const [audSummary, setAudSummary] = useState<{ total: number; viewed: number; notViewed: number } | null>(null);
  const [audError, setAudError] = useState("");

  // per-subtopic upload/title state
  const [subTitles, setSubTitles] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [savingText, setSavingText] = useState<Record<string, boolean>>({});
  const [busyNote, setBusyNote] = useState<Record<string, boolean>>({});
  const [busyImage, setBusyImage] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<
    | { kind: "pdf"; url: string; title: string }
    | { kind: "text"; contentHtml: string; title: string }
    | { kind: "image"; url: string; title: string }
    | null
  >(null);

  // in-system confirm dialog
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(""), 5000);
    return () => clearTimeout(t);
  }, [info]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [c, t] = await Promise.all([fetchNoteContexts(), fetchNoteTopics()]);
      setContexts(c.contexts);
      setTopics(t.topics);
      // seed subtopic title inputs
      const map: Record<string, string> = {};
      for (const topic of t.topics) {
        for (const s of topic.subtopics) map[s.id] = s.title;
      }
      setSubTitles((prev) => ({ ...map, ...prev }));
    } catch (e: any) {
      setError(e?.message || "Could not load study notes.");
    } finally {
      setLoading(false);
    }
  }

  const formLevels = useMemo(() => Array.from(new Set(contexts.map((c) => c.formLevel).filter((n) => n > 0))).sort((a, b) => a - b), [contexts]);
  const filteredContexts = useMemo(() => (formFilter ? contexts.filter((c) => String(c.formLevel) === formFilter) : contexts), [contexts, formFilter]);
  const allStreamGroups = useMemo(() => {
    const map = new Map<string, NoteContext[]>();
    for (const c of filteredContexts) {
      const key = `${c.subjectId}|${c.classId}`;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key, contexts: [...list].sort((a, b) => a.streamName.localeCompare(b.streamName)), sample: list[0] }));
  }, [filteredContexts]);
  const selectedCtx = contexts.find((c) => c.teachingAssignmentId === ctxId) ?? null;
  const selectedAllGroup = ctxId.startsWith("ALL|") ? (allStreamGroups.find((g) => `ALL|${g.key}` === ctxId) ?? null) : null;

  useEffect(() => {
    if (!selectedCtx) return;
    if (selectedCtx.formLevel > 0) setFormFilter(String(selectedCtx.formLevel));
  }, [selectedCtx?.teachingAssignmentId, selectedCtx?.formLevel]);

  useEffect(() => {
    if (!ctxId) return;
    if (ctxId.startsWith("ALL|")) {
      if (!allStreamGroups.some((g) => `ALL|${g.key}` === ctxId)) setCtxId("");
      return;
    }
    if (!filteredContexts.some((c) => c.teachingAssignmentId === ctxId)) setCtxId("");
  }, [filteredContexts, ctxId, allStreamGroups]);

  useEffect(() => { void loadAll(); }, []);

  const listFormLevels = useMemo(() => {
    const set = new Set<number>();
    for (const t of topics) {
      const f = t.context?.formLevel;
      if (f && f > 0) set.add(f);
    }
    if (set.size === 0) for (const c of contexts) if (c.formLevel > 0) set.add(c.formLevel);
    return Array.from(set).sort((a, b) => a - b);
  }, [topics, contexts]);

  const filteredTopics = useMemo(() => {
    if (!listFormFilter) return topics;
    return topics.filter((t) => String(t.context?.formLevel || "") === listFormFilter);
  }, [topics, listFormFilter]);

  // Number topics inside each teaching context (subject/class/stream):
  // Topic 1, Topic 2, … so each class/stream has its own sequence.
  const topicNumbers = useMemo(() => {
    const sorted = [...topics].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const counts = new Map<string, number>();
    const numbers = new Map<string, number>();
    for (const t of sorted) {
      const n = (counts.get(t.teachingAssignmentId) ?? 0) + 1;
      counts.set(t.teachingAssignmentId, n);
      numbers.set(t.id, n);
    }
    return numbers;
  }, [topics]);

  useEffect(() => {
    if (listFormFilter && !listFormLevels.some((f) => String(f) === listFormFilter)) {
      setListFormFilter("");
    }
  }, [listFormFilter, listFormLevels]);

  async function onCreate() {
    if (!formFilter) { setError("Select the form (Kidato) for these notes."); return; }
    if (!ctxId) { setError("Select subject, class and stream for the selected form."); return; }
    if (!selectedCtx && !selectedAllGroup) { setError("Select a valid subject, class and stream."); return; }
    if (!title.trim()) { setError("Enter topic title."); return; }
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 100) { setError("Subtopics must be 1-100."); return; }
    setCreating(true); setError(""); setInfo("");
    try {
      if (selectedAllGroup) {
        for (const c of selectedAllGroup.contexts) {
          await createNoteTopic({ teachingAssignmentId: c.teachingAssignmentId, title: title.trim(), subtopicCount: n });
        }
        setInfo(`Topic created for ${selectedAllGroup.contexts.length} streams (${selectedAllGroup.contexts.map((c) => c.streamName).join(", ")}). Add PDF or text notes to each subtopic and publish for students.`);
      } else {
        await createNoteTopic({ teachingAssignmentId: ctxId, title: title.trim(), subtopicCount: n });
        setInfo("Topic created. Add PDF or text notes to each subtopic and publish for students.");
      }
      setTitle(""); setCount("5"); setShowCreate(false);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Could not create topic.");
    } finally { setCreating(false); }
  }

  async function onRenameTopic(id: string, newTitle: string) {
    const t = newTitle.trim(); if (!t) return;
    try { await renameNoteTopic(id, t); await loadAll(); } catch (e: any) { setError(e?.message || "Failed."); }
  }
  function onDeleteTopic(id: string) {
    setConfirmState({
      title: "Delete topic?",
      message: "Delete this topic and all its notes and files? This cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        try { await deleteNoteTopic(id); setInfo("Topic deleted."); await loadAll(); } catch (e: any) { setError(e?.message || "Failed."); }
      },
    });
  }
  async function onRenameSubtopic(id: string) {
    const t = (subTitles[id] || "").trim(); if (!t) return;
    try { await renameNoteSubtopic(id, t); setInfo("Subtopic renamed."); } catch (e: any) { setError(e?.message || "Failed."); }
  }
  async function onUpload(subtopicId: string, file: File | null, noteTitle: string) {
    if (!file) { setError("Select a PDF file."); return; }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { setError("Only PDF files are allowed."); return; }
    const maxBytes = 2 * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) { setError("PDF must be 2 MB or smaller."); return; }
    setUploading((p) => ({ ...p, [subtopicId]: true })); setError(""); setInfo("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (noteTitle.trim()) fd.append("title", noteTitle.trim());
      await uploadNotePdf(subtopicId, fd);
      setInfo("PDF uploaded. Publish it so students can see it.");
      await loadAll();
    } catch (e: any) { setError(e?.message || "Upload failed."); }
    finally { setUploading((p) => ({ ...p, [subtopicId]: false })); }
  }

  async function onSaveText(subtopicId: string, noteTitle: string, contentHtml: string) {
    const plain = contentHtml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
    if (!plain) { setError("Write or paste note content before saving."); return; }
    setSavingText((p) => ({ ...p, [subtopicId]: true })); setError(""); setInfo("");
    try {
      await saveNoteText(subtopicId, { title: noteTitle.trim() || "Note", contentHtml });
      setInfo("Text note saved. Publish it so students can see it.");
      await loadAll();
    } catch (e: any) { setError(e?.message || "Could not save text note."); }
    finally { setSavingText((p) => ({ ...p, [subtopicId]: false })); }
  }

  async function onUploadImage(subtopicId: string, file: File | null, caption: string) {
    if (!file) { setError("Select an image file."); return; }
    if (!isNoteImageFile(file)) { setError("Only JPG, PNG, WEBP or GIF images are allowed (max 5 MB)."); return; }
    setBusyImage((p) => ({ ...p, [subtopicId]: true })); setError(""); setInfo("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (caption.trim()) fd.append("caption", caption.trim());
      await uploadNoteImage(subtopicId, fd);
      setInfo("Diagram uploaded. Publish the subtopic note so students can see it.");
      await loadAll();
    } catch (e: any) { setError(e?.message || "Could not upload diagram."); }
    finally { setBusyImage((p) => ({ ...p, [subtopicId]: false })); }
  }

  async function onSaveImageCaption(imageId: string, caption: string) {
    setBusyImage((p) => ({ ...p, [imageId]: true })); setError(""); setInfo("");
    try {
      await updateNoteImageCaption(imageId, caption.trim());
      setInfo("Diagram caption saved.");
      await loadAll();
    } catch (e: any) { setError(e?.message || "Could not save caption."); }
    finally { setBusyImage((p) => ({ ...p, [imageId]: false })); }
  }

  function onDeleteImage(imageId: string) {
    setConfirmState({
      title: "Delete diagram?",
      message: "Delete this diagram and its image file? This cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        setBusyImage((p) => ({ ...p, [imageId]: true }));
        try { await deleteNoteImage(imageId); setInfo("Diagram deleted."); await loadAll(); }
        catch (e: any) { setError(e?.message || "Failed."); }
        finally { setBusyImage((p) => ({ ...p, [imageId]: false })); }
      },
    });
  }
  async function onTogglePublish(noteId: string, publish: boolean) {
    setBusyNote((p) => ({ ...p, [noteId]: true })); setError("");
    try { await setNotePublished(noteId, publish); setInfo(publish ? "Note published to students." : "Note unpublished."); await loadAll(); }
    catch (e: any) { setError(e?.message || "Failed."); }
    finally { setBusyNote((p) => ({ ...p, [noteId]: false })); }
  }
  function onDeleteNote(noteId: string) {
    setConfirmState({
      title: "Delete note?",
      message: "Delete this note and its file? This cannot be undone.",
      onConfirm: async () => {
        setConfirmState(null);
        setBusyNote((p) => ({ ...p, [noteId]: true }));
        try { await deleteNote(noteId); setInfo("Note deleted."); await loadAll(); } catch (e: any) { setError(e?.message || "Failed."); }
        finally { setBusyNote((p) => ({ ...p, [noteId]: false })); }
      },
    });
  }
  async function onOpenNote(noteId: string, titleLabel: string) {
    try {
      const res = await fetchTeacherNoteFileUrl(noteId, false);
      if (res.kind === "text" || (!res.url && res.contentHtml)) {
        setViewer({ kind: "text", contentHtml: res.contentHtml || "", title: res.title || titleLabel });
      } else if (res.url) {
        setViewer({ kind: "pdf", url: res.url, title: res.title || titleLabel });
      } else {
        setError("Could not open note.");
      }
    } catch (e: any) { setError(e?.message || "Could not open note."); }
  }
  async function onAudience(noteId: string) {
    setAudNoteId(noteId); setAudLoading(true); setAudError(""); setAudRows([]); setAudSummary(null);
    try {
      const res = await fetchNoteAudience(noteId);
      setAudRows(res.audience); setAudSummary(res.summary);
    } catch (e: any) { setAudError(e?.message || "Could not load audience."); }
    finally { setAudLoading(false); }
  }

  if (loading) return <div className="ta-page"><p className="ta-muted">Loading study notes…</p></div>;

  return (
    <div className="ta-page">
      <div className="ta-header">
        <div>
          <h2 className="ta-title">Study Notes</h2>
          <p className="ta-subtitle">Upload PDF study notes for your subjects/classes. Publish so students can read them in their portal.</p>
        </div>
        <div className="ta-actions">
          <button type="button" className="ta-btn ta-btn--primary" onClick={() => setShowCreate((v) => !v)}>+ New topic</button>
          <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void loadAll()}>Refresh</button>
        </div>
      </div>

      {(error || info) && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => { setError(""); setInfo(""); }}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3>{error ? "Notice" : "Success"}</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => { setError(""); setInfo(""); }}>Close</button>
            </div>
            <div className={`ta-alert ${error ? "ta-alert--error" : "ta-alert--success"}`} style={{ margin: 0 }}>{error || info}</div>
          </div>
        </div>
      )}

      {showCreate && (
        <section className="ta-card">
          <h3 className="ta-card-title">Create topic</h3>
          <p className="ta-muted" style={{ marginTop: 0 }}>Select the form (Kidato) and target. For subjects taught in all streams of the same class, you can choose “All streams” to create the topic for every stream at once. Only students in each selected class/stream (and form) who take the subject will see the notes.</p>
          <div className="ta-grid ta-grid--2">
            <label className="ta-field">
              <span>Form (Kidato)</span>
              <select className="ta-input" value={formFilter} onChange={(e) => { setFormFilter(e.target.value); setCtxId(""); }}>
                <option value="">— Select form —</option>
                {formLevels.map((f) => (
                  <option key={f} value={String(f)}>Form {f} (Kidato {f})</option>
                ))}
              </select>
            </label>
            <label className="ta-field">
              <span>Subject / Class / Stream (target)</span>
              <select className="ta-input" value={ctxId} onChange={(e) => setCtxId(e.target.value)}>
                <option value="">Select…</option>
                {allStreamGroups.map((group) => (
                  <option key={`ALL|${group.key}`} value={`ALL|${group.key}`}>
                    Form {group.sample.formLevel} {group.sample.className} - {group.sample.subjectName} (All streams: {group.contexts.map((c) => c.streamName).join(", ")})
                  </option>
                ))}
                {filteredContexts.map((c) => (
                  <option key={c.teachingAssignmentId} value={c.teachingAssignmentId}>
                    Form {c.formLevel} — {c.subjectName} · {c.className} {c.streamName}
                  </option>
                ))}
              </select>
              <small className="ta-muted">{selectedAllGroup ? `This will create a separate topic (with the same title and subtopic count) for each stream: ${selectedAllGroup.contexts.map((c) => c.streamName).join(", ")}.` : "Only students in the selected class/stream who take this subject will see these notes."}</small>
            </label>
            <label className="ta-field">
              <span>Number of subtopics</span>
              <input className="ta-input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
          </div>
          <label className="ta-field" style={{ marginTop: 8 }}>
            <span>Topic title</span>
            <input className="ta-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Introduction to Algebra" />
          </label>
          <div className="ta-actions" style={{ marginTop: 10 }}>
            <button type="button" className="ta-btn ta-btn--primary" onClick={() => void onCreate()} disabled={creating}>{creating ? "Creating…" : "Create topic"}</button>
            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </section>
      )}

      {topics.length === 0 ? (
        <section className="ta-card"><p className="ta-muted">No note topics yet. Create a topic, then upload and publish PDFs for students.</p></section>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {listFormLevels.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label className="ta-field" style={{ minWidth: 220, margin: 0 }}>
                <span>Filter by form (Kidato)</span>
                <select className="ta-input" value={listFormFilter} onChange={(e) => setListFormFilter(e.target.value)}>
                  <option value="">All forms</option>
                  {listFormLevels.map((f) => (
                    <option key={f} value={String(f)}>Form {f} (Kidato {f})</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {filteredTopics.length === 0 ? (
            <section className="ta-card"><p className="ta-muted">No note topics for the selected form (Kidato). Try another form or view all forms.</p></section>
          ) : (
            filteredTopics.map((topic) => (
            <section key={topic.id} className="ta-card">
              <div className="ta-card-head" style={{ alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ background: "#eef2ff", color: "#3730a3", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      Topic {topicNumbers.get(topic.id) ?? 1}
                    </span>
                    <input className="ta-input" defaultValue={topic.title} onBlur={(e) => { if (e.target.value.trim() !== topic.title) void onRenameTopic(topic.id, e.target.value); }} style={{ fontWeight: 600, maxWidth: 420 }} />
                  </div>
                  <p className="ta-muted" style={{ marginTop: 4 }}>
                    {topic.context ? `Form ${topic.context.formLevel} (Kidato ${topic.context.formLevel}) · ${topic.context.subjectName} · ${topic.context.className} ${topic.context.streamName}` : "Subject"} · {topic.subtopics.length} subtopics
                  </p>
                </div>
                <div className="ta-actions">
                  <button type="button" className="ta-btn ta-btn--ghost ta-btn--danger" onClick={() => onDeleteTopic(topic.id)}>Delete topic</button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                {topic.subtopics.map((s) => (
                  <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ minWidth: 28 }}>{s.position}.</strong>
                      <input className="ta-input" value={subTitles[s.id] ?? s.title} onChange={(e) => setSubTitles((p) => ({ ...p, [s.id]: e.target.value }))} onBlur={() => void onRenameSubtopic(s.id)} style={{ flex: 1, minWidth: 220 }} />
                    </div>

                    {s.note ? (
                      <div style={{ marginTop: 8, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                            <div style={{ fontWeight: 600 }}>{s.note.title}</div>
                            <div className="ta-muted" style={{ fontSize: 12 }}>
                              {(s.note.contentHtml && !s.note.filePath) ? "Text note" : `PDF ${formatBytes(s.note.fileSize)}`} · {s.note.isPublished ? `Published ${fmtDate(s.note.publishedAt)}` : "Not published"}
                              {s.images.length > 0 ? ` · ${s.images.length} diagram${s.images.length === 1 ? "" : "s"}` : ""}
                            </div>
                          </div>
                          <div className="ta-actions" style={{ flexWrap: "wrap" }}>
                            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void onOpenNote(s.note!.id, s.note!.title)}>Open</button>
                            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void onAudience(s.note!.id)}>Audience</button>
                            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void onTogglePublish(s.note!.id, !s.note!.isPublished)} disabled={busyNote[s.note.id]}>
                              {s.note.isPublished ? "Unpublish" : "Publish"}
                            </button>
                            <button type="button" className="ta-btn ta-btn--ghost ta-btn--danger" onClick={() => onDeleteNote(s.note!.id)} disabled={busyNote[s.note.id]}>Delete</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="ta-muted" style={{ marginTop: 6, fontSize: 13 }}>No note added yet. Upload a PDF or save a text note below.</div>
                    )}

                    <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 12 }}>
                      <UploadRow
                        subtopicId={s.id}
                        uploading={Boolean(uploading[s.id])}
                        hasNote={Boolean(s.note)}
                        defaultTitle={s.note?.title || subTitles[s.id] || s.title}
                        onUpload={(file, t) => void onUpload(s.id, file, t)}
                      />
                      <TextNoteEditor
                        subtopicId={s.id}
                        saving={Boolean(savingText[s.id])}
                        hasNote={Boolean(s.note)}
                        defaultTitle={s.note?.title || subTitles[s.id] || s.title}
                        initialHtml={(s.note && s.note.contentHtml && !s.note.filePath) ? s.note.contentHtml : ""}
                        onSave={(title, html) => void onSaveText(s.id, title, html)}
                      />
                      <SubtopicImages
                        uploading={Boolean(busyImage[s.id])}
                        busy={busyImage}
                        images={s.images}
                        onUpload={(file, caption) => void onUploadImage(s.id, file, caption)}
                        onSaveCaption={(id, caption) => void onSaveImageCaption(id, caption)}
                        onDelete={onDeleteImage}
                        onPreview={(img) => {
                          if (img.url) setViewer({ kind: "image", url: img.url, title: img.caption || img.fileName || "Diagram" });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
          )}
        </div>
      )}

      {viewer && (
        <div className="ta-modal-backdrop" onClick={() => setViewer(null)}>
          <div className="ta-modal" style={{ maxWidth: 1000, width: "95vw", height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head" style={{ flex: "0 0 auto" }}>
              <h3 style={{ margin: 0 }}>{viewer.title || "Note"}</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setViewer(null)}>Close</button>
            </div>
            {viewer.kind === "pdf" ? (
              <iframe src={viewer.url} title={viewer.title} style={{ width: "100%", flex: 1, border: "none", borderRadius: 8 }} />
            ) : viewer.kind === "image" ? (
              <div style={{ flex: 1, overflow: "auto", display: "grid", placeItems: "center", padding: 16, background: "#0f172a", borderRadius: 8 }}>
                <img src={viewer.url} alt={viewer.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", background: "#fff", borderRadius: 8 }} />
              </div>
            ) : (
              <div style={{ flex: 1, overflow: "auto", padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <NoteContent html={viewer.contentHtml} />
              </div>
            )}
          </div>
        </div>
      )}

      {audNoteId && (
        <div className="ta-modal-backdrop" onClick={() => setAudNoteId(null)}>
          <div className="ta-modal" style={{ maxWidth: 860, width: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head" style={{ flex: "0 0 auto", borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 0 }}>
              <h3 style={{ margin: 0 }}>Note audience</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setAudNoteId(null)}>Close</button>
            </div>
            <div style={{ padding: "14px 0 0", overflow: "auto", flex: 1, minHeight: 0 }}>
              {audLoading ? <p className="ta-muted" style={{ margin: 0 }}>Loading audience…</p> : audError ? <div className="ta-alert ta-alert--error" style={{ margin: 0 }}>{audError}</div> : (
                <>
                  {audSummary && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                      <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                        <div className="ta-muted" style={{ fontSize: 12 }}>Total students</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{audSummary.total}</div>
                      </div>
                      <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: "#065f46" }}>Viewed</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#065f46" }}>{audSummary.viewed}</div>
                      </div>
                      <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: "#9a3412" }}>Not viewed</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#9a3412" }}>{audSummary.notViewed}</div>
                      </div>
                    </div>
                  )}
                  <div style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
                    <table className="ta-table" style={{ margin: 0, minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={{ whiteSpace: "nowrap" }}>Student</th>
                          <th style={{ whiteSpace: "nowrap" }}>Reg no.</th>
                          <th style={{ whiteSpace: "nowrap" }}>Viewed</th>
                          <th style={{ whiteSpace: "nowrap" }}>First viewed</th>
                          <th style={{ whiteSpace: "nowrap" }}>Last viewed</th>
                          <th style={{ whiteSpace: "nowrap" }}>Opens</th>
                          <th style={{ whiteSpace: "nowrap" }}>Downloads</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audRows.map((r) => (
                          <tr key={r.studentId}>
                            <td>{r.fullName || "—"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{r.registrationNo || "—"}</td>
                            <td>
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: r.hasViewed ? "#dcfce7" : "#f3f4f6", color: r.hasViewed ? "#166534" : "#374151" }}>
                                {r.hasViewed ? "Yes" : "No"}
                              </span>
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.firstViewedAt)}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.lastViewedAt)}</td>
                            <td>{r.viewCount}</td>
                            <td>{r.downloadCount}</td>
                          </tr>
                        ))}
                        {audRows.length === 0 && <tr><td colSpan={7} className="ta-muted" style={{ textAlign: "center", padding: 16 }}>No students in audience.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="ta-modal-backdrop" onClick={() => setConfirmState(null)}>
          <div className="ta-modal" style={{ maxWidth: 480, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3>{confirmState.title}</h3>
            </div>
            <p className="ta-muted" style={{ margin: "0 0 16px" }}>{confirmState.message}</p>
            <div className="ta-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setConfirmState(null)}>Cancel</button>
              <button type="button" className="ta-btn ta-btn--primary ta-btn--danger" onClick={() => void confirmState.onConfirm()}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadRow({ subtopicId, uploading, hasNote, defaultTitle, onUpload }: { subtopicId: string; uploading: boolean; hasNote: boolean; defaultTitle: string; onUpload: (file: File | null, title: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [noteTitle, setNoteTitle] = useState(defaultTitle);
  useEffect(() => { setNoteTitle(defaultTitle); }, [defaultTitle]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="ta-muted" style={{ fontSize: 12, fontWeight: 600 }}>Option 1: Upload PDF file</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input className="ta-input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" style={{ minWidth: 220, flex: "1 1 220px" }} />
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ flex: "1 1 220px", maxWidth: "100%" }} />
        <button type="button" className="ta-btn ta-btn--primary" disabled={uploading || !file} onClick={() => { onUpload(file, noteTitle); setFile(null); }}>
          {uploading ? "Uploading…" : hasNote ? "Replace with PDF" : "Upload PDF"}
        </button>
      </div>
      <span className="ta-muted" style={{ fontSize: 12 }}>PDF only, max 2 MB.</span>
    </div>
  );
}

function TextNoteEditor({ subtopicId, saving, hasNote, defaultTitle, initialHtml, onSave }: { subtopicId: string; saving: boolean; hasNote: boolean; defaultTitle: string; initialHtml: string; onSave: (title: string, html: string) => void }) {
  const [title, setTitle] = useState(defaultTitle);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setTitle(defaultTitle); }, [defaultTitle, subtopicId]);
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (initialHtml || "")) {
      el.innerHTML = initialHtml || "";
    }
  }, [initialHtml, subtopicId]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="ta-muted" style={{ fontSize: 12, fontWeight: 600 }}>Option 2: Write or paste text note (saves storage)</div>
      <input className="ta-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" style={{ maxWidth: 520 }} />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="ta-input note-content"
        style={{ minHeight: 140, maxHeight: 320, overflow: "auto", background: "#fff" }}
        data-placeholder="Type here or paste text from Word/Docs. Formatting is kept."
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="ta-btn ta-btn--primary" disabled={saving} onClick={() => onSave(title, ref.current?.innerHTML || "")}>
          {saving ? "Saving…" : hasNote ? "Replace with text note" : "Save text note"}
        </button>
        <span className="ta-muted" style={{ fontSize: 12 }}>Paste from Word to keep formatting. Text notes use less storage than PDFs.</span>
      </div>
    </div>
  );
}

function SubtopicImages({
  uploading,
  busy,
  images,
  onUpload,
  onSaveCaption,
  onDelete,
  onPreview,
}: {
  uploading: boolean;
  busy: Record<string, boolean>;
  images: NoteImage[];
  onUpload: (file: File | null, caption: string) => void;
  onSaveCaption: (imageId: string, caption: string) => void;
  onDelete: (imageId: string) => void;
  onPreview: (image: NoteImage) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [fileKey, setFileKey] = useState(0);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="ta-muted" style={{ fontSize: 12, fontWeight: 600 }}>Option 3: Upload diagrams / michoro</div>
      <p className="ta-muted" style={{ margin: 0, fontSize: 12 }}>
        Attach one or more pictures to this subtopic. Add a caption such as “Mchoro 1.42: ...”. Students see the diagrams when the note above is published.
      </p>

      {images.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {images.map((img) => (
            <DiagramTile
              key={img.id}
              image={img}
              saving={Boolean(busy[img.id])}
              onSave={(value) => onSaveCaption(img.id, value)}
              onDelete={() => onDelete(img.id)}
              onPreview={() => onPreview(img)}
            />
          ))}
        </div>
      ) : (
        <div className="ta-muted" style={{ fontSize: 13 }}>No diagrams added yet.</div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="ta-input"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder='Caption e.g. "Mchoro 1.42: ..."'
          style={{ minWidth: 220, flex: "1 1 240px" }}
        />
        <input
          key={fileKey}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ flex: "1 1 200px", maxWidth: "100%" }}
        />
        <button
          type="button"
          className="ta-btn ta-btn--primary"
          disabled={uploading || !file}
          onClick={() => {
            onUpload(file, caption);
            setFile(null);
            setCaption("");
            setFileKey((k) => k + 1);
          }}
        >
          {uploading ? "Uploading…" : "Upload diagram"}
        </button>
      </div>
      <span className="ta-muted" style={{ fontSize: 12 }}>JPG, PNG, WEBP or GIF, max 5 MB each.</span>
    </div>
  );
}

function DiagramTile({
  image,
  saving,
  onSave,
  onDelete,
  onPreview,
}: {
  image: NoteImage;
  saving: boolean;
  onSave: (caption: string) => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const [caption, setCaption] = useState(image.caption || "");
  useEffect(() => { setCaption(image.caption || ""); }, [image.caption, image.id]);
  const changed = caption.trim() !== (image.caption || "");

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "#f8fafc", display: "grid", gap: 6 }}>
      <button
        type="button"
        onClick={onPreview}
        disabled={!image.url}
        style={{ border: 0, padding: 0, background: "#e2e8f0", borderRadius: 8, overflow: "hidden", cursor: image.url ? "zoom-in" : "default" }}
      >
        {image.url ? (
          <img src={image.url} alt={image.caption || image.fileName || "Diagram"} style={{ display: "block", width: "100%", height: 120, objectFit: "cover" }} />
        ) : (
          <span className="ta-muted" style={{ display: "grid", placeItems: "center", height: 120, fontSize: 12 }}>No preview</span>
        )}
      </button>
      <input
        className="ta-input"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (e.g. 1.42)"
        style={{ fontSize: 12 }}
      />
      <div className="ta-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
        <button type="button" className="ta-btn ta-btn--ghost" disabled={saving || !changed} onClick={() => onSave(caption)}>
          {saving ? "Saving…" : "Save caption"}
        </button>
        <button type="button" className="ta-btn ta-btn--ghost ta-btn--danger" disabled={saving} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
