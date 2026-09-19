"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteStudent,
  fetchClassesWithStreams,
  fetchStudentSubjects,
  fetchStudents,
  fetchSubjects,
  insertStudent,
  saveStudentSubjects,
  updateStudent,
  type DbClassRow,
  type DbStudentRow,
  type DbSubjectRow,
  type Gender,
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

interface StudentForm {
  first: string;
  middle: string;
  last: string;
  gender: Gender;
  phone: string;
  classId: string;
  streamId: string;
}

interface StudentImportRow {
  line: number;
  first: string;
  middle: string;
  last: string;
  gender: string;
  className: string;
  streamName: string;
  phone: string;
  optionalCodes: string[];
}

let toastId = 0;
const PAGE_SIZE = 10;

function emptyForm(): StudentForm {
  return { first: "", middle: "", last: "", gender: "Male", phone: "", classId: "", streamId: "" };
}

function initialsOf(row: DbStudentRow): string {
  return (row.first_name[0] ?? "").toUpperCase() + (row.last_name[0] ?? "").toUpperCase();
}

function fullName(row: DbStudentRow): string {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (!digits) return null;
  if (!/^(\+255|0)[67]\d{8}$/.test(digits)) return null;
  return digits;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("A quoted CSV value was not closed.");
  values.push(value.trim());
  return values;
}

function parseStudentCsv(text: string): StudentImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataLines = lines.filter((line) => !line.startsWith("#"));
  if (dataLines.length < 2) throw new Error("CSV must contain a header row and at least one student row.");
  const headers = parseCsvLine(dataLines[0]).map((header) => header.toLowerCase());
  const expected = ["first_name", "middle_name", "last_name", "sex", "class", "stream", "phone", "optional_subject_codes"];
  if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) {
    throw new Error(`CSV headers must be exactly: ${expected.join(",")}`);
  }
  return dataLines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== expected.length) throw new Error(`Line ${index + 2} must contain ${expected.length} columns.`);
    return {
      line: index + 2,
      first: values[0],
      middle: values[1],
      last: values[2],
      gender: values[3],
      className: values[4],
      streamName: values[5],
      phone: values[6],
      optionalCodes: values[7] ? values[7].split(",").map((code) => code.trim()).filter(Boolean) : [],
    };
  });
}

export default function StudentsManagement() {
  const [students, setStudents] = useState<DbStudentRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<DbSubjectRow[]>([]);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "delete">(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<DbStudentRow | null>(null);
  const [assignOptional, setAssignOptional] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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
      const result = await fetchStudents({
        search: debouncedSearch,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setStudents(result.rows);
      setTotal(result.total);
    } catch {
      setDbError(true);
      setStudents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, classFilter, streamFilter, page]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setDbError(false);
      try {
        const result = await fetchStudents({
          search: debouncedSearch,
          classId: classFilter || undefined,
          streamId: streamFilter || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!active) return;
        setStudents(result.rows);
        setTotal(result.total);
      } catch {
        if (!active) return;
        setDbError(true);
        setStudents([]);
        setTotal(0);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [debouncedSearch, classFilter, streamFilter, page]);

  useEffect(() => {
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

  function validateImportRows(rows: StudentImportRow[]): { row: StudentImportRow; classOption: ClassOption; streamId: string; optionalIds: string[] }[] {
    const seen = new Set<string>();
    return rows.map((row) => {
      const prefix = `Line ${row.line}:`;
      if (!row.first || !row.last) throw new Error(`${prefix} first_name and last_name are required.`);
      if (row.gender !== "Male" && row.gender !== "Female") {
        throw new Error(`${prefix} sex must be exactly Male or Female.`);
      }
      const classOption = classes.find((item) => item.name === row.className);
      if (!classOption) throw new Error(`${prefix} class must exactly match a configured class: "${row.className}".`);
      const stream = classOption.streams.find((item) => item.name === row.streamName);
      if (!stream) throw new Error(`${prefix} stream "${row.streamName}" is not configured for class "${row.className}".`);
      const phone = normalizePhone(row.phone);
      if (row.phone && !phone) throw new Error(`${prefix} phone is not a valid Tanzanian number.`);
      const applicableOptional = subjects.filter(
        (subject) =>
          subject.subject_type === "Optional" &&
          (subject.stream === row.streamName || subject.stream === "Both"),
      );
      const optionalByCode = new Map(applicableOptional.map((subject) => [subject.code, subject]));
      const optionalIds = row.optionalCodes.map((code) => {
        const subject = optionalByCode.get(code);
        if (!subject) throw new Error(`${prefix} optional subject code "${code}" is not valid for stream "${row.streamName}".`);
        return subject.id;
      });
      const duplicateKey = `${row.first.toLowerCase()}|${row.last.toLowerCase()}|${classOption.id}|${stream.id}`;
      if (seen.has(duplicateKey)) throw new Error(`${prefix} duplicates another student in this CSV.`);
      seen.add(duplicateKey);
      return { row: { ...row, phone: phone ?? "" }, classOption, streamId: stream.id, optionalIds };
    });
  }

  async function handleImportFile(file: File) {
    if (importing) return;
    setImporting(true);
    try {
      const rows = validateImportRows(parseStudentCsv(await file.text()));
      for (const { row, classOption, streamId, optionalIds } of rows) {
        const inserted = await insertStudent({
          first_name: row.first,
          middle_name: row.middle || null,
          last_name: row.last,
          gender: row.gender === "Male" ? "Male" : "Female",
          phone: normalizePhone(row.phone),
          class_id: classOption.id,
          stream_id: streamId,
        });
        await saveStudentSubjects(inserted.id, optionalIds);
      }
      showToast("success", `Imported ${rows.length} student${rows.length === 1 ? "" : "s"}.`);
      setPage(1);
      await loadPage();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The CSV could not be imported.";
      showToast("warning", `Import failed: ${message}`);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  const streamOptions =
    classes.find((c) => c.id === (classFilter || form.classId))?.streams ?? [];

  function onClassFilterChange(value: string) {
    setClassFilter(value);
    setStreamFilter("");
    setPage(1);
  }

  // ---- Form helpers ----
  function toggleOptional(id: string, checked: boolean) {
    setSelectedOptional((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );
  }

  function recomputeOptionalForStream(classId: string, streamId: string) {
    const streamName =
      classes.find((c) => c.id === classId)?.streams.find((s) => s.id === streamId)?.name ?? "";
    const pool = new Set(
      subjects
        .filter((s) => s.subject_type === "Optional" && (s.stream === streamName || s.stream === "Both"))
        .map((s) => s.id),
    );
    setSelectedOptional((prev) => prev.filter((id) => pool.has(id)));
  }

  function openNew() {
    setForm(emptyForm());
    setEditingId(null);
    setSelectedOptional([]);
    setShowForm(true);
  }

  function openEdit(row: DbStudentRow) {
    setEditingId(row.id);
    setForm({
      first: row.first_name,
      middle: row.middle_name ?? "",
      last: row.last_name,
      gender: row.gender,
      phone: row.phone ?? "",
      classId: row.class_id ?? "",
      streamId: row.stream_id ?? "",
    });
    setSelectedOptional([]);
    setShowForm(true);
    const streamName =
      classes.find((c) => c.id === row.class_id)?.streams.find((s) => s.id === row.stream_id)?.name ?? "";
    const pool = new Set(
      subjects
        .filter((s) => s.subject_type === "Optional" && (s.stream === streamName || s.stream === "Both"))
        .map((s) => s.id),
    );
    fetchStudentSubjects(row.id)
      .then((ids) => setSelectedOptional(ids.filter((id) => pool.has(id))))
      .catch(() => setSelectedOptional([]));
  }

  function onFormClassChange(classId: string) {
    const formStreamOptions = classes.find((c) => c.id === classId)?.streams ?? [];
    const keepStream = formStreamOptions.some((s) => s.id === form.streamId) ? form.streamId : "";
    setForm((prev) => ({
      ...prev,
      classId,
      streamId: keepStream,
    }));
    recomputeOptionalForStream(classId, keepStream);
  }

  async function handleSave() {
    if (saving) return;
    const first = form.first.trim();
    const last = form.last.trim();
    if (!first || !last) {
      showToast("warning", "First name and last name are required.");
      return;
    }
    if (!form.classId) {
      showToast("warning", "Please select a class.");
      return;
    }
    if (!form.streamId) {
      showToast("warning", "Please select a stream.");
      return;
    }
    const phone = normalizePhone(form.phone);
    if (form.phone.trim() && !phone) {
      showToast("warning", "Phone must be a valid Tanzanian number, e.g. 0712345678 or +255712345678.");
      return;
    }

    setSaving("save");
    const payload = {
      first_name: first,
      middle_name: form.middle.trim() || null,
      last_name: last,
      gender: form.gender,
      phone,
      class_id: form.classId,
      stream_id: form.streamId,
    };

    const streamName =
      classes.find((c) => c.id === form.classId)?.streams.find((s) => s.id === form.streamId)?.name ?? "";
    const assignedSubjectIds = [
      ...subjects
        .filter((s) => (s.stream === streamName || s.stream === "Both") && s.subject_type === "Compulsory")
        .map((s) => s.id),
      ...selectedOptional.filter((id) =>
        subjects.some((s) => s.id === id && (s.stream === streamName || s.stream === "Both")),
      ),
    ];

    try {
      if (editingId) {
        await updateStudent(editingId, payload);
        await saveStudentSubjects(editingId, assignedSubjectIds);
        showToast("success", `Student "${first} ${last}" updated.`);
      } else {
        const inserted = await insertStudent(payload);
        await saveStudentSubjects(inserted.id, assignedSubjectIds);
        showToast("success", `Student "${first} ${last}" registered.`);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      setSelectedOptional([]);
      if (editingId) {
        await loadPage();
      } else {
        setPage(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the student record.";
      showToast("warning", `Student not saved: ${message}`);
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    if (saving) return;
    const deleted = students.find((s) => s.id === id);
    setSaving("delete");
    try {
      await deleteStudent(id);
      showToast("warning", `Student "${deleted ? fullName(deleted) : "record"}" deleted.`);
      if (students.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await loadPage();
      }
    } catch {
      showToast("warning", "Database unavailable. Student not deleted.");
    } finally {
      setSaving(null);
      setDeleteConfirm(null);
    }
  }

  function toggleAssignOptional(id: string, checked: boolean) {
    setAssignOptional((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );
  }

  function openAssign(row: DbStudentRow) {
    setAssignTarget(row);
    setAssignOptional([]);
    const streamName =
      classes.find((c) => c.id === row.class_id)?.streams.find((s) => s.id === row.stream_id)?.name ?? "";
    const pool = new Set(
      subjects
        .filter((s) => s.subject_type === "Optional" && (s.stream === streamName || s.stream === "Both"))
        .map((s) => s.id),
    );
    fetchStudentSubjects(row.id)
      .then((ids) => setAssignOptional(ids.filter((id) => pool.has(id))))
      .catch(() => setAssignOptional([]));
  }

  async function saveAssignments() {
    if (!assignTarget || assignSaving) return;
    const row = assignTarget;
    const streamName =
      classes.find((c) => c.id === row.class_id)?.streams.find((s) => s.id === row.stream_id)?.name ?? "";
    const assignedSubjectIds = [
      ...subjects
        .filter((s) => (s.stream === streamName || s.stream === "Both") && s.subject_type === "Compulsory")
        .map((s) => s.id),
      ...assignOptional.filter((id) =>
        subjects.some((s) => s.id === id && (s.stream === streamName || s.stream === "Both")),
      ),
    ];
    setAssignSaving(true);
    try {
      await saveStudentSubjects(row.id, assignedSubjectIds);
      showToast("success", `Subjects assigned to ${fullName(row)}.`);
      setAssignTarget(null);
    } catch {
      showToast("warning", "Database unavailable. Subjects not saved.");
    } finally {
      setAssignSaving(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasFilters = Boolean(classFilter || streamFilter || debouncedSearch);
  const phoneInvalid = Boolean(form.phone.trim()) && normalizePhone(form.phone) === null;

  const selectedStreamName =
    classes.find((c) => c.id === form.classId)?.streams.find((s) => s.id === form.streamId)?.name ?? "";
  const applicableSubjects = form.streamId
    ? subjects.filter((s) => s.stream === selectedStreamName || s.stream === "Both")
    : [];

  const assignStreamName = assignTarget
    ? classes.find((c) => c.id === assignTarget.class_id)?.streams.find((s) => s.id === assignTarget.stream_id)?.name ?? ""
    : "";
  const assignApplicable =
    assignTarget && assignTarget.stream_id
      ? subjects.filter((s) => s.stream === assignStreamName || s.stream === "Both")
      : [];

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
          <h2 className="page-title">Students</h2>
          <p className="page-sub">Register and manage student records (3 names, class, stream, phone).</p>
        </div>
        <div className="page-head-right">
          {total > 0 && <span className="active-chip">● {total.toLocaleString()} Students</span>}
          <a className="cm-btn cm-btn--ghost cm-btn--sm" href="/student-import-template.csv" download>
            Download CSV template
          </a>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={importing} onClick={() => importInputRef.current?.click()}>
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button className="sm-add-btn" onClick={openNew}>+ Register Student</button>
        </div>
      </div>

      <div className="st-toolbar">
        <div className="sm-search-bar" style={{ flex: 1, marginBottom: 0 }}>
          <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="sm-search"
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="st-filter__wrap">
          <select className="st-filter" value={classFilter} onChange={(e) => onClassFilterChange(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="st-filter__wrap">
          <select
            className="st-filter"
            value={streamFilter}
            onChange={(e) => { setStreamFilter(e.target.value); setPage(1); }}
            disabled={!classFilter}
          >
            <option value="">All streams</option>
            {streamOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            className="st-reset"
            onClick={() => { setSearch(""); setDebouncedSearch(""); setClassFilter(""); setStreamFilter(""); setPage(1); }}
          >
            × Clear filters
          </button>
        )}
      </div>

      {dbError ? (
        <div className="sm-table-wrap">
          <div className="st-empty-state">
            Could not load students from the database.
            <div>
              <button className="cm-btn cm-btn--ghost st-retry" onClick={loadPage}>Retry</button>
            </div>
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
                <th>Student</th>
                <th>Class</th>
                <th>Stream</th>
                <th>Sex</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr><td colSpan={6} className="st-empty-state">
                  {hasFilters ? "No students match the current filters." : "No students registered yet."}
                </td></tr>
              )}
              {students.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="st-student">
                      <span className={`st-avatar${row.gender === "Female" ? " st-avatar--female" : ""}`}>
                        {initialsOf(row)}
                      </span>
                      <div>
                        <div className="st-student-name">{fullName(row)}</div>
                        <div className="st-student-sub">{row.gender} · ID {row.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="st-badge st-badge--form">{row.school_classes?.name ?? "—"}</span></td>
                  <td>{row.streams?.name ?? "—"}</td>
                  <td>
                    <span className={`st-badge st-badge--${row.gender === "Male" ? "male" : "female"}`}>
                      {row.gender}
                    </span>
                  </td>
                  <td><span className="st-phone">{row.phone ?? "—"}</span></td>
                  <td>
                    <div className="sm-actions">
                      <button className="cm-icon-btn cm-icon-btn--sm" title="Assign subjects" onClick={() => openAssign(row)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                      </button>
                      <button className="cm-icon-btn cm-icon-btn--sm" title="Edit student" onClick={() => openEdit(row)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger" title="Delete student" onClick={() => setDeleteConfirm(row.id)}>
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

      {!loading && !dbError && total > 0 && (
        <div className="st-pagination">
          <span className="st-pagination-info">
            Showing {from}–{to} of {total.toLocaleString()} students
          </span>
          <div className="st-pagination-controls">
            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="st-pagination-info" style={{ display: "inline-flex", alignItems: "center", padding: "0 .4rem" }}>
              Page {page} of {pageCount}
            </span>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="cm-modal-backdrop" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="st-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <span className="st-modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              <div>
                <h3 className="st-modal-title">{editingId ? "Edit Student" : "Register Student"}</h3>
                <p className="st-modal-sub">{editingId ? "Update this student record." : "Fill in the details to register a new student."}</p>
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
                    <button
                      type="button"
                      className={form.gender === "Male" ? "st-seg--active" : ""}
                      onClick={() => setForm({ ...form, gender: "Male" })}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="14" r="8"/><path d="m19 5 3-3"/><path d="m14 2 3 3-3 3"/><path d="M19 7v4"/></svg>
                      Male
                    </button>
                    <button
                      type="button"
                      className={form.gender === "Female" ? "st-seg--active st-seg--female" : ""}
                      onClick={() => setForm({ ...form, gender: "Female" })}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v9"/><path d="M12 13a5 5 0 0 0 5 5h3" transform="translate(0 -3)"/><path d="M12 21a5 5 0 0 1-5-5V9"/></svg>
                      Female
                    </button>
                  </div>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-label">Class &amp; Stream</div>
                <div className="st-grid st-grid--2">
                  <label className="st-field">
                    <span className="st-field-label">Class <em>*</em></span>
                    <div className="st-input-wrap">
                      <select className="st-input" value={form.classId} onChange={(e) => onFormClassChange(e.target.value)}>
                        <option value="">Select class…</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <span className="st-select-caret">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </span>
                    </div>
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">Stream <em>*</em></span>
                    <div className="st-input-wrap">
                      <select className="st-input" value={form.streamId} onChange={(e) => { const v = e.target.value; setForm((prev) => ({ ...prev, streamId: v })); recomputeOptionalForStream(form.classId, v); }} disabled={!form.classId}>
                        <option value="">{form.classId ? "Select stream…" : "Select class first"}</option>
                        {(classes.find((c) => c.id === form.classId)?.streams ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <span className="st-select-caret">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {form.streamId && applicableSubjects.length > 0 && (
                <div className="st-section">
                  <div className="st-section-label">Assigned Subjects</div>
                  <p className="st-subjects-hint">
                    Compulsory subjects of this stream are added automatically. Tick the optional ones for this student.
                  </p>
                  <div className="st-subjects">
                    {applicableSubjects.map((s) => (
                      <label
                        key={s.id}
                        className={`st-subject${s.subject_type === "Compulsory" ? " st-subject--compulsory" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={s.subject_type === "Compulsory" || selectedOptional.includes(s.id)}
                          disabled={s.subject_type === "Compulsory"}
                          onChange={(e) => toggleOptional(s.id, e.target.checked)}
                        />
                        <span className="st-subject-name">{s.name}</span>
                        <span className="st-subject-code">{s.code}</span>
                        <span className={`st-subject-tag st-subject-tag--${s.subject_type === "Compulsory" ? "auto" : "optional"}`}>
                          {s.subject_type === "Compulsory" ? "Auto" : "Optional"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="st-section">
                <div className="st-section-label">Contact</div>
                <div className="st-grid st-grid--1">
                  <label className="st-field">
                    <span className="st-field-label">Phone Number</span>
                    <div className="st-input-wrap">
                      <input
                        className={`st-input st-input--tel${phoneInvalid ? " st-input--error" : ""}`}
                        type="tel"
                        placeholder="e.g. 0712345678 or +255712345678"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <span className={phoneInvalid ? "st-hint st-hint--error" : "st-hint"}>
                      {phoneInvalid ? "Enter a valid number, e.g. 0712345678 or +255712345678." : "Optional · Tanzanian format preferred."}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="st-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${saving === "save" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={handleSave}>
                {saving === "save" ? <><Spinner size={14} /> {editingId ? "Updating" : "Registering"}…</> : (
                  <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>{editingId ? "Update Student" : "Register Student"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="cm-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cm-modal-title">Confirm Delete</h3>
            <p className="cm-modal-text">Are you sure you want to delete this student record? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving !== null} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--danger${saving === "delete" ? " btn-loading" : ""}`} disabled={saving !== null} onClick={() => handleDelete(deleteConfirm)}>
                {saving === "delete" ? <><Spinner size={14} /> Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <div className="cm-modal-backdrop" onClick={() => { if (!assignSaving) setAssignTarget(null); }}>
          <div className="sm-modal assign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-modal-head">
              <h3 className="sm-modal-title">Assign Subjects</h3>
              <p className="sm-modal-sub">
                {fullName(assignTarget)} · {assignStreamName || "No stream"} · ID {assignTarget.id.slice(0, 8)}
              </p>
            </div>
            <p className="st-subjects-hint">
              Compulsory subjects of this stream are added automatically. Tick the optional ones for this student.
            </p>
            {assignApplicable.length === 0 ? (
              <p className="st-subjects-empty">No subjects configured for this stream yet.</p>
            ) : (
              <div className="st-subjects assign-modal-list">
                {assignApplicable.map((s) => (
                  <label
                    key={s.id}
                    className={`st-subject${s.subject_type === "Compulsory" ? " st-subject--compulsory" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={s.subject_type === "Compulsory" || assignOptional.includes(s.id)}
                      disabled={s.subject_type === "Compulsory"}
                      onChange={(e) => toggleAssignOptional(s.id, e.target.checked)}
                    />
                    <span className="st-subject-name">{s.name}</span>
                    <span className="st-subject-code">{s.code}</span>
                    <span className={`st-subject-tag st-subject-tag--${s.subject_type === "Compulsory" ? "auto" : "optional"}`}>
                      {s.subject_type === "Compulsory" ? "Auto" : "Optional"}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="sm-modal-actions assign-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={assignSaving} onClick={() => setAssignTarget(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${assignSaving ? " btn-loading" : ""}`} disabled={assignSaving} onClick={saveAssignments}>
                {assignSaving ? <><Spinner size={14} /> Saving…</> : "Save Subjects"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}