"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_MAX_BYTES,
  questionTypeLabel,
  studentStatusLabel,
} from "@/lib/assignments-shared";
import {
  fetchStudentAssignment,
  saveStudentDraft,
  submitStudentAssignment,
  StudentApiError,
  type StudentAssignmentDetail,
} from "@/lib/student-portal-api";
import RichTextEditor from "@/components/rich-text-editor";
import StudentConfirmDialog from "@/components/student-confirm-dialog";
import "./student-portal.css";

type AnswerState = Record<string, { html: string; text: string }>;
type Attachment = { name: string; type: string; data: string } | null;

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export default function StudentAssignmentView({
  assignmentId,
  onBack,
  onUpdated,
}: {
  assignmentId: string;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [detail, setDetail] = useState<StudentAssignmentDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [banner, setBanner] = useState("");

  const stateRef = useRef<{
    answers: AnswerState;
    attachment: Attachment;
    dirty: boolean;
    locked: boolean;
  }>({ answers: {}, attachment: null, dirty: false, locked: false });
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyDetail = useCallback((data: StudentAssignmentDetail) => {
    const initial: AnswerState = {};
    for (const answer of data.answers) {
      initial[answer.questionId] = {
        html: answer.answerHtml,
        text: answer.answerText,
      };
    }
    const existingAttachment =
      data.submission?.attachmentData && data.submission.attachmentName
        ? {
            name: data.submission.attachmentName,
            type: data.submission.attachmentType || "application/octet-stream",
            data: data.submission.attachmentData,
          }
        : null;

    setDetail(data);
    setAnswers(initial);
    setAttachment(existingAttachment);
    stateRef.current = {
      answers: initial,
      attachment: existingAttachment,
      dirty: false,
      locked: data.locked,
    };
    setLastSavedAt(data.submission?.lastSavedAt ?? null);
    setSaveState("idle");
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchStudentAssignment(assignmentId);
      if (!mountedRef.current) return;
      applyDetail(data);
      setError("");
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof StudentApiError
            ? err.message
            : "Could not load this assignment. Please try again.",
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [assignmentId, applyDetail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    stateRef.current.answers = answers;
    stateRef.current.attachment = attachment;
  }, [answers, attachment]);

  const buildPayload = useCallback(() => {
    const current = stateRef.current;
    return {
      answers: Object.entries(current.answers).map(([questionId, answer]) => ({
        questionId,
        answerHtml: answer.html,
        answerText: answer.text,
      })),
      attachment: current.attachment,
    };
  }, []);

  const persist = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (savingRef.current) return false;
      const payload = buildPayload();
      savingRef.current = true;
      if (!silent) setSaveState("saving");
      try {
        const result = await saveStudentDraft(assignmentId, payload.answers, payload.attachment);
        stateRef.current.dirty = false;
        if (mountedRef.current) {
          setLastSavedAt(result.savedAt);
          setSaveState("saved");
          setSaveError("");
        }
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setSaveState("error");
          setSaveError(
            err instanceof StudentApiError
              ? err.message
              : "Could not save the draft. Please try again.",
          );
        }
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [assignmentId, buildPayload],
  );

  // Autosave every 6 seconds while there are unsaved changes.
  useEffect(() => {
    if (!detail || detail.locked) return;
    const timer = window.setInterval(() => {
      if (stateRef.current.dirty) void persist(true);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [detail, persist]);

  function markDirty() {
    stateRef.current.dirty = true;
    setSaveState("unsaved");
    setBanner("");
  }

  function updateAnswer(questionId: string, html: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { html, text } }));
    markDirty();
  }

  async function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setSaveError("Use a PDF or an image (PNG, JPG, WEBP, GIF).");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setSaveError("The attachment is too large. The limit is 3 MB.");
      return;
    }

    try {
      const data = await readFileAsDataUrl(file);
      const next = { name: file.name, type: file.type, data };
      setAttachment(next);
      stateRef.current.attachment = next;
      markDirty();
      setSaveError("");
    } catch {
      setSaveError("Could not read the file.");
    }
  }

  function removeAttachment() {
    setAttachment(null);
    stateRef.current.attachment = null;
    markDirty();
  }

  async function handleBack() {
    if (detail && !detail.locked && stateRef.current.dirty) {
      await persist(false);
    }
    onBack();
  }

  async function handleSubmit() {
    if (!detail || detail.locked || submitting) return;

    const hasAnswer = Object.values(answers).some(
      (answer) => answer.text.trim().length > 0 || answer.html.trim().length > 0,
    );
    if (!hasAnswer) {
      setSaveError("Answer at least one question before submitting.");
      return;
    }

    setSaveError("");
    setConfirmingSubmit(true);
  }

  async function submitAssignment() {
    if (!detail || detail.locked || submitting) return;

    setConfirmingSubmit(false);
    setSubmitting(true);
    setSaveError("");
    try {
      const payload = buildPayload();
      await submitStudentAssignment(assignmentId, payload.answers, payload.attachment);
      stateRef.current.dirty = false;
      setBanner(detail.deadlinePassed ? "Assignment submitted (late)." : "Assignment submitted successfully.");
      onUpdated();
      await load();
    } catch (err) {
      setSaveError(
        err instanceof StudentApiError
          ? err.message
          : "Could not submit the assignment. Please try again.",
      );
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="sp-panel">
        <button type="button" className="sp-link sp-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <p className="sp-muted">Loading assignment…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="sp-panel">
        <button type="button" className="sp-link sp-back" onClick={onBack}>
          ← Back to assignments
        </button>
        <div className="sp-alert sp-alert--error">{error || "Assignment not found."}</div>
        <button type="button" className="sp-btn sp-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>
          Try again
        </button>
      </div>
    );
  }

  const assignment = detail.assignment;
  const locked = detail.locked;
  const marked = detail.submission?.status === "marked";

  return (
    <div className="sp-panel sp-assignment">
      <div className="sp-assignment-head">
        <button type="button" className="sp-link sp-back" onClick={() => void handleBack()}>
          ← Back to assignments
        </button>
        <div className="sp-assignment-title">
          <h2>{assignment.title}</h2>
          <p className="sp-muted">
            {assignment.subjectName} · {assignment.className} {assignment.streamName} ·{" "}
            {assignment.totalMarks} marks
          </p>
        </div>
        <span className={`sp-status sp-status--${assignment.submissionStatus}`}>
          {studentStatusLabel[assignment.submissionStatus]}
        </span>
      </div>

      {banner && <div className="sp-alert sp-alert--success">{banner}</div>}

      {detail.deadlinePassed && !locked && (
        <div className="sp-alert sp-alert--warn">
          The deadline has passed. You can still submit, but the assignment will be marked as late.
        </div>
      )}
      {detail.deadlinePassed && locked && !detail.submission?.submittedAt && (
        <div className="sp-alert sp-alert--error">
          The submission deadline has passed. This assignment can no longer be submitted.
        </div>
      )}

      <div className="sp-assignment-meta">
        <span>
          <strong>Teacher:</strong> {assignment.teacherName}
        </span>
        <span>
          <strong>Deadline:</strong>{" "}
          {assignment.deadline ? formatDate(assignment.deadline) : "None"}
        </span>
        {detail.submission?.submittedAt && (
          <span>
            <strong>Submitted:</strong> {formatDate(detail.submission.submittedAt)}
            {detail.submission.isLate && " (late)"}
          </span>
        )}
        {lastSavedAt && !locked && (
          <span>
            <strong>Draft saved:</strong> {formatDate(lastSavedAt)}
          </span>
        )}
      </div>

      {assignment.instructions && (
        <div className="sp-instructions">
          <h3>Instructions</h3>
          <p>{assignment.instructions}</p>
        </div>
      )}

      {assignment.attachmentName && assignment.attachmentData && (
        <a
          className="sp-attachment"
          href={assignment.attachmentData}
          download={assignment.attachmentName}
          target="_blank"
          rel="noreferrer"
        >
          📎 Teacher attachment: {assignment.attachmentName}
        </a>
      )}

      {marked && (
        <div className="sp-marked-box">
          <div>
            <span className="sp-muted">Your marks</span>
            <strong>
              {detail.submission?.totalScore ?? 0} / {assignment.totalMarks}
            </strong>
          </div>
          {detail.submission?.feedback && (
            <div>
              <span className="sp-muted">Teacher feedback</span>
              <p>{detail.submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      <div className="sp-questions">
        {detail.questions.map((question) => {
          const answer = answers[question.id] ?? { html: "", text: "" };
          const savedAnswer = detail.answers.find((row) => row.questionId === question.id);

          return (
            <section key={question.id} className="sp-question">
              <header className="sp-question-head">
                <h3>Question {question.position}</h3>
                <span className="sp-chip">
                  {questionTypeLabel[question.questionType]} · {question.marks} marks
                </span>
              </header>
              <p className="sp-question-prompt">{question.prompt}</p>

              {question.questionType === "mcq" ? (
                <div className="sp-mcq">
                  {question.options.map((option, index) => (
                    <label key={`${question.id}-${index}`} className="sp-mcq-option">
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option}
                        checked={answer.text === option}
                        disabled={locked}
                        onChange={() => updateAnswer(question.id, "", option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              ) : locked ? (
                <div
                  className="sp-answer-rendered"
                  // Stored HTML is sanitised on the server before it is saved.
                  dangerouslySetInnerHTML={{ __html: answer.html }}
                />
              ) : (
                <RichTextEditor
                  value={answer.html}
                  onChange={(html, text) => updateAnswer(question.id, html, text)}
                  disabled={locked}
                  ariaLabel={`Answer for question ${question.position}`}
                  minHeight={question.questionType === "essay" ? 280 : 160}
                />
              )}

              {marked && savedAnswer && (
                <div className="sp-question-mark">
                  <span>
                    Marks: <strong>{savedAnswer.awardedMarks ?? 0}</strong> / {question.marks}
                  </span>
                  {savedAnswer.feedback && <p>Feedback: {savedAnswer.feedback}</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="sp-attachment-box">
        <h3>Your attachment (optional)</h3>
        <p className="sp-muted">PDF or image, up to 3 MB.</p>
        {attachment ? (
          <div className="sp-attachment-current">
            <a href={attachment.data} download={attachment.name} target="_blank" rel="noreferrer">
              {attachment.name}
            </a>
            {!locked && (
              <button type="button" className="sp-link sp-link--danger" onClick={removeAttachment}>
                Remove
              </button>
            )}
          </div>
        ) : (
          !locked && (
            <input
              className="sp-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => void handleAttachment(event)}
            />
          )
        )}
      </div>

      {saveError && <div className="sp-alert sp-alert--error">{saveError}</div>}

      <div className="sp-submit-bar">
        <div className="sp-save-state">
          {locked
            ? "This assignment is locked."
            : saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? `Draft saved ${lastSavedAt ? formatDate(lastSavedAt) : ""}`
                : saveState === "unsaved"
                  ? "Unsaved changes…"
                  : saveState === "error"
                    ? "Save error."
                    : "Draft autosaves every 6 seconds."}
        </div>
        <div className="sp-submit-actions">
          {!locked && (
            <button
              type="button"
              className="sp-btn sp-btn--ghost"
              onClick={() => void persist(false)}
              disabled={saveState === "saving"}
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={locked || submitting}
          >
            {locked
              ? "Already submitted"
              : submitting
                ? "Submitting…"
                : "Submit assignment"}
          </button>
        </div>
      </div>

      <StudentConfirmDialog
        open={confirmingSubmit}
        title="Submit this assignment?"
        message="Have you reviewed all your answers? You cannot edit this assignment after submitting."
        confirmLabel="Yes, submit"
        cancelLabel="Keep editing"
        busy={submitting}
        onConfirm={() => void submitAssignment()}
        onCancel={() => setConfirmingSubmit(false)}
      />
    </div>
  );
}
