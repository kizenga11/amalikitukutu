"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ATTACHMENT_MAX_BYTES, type QuestionType } from "@/lib/assignments-shared";
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

interface DraftQuestion {
  key: string;
  questionType: QuestionType;
  prompt: string;
  marks: string;
  options: string[];
  correctOption: number;
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
  short_answer: "Short answer",
  mcq: "Multiple choice",
};

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

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

function newQuestion(type: QuestionType = "essay"): DraftQuestion {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    questionType: type,
    prompt: "",
    marks: "10",
    options: type === "mcq" ? ["", ""] : [],
    correctOption: 0,
  };
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

export default function TeacherAssignments() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [options, setOptions] = useState<TeacherOption[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignmentSummary[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const load = useCallback(async () => {
    try {
      const [optionsResult, assignmentsResult] = await Promise.all([
        fetchTeacherOptions(),
        fetchTeacherAssignments(),
      ]);
      setOptions(optionsResult.options);
      setAssignments(assignmentsResult.assignments);
      setPeriod(assignmentsResult.period);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function afterMutation() {
    void load();
  }

  async function deleteFromList(assignment: TeacherAssignmentSummary) {
    if (deletingId) return;
    const confirmed = window.confirm(
      `Delete “${assignment.title}”? This also removes all its questions and student submissions. This cannot be undone.`,
    );
    if (!confirmed) return;

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
                Create assignments for the subject, class and stream assigned to you.
                {period ? ` Academic year ${period.academicYearId} · Term ${period.term}.` : ""}
              </p>
            </div>
            <div className="ta-header-actions">
              <button type="button" className="ta-btn ta-btn--ghost" onClick={() => { setLoading(true); setError(""); void load(); }}>
                Refresh
              </button>
              <button
                type="button"
                className="ta-btn ta-btn--primary"
                onClick={() => setView({ kind: "create" })}
              >
                + New Assignment
              </button>
            </div>
          </header>

          {error && <div className="ta-alert ta-alert--error">{error}</div>}

          {loading ? (
            <p className="ta-muted">Loading assignment…</p>
          ) : assignments.length === 0 ? (
            <div className="ta-empty">
              <h2>No assignments yet</h2>
              <p>Click “New Assignment” to create the first assignment for your students.</p>
              {options.length === 0 && (
                <p className="ta-warn">
                  You are not assigned to any subject, class or stream. Contact the academic
                  office.
                </p>
              )}
            </div>
          ) : (
            <div className="ta-grid">
              {assignments.map((assignment) => (
                <article key={assignment.id} className="ta-card">
                  <div className="ta-card-head">
                    <span className="ta-subject">
                      {assignment.subjectName}
                      <span>
                        {assignment.className} {assignment.streamName}
                      </span>
                    </span>
                    <span className={`ta-status ta-status--${assignment.status}`}>
                      {assignmentStatusLabel[assignment.status]}
                    </span>
                  </div>
                  <h2>{assignment.title}</h2>
                  <p className="ta-muted">
                    Deadline: {formatDate(assignment.deadline)}
                    {assignment.allowLateSubmission ? " · Late submission allowed" : ""}
                  </p>
                  <div className="ta-counts">
                    <div>
                      <strong>{assignment.submittedCount}</strong>
                      <span>submitted</span>
                    </div>
                    <div>
                      <strong>{assignment.markedCount}</strong>
                      <span>marked</span>
                    </div>
                    <div>
                      <strong>{assignment.notSubmittedCount}</strong>
                      <span>not submitted</span>
                    </div>
                    <div>
                      <strong>{assignment.totalStudents}</strong>
                      <span>total</span>
                    </div>
                  </div>
                  <div className="ta-card-actions">
                    <button
                      type="button"
                      className="ta-btn ta-btn--primary"
                      onClick={() => setView({ kind: "detail", id: assignment.id })}
                    >
                      Open assignment
                    </button>
                    <button
                      type="button"
                      className="ta-btn ta-btn--ghost"
                      onClick={() => setView({ kind: "edit", id: assignment.id })}
                      disabled={deletingId === assignment.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ta-btn ta-btn--danger"
                      onClick={() => void deleteFromList(assignment)}
                      disabled={Boolean(deletingId)}
                    >
                      {deletingId === assignment.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {view.kind === "create" && (
        <AssignmentForm
          options={options}
          onCancel={() => setView({ kind: "list" })}
          onSaved={(id) => {
            afterMutation();
            setView({ kind: "detail", id });
          }}
        />
      )}

      {view.kind === "edit" && (
        <AssignmentForm
          options={options}
          editId={view.id}
          onCancel={() => setView({ kind: "detail", id: view.id })}
          onSaved={(id) => {
            afterMutation();
            setView({ kind: "detail", id });
          }}
        />
      )}

      {view.kind === "detail" && (
        <AssignmentDetailPanel
          assignmentId={view.id}
          onBack={() => {
            afterMutation();
            setView({ kind: "list" });
          }}
          onEdit={() => setView({ kind: "edit", id: view.id })}
          onDeleted={() => {
            afterMutation();
            setView({ kind: "list" });
          }}
          onGrade={(submissionId, studentName) =>
            setView({
              kind: "grade",
              assignmentId: view.id,
              submissionId,
              studentName,
            })
          }
        />
      )}

      {view.kind === "grade" && (
        <GradePanel
          assignmentId={view.assignmentId}
          submissionId={view.submissionId}
          studentName={view.studentName}
          onBack={() => setView({ kind: "detail", id: view.assignmentId })}
          onSaved={() => {
            afterMutation();
          }}
        />
      )}
    </div>
  );
}

function AssignmentForm({
  options,
  editId,
  onCancel,
  onSaved,
}: {
  options: TeacherOption[];
  editId?: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const isEditing = Boolean(editId);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState("");
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

  useEffect(() => {
    if (!editId) return;
    let active = true;

    fetchTeacherAssignment(editId)
      .then((detail) => {
        if (!active) return;
        const assignment = detail.assignment;
        setSelection(
          `${assignment.subjectId}|${assignment.classId}|${assignment.streamId}`,
        );
        setTitle(assignment.title);
        setInstructions(assignment.instructions);
        setDeadline(soonDatetimeLocal(assignment.deadline));
        setTotalMarks(String(assignment.totalMarks));
        setAllowLate(assignment.allowLateSubmission);
        setStatus(assignment.status);
        setAttachment(
          assignment.attachmentName && assignment.attachmentData
            ? {
                name: assignment.attachmentName,
                type: assignment.attachmentType ?? "",
                data: assignment.attachmentData,
              }
            : null,
        );
        setQuestions(
          detail.questions.length > 0
            ? detail.questions.map((question) => ({
                key: question.id,
                questionType: question.questionType,
                prompt: question.prompt,
                marks: String(question.marks),
                options: question.options.length >= 2 ? question.options : ["", ""],
                correctOption: question.correctOption ?? 0,
              }))
            : [newQuestion()],
        );
        setQuestionsLocked(detail.assignment.hasSubmissions);
        setLoadError("");
      })
      .catch((err) => {
        if (active) {
          setLoadError(err instanceof Error ? err.message : "Could not load the assignment.");
        }
      })
      .finally(() => {
        if (active) setLoadingEdit(false);
      });

    return () => {
      active = false;
    };
  }, [editId]);

  const selected = options.find(
    (option) =>
      `${option.subjectId}|${option.classId}|${option.streamId}` === selection,
  );

  const questionTotal = useMemo(
    () =>
      questions.reduce((sum, question) => {
        const value = Number(question.marks);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [questions],
  );

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) =>
      prev.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    );
  }

  function changeType(key: string, type: QuestionType) {
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.key !== key) return question;
        const nextOptions =
          type === "mcq"
            ? question.options.length >= 2
              ? question.options
              : [...question.options, "", ""].slice(0, 2)
            : [];
        return {
          ...question,
          questionType: type,
          options: nextOptions,
          correctOption: Math.min(question.correctOption, Math.max(0, nextOptions.length - 1)),
        };
      }),
    );
  }

  function addOption(key: string) {
    setQuestions((prev) =>
      prev.map((question) =>
        question.key === key && question.options.length < 8
          ? { ...question, options: [...question.options, ""] }
          : question,
      ),
    );
  }

  function removeOption(key: string, index: number) {
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.key !== key || question.options.length <= 2) return question;
        const optionsNext = question.options.filter((_, i) => i !== index);
        return {
          ...question,
          options: optionsNext,
          correctOption:
            question.correctOption === index
              ? 0
              : question.correctOption > index
                ? question.correctOption - 1
                : question.correctOption,
        };
      }),
    );
  }

  async function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    try {
      const picked = await pickAttachment(event);
      if (picked) {
        setAttachment(picked);
        setError("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid attachment.");
    }
  }

  async function save(action: "draft" | "published" | "save") {
    if (submitting) return;
    setError("");

    if (!isEditing && !selected) {
      setError("Select a subject, class and stream.");
      return;
    }
    if (title.trim().length < 3) {
      setError("Enter an assignment title (at least 3 characters).");
      return;
    }
    if (!questionsLocked) {
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        if (!question.prompt.trim()) {
          setError(`Enter the instructions for question ${index + 1}.`);
          return;
        }
        const marks = Number(question.marks);
        if (!Number.isFinite(marks) || marks < 0) {
          setError(`The marks for question ${index + 1} are invalid.`);
          return;
        }
        if (question.questionType === "mcq") {
          const filled = question.options.filter((option) => option.trim().length > 0);
          if (filled.length < 2) {
            setError(`Question ${index + 1} needs at least two options.`);
            return;
          }
          if (question.correctOption >= question.options.length) {
            setError(`Select the correct answer for question ${index + 1}.`);
            return;
          }
          if (!question.options[question.correctOption]?.trim()) {
            setError(`The correct answer for question ${index + 1} cannot be empty.`);
            return;
          }
        }
      }
    }

    let deadlineIso: string | null = null;
    if (deadline) {
      const parsed = new Date(deadline);
      if (Number.isNaN(parsed.getTime())) {
        setError("The deadline is invalid.");
        return;
      }
      deadlineIso = parsed.toISOString();
    }

    const total = Number(totalMarks);
    if (!Number.isFinite(total) || total <= 0) {
      setError("Total marks must be greater than zero.");
      return;
    }
    if (questionTotal > total) {
      setError(
        `The questions total (${questionTotal}) exceeds the assignment total (${total}).`,
      );
      return;
    }

    const payloadQuestions: NewQuestionPayload[] = questions.map((question) => ({
      questionType: question.questionType,
      prompt: question.prompt,
      options:
        question.questionType === "mcq"
          ? question.options.map((option) => option.trim()).filter(Boolean)
          : [],
      correctOption:
        question.questionType === "mcq"
          ? Math.max(
              0,
              question.options
                .map((option) => option.trim())
                .filter(Boolean)
                .indexOf(question.options[question.correctOption]?.trim() ?? ""),
            )
          : null,
      marks: Number(question.marks),
    }));

    setSubmitting(action);
    try {
      if (isEditing && editId) {
        await updateTeacherAssignment(editId, {
          title: title.trim(),
          instructions: instructions.trim(),
          deadline: deadlineIso,
          totalMarks: total,
          allowLateSubmission: allowLate,
          status,
          attachment,
          questions: questionsLocked ? null : payloadQuestions,
        });
        onSaved(editId);
      } else {
        const result = await createTeacherAssignment({
          subjectId: selected!.subjectId,
          classId: selected!.classId,
          streamId: selected!.streamId,
          title: title.trim(),
          instructions: instructions.trim(),
          deadline: deadlineIso,
          totalMarks: total,
          allowLateSubmission: allowLate,
          status: action === "draft" ? "draft" : "published",
          attachment,
          questions: payloadQuestions,
        });
        onSaved(result.id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Could not update the assignment."
            : "Could not create the assignment.",
      );
      setSubmitting(null);
    }
  }

  if (loadingEdit) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onCancel}>
          ← Back to assignments
        </button>
        <p className="ta-muted">Loading assignment…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onCancel}>
          ← Back to assignments
        </button>
        <div className="ta-alert ta-alert--error">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onCancel}>
        ← Back to assignments
      </button>

      <header className="ta-panel-head">
        <h1>{isEditing ? "Edit Assignment" : "New Assignment"}</h1>
        <p>
          {isEditing
            ? "Update the assignment details. Questions can only be changed while no student has started."
            : "Choose the subject and class, then prepare the questions and marks."}
        </p>
      </header>

      {options.length === 0 && (
        <div className="ta-alert ta-alert--warn">
          You are not assigned to any subject, class or stream. Contact the academic office.
        </div>
      )}

      <div className="ta-form-grid">
        <label className="ta-field ta-field--span">
          <span>Subject, class and stream</span>
          <select
            className="ta-input"
            value={selection}
            disabled={isEditing}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="">— Select —</option>
            {isEditing && !selected && selection && (
              <option value={selection}>Current subject, class and stream</option>
            )}
            {options.map((option) => (
              <option
                key={`${option.subjectId}|${option.classId}|${option.streamId}`}
                value={`${option.subjectId}|${option.classId}|${option.streamId}`}
              >
                Form {option.formLevel} {option.className} {option.streamName} —{" "}
                {option.subjectName}
              </option>
            ))}
          </select>
        </label>

        <label className="ta-field ta-field--span">
          <span>Assignment title</span>
          <input
            className="ta-input"
            type="text"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Exercise 2 — Linear equations"
          />
        </label>

        <label className="ta-field ta-field--span">
          <span>Instructions</span>
          <textarea
            className="ta-input ta-textarea"
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="General instructions for students…"
          />
        </label>

        <label className="ta-field">
          <span>Deadline</span>
          <input
            className="ta-input"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </label>

        <label className="ta-field">
          <span>Total marks</span>
          <input
            className="ta-input"
            type="number"
            min={1}
            step="0.5"
            value={totalMarks}
            onChange={(event) => setTotalMarks(event.target.value)}
          />
          <small>
            Question marks: {questionTotal}
            {Number(totalMarks) > 0 && questionTotal > Number(totalMarks)
              ? " — exceeds the total!"
              : ""}
          </small>
        </label>

        <label className="ta-check ta-field--span">
          <input
            type="checkbox"
            checked={allowLate}
            onChange={(event) => setAllowLate(event.target.checked)}
          />
          <span>Allow submissions after the deadline (they will be marked late)</span>
        </label>

        {isEditing && (
          <label className="ta-field">
            <span>Status</span>
            <select
              className="ta-input"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "draft" | "published" | "closed")
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        )}

        <div className="ta-field ta-field--span">
          <span>Attachment (PDF or image, optional)</span>
          {attachment ? (
            <div className="ta-attachment">
              <a href={attachment.data} download={attachment.name} target="_blank" rel="noreferrer">
                {attachment.name}
              </a>
              <button type="button" className="ta-link ta-link--danger" onClick={() => setAttachment(null)}>
                Remove
              </button>
            </div>
          ) : (
            <input
              className="ta-input"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => void handleAttachment(event)}
            />
          )}
        </div>
      </div>

      {questionsLocked ? (
        <section className="ta-questions">
          <div className="ta-section-head">
            <h2>Questions</h2>
          </div>
          <div className="ta-alert ta-alert--warn">
            Students have already started this assignment, so the questions are locked. You can
            still update the title, instructions, deadline, total marks, attachment and status.
          </div>
          {questions.map((question, index) => (
            <article key={question.key} className="ta-question-read">
              <header>
                <strong>Question {index + 1}</strong>
                <span>
                  {questionTypeLabelEn[question.questionType]} · {question.marks} marks
                </span>
              </header>
              <p>{question.prompt}</p>
              {question.questionType === "mcq" && (
                <ol className="ta-option-read">
                  {question.options.map((option, optionIndex) => (
                    <li
                      key={optionIndex}
                      className={question.correctOption === optionIndex ? "is-correct" : ""}
                    >
                      {option}
                      {question.correctOption === optionIndex ? " ✓" : ""}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </section>
      ) : (
        <section className="ta-questions">
          <div className="ta-section-head">
            <h2>Questions</h2>
            <button type="button" className="ta-btn ta-btn--ghost" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>
              + Add question
            </button>
          </div>

          {questions.map((question, index) => (
            <article key={question.key} className="ta-question">
              <header className="ta-question-head">
                <strong>Question {index + 1}</strong>
                <button
                  type="button"
                  className="ta-link ta-link--danger"
                  onClick={() => setQuestions((prev) => prev.filter((row) => row.key !== question.key))}
                  disabled={questions.length === 1}
                >
                  Remove
                </button>
              </header>

              <div className="ta-question-grid">
                <label className="ta-field">
                  <span>Question type</span>
                  <select
                    className="ta-input"
                    value={question.questionType}
                    onChange={(event) => changeType(question.key, event.target.value as QuestionType)}
                  >
                    <option value="essay">Essay / Long answer</option>
                    <option value="short_answer">Short answer</option>
                    <option value="mcq">Multiple choice</option>
                  </select>
                </label>

                <label className="ta-field">
                  <span>Marks</span>
                  <input
                    className="ta-input"
                    type="number"
                    min={0}
                    step="0.5"
                    value={question.marks}
                    onChange={(event) => updateQuestion(question.key, { marks: event.target.value })}
                  />
                </label>

                <label className="ta-field ta-field--span">
                  <span>Question / instructions</span>
                  <textarea
                    className="ta-input ta-textarea"
                    rows={3}
                    value={question.prompt}
                    onChange={(event) => updateQuestion(question.key, { prompt: event.target.value })}
                    placeholder="Type the question here…"
                  />
                </label>
              </div>

              {question.questionType === "mcq" && (
                <div className="ta-options">
                  <span className="ta-muted">Options (select the correct answer)</span>
                  {question.options.map((option, optionIndex) => (
                    <div key={`${question.key}-${optionIndex}`} className="ta-option-row">
                      <input
                        type="radio"
                        name={`correct-${question.key}`}
                        checked={question.correctOption === optionIndex}
                        onChange={() => updateQuestion(question.key, { correctOption: optionIndex })}
                        aria-label={`Correct answer for option ${optionIndex + 1}`}
                      />
                      <input
                        className="ta-input"
                        type="text"
                        value={option}
                        onChange={(event) =>
                          updateQuestion(question.key, {
                            options: question.options.map((row, i) =>
                              i === optionIndex ? event.target.value : row,
                            ),
                          })
                        }
                        placeholder={`Option ${optionIndex + 1}`}
                      />
                      <button
                        type="button"
                        className="ta-link ta-link--danger"
                        onClick={() => removeOption(question.key, optionIndex)}
                        disabled={question.options.length <= 2}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {question.options.length < 8 && (
                    <button type="button" className="ta-link" onClick={() => addOption(question.key)}>
                      + Add option
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {error && <div className="ta-alert ta-alert--error">{error}</div>}

      <div className="ta-form-actions">
        <button type="button" className="ta-btn ta-btn--ghost" onClick={onCancel} disabled={Boolean(submitting)}>
          Cancel
        </button>
        {isEditing ? (
          <button
            type="button"
            className="ta-btn ta-btn--primary"
            onClick={() => void save("save")}
            disabled={Boolean(submitting)}
          >
            {submitting === "save" ? "Saving…" : "Save changes"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ta-btn ta-btn--ghost"
              onClick={() => void save("draft")}
              disabled={Boolean(submitting)}
            >
              {submitting === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <button
              type="button"
              className="ta-btn ta-btn--primary"
              onClick={() => void save("published")}
              disabled={Boolean(submitting)}
            >
              {submitting === "published" ? "Publishing…" : "Publish assignment"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AssignmentDetailPanel({
  assignmentId,
  onBack,
  onEdit,
  onDeleted,
  onGrade,
}: {
  assignmentId: string;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onGrade: (submissionId: string, studentName: string) => void;
}) {
  const [detail, setDetail] = useState<TeacherAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTeacherAssignment(assignmentId);
      setDetail(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the assignment.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function changeStatus(next: TeacherAssignmentSummary["status"]) {
    setChangingStatus(true);
    setError("");
    try {
      await updateTeacherAssignmentStatus(assignmentId, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the assignment status.");
    } finally {
      setChangingStatus(false);
    }
  }

  async function exportCsv() {
    if (!detail) return;
    setDownloading(true);
    setError("");
    try {
      const filename = `assignment-${detail.assignment.title}-${detail.assignment.className}-${detail.assignment.streamName}.csv`
        .replace(/[^\w.-]+/g, "-")
        .toLowerCase();
      await downloadAssignmentCsv(detail.assignment.id, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the marks.");
    } finally {
      setDownloading(false);
    }
  }

  async function removeAssignment() {
    if (!detail || deleting) return;
    const confirmed = window.confirm(
      `Delete “${detail.assignment.title}”? This also removes all its questions and student submissions. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      await deleteTeacherAssignment(detail.assignment.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the assignment.");
      setDeleting(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <p className="ta-muted">Loading assignment…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <div className="ta-alert ta-alert--error">{error || "Assignment not found."}</div>
        <button type="button" className="ta-btn ta-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>
          Try again
        </button>
      </div>
    );
  }

  const assignment = detail.assignment;

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onBack}>
        ← Back to assignments
      </button>

      <header className="ta-panel-head ta-panel-head--row">
        <div>
          <h1>{assignment.title}</h1>
          <p>
            {assignment.subjectName} · {assignment.className} {assignment.streamName} ·{" "}
            {assignment.totalMarks} marks
          </p>
          <p className="ta-muted">
            Deadline: {formatDate(assignment.deadline)}
            {assignment.allowLateSubmission ? " · Late submission allowed" : ""}
          </p>
        </div>
        <div className="ta-panel-head-actions">
          <button
            type="button"
            className="ta-btn ta-btn--ghost"
            onClick={onEdit}
            disabled={deleting}
          >
            Edit assignment
          </button>
          <button
            type="button"
            className="ta-btn ta-btn--danger"
            onClick={() => void removeAssignment()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete assignment"}
          </button>
          <button
            type="button"
            className="ta-btn ta-btn--ghost"
            onClick={() => void exportCsv()}
            disabled={downloading || deleting}
          >
            {downloading ? "Downloading…" : "Download marks (CSV)"}
          </button>
          <select
            className="ta-input ta-status-select"
            value={assignment.status}
            disabled={changingStatus || deleting}
            onChange={(event) =>
              void changeStatus(event.target.value as TeacherAssignmentSummary["status"])
            }
            aria-label="Assignment status"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </header>

      {error && <div className="ta-alert ta-alert--error">{error}</div>}

      <div className="ta-counts ta-counts--detail">
        <div>
          <strong>{assignment.totalStudents}</strong>
          <span>total students</span>
        </div>
        <div>
          <strong>{assignment.submittedCount}</strong>
          <span>submitted</span>
        </div>
        <div>
          <strong>{assignment.markedCount}</strong>
          <span>marked</span>
        </div>
        <div>
          <strong>{assignment.notSubmittedCount}</strong>
          <span>not submitted</span>
        </div>
      </div>

      {assignment.instructions && (
        <section className="ta-instructions">
          <h2>Instructions</h2>
          <p>{assignment.instructions}</p>
        </section>
      )}

      {assignment.attachmentName && (
        <p className="ta-muted">
          Assignment attachment: <strong>{assignment.attachmentName}</strong>
        </p>
      )}

      <section className="ta-question-list">
        <h2>Questions ({detail.questions.length})</h2>
        {detail.questions.map((question) => (
          <article key={question.id} className="ta-question-read">
            <header>
              <strong>Question {question.position}</strong>
              <span>
                {questionTypeLabelEn[question.questionType]} · {question.marks} marks
              </span>
            </header>
            <p>{question.prompt}</p>
            {question.questionType === "mcq" && (
              <ol className="ta-option-read">
                {question.options.map((option, index) => (
                  <li key={index} className={question.correctOption === index ? "is-correct" : ""}>
                    {option}
                    {question.correctOption === index ? " ✓" : ""}
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </section>

      <section className="ta-table-section">
        <h2>Students and Submissions</h2>
        <div className="ta-table-wrap">
          <table className="ta-table">
            <thead>
              <tr>
                <th>Registration No.</th>
                <th>Name</th>
                <th>Status</th>
                <th>Submitted at</th>
                <th>Marks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {detail.students.map((student) => (
                <tr key={student.studentId}>
                  <td>{student.registrationNo || "—"}</td>
                  <td>{student.name}</td>
                  <td>
                    <span className={`ta-student-status ta-student-status--${student.status}`}>
                      {studentStatusLabel[student.status]}
                    </span>
                    {student.isLate && <span className="ta-late"> · Late</span>}
                  </td>
                  <td>{student.submittedAt ? formatDate(student.submittedAt) : "—"}</td>
                  <td>
                    {student.totalScore === null
                      ? "—"
                      : `${student.totalScore} / ${assignment.totalMarks}`}
                  </td>
                  <td>
                    {student.submissionId && student.status !== "draft" ? (
                      <button
                        type="button"
                        className="ta-link"
                        onClick={() => onGrade(student.submissionId!, student.name)}
                      >
                        {student.status === "marked" ? "Review / Regrade" : "Grade"}
                      </button>
                    ) : (
                      <span className="ta-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {detail.students.length === 0 && (
                <tr>
                  <td colSpan={6} className="ta-muted">
                    No students in this subject for this class and stream.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function GradePanel({
  assignmentId,
  submissionId,
  studentName,
  onBack,
  onSaved,
}: {
  assignmentId: string;
  submissionId: string;
  studentName: string;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<TeacherSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [overallFeedback, setOverallFeedback] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchTeacherSubmission(assignmentId, submissionId);
      setDetail(data);
      const nextMarks: Record<string, string> = {};
      const nextFeedbacks: Record<string, string> = {};
      for (const answer of data.answers) {
        if (!answer.id) continue;
        nextMarks[answer.id] = answer.awardedMarks === null ? "" : String(answer.awardedMarks);
        nextFeedbacks[answer.id] = answer.feedback ?? "";
      }
      setMarks(nextMarks);
      setFeedbacks(nextFeedbacks);
      setOverallFeedback(data.submission.feedback ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the answers.");
    } finally {
      setLoading(false);
    }
  }, [assignmentId, submissionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const totalScore = useMemo(
    () =>
      Object.values(marks).reduce((sum, value) => {
        const number = Number(value);
        return sum + (Number.isFinite(number) ? number : 0);
      }, 0),
    [marks],
  );

  async function saveGrade() {
    if (!detail || saving) return;
    setError("");
    setBanner("");

    for (const answer of detail.answers) {
      if (!answer.id) continue;
      const value = marks[answer.id];
      if (value === "" || value === undefined) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) {
        setError("The marks entered are invalid.");
        return;
      }
      if (number > answer.maxMarks) {
        setError(`Question ${answer.position}: marks cannot exceed ${answer.maxMarks}.`);
        return;
      }
    }
    if (totalScore > detail.assignment.totalMarks) {
      setError(
        `The total (${totalScore}) exceeds the assignment total (${detail.assignment.totalMarks}).`,
      );
      return;
    }

    setSaving(true);
    try {
      await gradeTeacherSubmission(assignmentId, submissionId, {
        answers: detail.answers
          .filter((answer) => answer.id)
          .map((answer) => ({
            answerId: answer.id,
            awardedMarks: marks[answer.id] === "" ? null : Number(marks[answer.id]),
            feedback: feedbacks[answer.id] ?? "",
          })),
        feedback: overallFeedback,
      });
      setBanner("Marks saved.");
      onSaved();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the marks.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <p className="ta-muted">Loading answers…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="ta-panel">
        <button type="button" className="ta-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <div className="ta-alert ta-alert--error">{error || "Answers not found."}</div>
        <button type="button" className="ta-btn ta-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="ta-panel">
      <button type="button" className="ta-back" onClick={onBack}>
        ← Back to assignments
      </button>

      <header className="ta-panel-head">
        <h1>Grade — {detail.student.name || studentName}</h1>
        <p>
          {detail.assignment.subjectName} · {detail.assignment.className}{" "}
          {detail.assignment.streamName} · {detail.assignment.title}
        </p>
        <p className="ta-muted">
          Registration No.: {detail.student.registrationNo || "—"} · Submitted:{" "}
          {formatDate(detail.submission.submittedAt)}
          {detail.submission.isLate ? " · Late" : ""}
        </p>
      </header>

      {banner && <div className="ta-alert ta-alert--success">{banner}</div>}
      {error && <div className="ta-alert ta-alert--error">{error}</div>}

      {detail.submission.attachmentName && detail.submission.attachmentData && (
        <a
          className="ta-attachment ta-attachment--link"
          href={detail.submission.attachmentData}
          download={detail.submission.attachmentName}
          target="_blank"
          rel="noreferrer"
        >
          📎 Student attachment: {detail.submission.attachmentName}
        </a>
      )}

      <div className="ta-grade-total">
        <span>Running total</span>
        <strong>
          {Math.round(totalScore * 100) / 100} / {detail.assignment.totalMarks}
        </strong>
      </div>

      <section className="ta-grade-list">
        {detail.answers.map((answer) => (
          <article key={answer.questionId} className="ta-grade-item">
            <header className="ta-grade-head">
              <div>
                <strong>Question {answer.position}</strong>
                <span>
                  {questionTypeLabelEn[answer.questionType]} · {answer.maxMarks} marks
                </span>
              </div>
              <label className="ta-field ta-field--marks">
                <span>Marks</span>
                <input
                  className="ta-input"
                  type="number"
                  min={0}
                  max={answer.maxMarks}
                  step="0.5"
                  value={answer.id ? marks[answer.id] ?? "" : ""}
                  disabled={!answer.id}
                  onChange={(event) =>
                    answer.id &&
                    setMarks((prev) => ({ ...prev, [answer.id]: event.target.value }))
                  }
                />
              </label>
            </header>

            <p className="ta-question-prompt">{answer.prompt}</p>

            {answer.questionType === "mcq" ? (
              <ul className="ta-mcq-read">
                {answer.options.map((option, index) => {
                  const chosen = answer.answerText === option;
                  const correct = answer.correctOption === index;
                  return (
                    <li
                      key={index}
                      className={`${chosen ? "is-chosen" : ""} ${correct ? "is-correct" : ""}`}
                    >
                      <span>{option}</span>
                      {chosen && <em> · student&apos;s answer</em>}
                      {correct && <em> · correct answer</em>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div
                className="ta-answer-body"
                // Answers are sanitised on the server before being stored.
                dangerouslySetInnerHTML={{ __html: answer.answerHtml }}
              />
            )}

            {!answer.id && (
              <p className="ta-muted">The student did not answer this question.</p>
            )}

            <label className="ta-field">
              <span>Feedback for this question</span>
              <textarea
                className="ta-input ta-textarea"
                rows={2}
                value={answer.id ? feedbacks[answer.id] ?? "" : ""}
                disabled={!answer.id}
                onChange={(event) =>
                  answer.id &&
                  setFeedbacks((prev) => ({ ...prev, [answer.id]: event.target.value }))
                }
              />
            </label>
          </article>
        ))}
      </section>

      <label className="ta-field">
        <span>Overall feedback for the student</span>
        <textarea
          className="ta-input ta-textarea"
          rows={4}
          value={overallFeedback}
          onChange={(event) => setOverallFeedback(event.target.value)}
          placeholder="Overall feedback…"
        />
      </label>

      <div className="ta-form-actions">
        <button type="button" className="ta-btn ta-btn--ghost" onClick={onBack} disabled={saving}>
          Back
        </button>
        <button
          type="button"
          className="ta-btn ta-btn--primary"
          onClick={() => void saveGrade()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save marks"}
        </button>
      </div>
    </div>
  );
}
