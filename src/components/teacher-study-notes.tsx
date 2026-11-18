"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./teacher-assignments.css";
import {
  addNoteSubtopic,
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
import { formatBytes, isNoteImageFile, preparePastedNoteHtml } from "@/lib/study-notes-shared";
import NoteContent from "@/components/note-content";

function fmtDate(v: string | null | undefined) {
  if (!v) return "â€”";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "â€”";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formShortLabel(context: NoteContext | null | undefined) {
  if (!context) return "Unassigned";
  if (context.formLevel > 0) return `F${context.formLevel}`;
  return context.className || "Unassigned";
}

// Notes are grouped by subject + class + form, never by stream, so Computer
// Science F1 and Computer Science F2 show as separate cards while all streams
// of one class stay together.
function noteGroupKey(context: NoteContext | null | undefined) {
  if (!context) return "none";
  return [
    context.subjectId || context.subjectCode || context.subjectName || "subject",
    context.classId || context.className || "class",
    context.formLevel || 0,
  ].join("|");
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
  const [listSubjectFilter, setListSubjectFilter] = useState<string>("");
  const [listQuery, setListQuery] = useState("");

  // Accordion state: subject/class cards start collapsed, then topics and
  // subtopics start collapsed too, so teachers see a short index first.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({});
  const [openSubtopics, setOpenSubtopics] = useState<Record<string, boolean>>({});

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
  const [addingSubtopic, setAddingSubtopic] = useState<Record<string, boolean>>({});
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
    const query = listQuery.trim().toLowerCase();
    return topics.filter((t) => {
      if (listFormFilter && String(t.context?.formLevel || "") !== listFormFilter) return false;
      if (listSubjectFilter && t.context?.subjectId !== listSubjectFilter) return false;
      if (!query) return true;
      const hay = [
        t.title,
        t.context?.subjectName || "",
        t.context?.className || "",
        t.context?.streamName || "",
        ...t.subtopics.map((s) => s.title),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [topics, listFormFilter, listSubjectFilter, listQuery]);

  const listSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of topics) {
      const c = t.context;
      if (c?.subjectId) map.set(c.subjectId, c.subjectName || "Subject");
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [topics]);

  // Teacher-facing index: Computer Science F1, Computer Science F2,
  // Technical Drawing F1, â€¦ Clicking one card reveals its topics.
  const groupedTopics = useMemo(() => {
    const map = new Map<string, {
      key: string;
      label: string;
      formLabel: string;
      formLevel: number;
      subjectId: string;
      classId: string;
      subjectName: string;
      topics: NoteTopicDetail[];
      publishedCount: number;
      streamNames: string[];
    }>();

    for (const topic of filteredTopics) {
      const c = topic.context;
      const key = noteGroupKey(c);
      let group = map.get(key);
      if (!group) {
        const subjectName = c?.subjectName || c?.subjectCode || "Subject";
        group = {
          key,
          label: c ? `${subjectName} ${formShortLabel(c)}` : "Unassigned topics",
          formLabel: formShortLabel(c),
          formLevel: c?.formLevel || 0,
          subjectId: c?.subjectId || "",
          classId: c?.classId || "",
          subjectName,
          topics: [],
          publishedCount: 0,
          streamNames: [],
        };
        map.set(key, group);
      }
      group.topics.push(topic);
      group.publishedCount += topic.subtopics.filter((s) => s.note?.isPublished).length;
      if (c?.streamName && !group.streamNames.includes(c.streamName)) group.streamNames.push(c.streamName);
    }

    return Array.from(map.values())
      .map((group) => {
        group.topics.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
        return group;
      })
      .sort((a, b) =>
        (a.formLevel || 999) - (b.formLevel || 999) ||
        a.subjectName.localeCompare(b.subjectName) ||
        a.label.localeCompare(b.label),
      );
  }, [filteredTopics]);

  function startCreateTopicForGroup(group: { formLevel: number; subjectId: string; classId: string }) {
    if (!group.subjectId || !group.classId) {
      setShowCreate(true);
      return;
    }
    if (group.formLevel > 0) setFormFilter(String(group.formLevel));
    const groupContexts = contexts.filter((c) => c.subjectId === group.subjectId && c.classId === group.classId);
    if (groupContexts.length > 1) {
      setCtxId(`ALL|${group.subjectId}|${group.classId}`);
    } else if (groupContexts.length === 1) {
      setCtxId(groupContexts[0].teachingAssignmentId);
    } else {
      setCtxId("");
    }
    setShowCreate(true);
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function toggleTopic(id: string) {
    setOpenTopics((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function toggleSubtopic(id: string) {
    setOpenSubtopics((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Number topics inside each teaching context (subject/class/stream):
  // Topic 1, Topic 2, â€¦ so each class/stream has its own sequence.
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
    const createdContext = selectedAllGroup ? selectedAllGroup.sample : selectedCtx;
    try {
      if (selectedAllGroup) {
        for (const c of selectedAllGroup.contexts) {
          await createNoteTopic({ teachingAssignmentId: c.teachingAssignmentId, title: title.trim(), subtopicCount: n });
        }
        setInfo(`Topic created for ${selectedAllGroup.contexts.length} streams (${selectedAllGroup.contexts.map((c) => c.streamName).join(", ")}). Add PDF, text, or code notes to each subtopic and publish for students. You can add more subtopics later.`);
      } else {
        await createNoteTopic({ teachingAssignmentId: ctxId, title: title.trim(), subtopicCount: n });
        setInfo("Topic created. Add PDF, text, or code notes to each subtopic and publish for students. You can add more subtopics later.");
      }
      if (createdContext) {
        setOpenGroups((prev) => ({ ...prev, [noteGroupKey(createdContext)]: true }));
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
  async function onAddSubtopic(topicId: string) {
    setAddingSubtopic((p) => ({ ...p, [topicId]: true }));
    setError(""); setInfo("");
    try {
      await addNoteSubtopic(topicId);
      setInfo("Subtopic added. You can now add a PDF, text note, or code note to it.");
      setOpenTopics((prev) => ({ ...prev, [topicId]: true }));
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Could not add subtopic.");
    } finally {
      setAddingSubtopic((p) => ({ ...p, [topicId]: false }));
    }
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

  if (loading) return <div className="ta-page"><p className="ta-muted">Loading study notesâ€¦</p></div>;

  return (
    <div className="ta-page">
      <div className="ta-header">
        <div>
          <h2 className="ta-title">Study Notes</h2>
          <p className="ta-subtitle">Notes are grouped by subject and class. Click a card such as Computer Science F1 to see its topics, then open a topic to add or publish notes.</p>
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
          <p className="ta-muted" style={{ marginTop: 0 }}>Select the form (Kidato) and target. For subjects taught in all streams of the same class, you can choose â€œAll streamsâ€ to create the topic for every stream at once. Only students in each selected class/stream (and form) who take the subject will see the notes.</p>
          <div className="ta-grid ta-grid--2">
            <label className="ta-field">
              <span>Form (Kidato)</span>
              <select className="ta-input" value={formFilter} onChange={(e) => { setFormFilter(e.target.value); setCtxId(""); }}>
                <option value="">â€” Select form â€”</option>
                {formLevels.map((f) => (
                  <option key={f} value={String(f)}>Form {f} (Kidato {f})</option>
                ))}
              </select>
            </label>
            <label className="ta-field">
              <span>Subject / Class / Stream (target)</span>
              <select className="ta-input" value={ctxId} onChange={(e) => setCtxId(e.target.value)}>
                <option value="">Selectâ€¦</option>
                {allStreamGroups.map((group) => (
                  <option key={`ALL|${group.key}`} value={`ALL|${group.key}`}>
                    Form {group.sample.formLevel} {group.sample.className} - {group.sample.subjectName} (All streams: {group.contexts.map((c) => c.streamName).join(", ")})
                  </option>
                ))}
                {filteredContexts.map((c) => (
                  <option key={c.teachingAssignmentId} value={c.teachingAssignmentId}>
                    Form {c.formLevel} â€” {c.subjectName} Â· {c.className} {c.streamName}
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
            <button type="button" className="ta-btn ta-btn--primary" onClick={() => void onCreate()} disabled={creating}>{creating ? "Creatingâ€¦" : "Create topic"}</button>
            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </section>
      )}

      {topics.length === 0 ? (
        <section className="ta-card"><p className="ta-muted">No note topics yet. Create a topic, add subtopics now or later, then save and publish notes for students.</p></section>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            {listFormLevels.length > 0 && (
              <label className="ta-field" style={{ minWidth: 200, margin: 0 }}>
                <span>Filter by form (Kidato)</span>
                <select className="ta-input" value={listFormFilter} onChange={(e) => setListFormFilter(e.target.value)}>
                  <option value="">All forms</option>
                  {listFormLevels.map((f) => (
                    <option key={f} value={String(f)}>Form {f} (Kidato {f})</option>
                  ))}
                </select>
              </label>
            )}
            {listSubjects.length > 1 && (
              <label className="ta-field" style={{ minWidth: 200, margin: 0 }}>
                <span>Filter by subject</span>
                <select className="ta-input" value={listSubjectFilter} onChange={(e) => setListSubjectFilter(e.target.value)}>
                  <option value="">All subjects</option>
                  {listSubjects.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="ta-field" style={{ flex: "1 1 240px", margin: 0 }}>
              <span>Search topics</span>
              <input
                className="ta-input"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Topic or subtopic titleâ€¦"
              />
            </label>
          </div>
          {filteredTopics.length === 0 ? (
            <section className="ta-card"><p className="ta-muted">No note topics match the selected filters. Try another form, subject or search word.</p></section>
          ) : (
            groupedTopics.map((group) => {
              const groupOpen = Boolean(openGroups[group.key]);
              const totalSubtopics = group.topics.reduce((sum, t) => sum + t.subtopics.length, 0);
              const streamSuffix = group.streamNames.length > 1 ? ` Â· ${[...group.streamNames].sort().join(", ")}` : "";
              return (
                <section key={group.key} className="ta-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      background: groupOpen ? "#eef2ff" : "#fff", padding: "14px 16px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={groupOpen}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textAlign: "left",
                        border: 0, background: "transparent", padding: 0, cursor: "pointer",
                      }}
                    >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis" }}>{group.label}</span>
                      <span className="ta-muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
                        {group.topics.length} topic{group.topics.length === 1 ? "" : "s"} Â· {totalSubtopics} subtopic{totalSubtopics === 1 ? "" : "s"} Â· {group.publishedCount} published{streamSuffix}
                      </span>
                    </span>
                    <span className="ta-btn ta-btn--ghost" style={{ pointerEvents: "none", margin: 0 }}>{groupOpen ? "Hide topics" : "Open topics"}</span>
                    </button>
                    {group.subjectId && group.classId ? (
                      <button
                        type="button"
                        className="ta-btn ta-btn--ghost"
                        onClick={(e) => { e.stopPropagation(); startCreateTopicForGroup(group); }}
                        title="Add another topic for this subject/class"
                      >
                        + Add topic
                      </button>
                    ) : null}
                  </div>

                  {groupOpen && (
                    <div style={{ padding: "8px 14px 14px", borderTop: "1px solid #e5e7eb", display: "grid", gap: 12 }}>
                      {group.topics.map((topic) => {
                        const open = Boolean(openTopics[topic.id]);
                        const publishedCount = topic.subtopics.filter((s) => s.note?.isPublished).length;
                        return (
                          <section key={topic.id} className="ta-card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
                            <button
                              type="button"
                              onClick={() => toggleTopic(topic.id)}
                              aria-expanded={open}
                              style={{
                                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                                border: 0, background: open ? "#f8fafc" : "#fff", padding: "12px 14px", cursor: "pointer",
                              }}
                            >
                              <span style={{ background: "#eef2ff", color: "#3730a3", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                                Topic {topicNumbers.get(topic.id) ?? 1}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.title}</span>
                                <span className="ta-muted" style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                                  {topic.context?.streamName ? `${topic.context.streamName} Â· ` : ""}{topic.subtopics.length} subtopic{topic.subtopics.length === 1 ? "" : "s"} Â· {publishedCount} published
                                </span>
                              </span>
                              <span className="ta-btn ta-btn--ghost" style={{ pointerEvents: "none", margin: 0 }}>{open ? "Hide" : "Open"}</span>
                            </button>

                            {open && (
                              <div style={{ padding: "0 14px 14px", borderTop: "1px solid #e5e7eb" }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                                  <input
                                    className="ta-input"
                                    defaultValue={topic.title}
                                    onBlur={(e) => { if (e.target.value.trim() !== topic.title) void onRenameTopic(topic.id, e.target.value); }}
                                    style={{ fontWeight: 600, flex: "1 1 240px" }}
                                    placeholder="Topic title"
                                  />
                                  <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void onAddSubtopic(topic.id)} disabled={Boolean(addingSubtopic[topic.id]) || topic.subtopics.length >= 100}>
                                    {addingSubtopic[topic.id] ? "Addingâ€¦" : "+ Add subtopic"}
                                  </button>
                                  <button type="button" className="ta-btn ta-btn--ghost ta-btn--danger" onClick={() => onDeleteTopic(topic.id)}>Delete topic</button>
                                </div>

                                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                                  {topic.subtopics.map((s) => {
                                    const subOpen = Boolean(openSubtopics[s.id]);
                                    const status = s.note ? (s.note.isPublished ? "published" : "draft") : "empty";
                                    const statusStyle = status === "published"
                                      ? { background: "#dcfce7", color: "#166534" }
                                      : status === "draft"
                                        ? { background: "#fef3c7", color: "#92400e" }
                                        : { background: "#f3f4f6", color: "#374151" };
                                    return (
                                      <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
                                        <button
                                          type="button"
                                          onClick={() => toggleSubtopic(s.id)}
                                          aria-expanded={subOpen}
                                          style={{
                                            display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                                            border: 0, background: subOpen ? "#f8fafc" : "#fff", padding: "10px 12px", cursor: "pointer",
                                          }}
                                        >
                                          <strong style={{ minWidth: 28 }}>{s.position}.</strong>
                                          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subTitles[s.id] ?? s.title}</span>
                                          {s.images.length > 0 && <span className="ta-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{s.images.length} diagram{s.images.length === 1 ? "" : "s"}</span>}
                                          <span style={{ ...statusStyle, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                                            {status === "published" ? "Published" : status === "draft" ? "Draft" : "No note"}
                                          </span>
                                          <span className="ta-btn ta-btn--ghost" style={{ pointerEvents: "none", margin: 0 }}>{subOpen ? "Close" : "Edit"}</span>
                                        </button>

                                        {subOpen && (
                                          <div style={{ padding: "0 12px 12px", borderTop: "1px solid #e5e7eb" }}>
                                            <label className="ta-field" style={{ marginTop: 10 }}>
                                              <span>Subtopic title</span>
                                              <input
                                                className="ta-input"
                                                value={subTitles[s.id] ?? s.title}
                                                onChange={(e) => setSubTitles((p) => ({ ...p, [s.id]: e.target.value }))}
                                                onBlur={() => void onRenameSubtopic(s.id)}
                                              />
                                            </label>

                                            {s.note ? (
                                              <div style={{ marginTop: 8, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                                                    <div style={{ fontWeight: 600 }}>{s.note.title}</div>
                                                    <div className="ta-muted" style={{ fontSize: 12 }}>
                                                      {(s.note.contentHtml && !s.note.filePath) ? "Text note" : `PDF ${formatBytes(s.note.fileSize)}`} Â· {s.note.isPublished ? `Published ${fmtDate(s.note.publishedAt)}` : "Not published"}
                                                      {s.images.length > 0 ? ` Â· ${s.images.length} diagram${s.images.length === 1 ? "" : "s"}` : ""}
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
                                              <div className="ta-muted" style={{ marginTop: 6, fontSize: 13 }}>No note added yet. Upload a PDF, save a text note, au ongeza code note hapo chini.</div>
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
                                              <CodeNoteEditor
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
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
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
              {audLoading ? <p className="ta-muted" style={{ margin: 0 }}>Loading audienceâ€¦</p> : audError ? <div className="ta-alert ta-alert--error" style={{ margin: 0 }}>{audError}</div> : (
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
                            <td>{r.fullName || "â€”"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{r.registrationNo || "â€”"}</td>
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
          {uploading ? "Uploadingâ€¦" : hasNote ? "Replace with PDF" : "Upload PDF"}
        </button>
      </div>
      <span className="ta-muted" style={{ fontSize: 12 }}>PDF only, max 2 MB.</span>
    </div>
  );
}

function insertHtmlAtCursor(el: HTMLDivElement, html: string) {
  el.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
    el.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    const after = document.createRange();
    after.setStartAfter(last);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
  }
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

  function readClipboardImageFiles(cd: DataTransfer): Promise<string[]> {
    const files = Array.from(cd.items || [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length === 0) return Promise.resolve([]);
    return Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          }),
      ),
    ).then((urls) => urls.filter(Boolean));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const cd = e.clipboardData;
    const el = ref.current;
    if (!cd || !el) return;

    const html = cd.getData("text/html");
    if (html && html.trim()) {
      e.preventDefault();
      void readClipboardImageFiles(cd).then((imageUrls) => {
        let cleaned = preparePastedNoteHtml(html) || html;
        if (imageUrls.length > 0) {
          let i = 0;
          cleaned = cleaned.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, src) => {
            if (/^file:/i.test(src) && i < imageUrls.length) {
              return `${pre}${q}${imageUrls[i++]}${q}`;
            }
            return m;
          });
        }
        if (ref.current) insertHtmlAtCursor(ref.current, cleaned);
      });
      return;
    }

    const items = Array.from(cd.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const src = typeof reader.result === "string" ? reader.result : "";
          if (src && ref.current) {
            insertHtmlAtCursor(ref.current, `<img src="${src}" alt="" />`);
          }
        };
        reader.readAsDataURL(file);
      }
      return;
    }
  }

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
        data-placeholder="Type or paste from Word (text, tables and images are kept as they appear)."
        onPaste={handlePaste}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="ta-btn ta-btn--primary" disabled={saving} onClick={() => onSave(title, ref.current?.innerHTML || "")}>
          {saving ? "Savingâ€¦" : hasNote ? "Replace with text note" : "Save text note"}
        </button>
        <span className="ta-muted" style={{ fontSize: 12 }}>Paste from Word to keep formatting, tables and drawings. Images adjust to fit phones and other screens.</span>
      </div>
    </div>
  );
}

const CODE_NOTE_LANGUAGES = [
  { value: "plain", label: "Plain text" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "php", label: "PHP" },
  { value: "sql", label: "SQL" },
  { value: "vb", label: "Visual Basic" },
  { value: "csharp", label: "C#" },
];

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function codeToNoteHtml(language: string, code: string): string {
  const lang = (language || "plain").replace(/[^a-z0-9_-]/gi, "") || "plain";
  return `<pre data-note-kind="code" data-language="${escapeHtmlText(lang)}"><code class="language-${escapeHtmlText(lang)}">${escapeHtmlText(code)}</code></pre>`;
}

function parseCodeNoteHtml(html: string): { language: string; code: string } | null {
  if (typeof html !== "string") return null;
  const trimmed = html.trim();
  const isMarkedCode = /data-note-kind\s*=\s*(["'])code\1/i.test(trimmed);
  const isSinglePre = /^<pre\b[\s\S]*<\/pre>$/i.test(trimmed);
  if (!isMarkedCode && !isSinglePre) return null;

  const preMatch = trimmed.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
  if (!preMatch) return null;
  const preTag = trimmed.match(/<pre\b([^>]*)>/i)?.[1] || "";
  const langMatch = preTag.match(/data-language\s*=\s*(["'])(.*?)\1/i) || preTag.match(/class\s*=\s*(["']).*?\blanguage-([a-z0-9_-]+)\b.*?\1/i);
  const language = (langMatch?.[2] || "plain").trim() || "plain";
  const inner = preMatch[1].replace(/^<code\b[^>]*>/i, "").replace(/<\/code>$/i, "");
  const code = inner
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
  return { language, code };
}

function CodeNoteEditor({ subtopicId, saving, hasNote, defaultTitle, initialHtml, onSave }: { subtopicId: string; saving: boolean; hasNote: boolean; defaultTitle: string; initialHtml: string; onSave: (title: string, html: string) => void }) {
  const parsed = useMemo(() => parseCodeNoteHtml(initialHtml || ""), [initialHtml]);
  const [title, setTitle] = useState(defaultTitle);
  const [language, setLanguage] = useState(parsed?.language || "plain");
  const [code, setCode] = useState(parsed?.code || "");
  const [fileName, setFileName] = useState("");

  useEffect(() => { setTitle(defaultTitle); }, [defaultTitle, subtopicId]);
  useEffect(() => {
    setLanguage(parsed?.language || "plain");
    setCode(parsed?.code || "");
    setFileName("");
  }, [subtopicId, parsed?.language, parsed?.code]);

  function onAttachFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const extLang: Record<string, string> = { c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", java: "java", py: "python", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", html: "html", htm: "html", css: "css", php: "php", sql: "sql", vb: "vb", cs: "csharp" };
    if (extLang[ext]) setLanguage(extLang[ext]);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCode(text);
    };
    reader.readAsText(file);
  }

  const previewHtml = useMemo(() => codeToNoteHtml(language, code), [language, code]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="ta-muted" style={{ fontSize: 12, fontWeight: 600 }}>Option 3: Code note (andika au attach faili la code)</div>
      <input className="ta-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" style={{ maxWidth: 520 }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="ta-field" style={{ margin: 0, minWidth: 180 }}>
          <span style={{ fontSize: 12 }}>Lugha ya code</span>
          <select className="ta-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {CODE_NOTE_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <label className="ta-field" style={{ margin: 0, flex: "1 1 260px" }}>
          <span style={{ fontSize: 12 }}>Attach faili la code (hiari)</span>
          <input
            className="ta-input"
            type="file"
            accept=".txt,.c,.h,.cpp,.hpp,.cc,.cxx,.java,.py,.js,.jsx,.ts,.tsx,.html,.htm,.css,.php,.sql,.json,.xml,.vb,.cs,.rb,.go,.rs,.kt,.swift,.sh,.bat,.ps1,text/plain"
            onChange={(e) => onAttachFile(e.target.files?.[0] || null)}
          />
        </label>
        {fileName ? <span className="ta-muted" style={{ fontSize: 12 }}>Faili: {fileName}</span> : null}
      </div>
      <textarea
        className="ta-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={"Andika au paste code hapa..."}
        style={{ minHeight: 160, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13, whiteSpace: "pre", overflow: "auto" }}
      />
      <div>
        <div className="ta-muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Preview ya note (hivi ndivyo itakavyoonekana)</div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fff", maxHeight: 260, overflow: "auto" }}>
          {code.trim() ? <NoteContent html={previewHtml} /> : <span className="ta-muted" style={{ fontSize: 13 }}>Hakuna code bado.</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="ta-btn ta-btn--primary"
          disabled={saving || !code.trim()}
          onClick={() => onSave(title, codeToNoteHtml(language, code))}
        >
          {saving ? "Savingâ€¦" : hasNote ? "Replace with code note" : "Save code note"}
        </button>
        <span className="ta-muted" style={{ fontSize: 12 }}>Andika/paste code au attach faili, kisha angalia preview na uhifadhi. Baadaye unaweza ku-publish ili wanafunzi waione.</span>
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
        Attach one or more pictures to this subtopic. Add a caption such as â€œMchoro 1.42: ...â€. Students see the diagrams when the note above is published.
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
          {uploading ? "Uploadingâ€¦" : "Upload diagram"}
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
          {saving ? "Savingâ€¦" : "Save caption"}
        </button>
        <button type="button" className="ta-btn ta-btn--ghost ta-btn--danger" disabled={saving} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
