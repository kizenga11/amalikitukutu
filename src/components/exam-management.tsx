"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteExam,
  fetchClassesWithStreams,
  fetchExamDetail,
  fetchExamMarks,
  fetchExams,
  fetchSubjects,
  fetchTeachingAssignments,
  fetchTeacherByAuth,
  insertExam,
  saveExamMarks,
  updateExam,
  updateExamStatus,
  type DbClassRow,
  type DbExamDetail,
  type DbExamRow,
  type DbSubjectRow,
  type ExamMarkEntry,
  type ExamMarksData,
  type ExamStatus,
  type TeachingAssignment,
} from "@/lib/school-api";
import { ListRowSkeleton, Spinner } from "@/components/loading";

type ToastType = "success" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ExamForm {
  name: string;
  startDate: string;
  endDate: string;
  hasPractical: boolean;
  classSubjects: Record<string, string[]>;
}

interface CellScore {
  theory: string;
  practical: string;
}

type MarksStep = "class" | "stream" | "subjects" | "grid";

let toastId = 0;
const PAGE_SIZE = 10;
const MARKS_PAGE_SIZE = 50;

function emptyForm(): ExamForm {
  return { name: "", startDate: "", endDate: "", hasPractical: false, classSubjects: {} };
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const statusLabels: Record<ExamStatus, string> = {
  draft: "Draft",
  active: "Active",
  processing: "Processing",
  published: "Published",
};

const stepLabels: Record<MarksStep, string> = {
  class: "1. Choose Class",
  stream: "2. Choose Stream",
  subjects: "3. Choose Subject",
  grid: "4. Enter Marks",
};

export default function ExamManagement({ teacherId }: { teacherId?: string }) {
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [classes, setClasses] = useState<DbClassRow[]>([]);
  const [subjects, setSubjects] = useState<DbSubjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExamForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Inline marks entry state ────────────────────────────
  const [viewExam, setViewExam] = useState<DbExamRow | null>(null);
  const [marksStep, setMarksStep] = useState<MarksStep>("class");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const [marksDetail, setMarksDetail] = useState<DbExamDetail | null>(null);
  const [marksData, setMarksData] = useState<ExamMarksData | null>(null);
  const [scores, setScores] = useState<Record<string, Record<string, Record<string, CellScore>>>>({});
  const [absent, setAbsent] = useState<Record<string, Record<string, boolean>>>({});
  const [marksSaving, setMarksSaving] = useState(false);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksPage, setMarksPage] = useState(1);
  const [marksSaveProgress, setMarksSaveProgress] = useState<{ done: number; total: number } | null>(null);

  const [teacherAssignments, setTeacherAssignments] = useState<TeachingAssignment[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const isTeacher = !!teacherId;

  // ── Load reference data ─────────────────────────────────
  useEffect(() => {
    fetchClassesWithStreams().then(setClasses).catch(() => setClasses([]));
    fetchSubjects().then(setSubjects).catch(() => setSubjects([]));
    if (teacherId) {
      fetchTeacherByAuth(teacherId)
        .then((teacher) => {
          if (teacher) {
            fetchTeachingAssignments(teacher.id).then(setTeacherAssignments).catch(() => setTeacherAssignments([]));
          }
        })
        .catch(() => {});
    }
  }, [teacherId]);

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
      const result = await fetchExams({ search: debouncedSearch, page, pageSize: PAGE_SIZE });
      setExams(result.rows);
      setTotal(result.total);
    } catch {
      setDbError(true);
      setExams([]);
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
        const result = await fetchExams({ search: debouncedSearch, page, pageSize: PAGE_SIZE });
        if (!active) return;
        setExams(result.rows);
        setTotal(result.total);
      } catch {
        if (!active) return;
        setDbError(true);
        setExams([]);
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

  const teacherClassIds = new Set(teacherAssignments.map((a) => a.class_id));

  const visibleExams = isTeacher
    ? exams.filter((ex) => ex.status !== "draft")
    : exams;

  // ── Toasts ──────────────────────────────────────────────
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

  // ── Register / Edit ─────────────────────────────────────
  function openNew() {
    const today = todayISO();
    setForm({ ...emptyForm(), startDate: today, endDate: today });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(row: DbExamRow) {
    setEditingId(row.id);
    setForm({ ...emptyForm(), name: row.name, startDate: row.start_date, endDate: row.end_date, hasPractical: row.has_practical });
    setShowForm(true);
    fetchExamDetail(row.id)
      .then((d) => {
        const cls: Record<string, string[]> = {};
        for (const c of d.classes) cls[c.id] = c.subjects.map((s) => s.id);
        setForm((prev) => ({ ...prev, classSubjects: cls }));
      })
      .catch(() => {});
  }

  async function handleSave() {
    if (saving) return;
    const name = form.name.trim();
    if (!name) { showToast("warning", "Exam name is required."); return; }
    if (!form.startDate || !form.endDate) { showToast("warning", "Please set both start and end dates."); return; }
    if (form.endDate < form.startDate) { showToast("warning", "End date cannot be before the start date."); return; }
    const classEntries = Object.entries(form.classSubjects);
    if (classEntries.length === 0) { showToast("warning", "Select at least one class for this exam."); return; }
    if (classEntries.some(([, ids]) => ids.length === 0)) { showToast("warning", "Every class must have at least one of its own subjects."); return; }

    setSaving(true);
    const payload = {
      name, start_date: form.startDate, end_date: form.endDate,
      has_practical: form.hasPractical,
      class_subjects: classEntries.map(([class_id, subject_ids]) => ({ class_id, subject_ids })),
    };
    try {
      if (editingId) { await updateExam(editingId, payload); showToast("success", `Exam "${name}" updated.`); }
      else { await insertExam(payload); showToast("success", `Exam "${name}" registered.`); }
      setShowForm(false); setEditingId(null); setForm(emptyForm());
      if (editingId) await loadPage(); else setPage(1);
    } catch { showToast("warning", "Database unavailable. Exam not saved."); }
    finally { setSaving(false); }
  }

  // ── Status transitions ──────────────────────────────────
  async function transitionStatus(row: DbExamRow, next: ExamStatus, successMsg: string) {
    if (saving) return;
    setSaving(true);
    try { await updateExamStatus(row.id, next); showToast("success", successMsg); await loadPage(); }
    catch { showToast("warning", "Database unavailable. Status not changed."); }
    finally { setSaving(false); }
  }

  // ── Delete ──────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteConfirm || saving) return;
    setSaving(true);
    try {
      await deleteExam(deleteConfirm); showToast("warning", "Exam deleted.");
      if (exams.length === 1 && page > 1) setPage(page - 1); else await loadPage();
    } catch { showToast("warning", "Database unavailable. Exam not deleted."); }
    finally { setSaving(false); setDeleteConfirm(null); }
  }

  // ── Inline marks entry flow ─────────────────────────────
  function enterMarks(row: DbExamRow) {
    setViewExam(row);
    setMarksStep("class");
    setSelectedClassId(null);
    setSelectedStreamId(null);
    setSelectedSubjectIds([]);
    setMarksDetail(null);
    setMarksData(null);
    setScores({});
    setAbsent({});
    setMarksPage(1);
    setMarksSaveProgress(null);
    setMarksLoading(true);
    Promise.all([
      fetchExamDetail(row.id),
      fetchExamMarks(row.id),
    ]).then(([detail, marks]) => {
      setMarksDetail(detail);
      setMarksData(marks);
      const pref: Record<string, Record<string, Record<string, CellScore>>> = {};
      const abs: Record<string, Record<string, boolean>> = {};
      for (const classRow of marks.classes) {
        if (!pref[classRow.class_id]) pref[classRow.class_id] = {};
        if (!abs[classRow.class_id]) abs[classRow.class_id] = {};
        for (const st of classRow.students) {
          if (!pref[classRow.class_id][st.student_id]) pref[classRow.class_id][st.student_id] = {};
          abs[classRow.class_id][st.student_id] = false;
          for (const subj of classRow.subjects) {
            const cell = marks.marks[`${st.student_id}|${subj.id}`];
            if (cell) {
              if (cell.is_absent) abs[classRow.class_id][st.student_id] = true;
              pref[classRow.class_id][st.student_id][subj.id] = {
                theory: cell.theory !== null ? String(cell.theory) : "",
                practical: cell.practical !== null ? String(cell.practical) : "",
              };
            } else {
              pref[classRow.class_id][st.student_id][subj.id] = { theory: "", practical: "" };
            }
          }
        }
      }
      setScores(pref);
      setAbsent(abs);
    }).catch(() => showToast("warning", "Could not load marks data."))
      .finally(() => setMarksLoading(false));
  }

  function exitMarks() {
    setViewExam(null);
    setMarksStep("class");
    setSelectedClassId(null);
    setSelectedStreamId(null);
    setSelectedSubjectIds([]);
    setMarksDetail(null);
    setMarksData(null);
    setScores({});
    setAbsent({});
    setMarksPage(1);
    setMarksSaveProgress(null);
  }

  function selectClass(classId: string) {
    setSelectedClassId(classId);
    setSelectedStreamId(null);
    setSelectedSubjectIds([]);
    setMarksStep("stream");
  }

  function selectStream(streamId: string | null) {
    setSelectedStreamId(streamId);
    setSelectedSubjectIds([]);
    setMarksPage(1);
    setMarksStep("subjects");
  }

  function toggleSubjectSelection(subjectId: string) {
    setSelectedSubjectIds((prev) =>
      prev.includes(subjectId) ? prev.filter((id) => id !== subjectId) : [...prev, subjectId]
    );
  }

  function confirmSubjects() {
    if (selectedSubjectIds.length === 0) {
      showToast("warning", "Select at least one subject.");
      return;
    }
    setMarksPage(1);
    setMarksStep("grid");
  }

  // ── Score helpers ───────────────────────────────────────
  function setScoreCell(studentId: string, subjectId: string, field: "theory" | "practical", value: string) {
    if (!selectedClassId) return;
    setScores((prev) => {
      const current = prev[selectedClassId]?.[studentId]?.[subjectId] ?? { theory: "", practical: "" };
      return {
        ...prev,
        [selectedClassId]: {
          ...(prev[selectedClassId] ?? {}),
          [studentId]: {
            ...(prev[selectedClassId]?.[studentId] ?? {}),
            [subjectId]: { ...current, [field]: value },
          },
        },
      };
    });
  }

  function toggleAbsentMark(studentId: string) {
    if (!selectedClassId) return;
    setAbsent((prev) => ({
      ...prev,
      [selectedClassId]: {
        ...(prev[selectedClassId] ?? {}),
        [studentId]: !(prev[selectedClassId]?.[studentId] ?? false),
      },
    }));
    setScores((prev) => {
      const classScores = prev[selectedClassId!];
      if (!classScores?.[studentId]) return prev;
      const cleared: Record<string, CellScore> = {};
      for (const key of Object.keys(classScores[studentId])) {
        cleared[key] = { theory: "", practical: "" };
      }
      return {
        ...prev,
        [selectedClassId!]: { ...prev[selectedClassId!], [studentId]: cleared },
      };
    });
  }

  // Mark entry is Theory+Practical only when BOTH the exam and the subject
  // allow practical marks. Otherwise the subject uses a single 0-100 theory
  // mark (this is how legacy / non-practical exams store their marks).
  function splitSubject(subj: { has_practical: boolean }): boolean {
    return (viewExam?.has_practical ?? false) && subj.has_practical;
  }

  function studentTotal(studentId: string, subjList: { id: string; has_practical: boolean }[]): string {
    if (!selectedClassId) return "—";
    let sum = 0;
    let hasAny = false;
    for (const subj of subjList) {
      const cell = scores[selectedClassId]?.[studentId]?.[subj.id];
      if (!cell) continue;
      const t = cell.theory.trim();
      const p = cell.practical.trim();
      if (t === "" && p === "") continue;
      hasAny = true;
      const tv = t === "" ? 0 : Number(t);
      const pv = p === "" ? 0 : Number(p);
      if (Number.isFinite(tv)) sum += tv;
      if (Number.isFinite(pv)) sum += pv;
    }
    return hasAny ? String(sum) : "\u2014";
  }

  function fillColumn(students: { student_id: string; subjects: string[] }[], subjectId: string, field: "theory" | "practical", value: string) {
    if (!selectedClassId) return;
    setScores((prev) => {
      const next = { ...prev };
      if (!next[selectedClassId!]) next[selectedClassId!] = {};
      for (const st of students) {
        if (!st.subjects.includes(subjectId)) continue;
        const current = next[selectedClassId!]?.[st.student_id]?.[subjectId] ?? { theory: "", practical: "" };
        if (!next[selectedClassId!][st.student_id]) next[selectedClassId!][st.student_id] = { ...prev[selectedClassId!]?.[st.student_id] };
        next[selectedClassId!][st.student_id] = {
          ...next[selectedClassId!][st.student_id],
          [subjectId]: { ...current, [field]: value },
        };
      }
      return next;
    });
  }

  // ── Save marks ──────────────────────────────────────────
  async function handleSaveMarks() {
    if (marksSaving || !viewExam || !marksData || !selectedClassId) return;
    const classRow = marksData.classes.find((c) => c.class_id === selectedClassId);
    if (!classRow) return;
    if (classRow.students.length === 0) { showToast("warning", "No students in this class."); return; }

    const entries: ExamMarkEntry[] = [];
    const clearKeys: { student_id: string; subject_id: string }[] = [];
    for (const st of classRow.students) {
      const isAbs = absent[selectedClassId]?.[st.student_id] ?? false;
      for (const subj of classRow.subjects) {
        if (!st.subjects.includes(subj.id)) continue;
        if (!selectedSubjectIds.includes(subj.id)) continue;
        if (
          isTeacher &&
          !teacherAssignments.some((assignment) =>
            assignment.class_id === selectedClassId &&
            assignment.subject_id === subj.id &&
            assignment.stream_id === st.stream_id
          )
        ) continue;

        if (isAbs) {
          entries.push({ subject_id: subj.id, student_id: st.student_id, theory_score: null, practical_score: null, is_absent: true, stream_id: st.stream_id });
          continue;
        }

        const cell = scores[selectedClassId]?.[st.student_id]?.[subj.id];
        if (!cell) continue;
        const theoryRaw = cell.theory.trim();
        const practicalRaw = cell.practical.trim();
        if (theoryRaw === "" && practicalRaw === "") {
          // Blank cell. If a mark was previously saved for this student+subject,
          // treat it as explicitly cleared so the old row is removed.
          if (marksData.marks[`${st.student_id}|${subj.id}`]) {
            clearKeys.push({ student_id: st.student_id, subject_id: subj.id });
          }
          continue;
        }

        if (splitSubject(subj)) {
          const tv = theoryRaw === "" ? null : Number(theoryRaw);
          const pv = practicalRaw === "" ? null : Number(practicalRaw);
          if (tv !== null && (!Number.isFinite(tv) || tv < 0 || tv > 50)) {
            showToast("warning", `Invalid theory score for ${st.first_name} ${st.last_name} in ${subj.name}. Use 0\u201350.`);
            return;
          }
          if (pv !== null && (!Number.isFinite(pv) || pv < 0 || pv > 50)) {
            showToast("warning", `Invalid practical score for ${st.first_name} ${st.last_name} in ${subj.name}. Use 0\u201350.`);
            return;
          }
          entries.push({ subject_id: subj.id, student_id: st.student_id, theory_score: tv, practical_score: pv, is_absent: false, stream_id: st.stream_id });
        } else {
          const tv = Number(theoryRaw);
          if (!Number.isFinite(tv) || tv < 0 || tv > 100) {
            showToast("warning", `Invalid score for ${st.first_name} ${st.last_name} in ${subj.name}. Use 0\u2013100.`);
            return;
          }
          entries.push({ subject_id: subj.id, student_id: st.student_id, theory_score: tv, practical_score: null, is_absent: false, stream_id: st.stream_id });
        }
      }
    }

    if (entries.length === 0 && clearKeys.length === 0) {
      showToast("warning", "No marks to save. Enter scores first.");
      return;
    }
    setMarksSaving(true);
    setMarksSaveProgress({ done: 0, total: entries.length });
    try {
      await saveExamMarks(viewExam.id, classRow.class_id, entries, clearKeys, (done, total) => {
        setMarksSaveProgress({ done, total });
      });
      showToast("success", `Marks saved for ${classRow.class_name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast("warning", `Could not save marks: ${msg}`);
    }
    finally {
      setMarksSaving(false);
      setMarksSaveProgress(null);
    }
  }

  function toggleClass(id: string) {
    setForm((prev) => {
      const next = { ...prev.classSubjects };
      if (next[id]) { delete next[id]; }
      else { next[id] = subjects.filter((s) => s.subject_type === "Compulsory").map((s) => s.id); }
      return { ...prev, classSubjects: next };
    });
  }

  function toggleSubject(classId: string, subjectId: string) {
    setForm((prev) => {
      const next = { ...prev.classSubjects };
      const list = next[classId] ?? [];
      next[classId] = list.includes(subjectId) ? list.filter((s) => s !== subjectId) : [...list, subjectId];
      return { ...prev, classSubjects: next };
    });
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  // ── Derived data for marks grid ─────────────────────────
  const activeClassRow = marksData?.classes.find((c) => c.class_id === selectedClassId) ?? null;
  const activeStreams = activeClassRow
    ? (() => {
        const map = new Map<string, { id: string | null; name: string; count: number }>();
        const examSubjectIds = new Set(activeClassRow.subjects.map((subject) => subject.id));
        for (const st of activeClassRow.students) {
          const key = st.stream_id ?? "__none__";
          const teacherSubjectIdsForStream = isTeacher
            ? new Set(
                teacherAssignments
                  .filter((assignment) =>
                    assignment.class_id === activeClassRow.class_id &&
                    assignment.stream_id === st.stream_id,
                  )
                  .map((assignment) => assignment.subject_id),
              )
            : examSubjectIds;
          const eligible = st.subjects.some((subjectId) =>
            examSubjectIds.has(subjectId) && teacherSubjectIdsForStream.has(subjectId),
          );
          if (!eligible) continue;
          const existing = map.get(key);
          if (existing) existing.count += 1;
          else map.set(key, { id: st.stream_id, name: st.stream_name || "Unassigned", count: 1 });
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      })()
    : [];
  const streamStudents = activeClassRow
    ? (selectedStreamId === null
        ? activeClassRow.students
        : activeClassRow.students.filter((s) => (s.stream_id ?? "__none__") === selectedStreamId))
    : [];
  const teacherSubjForClass = selectedClassId
    ? teacherAssignments.filter((a) =>
        a.class_id === selectedClassId &&
        (selectedStreamId === null || a.stream_id === selectedStreamId)
      )
    : [];
  const selectedSubjectSet = new Set(selectedSubjectIds);
  const scopedTeacherSubjectIds = new Set(teacherSubjForClass.map((a) => a.subject_id));
  // Once subjects are selected, only show students who are enrolled in at
  // least one of those subjects. This prevents unrelated stream students from
  // appearing with non-editable cells in the marks grid.
  const gridStudents = streamStudents.filter((st) =>
    selectedSubjectSet.size === 0 ||
    st.subjects.some((subjectId) =>
      selectedSubjectSet.has(subjectId) && (!isTeacher || scopedTeacherSubjectIds.has(subjectId))
    )
  );
  const marksPageCount = Math.max(1, Math.ceil(gridStudents.length / MARKS_PAGE_SIZE));
  const safeMarksPage = Math.min(marksPage, marksPageCount);
  const pagedStudents = gridStudents.slice((safeMarksPage - 1) * MARKS_PAGE_SIZE, safeMarksPage * MARKS_PAGE_SIZE);
  const marksFrom = gridStudents.length === 0 ? 0 : (safeMarksPage - 1) * MARKS_PAGE_SIZE + 1;
  const marksTo = Math.min(safeMarksPage * MARKS_PAGE_SIZE, gridStudents.length);
  const gridSubjects = activeClassRow
    ? (isTeacher
        ? activeClassRow.subjects.filter((s) => scopedTeacherSubjectIds.has(s.id))
        : activeClassRow.subjects)
    : [];

  // Subjects actually assigned to students in the selected stream (or any stream
  // when "All Streams" is chosen). Filters out subjects students don't take.
  const streamAssignedSubjectIds = (() => {
    if (!activeClassRow) return new Set<string>();
    const ids = new Set<string>();
    for (const st of activeClassRow.students) {
      if (selectedStreamId !== null && (st.stream_id ?? "__none__") !== selectedStreamId) continue;
      for (const sid of st.subjects) ids.add(sid);
    }
    return ids;
  })();

  const teacherSubjectsForClass = isTeacher
    ? subjects.filter((s) => teacherSubjForClass.some((a) => a.subject_id === s.id) && streamAssignedSubjectIds.has(s.id))
    : subjects.filter((s) => streamAssignedSubjectIds.has(s.id));

  // ── Available classes/streams for teacher ────────────────
  const availableClasses = isTeacher
    ? classes.filter((c) => teacherClassIds.has(c.id))
    : classes;
  const selectedClassObj = classes.find((c) => c.id === selectedClassId) ?? null;
  const availableStreams = selectedClassObj
    ? (isTeacher
        ? selectedClassObj.streams.filter((st) => teacherSubjForClass.some((a) => a.stream_id === st.id))
        : selectedClassObj.streams)
    : [];

  // ── Progress for grid ───────────────────────────────────
  let filledCount = 0;
  let totalCount = 0;
  if (activeClassRow && selectedClassId) {
    for (const st of gridStudents) {
      for (const subj of gridSubjects) {
        if (!st.subjects.includes(subj.id)) continue;
        if (!selectedSubjectIds.includes(subj.id)) continue;
        totalCount += 1;
        const cell = scores[selectedClassId]?.[st.student_id]?.[subj.id];
        if (cell && (cell.theory.trim() !== "" || cell.practical.trim() !== "")) filledCount += 1;
      }
    }
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

      {/* ════════════════════════════════════════════════════════
          VIEW 1: EXAM LIST
          ════════════════════════════════════════════════════════ */}
      {!viewExam && (
        <>
          <div className="page-head">
            <div>
              <h2 className="page-title">{isTeacher ? "Enter Marks" : "Exams"}</h2>
              <p className="page-sub">{isTeacher ? "Select an exam then enter marks for your subjects." : "Register exams with their classes and subjects, then manage the exam lifecycle."}</p>
            </div>
            <div className="page-head-right">
              {total > 0 && <span className="active-chip">{total.toLocaleString()} Exams</span>}
              {!isTeacher && <button className="sm-add-btn" onClick={openNew}>+ Register Exam</button>}
            </div>
          </div>

          <div className="sm-search-bar">
            <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="sm-search" type="text" placeholder="Search exams by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {dbError ? (
            <div className="sm-table-wrap">
              <div className="st-empty-state">
                Could not load exams from the database.
                <div><button className="cm-btn cm-btn--ghost st-retry" onClick={loadPage}>Retry</button></div>
              </div>
            </div>
          ) : loading ? (
            <div className="sm-table-wrap">
              <div className="sm-table-skeleton">
                <ListRowSkeleton cols={5} /><ListRowSkeleton cols={5} /><ListRowSkeleton cols={5} /><ListRowSkeleton cols={5} />
              </div>
            </div>
          ) : (
            <div className="sm-table-wrap">
              <table className="sm-table ex-list-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Type</th>
                    <th>Classes</th>
                    <th>Subjects</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExams.length === 0 && (
                    <tr><td colSpan={6} className="sm-empty">{isTeacher ? "No exams available." : "No exams registered yet."}</td></tr>
                  )}
                  {visibleExams.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="ex-name">{row.name}</div>
                        <div className="ex-dates">{formatDate(row.start_date)} \u2192 {formatDate(row.end_date)}</div>
                      </td>
                      <td>
                        {row.has_practical
                          ? <span className="sm-badge sm-badge--practical">Practical</span>
                          : <span className="sm-badge sm-badge--theory">Theory only</span>}
                      </td>
                      <td><span className="ex-chip">{row.class_count} class{row.class_count === 1 ? "" : "es"}</span></td>
                      <td><span className="ex-chip">{row.subject_count} subject{row.subject_count === 1 ? "" : "s"}</span></td>
                      <td><span className={`ex-status ex-status--${row.status}`}>{statusLabels[row.status]}</span></td>
                      <td>
                        <div className="ex-actions">
                          {!isTeacher && row.status === "draft" && (
                            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={saving} onClick={() => transitionStatus(row, "active", `Exam "${row.name}" activated.`)}>Activate</button>
                          )}
                          {!isTeacher && row.status === "active" && (
                            <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={saving} onClick={() => transitionStatus(row, "processing", `Exam "${row.name}" moved to processing.`)}>Process</button>
                          )}
                          {!isTeacher && row.status === "processing" && (
                            <button className="cm-btn cm-btn--primary cm-btn--sm" disabled={saving} onClick={() => transitionStatus(row, "published", `Exam "${row.name}" published.`)}>Publish</button>
                          )}
                          <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => enterMarks(row)}>
                            {isTeacher ? "Enter Marks" : "View Marks"}
                          </button>
                          {!isTeacher && (
                            <>
                              <button className="cm-icon-btn cm-icon-btn--sm" title="Edit exam" onClick={() => openEdit(row)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button className="cm-icon-btn cm-icon-btn--sm cm-icon-btn--danger" title="Delete exam" onClick={() => setDeleteConfirm(row.id)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </>
                          )}
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
              <span className="st-pagination-info">Showing {from}\u2013{to} of {total.toLocaleString()} exams</span>
              <div className="st-pagination-controls">
                <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{'\u2190'} Prev</button>
                <span className="st-pagination-info" style={{ display: "inline-flex", alignItems: "center", padding: "0 .4rem" }}>Page {page} of {pageCount}</span>
                <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next {'\u2192'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          VIEW 2: INLINE MARKS ENTRY
          ════════════════════════════════════════════════════════ */}
      {viewExam && (
        <>
          <div className="page-head me-view-head">
            <div>
              <button className="cm-btn cm-btn--ghost cm-btn--sm me-back-btn" onClick={exitMarks}>
                {'\u2190'} Back
              </button>
              <h2 className="page-title">{viewExam.name}</h2>
              <p className="page-sub">{formatDate(viewExam.start_date)} \u2192 {formatDate(viewExam.end_date)} \u00B7 <span className={`ex-status ex-status--${viewExam.status}`}>{statusLabels[viewExam.status]}</span></p>
            </div>
            <div className="me-view-stats">
              <div className="me-view-stat"><span>{marksDetail ? marksDetail.classes.length : availableClasses.length}</span><label>Classes</label></div>
              <div className="me-view-stat"><span>{gridStudents.length}</span><label>Students</label></div>
              <div className="me-view-stat"><span>{selectedSubjectIds.length || gridSubjects.length}</span><label>Subjects</label></div>
            </div>
          </div>

          {/* ── Step indicator ── */}
          <ol className="me-steps">
            {(["class", "stream", "subjects", "grid"] as MarksStep[]).map((step, i) => {
              const active = marksStep === step;
              const done = (["class", "stream", "subjects", "grid"] as MarksStep[]).indexOf(marksStep) > i;
              return (
                <li key={step} className={`me-step${active ? " me-step--active" : ""}${done ? " me-step--done" : ""}${i + 1 === 4 ? " me-step--last" : ""}`}>
                  <span className="me-step-num">{done ? "\u2713" : i + 1}</span>
                  <span className="me-step-label">{stepLabels[step]}</span>
                </li>
              );
            })}
          </ol>

          {marksLoading ? (
            <div className="me-loading"><Spinner size={20} /></div>
          ) : !marksDetail || !marksData ? (
            <div className="st-empty-state">Could not load exam data.<div><button className="cm-btn cm-btn--ghost st-retry" onClick={exitMarks}>Close</button></div></div>
          ) : (
            <>
              {/* ── STEP: Choose Class ── */}
              {marksStep === "class" && (
                <div className="me-grid">
                  {availableClasses.length === 0 && <p className="me-empty">No classes available.</p>}
                  {availableClasses.map((c) => {
                    const classStudents = marksData.classes.find((cl) => cl.class_id === c.id);
                    const studentCount = classStudents?.students.length ?? 0;
                    return (
                      <button key={c.id} className="me-card" onClick={() => selectClass(c.id)}>
                        <span className="me-card-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        </span>
                        <span className="me-card-title">{c.name}</span>
                        <span className="me-card-sub">{studentCount} students</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── STEP: Choose Stream ── */}
              {marksStep === "stream" && (
                <div className="me-grid">
                  <button className="me-card me-card--wide" onClick={() => selectStream(null)}>
                    <span className="me-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
                    </span>
                        <span className="me-card-title">All Streams</span>
                    <span className="me-card-sub">All streams</span>
                  </button>
                  {availableStreams.map((st) => {
                    const classStudents = marksData.classes.find((cl) => cl.class_id === selectedClassId);
                    const examSubjectIds = new Set((classStudents?.subjects ?? []).map((s) => s.id));
                    const assignedSubjectIds = isTeacher
                      ? new Set(
                          teacherAssignments
                            .filter((a) => a.class_id === selectedClassId && a.stream_id === st.id)
                            .map((a) => a.subject_id),
                        )
                      : examSubjectIds;
                    const streamCount = classStudents?.students.filter((s) =>
                      s.stream_id === st.id &&
                      s.subjects.some((subjectId) => examSubjectIds.has(subjectId) && assignedSubjectIds.has(subjectId)),
                    ).length ?? 0;
                    return (
                      <button key={st.id} className="me-card" onClick={() => selectStream(st.id)}>
                        <span className="me-card-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>
                        </span>
                        <span className="me-card-title">{st.name}</span>
                        <span className="me-card-sub">{streamCount} students</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── STEP: Choose Subjects ── */}
              {marksStep === "subjects" && (
                <div className="me-subjects">
                  <div className="me-subjects-header">
                    <h3 className="me-subjects-title">Choose subjects to enter marks</h3>
                    <p className="me-subjects-sub">You can select one or more subjects.</p>
                  </div>
                  <div className="me-subject-list">
                    {teacherSubjectsForClass.map((s) => {
                      const checked = selectedSubjectIds.includes(s.id);
                      return (
                        <label key={s.id} className={`me-subject-item${checked ? " me-subject-item--checked" : ""}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSubjectSelection(s.id)} />
                          <span className="me-subject-code">{s.code}</span>
                          <span className="me-subject-name">{s.name}</span>
                          {splitSubject(s) && <span className="me-subject-tag">Theory 50 + Prac 50</span>}
                          {!splitSubject(s) && <span className="me-subject-tag me-subject-tag--theory">Theory 100</span>}
                        </label>
                      );
                    })}
                    {teacherSubjectsForClass.length === 0 && <p className="me-empty">No subjects in this class.</p>}
                  </div>
                  <div className="me-subjects-actions">
                    <button className="cm-btn cm-btn--ghost" onClick={() => setMarksStep("stream")}>{'\u2190'} Back</button>
                    <button className="cm-btn cm-btn--primary" disabled={selectedSubjectIds.length === 0} onClick={confirmSubjects}>
                      Continue with subject{selectedSubjectIds.length !== 1 ? "s" : ""}{selectedSubjectIds.length > 0 ? ` (${selectedSubjectIds.length})` : ""}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP: Marks Grid ── */}
              {marksStep === "grid" && activeClassRow && (
                <>
                  {/* Grid context summary */}
                  <div className="ex-grid-summary">
                    <div className="ex-grid-summary-main">
                      <span className="ex-grid-chip">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        <span>{activeClassRow.class_name}</span>
                      </span>
                      {selectedStreamId !== null && (
                        <span className="ex-grid-chip">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>
                          <span>{activeStreams.find((s) => s.id === selectedStreamId)?.name ?? "Stream"}</span>
                        </span>
                      )}
                      {gridSubjects.filter((s) => selectedSubjectIds.includes(s.id)).map((subj) => (
                        <span key={subj.id} className={`ex-grid-chip ${splitSubject(subj) ? "ex-grid-chip--prac" : "ex-grid-chip--theory"}`}>
                          {subj.code}{splitSubject(subj) ? " (TP)" : ""}
                        </span>
                      ))}
                    </div>
                    <span className="ex-grid-count">{gridStudents.length} students</span>
                  </div>

                  {/* Stream tabs */}
                  {activeStreams.length > 1 && (
                    <div className="ex-tabs ex-tabs--streams">
                      <button className={`ex-tab${selectedStreamId === null ? " ex-tab--active" : ""}`} onClick={() => { setSelectedStreamId(null); setMarksPage(1); }}>All Streams</button>
                      {activeStreams.map((opt) => (
                        <button key={opt.id ?? "__none__"} className={`ex-tab${selectedStreamId === opt.id ? " ex-tab--active" : ""}`} onClick={() => { setSelectedStreamId(opt.id); setMarksPage(1); }}>
                          {opt.name} <span className="ex-tab-count">{opt.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="ex-marks-table-wrap">
                    <table className="sm-table ex-marks-table">
                      <thead>
                        <tr>
                          <th className="ex-col-num">#</th>
                          <th className="ex-col-student">Student</th>
                          <th className="ex-col-absent">Absent</th>
                          {gridSubjects.filter((s) => selectedSubjectIds.includes(s.id)).map((s) => (
                            splitSubject(s) ? (
                              <th key={`${s.id}-t`} title={`${s.name} \u2014 Theory`} className="ex-col-score ex-col-theory">{s.code} T</th>
                            ) : (
                              <th key={s.id} title={s.name} className="ex-col-score">{s.code}</th>
                            )
                          ))}
                          {gridSubjects.filter((s) => splitSubject(s) && selectedSubjectIds.includes(s.id)).map((s) => (
                            <th key={`${s.id}-p`} title={`${s.name} \u2014 Practical`} className="ex-col-score ex-col-prac">{s.code} P</th>
                          ))}
                          <th className="ex-col-avg">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedStudents.length === 0 && (
                          <tr><td colSpan={gridSubjects.filter((s) => selectedSubjectIds.includes(s.id)).length + gridSubjects.filter((s) => splitSubject(s) && selectedSubjectIds.includes(s.id)).length + 4} className="sm-empty">No students found.</td></tr>
                        )}
                        {pagedStudents.map((st, idx) => {
                          const isAbs = absent[selectedClassId!]?.[st.student_id] ?? false;
                          const displaySubjects = gridSubjects.filter((s) => selectedSubjectIds.includes(s.id));
                          return (
                            <tr key={st.student_id} className={isAbs ? "ex-row-absent" : ""}>
                              <td className="ex-col-num">{(safeMarksPage - 1) * MARKS_PAGE_SIZE + idx + 1}</td>
                              <td className="ex-col-student">
                                <span className="ex-student-name">{st.first_name} {st.last_name}</span>
                                {selectedStreamId === null && st.stream_id && <span className="ex-stream-tag">{st.stream_name}</span>}
                              </td>
                              <td className="ex-col-absent">
                                <label className="ex-absent-check">
                                  <input type="checkbox" checked={isAbs} onChange={() => toggleAbsentMark(st.student_id)} />
                                  <span className="ex-absent-label">ABS</span>
                                </label>
                              </td>
                              {displaySubjects.map((subj) => (
                                st.subjects.includes(subj.id) ? (
                                  <td className="ex-col-score" key={subj.id}>
                                    <input
                                      className={`ex-score-input${isAbs ? " ex-score-input--disabled" : ""}${scores[selectedClassId!]?.[st.student_id]?.[subj.id]?.theory?.trim() ? " ex-score-input--filled" : ""}`}
                                      type="number" min={0} max={splitSubject(subj) ? 50 : 100} step="any"
                                      placeholder={splitSubject(subj) ? "0-50" : "0-100"}
                                      value={scores[selectedClassId!]?.[st.student_id]?.[subj.id]?.theory ?? ""}
                                      disabled={isAbs}
                                      onChange={(e) => setScoreCell(st.student_id, subj.id, "theory", e.target.value)}
                                    />
                                  </td>
                                ) : (
                                  <td className="ex-col-score ex-na" key={subj.id}>\u2014</td>
                                )
                              ))}
                              {displaySubjects.filter((s) => splitSubject(s)).map((subj) => (
                                st.subjects.includes(subj.id) ? (
                                  <td className="ex-col-score ex-col-prac" key={`${subj.id}-p`}>
                                    <input
                                      className={`ex-score-input ex-score-input--prac${isAbs ? " ex-score-input--disabled" : ""}${scores[selectedClassId!]?.[st.student_id]?.[subj.id]?.practical?.trim() ? " ex-score-input--filled" : ""}`}
                                      type="number" min={0} max={50} step="any" placeholder="0-50"
                                      value={scores[selectedClassId!]?.[st.student_id]?.[subj.id]?.practical ?? ""}
                                      disabled={isAbs}
                                      onChange={(e) => setScoreCell(st.student_id, subj.id, "practical", e.target.value)}
                                    />
                                  </td>
                                ) : (
                                  <td className="ex-col-score ex-col-prac ex-na" key={`${subj.id}-p`}>\u2014</td>
                                )
                              ))}
                              <td className="ex-col-avg">{isAbs ? <span className="ex-total-absent">ABS</span> : <span className="ex-total-value">{studentTotal(st.student_id, displaySubjects)}</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Student pagination */}
                  {marksPageCount > 1 && (
                    <div className="st-pagination ex-pagination">
                      <span className="st-pagination-info">Showing {marksFrom}\u2013{marksTo} of {gridStudents.length.toLocaleString()} students</span>
                      <div className="st-pagination-controls">
                        <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={safeMarksPage <= 1} onClick={() => setMarksPage((p) => Math.max(1, p - 1))}>{'\u2190'} Prev</button>
                        <span className="st-pagination-info" style={{ display: "inline-flex", alignItems: "center", padding: "0 .4rem" }}>Page {safeMarksPage} of {marksPageCount}</span>
                        <button className="cm-btn cm-btn--ghost cm-btn--sm" disabled={safeMarksPage >= marksPageCount} onClick={() => setMarksPage((p) => Math.min(marksPageCount, p + 1))}>Next {'\u2192'}</button>
                      </div>
                    </div>
                  )}

                  {/* Quick-fill */}
                  <div className="ex-quickfill-row">
                    <span className="ex-quickfill-label">Quick-fill column:</span>
                    {gridSubjects.filter((s) => selectedSubjectIds.includes(s.id)).map((subj) => (
                      splitSubject(subj) ? (
                        <span key={`${subj.id}-fill`} className="ex-quickfill-group">
                          <span className="ex-quickfill-code">{subj.code} T</span>
                          <input className="ex-quickfill-input" type="number" min={0} max={50} placeholder="0-50"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                fillColumn(pagedStudents, subj.id, "theory", (e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }}
                          />
                          <span className="ex-quickfill-code">{subj.code} P</span>
                          <input className="ex-quickfill-input" type="number" min={0} max={50} placeholder="0-50"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                fillColumn(pagedStudents, subj.id, "practical", (e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }}
                          />
                        </span>
                      ) : (
                        <span key={subj.id} className="ex-quickfill-group">
                          <span className="ex-quickfill-code">{subj.code}</span>
                          <input className="ex-quickfill-input" type="number" min={0} max={100} placeholder="0-100"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                fillColumn(pagedStudents, subj.id, "theory", (e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }}
                          />
                        </span>
                      )
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="ex-marks-footer">
                    <div className="ex-marks-hint-group">
                      <span className="ex-marks-hint">
                        {gridSubjects.filter((s) => selectedSubjectIds.includes(s.id)).some((s) => splitSubject(s))
                          ? "Practical subjects: Theory (0-50) + Practical (0-50). Theory-only: (0-100)."
                          : "Enter scores 0-100. Blank cells are skipped."}
                      </span>
                      <span className="ex-progress">
                        {filledCount}/{totalCount} entered
                        {totalCount > 0 && <span className="ex-progress-bar"><span className="ex-progress-fill" style={{ width: `${(filledCount / totalCount) * 100}%` }} /></span>}
                      </span>
                    </div>
                    <div className="ex-marks-footer-actions">
                      <button className="cm-btn cm-btn--ghost" onClick={() => setMarksStep("subjects")} disabled={marksSaving}>{'\u2190'} Subjects</button>
                      {marksSaveProgress && marksSaveProgress.total > 500 ? (
                        <span className="ex-marks-save-progress">
                          Saving {marksSaveProgress.done.toLocaleString()}/{marksSaveProgress.total.toLocaleString()}
                          <span className="ex-progress-bar"><span className="ex-progress-fill" style={{ width: `${(marksSaveProgress.done / marksSaveProgress.total) * 100}%` }} /></span>
                        </span>
                      ) : null}
                      <button
                        className={`cm-btn cm-btn--primary${marksSaving ? " btn-loading" : ""}`}
                        disabled={marksSaving}
                        onClick={handleSaveMarks}
                      >{marksSaving ? <><Spinner size={14} /> Saving{'\u2026'}</> : "Save Marks"}</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Register / Edit Modal ──────────────────────── */}
      {showForm && (
        <div className="cm-modal-backdrop" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="st-modal ex-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <span className="st-modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>
              </span>
              <div>
                <h3 className="st-modal-title">{editingId ? "Edit Exam" : "Register Exam"}</h3>
                <p className="st-modal-sub">{editingId ? "Update this exam's details." : "Set up a new exam with its classes and subjects."}</p>
              </div>
              <button className="st-modal-close" onClick={() => { setShowForm(false); setEditingId(null); }} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="st-form">
              <div className="st-section">
                <div className="st-section-label">Exam Details</div>
                <div className="st-grid st-grid--1">
                  <label className="st-field">
                    <span className="st-field-label">Exam Name <em>*</em></span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="text" placeholder="e.g. Mid-Term Exam 2026 Term I" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                    </div>
                  </label>
                </div>
                <div className="st-grid st-grid--2" style={{ marginTop: ".85rem" }}>
                  <label className="st-field">
                    <span className="st-field-label">Start Date <em>*</em></span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                    </div>
                  </label>
                  <label className="st-field">
                    <span className="st-field-label">End Date <em>*</em></span>
                    <div className="st-input-wrap">
                      <input className="st-input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                    </div>
                  </label>
                </div>
                <div className="st-grid st-grid--1" style={{ marginTop: ".85rem" }}>
                  <div className="sm-field sm-field--toggle">
                    <span className="ex-toggle-label">Does this exam include practical subjects (Prac)?</span>
                    <label className="sm-toggle">
                      <span className="sm-toggle-text">{form.hasPractical ? "Yes" : "No"}</span>
                      <input type="checkbox" checked={form.hasPractical} onChange={(e) => setForm({ ...form, hasPractical: e.target.checked })} />
                      <span className="sm-toggle-track"><span className="sm-toggle-thumb" /></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-label">Classes &amp; Subjects <em>*</em></div>
                <p className="st-subjects-hint">Select each class, then pick the subjects examined in <em>that</em> class.</p>
                <div className="ex-check-list">
                  {classes.length === 0 && <p className="st-subjects-empty">No classes available.</p>}
                  {classes.map((c) => {
                    const selected = form.classSubjects[c.id] !== undefined;
                    return (
                      <div className="ex-class-block" key={c.id}>
                        <label className="st-subject ex-check-item ex-class-toggle">
                          <input type="checkbox" checked={selected} onChange={() => toggleClass(c.id)} />
                          <span className="st-subject-name">{c.name}</span>
                          <span className="st-subject-code">{c.streams.length} stream{c.streams.length === 1 ? "" : "s"}</span>
                        </label>
                        {selected && (
                          <div className="ex-class-subjects">
                            <div className="ex-class-subjects-label">Subjects for {c.name}</div>
                            <div className="ex-check-list">
                              {subjects.length === 0 && <p className="st-subjects-empty">No subjects available.</p>}
                              {subjects.map((s) => (
                                <label className="st-subject ex-check-item" key={s.id}>
                                  <input type="checkbox" checked={(form.classSubjects[c.id] ?? []).includes(s.id)} onChange={() => toggleSubject(c.id, s.id)} />
                                  <span className="st-subject-code">{s.code}</span>
                                  <span className="st-subject-name">{s.name}</span>
                                  {s.subject_type === "Compulsory" ? (
                                    <span className="st-subject-tag st-subject-tag--auto">Compulsory</span>
                                  ) : (
                                    <span className="st-subject-tag st-subject-tag--optional">Optional</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="st-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              <button className={`cm-btn cm-btn--primary${saving ? " btn-loading" : ""}`} disabled={saving} onClick={handleSave}>
                {saving ? <><Spinner size={14} /> Saving{'\u2026'}</> : editingId ? "Update Exam" : "Register Exam"}
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
            <p className="cm-modal-text">Are you sure you want to delete this exam? This action cannot be undone.</p>
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={saving} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={`cm-btn cm-btn--danger${saving ? " btn-loading" : ""}`} disabled={saving} onClick={handleDelete}>
                {saving ? <><Spinner size={14} /> Deleting{'\u2026'}</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
