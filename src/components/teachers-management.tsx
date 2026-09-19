"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteTeacher,
  fetchClassesWithStreams,
  fetchSubjects,
  fetchTeachers,
  fetchTeachingAssignmentCounts,
  fetchTeachingAssignments,
  insertTeacher,
  saveTeachingAssignments,
  updateTeacher,
  type DbClassRow,
  type DbSubjectRow,
  type DbTeacherRow,
  type Gender,
  type TeachingScope,
} from "@/lib/school-api";
import { ListRowSkeleton, Spinner } from "@/components/loading";

type ToastType = "success" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ClassOption {
  id: string;
  name: string;
  streams: { id: string; name: string }[];
}

interface TeacherForm {
  first: string;
  middle: string;
  last: string;
  gender: Gender;
  phone: string;
  email: string;
  password: string;
}

interface AssignmentDraft {
  key: string;
  subjectId: string;
  classId: string;
  streamName: string;
  scope: TeachingScope;
}

let toastId = 0;
const PAGE_SIZE = 12;

function emptyForm(): TeacherForm {
  return { first: "", middle: "", last: "", gender: "Male", phone: "", email: "", password: "" };
}

function emptyDraft(): AssignmentDraft {
  return { key: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), subjectId: "", classId: "", streamName: "", scope: "General" };
}

function teacherName(row: DbTeacherRow): string {
  if (row.first_name || row.last_name) {
    return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
  }
  return row.name;
}

function initialsOf(row: DbTeacherRow): string {
  const first = row.first_name?.[0] ?? row.name?.[0] ?? "";
  const last = row.last_name?.[0] ?? row.name?.split(" ").pop()?.[0] ?? "";
  return (first + last).toUpperCase();
}

export default function TeachersManagement() {
  const [teachers, setTeachers] = useState<DbTeacherRow[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<DbSubjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "delete">(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<DbTeacherRow | null>(null);
  const [assignDrafts, setAssignDrafts] = useState<AssignmentDraft[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // ── Load data ──────────────────────────────────────────
  useEffect(() => {
    fetchClassesWithStreams()
      .then((rows: DbClassRow[]) =>
        setClasses(rows.map((r) => ({ id: r.id, name: r.name, streams: r.streams }))),
      )
      .catch(() => setClasses([]));
    fetchSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setDbError(false);
    try {
      const result = await fetchTeachers({ search: debouncedSearch, page, pageSize: PAGE_SIZE });
      setTeachers(result.rows);
      setTotal(result.total);
      fetchTeachingAssignmentCounts(result.rows.map((r) => r.id))
        .then(setAssignmentCounts)
        .catch(() => setAssignmentCounts({}));
    } catch {
      setDbError(true);
      setTeachers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setDbError(false);
      try {
        const result = await fetchTeachers({ search: debouncedSearch, page, pageSize: PAGE_SIZE });
        if (!active) return;
        setTeachers(result.rows);
        setTotal(result.total);
        const counts = await fetchTeachingAssignmentCounts(result.rows.map((r) => r.id)).catch(() => ({}));
        if (active) setAssignmentCounts(counts);
      } catch {
        if (!active) return;
        setDbError(true);
        setTeachers([]);
        setTotal(0);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [debouncedSearch, page]);

  useEffect(() => {
    return () => { timersRef.current.forEach((t) => clearTimeout(t)); };
  }, []);

  // ── Toast helpers ──────────────────────────────────────
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

  // ── Register / Edit ────────────────────────────────────
  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(row: DbTeacherRow) {
    setEditingId(row.id);
    setForm({
      first: row.first_name ?? "",
      middle: row.middle_name ?? "",
      last: row.last_name ?? row.name.split(" ").pop() ?? "",
      gender: (row.gender as Gender) ?? "Male",
      phone: row.phone ?? "",
      email: row.email ?? "",
      password: row.password ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (saving) return;
    const first = form.first.trim();
    const last = form.last.trim();
    if (!first || !last) {
      showToast("warning", "First name and last name are required.");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast("warning", "Please enter a valid email address.");
      return;
    }

    setSaving("save");
    const payload = {
      first_name: first,
      middle_name: form.middle.trim() || null,
      last_name: last,
      gender: form.gender,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      password: form.password.trim() || null,
    };

    try {
      let saved: DbTeacherRow;
      if (editingId) {
        saved = await updateTeacher(editingId, payload);
        showToast("success", `Teacher "${first} ${last}" updated.`);
      } else {
        saved = await insertTeacher(payload);
        showToast("success", `Teacher "${first} ${last}" registered.`);
      }

      if (payload.email && payload.password) {
        try {
          const res = await fetch("/api/teacher-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ staffId: saved.id, email: payload.email, password: payload.password, displayName: `${first} ${last}` }),
          });
          if (!res.ok) showToast("warning", "Teacher saved but login account could not be created.");
        } catch {
          showToast("warning", "Teacher saved but login account could not be created.");
        }
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      if (editingId) await loadPage();
      else setPage(1);
    } catch {
      showToast("warning", "Database unavailable. Teacher not saved.");
    } finally {
      setSaving(null);
    }
  }

  // ── Delete ─────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (saving) return;
    const deleted = teachers.find((t) => t.id === id);
    setSaving("delete");
    try {
      try {
        await fetch("/api/teacher-account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId: id }),
        });
      } catch {}
      await deleteTeacher(id);
      showToast("warning", `Teacher "${deleted ? teacherName(deleted) : "record"}" deleted.`);
      if (teachers.length === 1 && page > 1) setPage(page - 1);
      else await loadPage();
    } catch {
      showToast("warning", "Database unavailable. Teacher not deleted.");
    } finally {
      setSaving(null);
      setDeleteConfirm(null);
    }
  }

  // ── Teaching Assignments ───────────────────────────────
  function openAssign(row: DbTeacherRow) {
    setAssignTarget(row);
    setAssignDrafts([]);
    setAssignSaving(true);
    fetchTeachingAssignments(row.id)
      .then((rows) => {
        setAssignDrafts(
          rows.length > 0
            ? (() => {
                const grouped = new Map<string, { draft: AssignmentDraft; streams: Set<string> }>();
                for (const assignment of rows) {
                  const key = `${assignment.subject_id}|${assignment.class_id}`;
                  const classStreams = classes.find((c) => c.id === assignment.class_id)?.streams ?? [];
                  const streamName = classStreams.find((stream) => stream.id === assignment.stream_id)?.name;
                  const current = grouped.get(key) ?? {
                    draft: {
                      key: assignment.id,
                      subjectId: assignment.subject_id,
                      classId: assignment.class_id,
                      streamName: streamName ?? "",
                      scope: "General" as TeachingScope,
                    },
                    streams: new Set<string>(),
                  };
                  if (streamName) current.streams.add(streamName);
                  current.draft.scope = current.streams.has("General") && current.streams.has("Vocational")
                    ? "Both"
                    : current.streams.has("Vocational")
                      ? "Vocational"
                      : "General";
                  grouped.set(key, current);
                }
                return Array.from(grouped.values()).map((entry) => entry.draft);
              })()
            : [emptyDraft()],
        );
      })
      .catch(() => setAssignDrafts([emptyDraft()]))
      .finally(() => setAssignSaving(false));
  }

  function addDraft() {
    setAssignDrafts((prev) => [...prev, emptyDraft()]);
  }

  function removeDraft(key: string) {
    setAssignDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  }

  function updateDraft(key: string, field: "subjectId" | "classId" | "streamName" | "scope", value: string) {
    setAssignDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d;
        if (field === "classId") return { ...d, classId: value, streamName: "", subjectId: "", scope: "General" };
        if (field === "streamName") return { ...d, streamName: value, subjectId: "", scope: value === "Vocational" ? "Vocational" : "General" };
        if (field === "scope" && (value === "General" || value === "Vocational" || value === "Both")) {
          const selectedSubject = subjects.find((item) => item.id === d.subjectId);
          const subjectStillFits = selectedSubject
            ? selectedSubject.stream === "Both" || selectedSubject.stream === d.streamName
            : true;
          return { ...d, scope: value, subjectId: subjectStillFits ? d.subjectId : "" };
        }
        if (field === "subjectId") {
          const subject = subjects.find((item) => item.id === value);
          const scope = subject?.stream === "Vocational" ? "Vocational" : d.streamName === "Vocational" ? "Vocational" : "General";
          return { ...d, subjectId: value, scope };
        }
        return d;
      }),
    );
  }

  async function saveAssignments() {
    if (!assignTarget || assignSaving) return;
    const valid: { subject_id: string; class_id: string; stream_id: string }[] = [];
    for (const draft of assignDrafts) {
      if (!draft.subjectId || !draft.classId || !draft.streamName) continue;
      const subject = subjects.find((item) => item.id === draft.subjectId);
      const classOption = classes.find((item) => item.id === draft.classId);
      if (!subject || !classOption) {
        showToast("warning", "Every assignment must have a valid subject and class.");
        return;
      }
      if (!classOption.streams.some((stream) => stream.name === draft.streamName)) {
        showToast("warning", `${classOption.name} does not have a ${draft.streamName} stream.`);
        return;
      }
      if (subject.stream !== "Both" && subject.stream !== draft.streamName) {
        showToast("warning", `${subject.name} is not offered in the ${draft.streamName} stream.`);
        return;
      }
      const allowedScopes: TeachingScope[] = subject.stream === "Both"
        ? ["General", "Vocational", "Both"]
        : [subject.stream];
      if (!allowedScopes.includes(draft.scope)) {
        showToast("warning", `${subject.name} can only be taught in its configured stream.`);
        return;
      }
      if (draft.scope !== "Both" && draft.scope !== draft.streamName) {
        showToast("warning", `Teaching scope must match the selected ${draft.streamName} stream or be Both.`);
        return;
      }
      const selectedStreams = draft.scope === "Both" ? ["General", "Vocational"] : [draft.scope];
      for (const streamName of selectedStreams) {
        const stream = classOption.streams.find((item) => item.name === streamName);
        if (!stream) {
          showToast("warning", `${classOption.name} does not have a ${streamName} stream.`);
          return;
        }
        valid.push({ subject_id: draft.subjectId, class_id: draft.classId, stream_id: stream.id });
      }
    }
    setAssignSaving(true);
    try {
      await saveTeachingAssignments(assignTarget.id, valid);
      showToast("success", `Assignments saved for ${teacherName(assignTarget)}.`);
      fetchTeachingAssignmentCounts([assignTarget.id])
        .then((counts) => setAssignmentCounts((prev) => ({ ...prev, ...counts })))
        .catch(() => {});
      setAssignTarget(null);
    } catch {
      showToast("warning", "Database unavailable. Assignments not saved.");
    } finally {
      setAssignSaving(false);
    }
  }

  // ── Derived ────────────────────────────────────────────
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      {/* Toast */}
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

      {/* Header */}
      <div className="page-head">
        <div>
          <h2 className="page-title">Teachers</h2>
          <p className="page-sub">Register teachers and assign their teaching subjects and classes.</p>
        </div>
        <div className="page-head-right">
          {total > 0 && <span className="active-chip">{total.toLocaleString()} Teachers</span>}
          <button className="sm-add-btn" onClick={openNew}>+ Register Teacher</button>
        </div>
      </div>

      {/* Search */}
      <div className="sm-search-bar">
        <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input className="sm-search" type="text" placeholder="Search by name, email or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      {dbError ? (
        <div className="sm-table-wrap">
          <div className="st-empty-state">
            Could not load teachers from the database.
            <div><button className="cm-btn cm-btn--ghost st-retry" onClick={loadPage}>Retry</button></div>
          </div>
        </div>
      ) : loading ? (
        <div className="sm-table-wrap">
          <div className="sm-table-skeleton">
            <ListRowSkeleton cols={4} />
            <ListRowSkeleton cols={4} />
            <ListRowSkeleton cols={4} />
            <ListRowSkeleton cols={4} />
            <ListRowSkeleton cols={4} />
          </div>
        </div>
      ) : (
        <div className="sm-table-wrap">
          <table className="sm-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Sex</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Assignments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.length === 0 && (
                <tr><td colSpan={6} className="sm-empty">No teachers registered yet.</td></tr>
              )}
              {teachers.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="st-student">
                      <span className={`st-avatar${row.gender === "Female" ? " st-avatar--female" : ""}`}>
                        {initialsOf(row)}
                      </span>
                      <div>
                        <div className="st-student-name">{teacherName(row)}</div>
                        <div className="st-student-sub">ID {row.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`st-badge st-badge--${row.gender === "Male" ? "male" : row.gender === "Female" ? "female" : "form"}`}>
                      {row.gender ?? "—"}
                    </span>
                  </td>
                  <td><span className="st-phone">{row.phone ?? "—"}</span></td>
                  <td><span className="st-email">{row.email ?? "—"}</span></td>
                  <td>
                    {assignmentCounts[row.id] ? (
                      <span className="ta-count-chip">{assignmentCounts[row.id]}</span>
                    ) : (
                      <span className="ta-count-zero">—</span>
                    )}
                  </td>
                  <td>
                    <div className="sm-actions">
                      <button className="cm-icon-btn cm-icon-btn--sm" title="Assign subjects" onClick={() => openAssign(row)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                      </button>
                      <button className="cm-icon-btn cm-icon-btn--sm" title="Edit teacher" onClick={() => openEdit(row)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger" title="Delete teacher" onClick={() => setDeleteConfirm(row.id)}>
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

      {/* Pagination */}
      {!loading && !dbError && total > 0 && (
        <div className="st-pagination">
          <span className="st-pagination-info">Showing {from}–{to} of {total.toLocaleString()} teachers</span>
          <div className="st-pagination-controls">
            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{'\u2190'} Prev</button>
            <span className="st-pagination-info" style={{ display: "inline-flex", alignItems: "center", padding: "0 .4rem" }}>Page {page} of {pageCount}</span>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next {'\u2192'}</button>
          </div>
        </div>
      )}

      {/* ─── Register / Edit Modal ──────────────────────── */}
      {showForm && (
        <div className="cm-modal-backdrop" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="st-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <span className="st-modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>
              </span>
              <div>
                <h3 className="st-modal-title">{editingId ? "Edit Teacher" : "Register Teacher"}</h3>
                <p className="st-modal-sub">{editingId ? "Update this teacher's profile." : "Fill in the teacher's personal details below."}</p>
              </div>
              <button className="st-modal-close" onClick={() => { setShowForm(false); setEditingId(null); }} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="st-form">
              <div className="st-section">
                <div className="st-section-label">Personal Details</div>
                <div className="st-grid st-grid--3">
                  <label className="st-field">
                    <span className="st-field-label">First Name <em>*</em></span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="text" placeholder="e.g. Juma" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} autoFocus />
                    </div>
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Middle Name</span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="text" placeholder="e.g. Salum" value={form.middle} onChange={(e) => setForm({ ...form, middle: e.target.value })} />
                    </div>
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Last Name <em>*</em></span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="text" placeholder="e.g. Mwakasege" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
                    </div>
                  </label>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-label">Sex</div>
                <div className="st-grid st-grid--1">
                  <div className="st-seg" role="radiogroup" aria-label="Sex">
                    <button type="button" className={form.gender === "Male" ? "st-seg--active" : ""} onClick={() => setForm({ ...form, gender: "Male" })}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="8"/><path d="m19 5 3-3"/><path d="m14 2 3 3-3 3"/><path d="M19 7v4"/></svg>
                      Male
                    </button>
                    <button type="button" className={form.gender === "Female" ? "st-seg--active st-seg--female" : ""} onClick={() => setForm({ ...form, gender: "Female" })}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v9"/><path d="M12 13a5 5 0 0 0 5 5h3" transform="translate(0 -3)"/><path d="M12 21a5 5 0 0 1-5-5V9"/></svg>
                      Female
                    </button>
                  </div>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-label">Contact</div>
                <div className="st-grid st-grid--2">
                  <label className="st-field">
                    <span className="st-field-label">Phone Number</span>
                    <div className="st-input-wrap">
                      <input className="st-input st-input--tel" type="tel" placeholder="e.g. 0712345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Email</span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="email" placeholder="e.g. teacher@amalischool.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </label>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-label">Account</div>
                <div className="st-grid st-grid--1">
                  <label className="st-field">
                    <span className="st-field-label">Password</span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="password" placeholder="Portal login password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="st-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${saving === "save" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={handleSave}>
                {saving === "save" ? <><Spinner size={14} /> {editingId ? "Updating" : "Registering"}{'\u2026'}</> : editingId ? "Update Teacher" : "Register Teacher"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm ─────────────────────────────── */}
      {deleteConfirm && (
        <div className="cm-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Confirm Delete</h3>
            <p className="cm-modal-text">Are you sure you want to delete this teacher record? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--danger${saving === "delete" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={() => handleDelete(deleteConfirm)}>
                {saving === "delete" ? <><Spinner size={14} /> Deleting{'\u2026'}</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Teaching Assignments Modal ──────────────────── */}
      {assignTarget && (
        <div className="cm-modal-backdrop" onClick={() => { if (!assignSaving) setAssignTarget(null); }}>
          <div className="sm-modal assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">Assign Teaching Subjects</h3>
              <p className="sm-modal-sub">{teacherName(assignTarget)} · ID {assignTarget.id.slice(0, 8)}</p>
            </div>

            {assignSaving && assignDrafts.length === 0 ? (
              <div className="ta-loading"><Spinner size={20} /></div>
            ) : (
              <>
                <p className="st-subjects-hint">Select a class and stream first. Only subjects offered in that stream will then be available.</p>
                <div className="ta-rows">
                  {assignDrafts.map((draft) => {
                    const selectedSubject = subjects.find((s) => s.id === draft.subjectId);
                    const streamOptions = classes.find((c) => c.id === draft.classId)?.streams ?? [];
                    const scopeOptions: TeachingScope[] = selectedSubject
                      ? selectedSubject.stream === "Both"
                        ? ["General", "Vocational", "Both"]
                        : [draft.streamName || selectedSubject.stream] as TeachingScope[]
                      : draft.streamName
                        ? [draft.streamName as TeachingScope]
                        : [];
                    return (
                      <div className="ta-row" key={draft.key}>
                        <select className="ta-select" value={draft.classId} onChange={(e) => updateDraft(draft.key, "classId", e.target.value)}>
                          <option value="">Class…</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select
                          className="ta-select"
                          value={draft.streamName}
                          onChange={(e) => updateDraft(draft.key, "streamName", e.target.value)}
                          disabled={!draft.classId}
                        >
                          <option value="">{draft.classId ? "Stream…" : "Class first"}</option>
                          {streamOptions.map((stream) => <option key={stream.id} value={stream.name}>{stream.name}</option>)}
                        </select>
                        <select
                          className="ta-select"
                          value={draft.subjectId}
                          onChange={(e) => updateDraft(draft.key, "subjectId", e.target.value)}
                          disabled={!draft.streamName}
                        >
                          <option value="">{draft.streamName ? "Subject…" : "Stream first"}</option>
                          {subjects
                            .filter((subject) => subject.stream === "Both" || subject.stream === draft.streamName)
                            .map((subject) => <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>)}
                        </select>
                        {selectedSubject?.stream === "Both" && (
                          <select className="ta-select" value={draft.scope} onChange={(e) => updateDraft(draft.key, "scope", e.target.value)}>
                            {scopeOptions.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
                          </select>
                        )}
                        <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger ta-remove" title="Remove" onClick={() => removeDraft(draft.key)} disabled={assignDrafts.length <= 1}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button className="ta-add-btn cm-btn cm-btn--ghost cm-btn--sm" onClick={addDraft}>+ Add Assignment</button>
              </>
            )}

            <div className="sm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={assignSaving} onClick={() => setAssignTarget(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${assignSaving ? " btn-loading" : ""}`} disabled={assignSaving} onClick={saveAssignments}>
                {assignSaving ? <><Spinner size={14} /> Saving{'\u2026'}</> : "Save Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}