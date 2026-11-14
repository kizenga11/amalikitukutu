"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import AutoGrowTextarea from "@/components/auto-grow-textarea";
import {
  ATTACHMENT_MAX_BYTES,
  alphaLabel,
  defaultAlphaMcqLabels,
  defaultMcqLabels,
  isPracticalQuestion,
  normaliseMatchingConfig,
  normaliseMcqConfig,
  normaliseStructuredParts,
  toRoman,
  type MatchingPair,
  type QuestionType,
  type StructuredPart,
  type StructuredPartType,
} from "@/lib/assignments-shared";
import {
  createTeacherAssignment,
  deleteTeacherAssignment,
  downloadAssignmentCsv,
  fetchTeacherAssignment,
  fetchTeacherAssignments,
  fetchTeacherOptions,
  fetchTeacherSubmission,
  gradeTeacherSubmission,
  updateTeacherAssignment,
  updateTeacherAssignmentStatus,
  type AssignmentStudent,
  type NewQuestionPayload,
  type Period,
  type TeacherAssignmentDetail,
  type TeacherAssignmentSummary,
  type TeacherOption,
  type TeacherSubmissionDetail,
} from "@/lib/teacher-assignments-api";
import "./teacher-assignments.css";

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; id: string }
  | { kind: "detail"; id: string }
  | { kind: "grade"; assignmentId: string; submissionId: string; studentName: string };

type Attachment = { name: string; type: string; data: string } | null;

interface DraftMcqItem {
  key: string;
  label: string;
  prompt: string;
  choices: string[];
  choiceLabels: string[];
  correctOption: number;
  marks: string;
}

interface DraftQuestion {
  key: string;
  questionType: QuestionType;
  prompt: string;
  marks: string;
  options: string[];
  choiceLabels: string[];
  correctOption: number;
  mcqItems: DraftMcqItem[];
  mcqMode: "simple" | "items";
  matchingPairs: MatchingPair[];
  structuredParts: StructuredPart[];
  /** Text-answer question answered in the C++ IDE. */
  practical: boolean;
}

const assignmentStatusLabel: Record<TeacherAssignmentSummary["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

const studentStatusLabel: Record<AssignmentStudent["status"], string> = {
  not_submitted: "Not submitted",
  draft: "Draft",
  submitted: "Submitted",
  marked: "Marked",
};

const questionTypeLabelEn: Record<QuestionType, string> = {
  essay: "Essay / Long answer",
  calculation: "Essay / Calculation (show working)",
  short_answer: "Short answer",
  mcq: "Multiple choice",
  matching: "Matching items",
  structured: "Structured / Multi-part",
};

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function soonDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function newStructuredPart(label: string, type: StructuredPartType = "short_answer"): StructuredPart {
  if (type === "mcq") {
    const options = ["", "", "", ""];
    return { key: uid(), label, prompt: "", marks: 1, type, options, choiceLabels: defaultAlphaMcqLabels(options.length), correctOption: 0, children: [] };
  }
  return { key: uid(), label, prompt: "", marks: 2, type, children: [] };
}

function newMcqItem(index: number): DraftMcqItem {
  const choices = ["", "", "", ""];
  return { key: uid(), label: toRoman(index + 1), prompt: "", choices, choiceLabels: defaultAlphaMcqLabels(4), correctOption: 0, marks: "1" };
}

function newQuestion(type: QuestionType = "essay"): DraftQuestion {
  const mcqOptions = ["", "", "", ""];
  return {
    key: uid(),
    questionType: type,
    prompt:
      type === "matching"
        ? "Match the items in Column A with those in Column B."
        : type === "structured"
          ? "Answer all parts."
          : type === "mcq"
            ? "For each of the items (i) – (x), choose the correct answer from the given alternatives and write its letter in the box provided."
            : "",
    marks: "10",
    options: type === "mcq" ? mcqOptions : [],
    choiceLabels: type === "mcq" ? defaultMcqLabels(mcqOptions.length) : [],
    correctOption: 0,
    mcqItems: type === "mcq" ? Array.from({ length: 10 }, (_, i) => newMcqItem(i)) : [],
    mcqMode: "items",
    matchingPairs: type === "matching" ? [{ left: "", right: "" }, { left: "", right: "" }] : [],
    structuredParts:
      type === "structured"
        ? [
            { key: uid(), label: "A", prompt: "", marks: 5, type: "short_answer", children: [] },
            { key: uid(), label: "B", prompt: "", marks: 5, type: "short_answer", children: [] },
          ]
        : [],
    practical: false,
  };
}

function mcqFromConfig(raw: unknown, fallbackCorrect = 0) {
  const cfg = normaliseMcqConfig(raw);
  if (cfg.choices.length === 0) {
    const opts = ["", "", "", ""];
    return { options: opts, choiceLabels: defaultMcqLabels(opts.length), correctOption: 0 };
  }
  return {
    options: cfg.choices,
    choiceLabels: cfg.choiceLabels.length === cfg.choices.length ? cfg.choiceLabels : defaultMcqLabels(cfg.choices.length),
    correctOption: cfg.correctOption ?? fallbackCorrect ?? 0,
  };
}

function questionToDraft(q: TeacherAssignmentDetail["questions"][number]): DraftQuestion {
  const base = newQuestion(q.questionType);
  const draft: DraftQuestion = {
    ...base,
    key: q.id || base.key,
    questionType: q.questionType,
    prompt: q.prompt ?? "",
    marks: String(q.marks ?? 0),
    practical: Boolean((q.options as { practical?: unknown } | null | undefined)?.practical === true),
  };
  if (q.questionType === "mcq") {
    const raw = q.options as any;
    if (raw && Array.isArray(raw.items) && raw.items.length > 0) {
      const cfg = normaliseMcqConfig(q.options);
      draft.mcqMode = "items";
      draft.mcqItems = (cfg.items || []).map((it, i) => ({
        key: it.key || uid(),
        label: it.label || toRoman(i + 1),
        prompt: it.prompt || "",
        choices: it.choices.length >= 2 ? [...it.choices] : ["", "", "", ""],
        choiceLabels: (it.choiceLabels && it.choiceLabels.length === it.choices.length) ? [...it.choiceLabels] : defaultAlphaMcqLabels(it.choices.length >= 2 ? it.choices.length : 4),
        correctOption: typeof it.correctOption === "number" ? it.correctOption : 0,
        marks: String(it.marks ?? 1),
      }));
      draft.options = [];
      draft.choiceLabels = [];
    } else {
      const mcq = mcqFromConfig(q.options, q.correctOption ?? 0);
      draft.mcqMode = "simple";
      draft.mcqItems = [];
      draft.options = mcq.options;
      draft.choiceLabels = mcq.choiceLabels;
      draft.correctOption = mcq.correctOption;
    }
  } else if (q.questionType === "matching") {
    const cfg = normaliseMatchingConfig(q.options);
    draft.matchingPairs = cfg.pairs.length >= 2 ? cfg.pairs : [{ left: "", right: "" }, { left: "", right: "" }];
  } else if (q.questionType === "structured") {
    const raw = q.options && typeof q.options === "object" && (q.options as any).parts ? (q.options as any).parts : q.options;
    const parts = normaliseStructuredParts(raw);
    draft.structuredParts = parts.length > 0 ? parts : base.structuredParts;
  }
  return draft;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

async function pickAttachment(event: ChangeEvent<HTMLInputElement>): Promise<Attachment> {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return null;
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Use a PDF or an image (PNG, JPG, WEBP, GIF).");
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    throw new Error("The attachment is too large. The limit is 3 MB.");
  }
  const data = await readFileAsDataUrl(file);
  return { name: file.name, type: file.type, data };
}

/**
 * Marks of a structured question.
 *
 * A part that has subparts is a container: its own "marks" value is the total
 * of its subparts, so we must not count it again on top of them. Counting both
 * was the reason a 5-mark part split into 5 marks of subparts reported 10.
 */
function sumPartMarks(parts: StructuredPart[]): number {
  return parts.reduce((sum, p) => {
    if (p.children && p.children.length > 0) return sum + sumPartMarks(p.children);
    return sum + (Number(p.marks) || 0);
  }, 0);
}

function partTotalMarks(part: StructuredPart): number {
  return part.children && part.children.length > 0 ? sumPartMarks(part.children) : Number(part.marks) || 0;
}

function clonePart(part: StructuredPart): StructuredPart {
  return { ...part, options: part.options ? [...part.options] : part.options, children: part.children ? part.children.map(clonePart) : part.children };
}

function updatePartInTree(parts: StructuredPart[], key: string, updater: (p: StructuredPart) => StructuredPart): StructuredPart[] {
  return parts.map((p) => {
    if (p.key === key) return updater(p);
    if (p.children && p.children.length) return { ...p, children: updatePartInTree(p.children, key, updater) };
    return p;
  });
}

function removePartInTree(parts: StructuredPart[], key: string): StructuredPart[] {
  return parts.filter((p) => p.key !== key).map((p) => (p.children ? { ...p, children: removePartInTree(p.children, key) } : p));
}

function addChildToPart(parts: StructuredPart[], parentKey: string): StructuredPart[] {
  return parts.map((p) => {
    if (p.key === parentKey) {
      const children = p.children ? [...p.children] : [];
      const label = toRoman(children.length + 1);
      children.push(newStructuredPart(label, "short_answer"));
      return { ...p, children };
    }
    if (p.children && p.children.length) return { ...p, children: addChildToPart(p.children, parentKey) };
    return p;
  });
}

function relabelParts(parts: StructuredPart[], depth = 0): StructuredPart[] {
  return parts.map((p, i) => {
    const label = depth === 0 ? String.fromCharCode(65 + i) : toRoman(i + 1);
    return { ...p, label, children: p.children ? relabelParts(p.children, depth + 1) : p.children };
  });
}

function validateAndBuildQuestion(question: DraftQuestion, index: number): { ok: true; payload: NewQuestionPayload; marks: number } | { ok: false; error: string } {
  const prompt = question.prompt.trim();
  if (question.questionType !== "structured" && question.questionType !== "matching" && !prompt) {
    return { ok: false, error: `Enter the instructions for question ${index + 1}.` };
  }
  const baseMarks = Number(question.marks);
  if (!Number.isFinite(baseMarks) || baseMarks < 0) {
    return { ok: false, error: `The marks for question ${index + 1} are invalid.` };
  }

  if (question.questionType === "mcq") {
    if (question.mcqMode === "items") {
      if (question.mcqItems.length === 0) return { ok: false, error: `Question ${index + 1} (MCQ) needs at least one item.` };
      const items = question.mcqItems.map((it, i) => {
        const filled = it.choices.map((c) => c.trim());
        const nonEmpty = filled.filter(Boolean);
        return { ...it, filled, nonEmpty, index: i };
      });
      for (const it of items) {
        if (!it.prompt.trim()) return { ok: false, error: `Question ${index + 1}, item (${it.label || toRoman(it.index + 1)}) needs question text.` };
        if (it.nonEmpty.length < 2) return { ok: false, error: `Question ${index + 1}, item (${it.label || toRoman(it.index + 1)}) needs 2 to 10 options.` };
      }
      const builtItems = items.map((it) => {
        const correctTrimmed = it.filled[it.correctOption]?.trim() || "";
        let correctIndex = it.nonEmpty.indexOf(correctTrimmed);
        if (correctIndex < 0) correctIndex = 0;
        const marksNum = Number(it.marks);
        return {
          key: it.key,
          label: it.label || toRoman(it.index + 1),
          prompt: it.prompt.trim(),
          choices: it.nonEmpty,
          choiceLabels: defaultAlphaMcqLabels(it.nonEmpty.length),
          correctOption: correctIndex,
          marks: Number.isFinite(marksNum) && marksNum >= 0 ? marksNum : 1,
        };
      });
      const itemsMarks = builtItems.reduce((s, it) => s + (Number(it.marks) || 0), 0);
      const marks = itemsMarks > 0 ? itemsMarks : baseMarks;
      return {
        ok: true,
        marks,
        payload: {
          questionType: "mcq",
          prompt: prompt || "For each of the items, choose the correct answer and write its letter in the box provided.",
          options: { instruction: prompt || undefined, items: builtItems },
          correctOption: null,
          marks,
        },
      };
    }
    const filled = question.options.map((o) => o.trim()).filter(Boolean);
    if (filled.length < 2 || filled.length > 20) return { ok: false, error: `Question ${index + 1} (MCQ) needs 2 to 20 options.` };
    if (!question.options[question.correctOption]?.trim()) return { ok: false, error: `Select the correct answer for question ${index + 1}.` };
    const correctTrimmed = question.options[question.correctOption].trim();
    const correctIndex = filled.indexOf(correctTrimmed);
    const labels = filled.map((_, i) => toRoman(i + 1));
    return {
      ok: true,
      marks: baseMarks,
      payload: {
        questionType: "mcq",
        prompt: prompt || "Choose the correct answer.",
        options: { choices: filled, choiceLabels: labels, correctOption: Math.max(0, correctIndex) },
        correctOption: Math.max(0, correctIndex),
        marks: baseMarks,
      },
    };
  }

  if (question.questionType === "matching") {
    const pairs = question.matchingPairs
      .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
      .filter((p) => p.left || p.right);
    if (pairs.length < 2 || pairs.length > 20) return { ok: false, error: `Question ${index + 1} (matching) needs 2 to 20 pairs.` };
    if (pairs.some((p) => !p.left || !p.right)) return { ok: false, error: `Fill both sides for every matching pair in question ${index + 1}.` };
    return {
      ok: true,
      marks: baseMarks,
      payload: {
        questionType: "matching",
        prompt: prompt || "Match the items.",
        options: { pairs, labelStyle: "roman" },
        correctOption: null,
        marks: baseMarks,
      },
    };
  }

  if (question.questionType === "structured") {
    const cleanParts = (parts: StructuredPart[]): StructuredPart[] =>
      parts.map((p) => ({
        ...p,
        prompt: (p.prompt || "").trim(),
        marks: Number(p.marks) || 0,
        options: p.type === "mcq" ? (p.options || []).map((o) => String(o).trim()).filter(Boolean) : undefined,
        correctOption: p.type === "mcq" ? (typeof p.correctOption === "number" ? p.correctOption : null) : null,
        children: p.children && p.children.length ? cleanParts(p.children) : undefined,
      }));
    const parts = cleanParts(question.structuredParts);
    const hasAny = (ps: StructuredPart[]): boolean => ps.some((p) => p.prompt || (p.children && hasAny(p.children)));
    if (!hasAny(parts)) return { ok: false, error: `Question ${index + 1} (structured) needs at least one part with content.` };
    const derived = sumPartMarks(parts);
    const marks = derived > 0 ? derived : baseMarks;
    return {
      ok: true,
      marks,
      payload: {
        questionType: "structured",
        prompt: prompt || "Answer all parts.",
        options: { parts },
        correctOption: null,
        marks,
      },
    };
  }

  // essay, calculation, short_answer
  return {
    ok: true,
    marks: baseMarks,
    payload: {
      questionType: question.questionType,
      prompt,
      options: question.practical ? { practical: true } : null,
      correctOption: null,
      marks: baseMarks,
    },
  };
}

export default function TeacherAssignments() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [options, setOptions] = useState<TeacherOption[]>([]);
  const [unrestricted, setUnrestricted] = useState(false);
  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [publishingId, setPublishingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TeacherAssignmentSummary | null>(null);
  const [listFormFilter, setListFormFilter] = useState<string>("");

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const load = useCallback(async () => {
    try {
      const [optionsResult, assignmentsResult] = await Promise.all([
        fetchTeacherOptions(),
        fetchTeacherAssignments(),
      ]);
      setOptions(optionsResult.options);
      setUnrestricted(Boolean(optionsResult.unrestricted));
      setAssignments(assignmentsResult.assignments);
      setPeriod(assignmentsResult.period);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  function afterMutation() { void load(); }

  const formByContext = useMemo(() => {
    const map = new Map<string, number>();
    for (const opt of options) {
      map.set(`${opt.subjectId}|${opt.classId}|${opt.streamId}`, opt.formLevel);
    }
    return map;
  }, [options]);

  const listFormLevels = useMemo(() => {
    const set = new Set<number>();
    for (const a of assignments) {
      const f = formByContext.get(`${a.subjectId}|${a.classId}|${a.streamId}`);
      if (f && f > 0) set.add(f);
    }
    if (set.size === 0) {
      for (const opt of options) if (opt.formLevel > 0) set.add(opt.formLevel);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [assignments, options, formByContext]);

  const filteredAssignments = useMemo(() => {
    if (!listFormFilter) return assignments;
    return assignments.filter(
      (a) => String(formByContext.get(`${a.subjectId}|${a.classId}|${a.streamId}`) || "") === listFormFilter,
    );
  }, [assignments, listFormFilter, formByContext]);

  useEffect(() => {
    if (listFormFilter && !listFormLevels.some((f) => String(f) === listFormFilter)) {
      setListFormFilter("");
    }
  }, [listFormFilter, listFormLevels]);

  async function publishFromList(id: string) {
    if (publishingId || deletingId) return;
    setPublishingId(id);
    setError("");
    setBanner("");
    try {
      await updateTeacherAssignmentStatus(id, "published");
      setAssignments((prev) => prev.map((row) => (row.id === id ? { ...row, status: "published" } : row)));
      setBanner("Assignment published. Students can now see it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish the assignment.");
    } finally {
      setPublishingId("");
    }
  }

  function requestDelete(assignment: TeacherAssignmentSummary) {
    if (deletingId) return;
    setPendingDelete(assignment);
  }

  async function confirmDeleteFromList() {
    const assignment = pendingDelete;
    if (!assignment || deletingId) return;
    setPendingDelete(null);
    setDeletingId(assignment.id);
    setError("");
    try {
      await deleteTeacherAssignment(assignment.id);
      setAssignments((prev) => prev.filter((row) => row.id !== assignment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the assignment.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="ta">
      {view.kind === "list" && (
        <>
          <header className="ta-header">
            <div>
              <h1>Assignments</h1>
              <p>
                {unrestricted
                  ? "Create assignments for any subject, class and stream in the school."
                  : "Create assignments for the subject, class and stream assigned to you."}
                {period ? ` Academic year ${period.academicYearId} · Term ${period.term}.` : ""}
              </p>
            </div>
            <div className="ta-header-actions">
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => { setLoading(true); setError(""); void load(); }}>Refresh</button>
              <button type="button" className="ta-btn ta-btn--primary" onClick={() => setView({ kind: "create" })}>+ New Assignment</button>
            </div>
          </header>
          {(error || banner) && (
            <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => { setError(""); setBanner(""); }}>
              <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="ta-modal-head">
                  <h3>{error ? "Notice" : "Success"}</h3>
                  <button type="button" className="ta-btn ta-btn--ghost" onClick={() => { setError(""); setBanner(""); }}>Close</button>
                </div>
                <div className={`ta-alert ${error ? "ta-alert--error" : "ta-alert--success"}`} style={{ margin: 0 }}>{error || banner}</div>
              </div>
            </div>
          )}
          {!loading && assignments.length > 0 && listFormLevels.length > 0 && (
            <div className="ta-filters" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
          {loading ? (
            <p className="ta-muted">Loading assignments…</p>
          ) : assignments.length === 0 ? (
            <div className="ta-empty">
              <h2>No assignments yet</h2>
              <p>Click “New Assignment” to create the first assignment for your students.</p>
              {options.length === 0 && (
                <p className="ta-warn">
                  {unrestricted
                    ? "No subject, class or stream options are available yet. Set up classes, streams and subjects first."
                    : "You are not assigned to any subject, class or stream. Contact the academic office."}
                </p>
              )}
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="ta-empty">
              <h2>No assignments for this form</h2>
              <p>There are no assignments for the selected form (Kidato). Try another form or view all forms.</p>
            </div>
          ) : (
            <div className="ta-grid">
              {filteredAssignments.map((assignment) => (
                <article key={assignment.id} className="ta-card">
                  <div className="ta-card-head">
                    <span className="ta-subject">{assignment.subjectName}<span>{assignment.className} {assignment.streamName}</span></span>
                    <span className={`ta-status ta-status--${assignment.status}`}>{assignmentStatusLabel[assignment.status]}</span>
                  </div>
                  <h2>{assignment.title}</h2>
                  <p className="ta-muted">Deadline: {formatDate(assignment.deadline)}{assignment.allowLateSubmission ? " · Late submission allowed" : ""}</p>
                  <div className="ta-counts">
                    <div><strong>{assignment.submittedCount}</strong><span>submitted</span></div>
                    <div><strong>{assignment.markedCount}</strong><span>marked</span></div>
                    <div><strong>{assignment.notSubmittedCount}</strong><span>not submitted</span></div>
                    <div><strong>{assignment.totalStudents}</strong><span>total</span></div>
                  </div>
                  <div className="ta-card-actions">
                    {assignment.status === "draft" && (
                      <button type="button" className="ta-btn ta-btn--primary" onClick={() => void publishFromList(assignment.id)} disabled={publishingId === assignment.id || Boolean(deletingId)}>{publishingId === assignment.id ? "Publishing…" : "Publish"}</button>
                    )}
                    <button type="button" className={`ta-btn ${assignment.status === "draft" ? "ta-btn--ghost" : "ta-btn--primary"}`} onClick={() => setView({ kind: "detail", id: assignment.id })}>Open assignment</button>
                    <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setView({ kind: "edit", id: assignment.id })} disabled={deletingId === assignment.id}>Edit</button>
                    <button type="button" className="ta-btn ta-btn--danger" onClick={() => requestDelete(assignment)} disabled={Boolean(deletingId) || Boolean(publishingId)}>{deletingId === assignment.id ? "Deleting…" : "Delete"}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {view.kind === "create" && (
        <AssignmentForm options={options} unrestricted={unrestricted} onCancel={() => setView({ kind: "list" })} onSaved={(id) => { afterMutation(); setView({ kind: "detail", id }); }} />
      )}
      {view.kind === "edit" && (
        <AssignmentForm options={options} unrestricted={unrestricted} editId={view.id} onCancel={() => setView({ kind: "detail", id: view.id })} onSaved={(id) => { afterMutation(); setView({ kind: "detail", id }); }} />
      )}
      {view.kind === "detail" && (
        <AssignmentDetailPanel
          assignmentId={view.id}
          onBack={() => { afterMutation(); setView({ kind: "list" }); }}
          onEdit={() => setView({ kind: "edit", id: view.id })}
          onDeleted={() => { afterMutation(); setView({ kind: "list" }); }}
          onGrade={(submissionId, studentName) => setView({ kind: "grade", assignmentId: view.id, submissionId, studentName })}
        />
      )}
      {view.kind === "grade" && (
        <GradePanel assignmentId={view.assignmentId} submissionId={view.submissionId} studentName={view.studentName} onBack={() => setView({ kind: "detail", id: view.assignmentId })} onSaved={() => afterMutation()} />
      )}


      {pendingDelete && (
        <div className="ta-modal-backdrop" onClick={() => !deletingId && setPendingDelete(null)}>
          <div className="ta-modal" style={{ maxWidth: 480, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head"><h3>Delete assignment?</h3></div>
            <p className="ta-muted" style={{ margin: "0 0 16px" }}>Delete “{pendingDelete.title}”? This also removes all its questions and student submissions. This cannot be undone.</p>
            <div className="ta-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setPendingDelete(null)} disabled={Boolean(deletingId)}>Cancel</button>
              <button type="button" className="ta-btn ta-btn--primary ta-btn--danger" onClick={() => void confirmDeleteFromList()} disabled={Boolean(deletingId)}>{deletingId ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function McqReadOnly({ options, labels, correct }: { options: string[]; labels: string[]; correct: number }) {
  return (
    <ol className="ta-option-read">
      {options.map((option, index) => (
        <li key={index} className={correct === index ? "is-correct" : ""}>
          <strong>({labels[index] || toRoman(index + 1)})</strong> {option}{correct === index ? " ✓" : ""}
        </li>
      ))}
    </ol>
  );
}

function MatchingReadOnly({ pairs }: { pairs: MatchingPair[] }) {
  return (
    <div>
      <p className="ta-muted">Match Column A with Column B</p>
      <ol>
        {pairs.map((p, i) => (
          <li key={i}><strong>({toRoman(i + 1)})</strong> {p.left} — <em>{p.right}</em></li>
        ))}
      </ol>
    </div>
  );
}

function StructuredReadOnly({ parts, depth = 0 }: { parts: StructuredPart[]; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      {parts.map((part, idx) => {
        const hasChildren = Boolean(part.children && part.children.length > 0);
        return (
        <div key={part.key || idx} style={{ marginBottom: 8 }}>
          <div>
            <strong>{part.label || (depth === 0 ? String.fromCharCode(65 + idx) : toRoman(idx + 1))}.</strong> {part.prompt}{" "}
            {!hasChildren && <span className="ta-muted">({partTotalMarks(part)} marks, {questionTypeLabelEn[part.type as QuestionType] || part.type})</span>}
          </div>
          {part.type === "mcq" && !(part.children && part.children.length > 0) && Array.isArray(part.options) && (
            <ul>
              {part.options.map((opt, i) => {
                const lbl = (part.choiceLabels && part.choiceLabels[i]) || (part.options && part.options.length <= 8 ? alphaLabel(i) : toRoman(i + 1));
                return <li key={i}>{lbl}. {String(opt)}{part.correctOption === i ? " ✓" : ""}</li>;
              })}
            </ul>
          )}
          {part.children && part.children.length > 0 && <StructuredReadOnly parts={part.children} depth={depth + 1} />}
        </div>
        );
      })}
    </div>
  );
}

function StructuredPartEditor({
  part, depth, onChange, onRemove, onAddChild, canRemove,
}: {
  part: StructuredPart; depth: number; onChange: (p: StructuredPart) => void; onRemove: () => void; onAddChild: () => void; canRemove: boolean;
}) {
  const isChild = depth > 0;
  const set = (patch: Partial<StructuredPart>) => onChange({ ...part, ...patch });
  const setType = (type: StructuredPartType) => {
    if (type === "mcq") {
      const opts = part.options && part.options.length >= 2 ? part.options.map(String) : ["", "", "", ""];
      const labels = (part.choiceLabels && part.choiceLabels.length === opts.length) ? part.choiceLabels : defaultAlphaMcqLabels(opts.length);
      set({ type, options: opts, choiceLabels: labels, correctOption: 0 });
    } else {
      set({ type, options: undefined, choiceLabels: undefined, correctOption: null });
    }
  };
  const options = (part.options || []).map(String);
  const labels = (part.choiceLabels && part.choiceLabels.length === options.length) ? part.choiceLabels : defaultAlphaMcqLabels(options.length);
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, marginTop: 8, marginLeft: depth * 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{part.label}.</strong>
        {!(part.children && part.children.length > 0) && (
          <select className="ta-input" value={part.type} onChange={(e) => setType(e.target.value as StructuredPartType)}>
            <option value="short_answer">Short answer</option>
            <option value="essay">Essay</option>
            <option value="calculation">Calculation</option>
            <option value="mcq">Multiple choice (A, B, C…)</option>
          </select>
        )}
        {part.children && part.children.length > 0 ? (
          <span className="ta-muted" title="This part is only an instruction; marks come from its subparts.">Marks from subparts: {partTotalMarks(part)}</span>
        ) : (
          <input className="ta-input" type="number" min={0} step="0.5" value={part.marks} onChange={(e) => set({ marks: Number(e.target.value) || 0 })} style={{ width: 100 }} placeholder="Marks" />
        )}
        <button type="button" className="ta-link ta-link--danger" onClick={onRemove} disabled={!canRemove && !isChild}>Remove</button>
        {!isChild && <button type="button" className="ta-link" onClick={onAddChild}>+ Add subpart (i, ii…)</button>}
      </div>
      <AutoGrowTextarea className="ta-input ta-textarea" minRows={2} value={part.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder={`Part ${part.label} question/instruction`} style={{ marginTop: 6 }} />
      {part.type === "mcq" && (
        <div style={{ marginTop: 6 }}>
          <span className="ta-muted">Options labeled A, B, C, D… (student can choose the letter)</span>
          {options.map((opt, i) => (
            <div key={i} className="ta-option-row">
              <input type="radio" name={`p-${part.key}`} checked={(part.correctOption ?? 0) === i} onChange={() => set({ correctOption: i })} />
              <strong style={{ minWidth: 24 }}>{labels[i] || alphaLabel(i)}.</strong>
              <input className="ta-input" value={opt} onChange={(e) => set({ options: options.map((o, j) => j === i ? e.target.value : o) })} />
              <button type="button" className="ta-link ta-link--danger" onClick={() => {
                const next = options.filter((_, j) => j !== i);
                let c = part.correctOption ?? 0; if (c === i) c = 0; else if (c > i) c -= 1;
                const nextLabels = defaultAlphaMcqLabels(next.length >= 2 ? next.length : 2);
                set({ options: next.length >= 2 ? next : ["", ""], choiceLabels: nextLabels, correctOption: c });
              }} disabled={options.length <= 2}>Remove</button>
            </div>
          ))}
          {options.length < 20 && <button type="button" className="ta-link" onClick={() => { const next = [...options, ""]; set({ options: next, choiceLabels: defaultAlphaMcqLabels(next.length) }); }}>+ Add option</button>}
        </div>
      )}
      {part.children && part.children.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {part.children.map((child) => (
            <StructuredPartEditor key={child.key} part={child} depth={depth + 1}
              onChange={(updated) => set({ children: (part.children || []).map((c) => c.key === child.key ? updated : c) })}
              onRemove={() => set({ children: (part.children || []).filter((c) => c.key !== child.key) })}
              onAddChild={() => {}}
              canRemove={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function McqItemsReadOnly({ instruction, items }: { instruction?: string; items: { label: string; prompt: string; choices: string[]; choiceLabels?: string[]; correctOption?: number | null }[] }) {
  return (
    <div>
      {instruction && <p style={{ marginBottom: 8 }}>{instruction}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
            <div><strong>({it.label || toRoman(idx + 1)})</strong> {it.prompt}</div>
            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
              {(it.choices || []).map((opt, i) => {
                const lbl = (it.choiceLabels && it.choiceLabels[i]) || alphaLabel(i);
                const correct = it.correctOption === i;
                return <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ minWidth: 22, fontWeight: 600 }}>{lbl}.</span><span>{opt}{correct ? " ✓" : ""}</span></div>;
              })}
            </div>
            <div className="ta-muted" style={{ marginTop: 6 }}>Answer box: <strong>[&nbsp;&nbsp;]</strong></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderQuestionConfigSummary(question: { questionType: QuestionType; options: unknown; correctOption: number | null; prompt?: string }) {
  if (question.questionType === "mcq") {
    const cfg = normaliseMcqConfig(question.options);
    if (Array.isArray(cfg.items) && cfg.items.length > 0) {
      return <McqItemsReadOnly instruction={cfg.instruction || question.prompt} items={cfg.items as any} />;
    }
    return <McqReadOnly options={cfg.choices} labels={cfg.choiceLabels} correct={cfg.correctOption ?? question.correctOption ?? 0} />;
  }
  if (question.questionType === "matching") {
    const cfg = normaliseMatchingConfig(question.options);
    return <MatchingReadOnly pairs={cfg.pairs} />;
  }
  if (question.questionType === "structured") {
    const raw = question.options && typeof question.options === "object" && (question.options as any).parts ? (question.options as any).parts : question.options;
    const parts = normaliseStructuredParts(raw);
    return <StructuredReadOnly parts={parts} />;
  }
  return null;
}

function AssignmentForm({ options, unrestricted, editId, onCancel, onSaved }: { options: TeacherOption[]; unrestricted: boolean; editId?: string; onCancel: () => void; onSaved: (id: string) => void; }) {
  const isEditing = Boolean(editId);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState(""); // "subjectId|classId|streamId" or "ALL|subjectId|classId"
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [totalMarks, setTotalMarks] = useState("100");
  const [allowLate, setAllowLate] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()]);
  const [status, setStatus] = useState<"draft" | "published" | "closed">("published");
  const [questionsLocked, setQuestionsLocked] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<"draft" | "published" | "save" | null>(null);
  const [optionsWarningOpen, setOptionsWarningOpen] = useState(true);
  const [lockedWarningOpen, setLockedWarningOpen] = useState(true);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!editId) return;
    let active = true;
    fetchTeacherAssignment(editId).then((detail) => {
      if (!active) return;
      const assignment = detail.assignment;
      const totalValue = String(assignment.totalMarks);
      setSelection(`${assignment.subjectId}|${assignment.classId}|${assignment.streamId}`);
      setTitle(assignment.title);
      setInstructions(assignment.instructions);
      setDeadline(soonDatetimeLocal(assignment.deadline));
      setTotalMarks(totalValue);
      setAllowLate(assignment.allowLateSubmission);
      setStatus(assignment.status);
      setAttachment(assignment.attachmentName && assignment.attachmentData ? { name: assignment.attachmentName, type: assignment.attachmentType ?? "", data: assignment.attachmentData } : null);
      const loadedQuestions = detail.questions.length > 0 ? detail.questions.map(questionToDraft) : [newQuestion()];
      // One question carries every mark in the assignment; keep it in step
      // with the total even for assignments saved with the old default.
      if (loadedQuestions.length === 1 && totalValue.trim()) {
        const only = loadedQuestions[0];
        if (only.questionType !== "structured" && !(only.questionType === "mcq" && only.mcqMode === "items")) {
          only.marks = totalValue;
        }
      }
      setQuestions(loadedQuestions);
      setQuestionsLocked(Boolean(detail.assignment.hasSubmissions));
      setLoadError("");
    }).catch((err) => { if (active) setLoadError(err instanceof Error ? err.message : "Could not load the assignment."); }).finally(() => { if (active) setLoadingEdit(false); });
    return () => { active = false; };
  }, [editId]);

  const [formFilter, setFormFilter] = useState<string>("");
  const formLevels = useMemo(() => Array.from(new Set(options.map((o) => o.formLevel).filter((n) => n > 0))).sort((a, b) => a - b), [options]);
  const filteredOptions = useMemo(
    () => (formFilter ? options.filter((o) => String(o.formLevel) === formFilter) : options),
    [options, formFilter],
  );
  const selected = options.find((option) => `${option.subjectId}|${option.classId}|${option.streamId}` === selection);
  const allStreamGroups = useMemo(() => {
    const map = new Map<string, TeacherOption[]>();
    for (const opt of filteredOptions) {
      const key = `${opt.subjectId}|${opt.classId}`;
      const list = map.get(key) ?? [];
      list.push(opt);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key, options: [...list].sort((a, b) => a.streamName.localeCompare(b.streamName)), sample: list[0] }));
  }, [filteredOptions]);
  const selectedAllGroup = selection.startsWith("ALL|") ? (allStreamGroups.find((g) => `ALL|${g.key}` === selection) ?? null) : null;

  useEffect(() => {
    if (!selected) return;
    if (selected.formLevel > 0) setFormFilter(String(selected.formLevel));
  }, [selected?.subjectId, selected?.classId, selected?.streamId, selected?.formLevel]);

  // A single question is the whole assignment, so its marks must match the
  // total the teacher typed. Without this the question kept the default 10 and
  // grading could never award the full total (e.g. 20).
  const soleQuestion = questions.length === 1 ? questions[0] : null;
  const soleQuestionMarksFollowTotal = soleQuestion !== null
    && soleQuestion.questionType !== "structured"
    && !(soleQuestion.questionType === "mcq" && soleQuestion.mcqMode === "items");

  function syncSingleQuestionMarks(value: string) {
    if (!value.trim() || questionsLocked || !soleQuestionMarksFollowTotal || !soleQuestion) return;
    updateQuestion(soleQuestion.key, { marks: value });
  }

  const questionTotal = useMemo(() => questions.reduce((sum, q) => {
    if (q.questionType === "structured") return sum + sumPartMarks(q.structuredParts);
    if (q.questionType === "mcq" && q.mcqMode === "items") {
      const m = q.mcqItems.reduce((s, it) => s + (Number(it.marks) || 0), 0);
      return sum + (m > 0 ? m : (Number(q.marks) || 0));
    }
    return sum + (Number.isFinite(Number(q.marks)) ? Number(q.marks) : 0);
  }, 0), [questions]);

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) { setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q))); }
  function changeType(key: string, type: QuestionType) { setQuestions((prev) => prev.map((q) => { if (q.key !== key) return q; const fresh = newQuestion(type); return { ...fresh, key: q.key, prompt: type === "mcq" ? fresh.prompt : (q.prompt || fresh.prompt), marks: q.marks }; })); }
  function addMcqOption(key: string) { setQuestions((prev) => prev.map((q) => { if (q.key !== key || q.options.length >= 20) return q; const opts = [...q.options, ""]; return { ...q, options: opts, choiceLabels: defaultMcqLabels(opts.length) }; })); }
  function removeMcqOption(key: string, index: number) { setQuestions((prev) => prev.map((q) => { if (q.key !== key || q.options.length <= 2) return q; const opts = q.options.filter((_, i) => i !== index); let c = q.correctOption; if (c === index) c = 0; else if (c > index) c -= 1; return { ...q, options: opts, correctOption: c, choiceLabels: defaultMcqLabels(opts.length) }; })); }
  function updatePair(key: string, idx: number, side: "left" | "right", value: string) { setQuestions((prev) => prev.map((q) => q.key !== key ? q : { ...q, matchingPairs: q.matchingPairs.map((p, i) => i === idx ? { ...p, [side]: value } : p) })); }
  function addPair(key: string) { setQuestions((prev) => prev.map((q) => q.key === key && q.matchingPairs.length < 20 ? { ...q, matchingPairs: [...q.matchingPairs, { left: "", right: "" }] } : q)); }
  function removePair(key: string, idx: number) { setQuestions((prev) => prev.map((q) => q.key === key && q.matchingPairs.length > 2 ? { ...q, matchingPairs: q.matchingPairs.filter((_, i) => i !== idx) } : q)); }
  function setStructuredParts(key: string, updater: (parts: StructuredPart[]) => StructuredPart[]) { setQuestions((prev) => prev.map((q) => q.key !== key ? q : { ...q, structuredParts: relabelParts(updater(q.structuredParts.map(clonePart))) })); }
  async function handleAttachment(event: ChangeEvent<HTMLInputElement>) { try { const picked = await pickAttachment(event); if (picked) { setAttachment(picked); setError(""); } } catch (err) { setError(err instanceof Error ? err.message : "Invalid attachment."); } }

  async function save(action: "draft" | "published" | "save", overrideStatus?: "draft" | "published" | "closed") {
    if (submitting) return; setError("");
    if (!isEditing && !selected && !selectedAllGroup) { setError("Select a subject, class and stream."); return; }
    if (title.trim().length < 3) { setError("Enter an assignment title (at least 3 characters)."); return; }
    const built: NewQuestionPayload[] = []; let computedTotal = 0;
    if (!questionsLocked) {
      for (let i = 0; i < questions.length; i++) { const res = validateAndBuildQuestion(questions[i], i); if (!res.ok) { setError(res.error); return; } built.push(res.payload); computedTotal += res.marks; }
    }
    let deadlineIso: string | null = null;
    if (deadline) { const parsed = new Date(deadline); if (Number.isNaN(parsed.getTime())) { setError("The deadline is invalid."); return; } deadlineIso = parsed.toISOString(); }
    const total = Number(totalMarks); if (!Number.isFinite(total) || total <= 0) { setError("Total marks must be greater than zero."); return; }
    if (!questionsLocked && computedTotal > total) { setError(`The questions total (${computedTotal}) exceeds the assignment total (${total}).`); return; }
    setSubmitting(action);
    try {
      if (isEditing && editId) {
        await updateTeacherAssignment(editId, { title: title.trim(), instructions: instructions.trim(), deadline: deadlineIso, totalMarks: total, allowLateSubmission: allowLate, status: overrideStatus ?? status, attachment, questions: questionsLocked ? null : built });
        onSaved(editId);
      } else if (selectedAllGroup) {
        const targets = selectedAllGroup.options;
        let lastId = "";
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const result = await createTeacherAssignment({ subjectId: t.subjectId, classId: t.classId, streamId: t.streamId, title: title.trim(), instructions: instructions.trim(), deadline: deadlineIso, totalMarks: total, allowLateSubmission: allowLate, status: action === "draft" ? "draft" : "published", attachment, questions: built });
          lastId = result.id;
        }
        onSaved(lastId);
      } else {
        const result = await createTeacherAssignment({ subjectId: selected!.subjectId, classId: selected!.classId, streamId: selected!.streamId, title: title.trim(), instructions: instructions.trim(), deadline: deadlineIso, totalMarks: total, allowLateSubmission: allowLate, status: action === "draft" ? "draft" : "published", attachment, questions: built });
        onSaved(result.id);
      }
    } catch (err) { setError(err instanceof Error ? err.message : (isEditing ? "Could not update the assignment." : "Could not create the assignment.")); setSubmitting(null); }
  }

  if (loadingEdit) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onCancel}>← Back to assignments</button><p className="ta-muted">Loading assignment…</p></div>);
  if (loadError) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onCancel}>← Back to assignments</button><div className="ta-alert ta-alert--error">{loadError}</div></div>);

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onCancel}>← Back to assignments</button>
      <header className="ta-panel-head"><h1>{isEditing ? "Edit Assignment" : "New Assignment"}</h1><p>{isEditing ? "Update the assignment details. Questions can only be changed while no student has started." : "Choose the subject and class, then prepare the questions and marks."}</p></header>
      {options.length === 0 && optionsWarningOpen && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => setOptionsWarningOpen(false)}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head"><h3>No classes available</h3></div>
            <div className="ta-alert ta-alert--warn" style={{ margin: "0 0 16px" }}>{unrestricted ? "No subject, class or stream options are available yet. Set up classes, streams and subjects first." : "You are not assigned to any subject, class or stream. Contact the academic office."}</div>
            <div className="ta-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ta-btn ta-btn--primary" onClick={() => setOptionsWarningOpen(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
      <div className="ta-form-grid">
        <label className="ta-field"><span>Form (Kidato)</span><select className="ta-input" value={formFilter} disabled={isEditing} onChange={(e) => { setFormFilter(e.target.value); if (!isEditing) setSelection(""); }}><option value="">— Select form —</option>{formLevels.map((f) => (<option key={f} value={String(f)}>Form {f} (Kidato {f})</option>))}</select></label>
        <label className="ta-field ta-field--span"><span>Subject, class and stream (target class)</span><select className="ta-input" value={selection} disabled={isEditing} onChange={(e) => setSelection(e.target.value)}><option value="">- Select -</option>{isEditing && !selected && selection && <option value={selection}>Current subject, class and stream</option>}{!isEditing && allStreamGroups.map((group) => (<option key={`ALL|${group.key}`} value={`ALL|${group.key}`}>Form {group.sample.formLevel} {group.sample.className} - {group.sample.subjectName} (All streams: {group.options.map((o) => o.streamName).join(", ")})</option>))}{filteredOptions.map((option) => (<option key={`${option.subjectId}|${option.classId}|${option.streamId}`} value={`${option.subjectId}|${option.classId}|${option.streamId}`}>Form {option.formLevel} {option.className} {option.streamName} - {option.subjectName}</option>))}</select><small className="ta-muted">{selectedAllGroup ? `This will create a separate copy for each stream (${selectedAllGroup.options.map((o) => o.streamName).join(", ")}) in ${selectedAllGroup.sample.className} for ${selectedAllGroup.sample.subjectName}.` : "This assignment will be visible only to students in the selected form/class and stream who take this subject."}</small></label>
        <label className="ta-field ta-field--span"><span>Assignment title</span><input className="ta-input" type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exercise 2 — Linear equations" /></label>
        <label className="ta-field ta-field--span"><span>Instructions</span><AutoGrowTextarea className="ta-input ta-textarea" minRows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="General instructions for students…" /></label>
        <label className="ta-field"><span>Deadline</span><input className="ta-input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        <label className="ta-field"><span>Total marks</span><input className="ta-input" type="number" min={1} step="0.5" value={totalMarks} onChange={(e) => { setTotalMarks(e.target.value); syncSingleQuestionMarks(e.target.value); }} /><small>Question marks: {questionTotal}{Number(totalMarks) > 0 && questionTotal > Number(totalMarks) ? " — exceeds the total!" : ""}</small></label>
        <label className="ta-check ta-field--span"><input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /><span>Allow submissions after the deadline (they will be marked late)</span></label>
        {isEditing && (<label className="ta-field"><span>Status</span><select className="ta-input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published" | "closed")}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></label>)}
        <div className="ta-field ta-field--span"><span>Attachment (PDF or image, optional)</span>{attachment ? (<div className="ta-attachment"><a href={attachment.data} download={attachment.name} target="_blank" rel="noreferrer">{attachment.name}</a><button type="button" className="ta-link ta-link--danger" onClick={() => setAttachment(null)}>Remove</button></div>) : (<input className="ta-input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void handleAttachment(e)} />)}</div>
      </div>

      {questionsLocked ? (
        <section className="ta-questions">
          <div className="ta-section-head"><h2>Questions</h2><span className="ta-muted">Questions are locked because students have started this assignment.</span></div>
          {questions.map((question, index) => (<article key={question.key} className="ta-question-read"><header><strong>Question {index + 1}</strong><span>{questionTypeLabelEn[question.questionType]} · {question.questionType === "structured" ? sumPartMarks(question.structuredParts) : (question.questionType === "mcq" && question.mcqMode === "items" ? (question.mcqItems.reduce((s,it)=>s+(Number(it.marks)||0),0) || question.marks) : question.marks)} marks</span>{question.practical && <span className="ta-status">Practical · C++ IDE</span>}</header><p>{question.prompt}</p>{question.questionType === "mcq" && (question.mcqMode === "items" ? <McqItemsReadOnly instruction={question.prompt} items={question.mcqItems.map(it=>({label:it.label,prompt:it.prompt,choices:it.choices,choiceLabels:it.choiceLabels,correctOption:it.correctOption}))} /> : <McqReadOnly options={question.options} labels={question.choiceLabels} correct={question.correctOption} />)}{question.questionType === "matching" && <MatchingReadOnly pairs={question.matchingPairs} />}{question.questionType === "structured" && <StructuredReadOnly parts={question.structuredParts} />}</article>))}
        </section>
      ) : (
        <section className="ta-questions">
          <div className="ta-section-head"><h2>Questions</h2><button type="button" className="ta-btn ta-btn--ghost" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>+ Add question</button></div>
          {questions.map((question, index) => (
            <article key={question.key} className="ta-question">
              <header className="ta-question-head"><strong>Question {index + 1}</strong><button type="button" className="ta-link ta-link--danger" onClick={() => setQuestions((prev) => prev.filter((r) => r.key !== question.key))} disabled={questions.length === 1}>Remove</button></header>
              <div className="ta-question-grid">
                <label className="ta-field"><span>Question type</span><select className="ta-input" value={question.questionType} onChange={(e) => changeType(question.key, e.target.value as QuestionType)}><option value="essay">Essay / Long answer</option><option value="calculation">Essay / Calculation (show working)</option><option value="short_answer">Short answer</option><option value="mcq">Multiple choice</option><option value="matching">Matching items</option><option value="structured">Structured / Multi-part</option></select></label>
                <label className="ta-field"><span>{question.questionType === "structured" ? "Marks (auto from parts if 0)" : "Marks"}</span><input className="ta-input" type="number" min={0} step="0.5" value={question.marks} onChange={(e) => updateQuestion(question.key, { marks: e.target.value })} /></label>
                <label className="ta-field ta-field--span"><span>Question / instructions</span><AutoGrowTextarea className="ta-input ta-textarea" minRows={3} value={question.prompt} onChange={(e) => updateQuestion(question.key, { prompt: e.target.value })} placeholder="Type the question here…" /></label>
              </div>
              {question.questionType === "mcq" && (
                <div className="ta-options">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <span className="ta-muted">Format:</span>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="radio" name={`mode-${question.key}`} checked={question.mcqMode === "items"} onChange={() => updateQuestion(question.key, { mcqMode: "items", mcqItems: question.mcqItems.length ? question.mcqItems : Array.from({length:10},(_,i)=>newMcqItem(i)) })} /> Items (i), (ii)… each with A–D options and an answer box</label>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="radio" name={`mode-${question.key}`} checked={question.mcqMode === "simple"} onChange={() => updateQuestion(question.key, { mcqMode: "simple" })} /> Simple (single choice)</label>
                  </div>
                  {question.mcqMode === "items" ? (
                    <div>
                      <div className="ta-muted" style={{ marginBottom: 8 }}>Write the general instructions above (question/prompt), then give each item (i, ii, iii…) its question, options A, B, C, D, and an answer-letter box.</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <button type="button" className="ta-link" onClick={() => updateQuestion(question.key, { mcqItems: [...question.mcqItems, newMcqItem(question.mcqItems.length)] })}>+ Add item</button>
                        <button type="button" className="ta-link" onClick={() => updateQuestion(question.key, { mcqItems: Array.from({length:10},(_,i)=>newMcqItem(i)), marks: String(10) })}>Set (i)–(x)</button>
                      </div>
                      {question.mcqItems.map((it, idx) => (
                        <div key={it.key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, marginBottom: 10, background: "#fff" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <strong>({it.label || toRoman(idx + 1)})</strong>
                            <input className="ta-input" value={it.label} onChange={(e) => updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,label:e.target.value}:r) })} style={{ width: 70 }} placeholder={toRoman(idx + 1)} />
                            <input className="ta-input" type="number" min={0} step="0.5" value={it.marks} onChange={(e) => updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,marks:e.target.value}:r) })} style={{ width: 90 }} />
                            <span className="ta-muted">marks</span>
                            <button type="button" className="ta-link ta-link--danger" onClick={() => updateQuestion(question.key, { mcqItems: question.mcqItems.filter((_,i)=>i!==idx) })} disabled={question.mcqItems.length <= 1}>Remove</button>
                          </div>
                          <AutoGrowTextarea className="ta-input ta-textarea" minRows={2} value={it.prompt} onChange={(e) => updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,prompt:e.target.value}:r) })} placeholder={`Question for item (${it.label || toRoman(idx + 1)})...`} style={{ marginTop: 6 }} />
                          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                            {it.choices.map((opt, oi) => (
                              <div key={oi} className="ta-option-row" style={{ alignItems: "center" }}>
                                <input type="radio" name={`corr-${question.key}-${it.key}`} checked={it.correctOption === oi} onChange={() => updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,correctOption:oi}:r) })} />
                                <strong style={{ minWidth: 22 }}>{it.choiceLabels[oi] || alphaLabel(oi)}.</strong>
                                <input className="ta-input" value={opt} onChange={(e) => updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,choices:r.choices.map((c,j)=> j===oi?e.target.value:c)}:r) })} placeholder={`Option ${alphaLabel(oi)}`} />
                                <button type="button" className="ta-link ta-link--danger" onClick={() => {
                                  const next = it.choices.filter((_,j)=>j!==oi);
                                  let c = it.correctOption; if (c===oi) c=0; else if (c>oi) c-=1;
                                  const nn = next.length>=2?next:["","","",""];
                                  updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,choices:nn,choiceLabels:defaultAlphaMcqLabels(nn.length),correctOption:c}:r) });
                                }} disabled={it.choices.length <= 2}>Remove</button>
                              </div>
                            ))}
                            {it.choices.length < 10 && <button type="button" className="ta-link" onClick={() => { const next=[...it.choices,""]; updateQuestion(question.key, { mcqItems: question.mcqItems.map((r,i)=> i===idx?{...r,choices:next,choiceLabels:defaultAlphaMcqLabels(next.length)}:r) }); }}>+ Add option</button>}
                          </div>
                          <div className="ta-muted" style={{ marginTop: 6 }}>The student will enter the answer letter in the box: <strong>[ {it.choiceLabels[it.correctOption] || alphaLabel(it.correctOption || 0)} ]</strong> (correct answer selected)</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <span className="ta-muted">Options (2–20) with roman labels (i, ii, iii…). Select the correct answer.</span>
                      {question.options.map((option, optionIndex) => (<div key={`${question.key}-${optionIndex}`} className="ta-option-row"><input type="radio" name={`correct-${question.key}`} checked={question.correctOption === optionIndex} onChange={() => updateQuestion(question.key, { correctOption: optionIndex })} /><strong style={{minWidth:28}}>({question.choiceLabels[optionIndex] || toRoman(optionIndex + 1)})</strong><input className="ta-input" type="text" value={option} onChange={(e) => updateQuestion(question.key, { options: question.options.map((row, i) => i === optionIndex ? e.target.value : row) })} placeholder={`Option ${toRoman(optionIndex + 1)}`} /><button type="button" className="ta-link ta-link--danger" onClick={() => removeMcqOption(question.key, optionIndex)} disabled={question.options.length <= 2}>Remove</button></div>))}
                      {question.options.length < 20 && <button type="button" className="ta-link" onClick={() => addMcqOption(question.key)}>+ Add option</button>}
                    </div>
                  )}
                </div>
              )}
              {question.questionType === "matching" && (
                <div className="ta-options">
                  <span className="ta-muted">Matching pairs (2–20). Roman labels for Column A.</span>
                  <div style={{display:"grid",gridTemplateColumns:"40px 1fr 1fr 80px",gap:8,alignItems:"center",marginTop:8}}><div></div><strong>Column A</strong><strong>Column B</strong><div></div>{question.matchingPairs.map((pair, idx) => (<div key={idx} style={{display:"contents"}}><strong>({toRoman(idx + 1)})</strong><input className="ta-input" value={pair.left} onChange={(e) => updatePair(question.key, idx, "left", e.target.value)} placeholder={`Item ${toRoman(idx + 1)}`} /><input className="ta-input" value={pair.right} onChange={(e) => updatePair(question.key, idx, "right", e.target.value)} placeholder="Match" /><button type="button" className="ta-link ta-link--danger" onClick={() => removePair(question.key, idx)} disabled={question.matchingPairs.length <= 2}>Remove</button></div>))}</div>
                  {question.matchingPairs.length < 20 && <button type="button" className="ta-link" onClick={() => addPair(question.key)}>+ Add pair</button>}
                </div>
              )}
              {question.questionType === "structured" && (
                <div className="ta-options">
                  <span className="ta-muted">Parts (A, B, C…) with optional subparts (i, ii…). Types: short answer, essay, calculation, MCQ. For NECTA-style objective items, use “Objective items (i)–(x)”.</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <button type="button" className="ta-link" onClick={() => setStructuredParts(question.key, () => Array.from({ length: 10 }, (_, i) => ({ key: uid(), label: toRoman(i + 1), prompt: "", marks: 1, type: "mcq" as const, options: ["", "", "", ""], choiceLabels: defaultAlphaMcqLabels(4), correctOption: 0, children: [] })))}>Set objective items (i)–(x), A–D</button>
                    <button type="button" className="ta-link" onClick={() => setStructuredParts(question.key, (parts) => [...parts, { key: uid(), label: toRoman(parts.length + 1), prompt: "", marks: 1, type: "mcq", options: ["", "", "", ""], choiceLabels: defaultAlphaMcqLabels(4), correctOption: 0, children: [] }])}>+ Add objective item (i, ii…) A–D</button>
                  </div>
                  {question.structuredParts.map((part) => (<StructuredPartEditor key={part.key} part={part} depth={0} onChange={(updated) => setStructuredParts(question.key, (parts) => updatePartInTree(parts, part.key, () => updated))} onRemove={() => setStructuredParts(question.key, (parts) => removePartInTree(parts, part.key))} onAddChild={() => setStructuredParts(question.key, (parts) => addChildToPart(parts, part.key))} canRemove={question.structuredParts.length > 1} />))}
                  <button type="button" className="ta-link" onClick={() => setStructuredParts(question.key, (parts) => [...parts, newStructuredPart(String.fromCharCode(65 + parts.length), "short_answer")])}>+ Add part (A, B…)</button>
                  <p className="ta-muted">Parts total: {sumPartMarks(question.structuredParts)} marks</p>
                </div>
              )}
              {(question.questionType === "essay" || question.questionType === "calculation" || question.questionType === "short_answer") && (
                <div className="ta-options">
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={question.practical}
                      onChange={(e) => updateQuestion(question.key, { practical: e.target.checked })}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong>Practical question (C++ IDE)</strong>
                      <span className="ta-muted" style={{ display: "block" }}>
                        Students answer in a C++ code editor and submit the code. Leave unchecked for a normal rich-text answer.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {error && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => setError("")}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3>Notice</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setError("")}>Close</button>
            </div>
            <div className="ta-alert ta-alert--error" style={{ margin: 0 }}>{error}</div>
          </div>
        </div>
      )}
      {questionsLocked && lockedWarningOpen && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => setLockedWarningOpen(false)}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head"><h3>Questions locked</h3></div>
            <div className="ta-alert ta-alert--warn" style={{ margin: "0 0 16px" }}>Students have already started this assignment, so the questions are locked. You can still update the title, instructions, deadline, total marks, attachment and status.</div>
            <div className="ta-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ta-btn ta-btn--primary" onClick={() => setLockedWarningOpen(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
      <div className="ta-form-actions"><button type="button" className="ta-btn ta-btn--ghost" onClick={onCancel} disabled={Boolean(submitting)}>Cancel</button>{isEditing ? (<><button type="button" className="ta-btn ta-btn--primary" onClick={() => void save("save")} disabled={Boolean(submitting)}>{submitting === "save" ? "Saving…" : "Save changes"}</button>{status === "draft" && (<button type="button" className="ta-btn ta-btn--primary" onClick={() => void save("save", "published")} disabled={Boolean(submitting)}>{submitting === "save" ? "Publishing…" : "Save & publish"}</button>)}</>) : (<><button type="button" className="ta-btn ta-btn--ghost" onClick={() => void save("draft")} disabled={Boolean(submitting)}>{submitting === "draft" ? "Saving…" : "Save as draft"}</button><button type="button" className="ta-btn ta-btn--primary" onClick={() => void save("published")} disabled={Boolean(submitting)}>{submitting === "published" ? "Publishing…" : "Publish assignment"}</button></>)}</div>
    </div>
  );
}

function AssignmentDetailPanel({ assignmentId, onBack, onEdit, onDeleted, onGrade }: { assignmentId: string; onBack: () => void; onEdit: () => void; onDeleted: () => void; onGrade: (submissionId: string, studentName: string) => void; }) {
  const [detail, setDetail] = useState<TeacherAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const load = useCallback(async () => { try { const data = await fetchTeacherAssignment(assignmentId); setDetail(data); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Could not load the assignment."); } finally { setLoading(false); } }, [assignmentId]);
  useEffect(() => { void load(); }, [load]);

  async function changeStatus(next: TeacherAssignmentSummary["status"]) { setChangingStatus(true); setError(""); setStatusNotice(""); try { await updateTeacherAssignmentStatus(assignmentId, next); await load(); setStatusNotice(next === "published" ? "Assignment published. Students can now see it." : next === "draft" ? "Assignment moved back to draft. Students can no longer see it." : "Assignment closed. Students can no longer submit."); } catch (err) { setError(err instanceof Error ? err.message : "Could not change the assignment status."); } finally { setChangingStatus(false); } }
  async function exportCsv() { if (!detail) return; setDownloading(true); setError(""); try { const filename = `assignment-${detail.assignment.title}-${detail.assignment.className}-${detail.assignment.streamName}.csv`.replace(/[^\w.-]+/g, "-").toLowerCase(); await downloadAssignmentCsv(detail.assignment.id, filename); } catch (err) { setError(err instanceof Error ? err.message : "Could not download the marks."); } finally { setDownloading(false); } }
  async function removeAssignment() {
    if (!detail || deleting) return;
    setConfirmDelete(true);
  }
  async function doRemoveAssignment() {
    if (!detail || deleting) return;
    setConfirmDelete(false);
    setDeleting(true); setError("");
    try { await deleteTeacherAssignment(detail.assignment.id); onDeleted(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete the assignment."); setDeleting(false); }
  }

  if (loading && !detail) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button><p className="ta-muted">Loading assignment…</p></div>);
  if (!detail) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button><div className="ta-alert ta-alert--error">{error || "Assignment not found."}</div><button type="button" className="ta-btn ta-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>Try again</button></div>);
  const assignment = detail.assignment;

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button>
      <header className="ta-panel-head ta-panel-head--row">
        <div>
          <h1>{assignment.title}</h1>
          <p>{assignment.subjectName} · {assignment.className} {assignment.streamName} · {assignment.totalMarks} marks</p>
          <p className="ta-muted">Status: <strong>{assignmentStatusLabel[assignment.status]}</strong> · Deadline: {formatDate(assignment.deadline)}{assignment.allowLateSubmission ? " · Late submission allowed" : ""}</p>
        </div>
        <div className="ta-panel-head-actions">
          {assignment.status === "draft" && (
            <button type="button" className="ta-btn ta-btn--primary" onClick={() => void changeStatus("published")} disabled={changingStatus || deleting}>{changingStatus ? "Publishing…" : "Publish assignment"}</button>
          )}
          <button type="button" className="ta-btn ta-btn--ghost" onClick={onEdit} disabled={deleting}>Edit assignment</button>
          <button type="button" className="ta-btn ta-btn--danger" onClick={() => void removeAssignment()} disabled={deleting}>{deleting ? "Deleting…" : "Delete assignment"}</button>
          <button type="button" className="ta-btn ta-btn--ghost" onClick={() => void exportCsv()} disabled={downloading || deleting}>{downloading ? "Downloading…" : "Download marks (CSV)"}</button>
          <select className="ta-input ta-status-select" value={assignment.status} disabled={changingStatus || deleting} onChange={(e) => void changeStatus(e.target.value as TeacherAssignmentSummary["status"])} aria-label="Assignment status"><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select>
        </div>
      </header>
      {statusNotice && <div className="ta-alert ta-alert--success" style={{ margin: "0 0 16px" }}>{statusNotice}</div>}
      {error && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => setError("")}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3>Notice</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setError("")}>Close</button>
            </div>
            <div className="ta-alert ta-alert--error" style={{ margin: 0 }}>{error}</div>
          </div>
        </div>
      )}
      <div className="ta-counts ta-counts--detail"><div><strong>{assignment.totalStudents}</strong><span>total students</span></div><div><strong>{assignment.submittedCount}</strong><span>submitted</span></div><div><strong>{assignment.markedCount}</strong><span>marked</span></div><div><strong>{assignment.notSubmittedCount}</strong><span>not submitted</span></div></div>
      {assignment.instructions && <section className="ta-instructions"><h2>Instructions</h2><p>{assignment.instructions}</p></section>}
      {assignment.attachmentName && <p className="ta-muted">Assignment attachment: <strong>{assignment.attachmentName}</strong></p>}
      <section className="ta-question-list">
        <h2>Questions ({detail.questions.length})</h2>
        {detail.questions.map((question) => (
          <article key={question.id} className="ta-question-read">
            <header><strong>Question {question.position}</strong><span>{questionTypeLabelEn[question.questionType]} · {question.marks} marks</span>{isPracticalQuestion(question) && <span className="ta-status">Practical · C++ IDE</span>}</header>
            <p>{question.prompt}</p>
            {renderQuestionConfigSummary(question)}
          </article>
        ))}
      </section>
      <section className="ta-table-section">
        <h2>Students and Submissions</h2>
        <div className="ta-table-wrap">
          <table className="ta-table">
            <thead><tr><th>Registration No.</th><th>Name</th><th>Status</th><th>Submitted at</th><th>Marks</th><th /></tr></thead>
            <tbody>
              {detail.students.map((student) => (
                <tr key={student.studentId}>
                  <td>{student.registrationNo || "—"}</td><td>{student.name}</td>
                  <td><span className={`ta-student-status ta-student-status--${student.status}`}>{studentStatusLabel[student.status]}</span>{student.isLate && <span className="ta-late"> · Late</span>}</td>
                  <td>{student.submittedAt ? formatDate(student.submittedAt) : "—"}</td>
                  <td>{student.totalScore === null ? "—" : `${student.totalScore} / ${assignment.totalMarks}`}</td>
                  <td>{student.submissionId && student.status !== "draft" ? (<button type="button" className="ta-link" onClick={() => onGrade(student.submissionId!, student.name)}>{student.status === "marked" ? "Review / Regrade" : "Grade"}</button>) : (<span className="ta-muted">—</span>)}</td>
                </tr>
              ))}
              {detail.students.length === 0 && <tr><td colSpan={6} className="ta-muted">No students in this subject for this class and stream.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {confirmDelete && detail && (
        <div className="ta-modal-backdrop" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="ta-modal" style={{ maxWidth: 480, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head"><h3>Delete assignment?</h3></div>
            <p className="ta-muted" style={{ margin: "0 0 16px" }}>Delete “{detail.assignment.title}”? This also removes all its questions and student submissions. This cannot be undone.</p>
            <div className="ta-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
              <button type="button" className="ta-btn ta-btn--primary ta-btn--danger" onClick={() => void doRemoveAssignment()} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function renderStudentAnswer(answer: TeacherSubmissionDetail["answers"][number]): ReactElement | null {
  if (answer.questionType === "mcq") {
    const cfg = normaliseMcqConfig(answer.options);
    if (Array.isArray(cfg.items) && cfg.items.length > 0) {
      let map: Record<string, any> = {};
      try { map = answer.answerText ? JSON.parse(answer.answerText) : {}; } catch {}
      return (
        <div style={{ display: "grid", gap: 10 }}>
          {(cfg.instruction || answer.prompt) && <p>{cfg.instruction || answer.prompt}</p>}
          {cfg.items.map((it, idx) => {
            const key = it.key || `item-${idx}`;
            const val = map[key] ?? map[it.label] ?? map[String(idx)];
            const labels = it.choiceLabels && it.choiceLabels.length === it.choices.length ? it.choiceLabels : it.choices.map((_, i) => alphaLabel(i));
            let chosenIdx = -1;
            if (typeof val === "number") chosenIdx = val;
            else if (typeof val === "string" && val !== "") { const n = Number(val); if (Number.isInteger(n) && String(n) === val.trim()) chosenIdx = n; else { const li = labels.indexOf(val.trim().toUpperCase()) >= 0 ? labels.indexOf(val.trim().toUpperCase()) : labels.indexOf(val.trim()); if (li >= 0) chosenIdx = li; } }
            const chosenLetter = chosenIdx >= 0 ? (labels[chosenIdx] || alphaLabel(chosenIdx)) : (val == null || val === "" ? "—" : String(val));
            return (
              <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                <div><strong>({it.label || toRoman(idx + 1)})</strong> {it.prompt}</div>
                <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                  {it.choices.map((opt, i) => {
                    const lbl = labels[i] || alphaLabel(i);
                    const chosen = i === chosenIdx;
                    const correct = it.correctOption === i;
                    return <div key={i} style={{ padding: "2px 4px", background: chosen ? "#f0fdf4" : undefined }}><strong>{lbl}.</strong> {opt}{chosen ? <em> · student</em> : null}{correct ? <em> · correct</em> : null}</div>;
                  })}
                </div>
                <div className="ta-muted" style={{ marginTop: 6 }}>Answer (box): <strong style={{ display: "inline-block", minWidth: 28, border: "1px solid #999", padding: "0 6px", textAlign: "center", background: "#fff" }}>{chosenLetter}</strong></div>
              </div>
            );
          })}
        </div>
      );
    }
    const chosenText = answer.answerText || "";
    return (
      <ul className="ta-mcq-read">
        {cfg.choices.map((option, index) => {
          const label = cfg.choiceLabels[index] || toRoman(index + 1);
          const chosen = chosenText === option || chosenText === String(index) || chosenText === label;
          const correct = (cfg.correctOption ?? answer.correctOption) === index;
          return <li key={index} className={`${chosen ? "is-chosen" : ""} ${correct ? "is-correct" : ""}`}><span><strong>{label}.</strong> {option}</span>{chosen && <em> · student&apos;s answer</em>}{correct && <em> · correct answer</em>}</li>;
        })}
      </ul>
    );
  }
  if (answer.questionType === "matching") {
    const cfg = normaliseMatchingConfig(answer.options);
    let map: Record<string, string> = {};
    try { map = answer.answerText ? JSON.parse(answer.answerText) : {}; } catch {}
    const rights = cfg.pairs.map((p) => p.right);
    return (
      <ol>
        {cfg.pairs.map((p, i) => {
          const key = String(i);
          const chosen = map[key] ?? map[toRoman(i + 1)] ?? "";
          return <li key={i}><strong>({toRoman(i + 1)}) {p.left}</strong> → <span>{chosen || "—"}</span>{chosen && rights.includes(chosen) ? <em className="ta-muted"> {chosen === p.right ? "✓" : `(expected: ${p.right})`}</em> : null}</li>;
        })}
      </ol>
    );
  }
  if (answer.questionType === "structured") {
    const raw = answer.options && typeof answer.options === "object" && (answer.options as any).parts ? (answer.options as any).parts : answer.options;
    const parts = normaliseStructuredParts(raw);
    let values: any = {};
    try { values = answer.answerText ? JSON.parse(answer.answerText) : {}; } catch {}
    const renderParts = (ps: StructuredPart[], depth = 0): ReactElement => (
      <div style={{ marginLeft: depth * 16 }}>
        {ps.map((part, idx) => {
          const key = part.key || `${depth}-${idx}`;
          const v = values[key];
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              <div><strong>{part.label}.</strong> {part.prompt} {(!part.children || part.children.length === 0) && <span className="ta-muted">({part.marks} marks)</span>}</div>
              {(!part.children || part.children.length === 0) && (
                part.type === "mcq" ? (
                  (() => {
                    const labels = (part.choiceLabels && part.choiceLabels.length === (part.options?.length || 0)) ? part.choiceLabels : ((part.options?.length || 0) <= 8 ? (part.options || []).map((_, i) => alphaLabel(i)) : (part.options || []).map((_, i) => toRoman(i + 1)));
                    let chosenIdx = -1;
                    if (typeof v === "number") chosenIdx = v;
                    else if (typeof v === "string" && v !== "") { const n = Number(v); if (Number.isInteger(n)) chosenIdx = n; else { const li = labels.indexOf(v); if (li >= 0) chosenIdx = li; } }
                    const ans = chosenIdx >= 0 ? (labels[chosenIdx] || alphaLabel(chosenIdx)) : (v == null || v === "" ? "—" : String(v));
                    return <div className="ta-muted">Answer: <strong style={{ display: "inline-block", minWidth: 28, border: "1px solid #999", padding: "0 6px", textAlign: "center", background: "#fff" }}>{ans}</strong></div>;
                  })()
                ) : (
                  <div className="ta-answer-body" dangerouslySetInnerHTML={{ __html: typeof v === "string" ? v : (v?.html || (v ? String(v) : "<em>No answer</em>")) }} />
                )
              )}
              {part.children && part.children.length > 0 && renderParts(part.children, depth + 1)}
            </div>
          );
        })}
      </div>
    );
    return renderParts(parts);
  }
  // essay/calculation/short_answer
  return <div className="ta-answer-body" dangerouslySetInnerHTML={{ __html: answer.answerHtml || (answer.answerText ? `<p>${answer.answerText}</p>` : "<em>No answer</em>") }} />;
}

function GradePanel({ assignmentId, submissionId, studentName, onBack, onSaved }: { assignmentId: string; submissionId: string; studentName: string; onBack: () => void; onSaved: () => void; }) {
  const [detail, setDetail] = useState<TeacherSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [overallFeedback, setOverallFeedback] = useState("");

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const load = useCallback(async () => {
    try {
      const data = await fetchTeacherSubmission(assignmentId, submissionId);
      setDetail(data);
      const nextMarks: Record<string, string> = {}; const nextFeedbacks: Record<string, string> = {};
      for (const answer of data.answers) { if (!answer.id) continue; nextMarks[answer.id] = answer.awardedMarks === null ? "" : String(answer.awardedMarks); nextFeedbacks[answer.id] = answer.feedback ?? ""; }
      setMarks(nextMarks); setFeedbacks(nextFeedbacks); setOverallFeedback(data.submission.feedback ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load the answers."); } finally { setLoading(false); }
  }, [assignmentId, submissionId]);
  useEffect(() => { void load(); }, [load]);

  const totalScore = useMemo(() => Object.values(marks).reduce((sum, value) => { const n = Number(value); return sum + (Number.isFinite(n) ? n : 0); }, 0), [marks]);

  // A one-question assignment is the whole work: the teacher's total is the
  // cap. With several questions each one keeps its own marks.
  const singleQuestion = detail?.answers.length === 1;
  const maxForAnswer = (answer: TeacherSubmissionDetail["answers"][number]) =>
    singleQuestion && detail ? detail.assignment.totalMarks : answer.maxMarks;

  async function saveGrade() {
    if (!detail || saving) return;
    setError(""); setBanner("");
    for (const answer of detail.answers) {
      if (!answer.id) continue; const value = marks[answer.id]; if (value === "" || value === undefined) continue;
      const number = Number(value); if (!Number.isFinite(number) || number < 0) { setError("The marks entered are invalid."); return; }
      const cap = maxForAnswer(answer);
      if (number > cap) { setError(`Question ${answer.position}: marks cannot exceed ${cap}.`); return; }
    }
    if (totalScore > detail.assignment.totalMarks) { setError(`The total (${totalScore}) exceeds the assignment total (${detail.assignment.totalMarks}).`); return; }
    setSaving(true);
    try {
      await gradeTeacherSubmission(assignmentId, submissionId, { answers: detail.answers.filter((a) => a.id).map((a) => ({ answerId: a.id, awardedMarks: marks[a.id] === "" ? null : Number(marks[a.id]), feedback: feedbacks[a.id] ?? "" })), feedback: overallFeedback });
      setBanner("Marks saved."); onSaved(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the marks."); } finally { setSaving(false); }
  }

  if (loading && !detail) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button><p className="ta-muted">Loading answers…</p></div>);
  if (!detail) return (<div className="ta-panel"><button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button><div className="ta-alert ta-alert--error">{error || "Answers not found."}</div><button type="button" className="ta-btn ta-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>Try again</button></div>);

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onBack}>← Back to assignments</button>
      <header className="ta-panel-head"><h1>Grade — {detail.student.name || studentName}</h1><p>{detail.assignment.subjectName} · {detail.assignment.className} {detail.assignment.streamName} · {detail.assignment.title}</p><p className="ta-muted">Registration No.: {detail.student.registrationNo || "—"} · Submitted: {formatDate(detail.submission.submittedAt)}{detail.submission.isLate ? " · Late" : ""}</p></header>
      {(banner || error) && (
        <div className="ta-modal-backdrop" style={{ zIndex: 70 }} onClick={() => { setBanner(""); setError(""); }}>
          <div className="ta-modal" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <h3>{error ? "Notice" : "Success"}</h3>
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => { setBanner(""); setError(""); }}>Close</button>
            </div>
            <div className={`ta-alert ${error ? "ta-alert--error" : "ta-alert--success"}`} style={{ margin: 0 }}>{error || banner}</div>
          </div>
        </div>
      )}
      {detail.submission.attachmentName && detail.submission.attachmentData && <a className="ta-attachment ta-attachment--link" href={detail.submission.attachmentData} download={detail.submission.attachmentName} target="_blank" rel="noreferrer">📎 Student attachment: {detail.submission.attachmentName}</a>}
      <div className="ta-grade-total"><span>Running total</span><strong>{Math.round(totalScore * 100) / 100} / {detail.assignment.totalMarks}</strong></div>
      <section className="ta-grade-list">
        {detail.answers.map((answer) => (
          <article key={answer.questionId} className="ta-grade-item">
            <header className="ta-grade-head">
              <div><strong>Question {answer.position}</strong><span>{questionTypeLabelEn[answer.questionType]} · {maxForAnswer(answer)} marks</span></div>
              <label className="ta-field ta-field--marks"><span>Marks</span><input className="ta-input" type="number" min={0} max={maxForAnswer(answer)} step="0.5" value={answer.id ? marks[answer.id] ?? "" : ""} disabled={!answer.id} onChange={(e) => answer.id && setMarks((prev) => ({ ...prev, [answer.id]: e.target.value }))} /></label>
            </header>
            <p className="ta-question-prompt">{answer.prompt}</p>
            {renderStudentAnswer(answer)}
            {!answer.id && <p className="ta-muted">The student did not answer this question.</p>}
            <label className="ta-field"><span>Feedback for this question</span><AutoGrowTextarea className="ta-input ta-textarea" minRows={3} value={answer.id ? feedbacks[answer.id] ?? "" : ""} disabled={!answer.id} onChange={(e) => answer.id && setFeedbacks((prev) => ({ ...prev, [answer.id]: e.target.value }))} /></label>
          </article>
        ))}
      </section>
      <label className="ta-field"><span>Overall feedback for the student</span><AutoGrowTextarea className="ta-input ta-textarea" minRows={6} value={overallFeedback} onChange={(e) => setOverallFeedback(e.target.value)} placeholder="Overall feedback…" /></label>
      <div className="ta-form-actions"><button type="button" className="ta-btn ta-btn--ghost" onClick={onBack} disabled={saving}>Back</button><button type="button" className="ta-btn ta-btn--primary" onClick={() => void saveGrade()} disabled={saving}>{saving ? "Saving…" : "Save marks"}</button></div>
    </div>
  );
}
