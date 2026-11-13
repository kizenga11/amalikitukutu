"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ATTACHMENT_MAX_BYTES,
  isPracticalQuestion,
  normaliseMatchingConfig,
  normaliseMcqConfig,
  normaliseStructuredParts,
  questionTypeLabel,
  studentStatusLabel,
  toRoman,
  type MatchingConfig,
  type StructuredPart,
} from "@/lib/assignments-shared";
import {
  fetchStudentAssignment,
  saveStudentDraft,
  submitStudentAssignment,
  StudentApiError,
  type StudentAssignmentDetail,
} from "@/lib/student-portal-api";
import RichTextEditor from "@/components/rich-text-editor";
import CppIde from "@/components/cpp-ide";
import StudentConfirmDialog from "@/components/student-confirm-dialog";
import StudentNoticeDialog, { type StudentNoticeTone } from "@/components/student-notice-dialog";
import "./student-portal.css";

type AnswerEntry = { html: string; text: string; value?: unknown };
type AnswerState = Record<string, AnswerEntry>;
type Attachment = { name: string; type: string; data: string } | null;

function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);

function safeParseJson(text: string): unknown {
  if (!text) return undefined;
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

function hasMeaningfulAnswer(entry: AnswerEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.html && entry.html.trim()) return true;
  if (entry.text && entry.text.trim()) return true;
  if (entry.value && typeof entry.value === "object") {
    try { return JSON.stringify(entry.value) !== "{}" && JSON.stringify(entry.value) !== "[]"; } catch { return true; }
  }
  return false;
}

function getStructuredParts(options: unknown): StructuredPart[] {
  const raw = options && typeof options === "object" && (options as any).parts ? (options as any).parts : options;
  return normaliseStructuredParts(raw);
}

function getLeafParts(parts: StructuredPart[], prefix = ""): { key: string; part: StructuredPart }[] {
  const out: { key: string; part: StructuredPart }[] = [];
  for (const p of parts) {
    const key = p.key || `${prefix}${p.label}`;
    if (p.children && p.children.length > 0) out.push(...getLeafParts(p.children, `${key}.`));
    else out.push({ key, part: p });
  }
  return out;
}

/** A part with subparts takes its marks from those subparts (never added twice). */
function partMarks(part: StructuredPart): number {
  if (part.children && part.children.length > 0) {
    return part.children.reduce((sum, child) => sum + partMarks(child), 0);
  }
  return Number(part.marks) || 0;
}

function AnswerText({ html, text }: { html: string; text: string }) {
  if (html) return <div className="sp-answer-rendered" dangerouslySetInnerHTML={{ __html: html }} />;
  return <p className="sp-muted">{text || "No answer provided."}</p>;
}

export default function StudentAssignmentView({ assignmentId, onBack, onUpdated }: { assignmentId: string; onBack: () => void; onUpdated: () => void; }) {
  const [detail, setDetail] = useState<StudentAssignmentDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [answerModes, setAnswerModes] = useState<Record<string, "ide" | "text">>({});
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [notice, setNotice] = useState<{ tone: StudentNoticeTone; title: string; message: string } | null>(null);
  const deadlineNoticeShown = useRef(false);

  const showNotice = useCallback((tone: StudentNoticeTone, title: string, message: string) => {
    setNotice({ tone, title, message });
  }, []);

  useEffect(() => { if (!error) return; const t = window.setTimeout(() => setError(""), 5000); return () => window.clearTimeout(t); }, [error]);

  useEffect(() => {
    if (!notice || (notice.tone !== "success" && notice.tone !== "info")) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const stateRef = useRef<{ answers: AnswerState; attachment: Attachment; dirty: boolean; locked: boolean }>({ answers: {}, attachment: null, dirty: false, locked: false });
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const applyDetail = useCallback((data: StudentAssignmentDetail) => {
    const initial: AnswerState = {};
    for (const answer of data.answers) {
      const value = (answer as any).answerValue ?? safeParseJson(answer.answerText);
      initial[answer.questionId] = { html: answer.answerHtml || "", text: answer.answerText || "", value };
    }
    const existingAttachment = data.submission?.attachmentData && data.submission.attachmentName ? { name: data.submission.attachmentName, type: data.submission.attachmentType || "application/octet-stream", data: data.submission.attachmentData } : null;
    setDetail(data); setAnswers(initial); setAttachment(existingAttachment);
    stateRef.current = { answers: initial, attachment: existingAttachment, dirty: false, locked: data.locked };
    setLastSavedAt(data.submission?.lastSavedAt ?? null); setSaveState("idle");
    if (data.deadlinePassed && !deadlineNoticeShown.current) {
      deadlineNoticeShown.current = true;
      if (!data.locked) {
        showNotice("warn", "Deadline passed", "The deadline has passed. You can still submit, but the assignment will be marked as late.");
      } else if (!data.submission?.submittedAt) {
        showNotice("warn", "Deadline passed", "The submission deadline has passed. This assignment can no longer be submitted.");
      }
    }
  }, [showNotice]);

  const load = useCallback(async () => {
    try { const data = await fetchStudentAssignment(assignmentId); if (!mountedRef.current) return; applyDetail(data); setError(""); }
    catch (err) { if (mountedRef.current) setError(err instanceof StudentApiError ? err.message : "Could not load this assignment. Please try again."); }
    finally { if (mountedRef.current) setLoading(false); }
  }, [assignmentId, applyDetail]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { stateRef.current.answers = answers; stateRef.current.attachment = attachment; }, [answers, attachment]);

  const buildPayload = useCallback(() => {
    const current = stateRef.current;
    return {
      answers: Object.entries(current.answers).map(([questionId, answer]) => {
        const isObj = answer.value !== undefined;
        return { questionId, answerHtml: answer.html || "", answerText: isObj ? JSON.stringify(answer.value) : (answer.text || "") };
      }),
      attachment: current.attachment,
    };
  }, []);

  const persist = useCallback(async (silent: boolean): Promise<boolean> => {
    if (savingRef.current) return false;
    const payload = buildPayload();
    savingRef.current = true; if (!silent) setSaveState("saving");
    try {
      const result = await saveStudentDraft(assignmentId, payload.answers, payload.attachment);
      stateRef.current.dirty = false;
      if (mountedRef.current) { setLastSavedAt(result.savedAt); setSaveState("saved"); }
      return true;
    } catch (err) {
      if (mountedRef.current) {
        setSaveState("error");
        if (!silent) showNotice("error", "Could not save", err instanceof StudentApiError ? err.message : "Could not save the draft. Please try again.");
      }
      return false;
    } finally { savingRef.current = false; }
  }, [assignmentId, buildPayload, showNotice]);

  useEffect(() => {
    if (!detail || detail.locked) return;
    const timer = window.setInterval(() => { if (stateRef.current.dirty) void persist(true); }, 6000);
    return () => window.clearInterval(timer);
  }, [detail, persist]);

  function markDirty() { stateRef.current.dirty = true; setSaveState("unsaved"); }

  function setAnswer(questionId: string, next: AnswerEntry) {
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    markDirty();
  }

  async function handleAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) { showNotice("error", "Invalid file", "Use a PDF or an image (PNG, JPG, WEBP, GIF)."); return; }
    if (file.size > ATTACHMENT_MAX_BYTES) { showNotice("error", "File too large", "The attachment is too large. The limit is 3 MB."); return; }
    try { const data = await readFileAsDataUrl(file); const next = { name: file.name, type: file.type, data }; setAttachment(next); stateRef.current.attachment = next; markDirty(); } catch { showNotice("error", "Could not read file", "Could not read the file."); }
  }
  function removeAttachment() { setAttachment(null); stateRef.current.attachment = null; markDirty(); }

  async function handleBack() { if (detail && !detail.locked && stateRef.current.dirty) { await persist(false); } onBack(); }
  async function handleSubmit() {
    if (!detail || detail.locked || submitting) return;
    const hasAnswer = Object.values(answers).some(hasMeaningfulAnswer);
    if (!hasAnswer) { showNotice("warn", "No answers yet", "Answer at least one question before submitting."); return; }
    setConfirmingSubmit(true);
  }

  async function submitAssignment() {
    if (!detail || detail.locked || submitting) return;
    setConfirmingSubmit(false); setSubmitting(true);
    try {
      const payload = buildPayload();
      await submitStudentAssignment(assignmentId, payload.answers, payload.attachment);
      if (!mountedRef.current) return;
      stateRef.current.dirty = false; showNotice("success", "Assignment submitted", detail.deadlinePassed ? "Assignment submitted (late)." : "Assignment submitted successfully."); setSaveState("saved"); onUpdated(); await load();
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof StudentApiError ? err.message : "Could not submit the assignment. Please try again.";
      const alreadySubmitted = err instanceof StudentApiError && (err.status === 409 || /already been submitted/i.test(err.message));
      if (alreadySubmitted) { stateRef.current.dirty = false; showNotice("success", "Assignment submitted", "Assignment submitted successfully."); setSaveState("saved"); onUpdated(); await load(); }
      else { showNotice("error", "Could not submit", message); }
    } finally { if (mountedRef.current) setSubmitting(false); }
  }

  if (loading && !detail) return (<div className="sp-panel"><button type="button" className="sp-link sp-back" onClick={onBack}>← Back to assignments</button><p className="sp-muted">Loading assignment…</p></div>);
  if (error || !detail) return (<div className="sp-panel"><button type="button" className="sp-link sp-back" onClick={onBack}>← Back to assignments</button><div className="sp-alert sp-alert--error">{error || "Assignment not found."}</div><button type="button" className="sp-btn sp-btn--primary" onClick={() => { setLoading(true); setError(""); void load(); }}>Try again</button></div>);

  const assignment = detail.assignment;
  const locked = detail.locked;
  const marked = detail.submission?.status === "marked";

  return (
    <div className="sp-panel sp-assignment">
      <div className="sp-assignment-head">
        <button type="button" className="sp-link sp-back" onClick={() => void handleBack()}>← Back to assignments</button>
        <div className="sp-assignment-title"><h2>{assignment.title}</h2><p className="sp-muted">{assignment.subjectName} · {assignment.className} {assignment.streamName} · {assignment.totalMarks} marks</p></div>
        <span className={`sp-status sp-status--${assignment.submissionStatus}`}>{studentStatusLabel[assignment.submissionStatus]}</span>
      </div>
      <div className="sp-assignment-meta">
        <span><strong>Teacher:</strong> {assignment.teacherName}</span>
        <span><strong>Deadline:</strong> {assignment.deadline ? formatDate(assignment.deadline) : "None"}</span>
        {detail.submission?.submittedAt && <span><strong>Submitted:</strong> {formatDate(detail.submission.submittedAt)}{detail.submission.isLate && " (late)"}</span>}
        {lastSavedAt && !locked && <span><strong>Draft saved:</strong> {formatDate(lastSavedAt)}</span>}
      </div>
      {assignment.instructions && <div className="sp-instructions"><h3>Instructions</h3><p>{assignment.instructions}</p></div>}
      {assignment.attachmentName && assignment.attachmentData && <a className="sp-attachment" href={assignment.attachmentData} download={assignment.attachmentName} target="_blank" rel="noreferrer">📎 Teacher attachment: {assignment.attachmentName}</a>}
      {marked && <div className="sp-marked-box"><div><span className="sp-muted">Your marks</span><strong>{detail.submission?.totalScore ?? 0} / {assignment.totalMarks}</strong></div>{detail.submission?.feedback && <div><span className="sp-muted">Teacher feedback</span><p>{detail.submission.feedback}</p></div>}</div>}

      <div className="sp-questions">
        {detail.questions.map((question) => {
          const answer = answers[question.id] ?? { html: "", text: "" };
          const savedAnswer = detail.answers.find((row) => row.questionId === question.id);
          const qType = question.questionType;
          const cfgMcq = qType === "mcq" ? normaliseMcqConfig(question.options) : null;
          const cfgMatch = qType === "matching" ? normaliseMatchingConfig(question.options) : null;
          const parts = qType === "structured" ? getStructuredParts(question.options) : [];
          const practical = isPracticalQuestion(question);
          const ideMode = practical ? answerModes[question.id] ?? "ide" : null;
          return (
            <section key={question.id} className="sp-question">
              <header className="sp-question-head"><h3>Question {question.position}</h3><span className="sp-chip">{questionTypeLabel[qType]} · {question.marks} marks</span></header>
              <p className="sp-question-prompt">{question.prompt}</p>

              {practical && !locked && (
                <div className="sp-answer-mode" role="group" aria-label={`Aina ya jibu la swali ${question.position}`}>
                  <button
                    type="button"
                    className={ideMode === "ide" ? "sp-answer-mode-btn sp-answer-mode-btn--active" : "sp-answer-mode-btn"}
                    onClick={() => setAnswerModes((prev) => ({ ...prev, [question.id]: "ide" }))}
                  >
                    IDE (C++)
                  </button>
                  <button
                    type="button"
                    className={ideMode === "text" ? "sp-answer-mode-btn sp-answer-mode-btn--active" : "sp-answer-mode-btn"}
                    onClick={() => setAnswerModes((prev) => ({ ...prev, [question.id]: "text" }))}
                  >
                    Maandishi
                  </button>
                </div>
              )}

              {qType === "mcq" && cfgMcq && Array.isArray((cfgMcq as any).items) && (cfgMcq as any).items.length > 0 ? (
                <McqItemsStudent qid={question.id} items={(cfgMcq as any).items} instruction={(cfgMcq as any).instruction || question.prompt} value={(answer.value && typeof answer.value === "object" ? answer.value : safeParseJson(answer.text)) as Record<string, any> | undefined} locked={locked} onChange={(v) => setAnswer(question.id, { html: "", text: JSON.stringify(v), value: v })} />
              ) : qType === "mcq" && cfgMcq ? (
                <div className="sp-mcq">
                  {cfgMcq.choices.map((option, index) => {
                    const label = cfgMcq.choiceLabels[index] || toRoman(index + 1);
                    const value = option; // store option text for compatibility
                    const checked = answer.text === value || answer.text === String(index);
                    return (
                      <label key={`${question.id}-${index}`} className="sp-mcq-option">
                        <input type="radio" name={`question-${question.id}`} value={value} checked={checked} disabled={locked} onChange={() => setAnswer(question.id, { html: "", text: value })} />
                        <span><strong>({label})</strong> {option}</span>
                      </label>
                    );
                  })}
                </div>
              ) : qType === "matching" && cfgMatch ? (
                <MatchingAnswer qid={question.id} cfg={cfgMatch} value={(answer.value && typeof answer.value === "object" ? answer.value : safeParseJson(answer.text)) as Record<string,string> | undefined} locked={locked} onChange={(v) => setAnswer(question.id, { html: "", text: JSON.stringify(v), value: v })} />
              ) : qType === "structured" ? (
                <StructuredAnswer qid={question.id} parts={parts} value={(answer.value && typeof answer.value === "object" ? answer.value : safeParseJson(answer.text)) as Record<string,any> | undefined} locked={locked} onChange={(v) => setAnswer(question.id, { html: "", text: JSON.stringify(v), value: v })} />
              ) : practical ? (
                locked ? (
                  <AnswerText html={answer.html} text={answer.text} />
                ) : ideMode === "ide" ? (
                  <CppIde
                    assignmentId={assignmentId}
                    questionId={question.id}
                    questionNumber={question.position}
                    initialHtml={answer.html}
                    locked={locked}
                    submitting={submitting}
                    onChange={(next) => setAnswer(question.id, next)}
                    onSubmit={() => void handleSubmit()}
                  />
                ) : (
                  <RichTextEditor value={answer.html} onChange={(html, text) => setAnswer(question.id, { html, text })} disabled={locked} ariaLabel={`Answer for question ${question.position}`} minHeight={qType === "essay" || qType === "calculation" ? 280 : 160} />
                )
              ) : locked ? (
                <AnswerText html={answer.html} text={answer.text} />
              ) : (
                <RichTextEditor value={answer.html} onChange={(html, text) => setAnswer(question.id, { html, text })} disabled={locked} ariaLabel={`Answer for question ${question.position}`} minHeight={qType === "essay" || qType === "calculation" ? 280 : 160} />
              )}

              {marked && savedAnswer && (
                <div className="sp-question-mark"><span>Marks: <strong>{savedAnswer.awardedMarks ?? 0}</strong> / {question.marks}</span>{savedAnswer.feedback && <p>Feedback: {savedAnswer.feedback}</p>}</div>
              )}
            </section>
          );
        })}
      </div>

      <div className="sp-attachment-box">
        <h3>Your attachment (optional)</h3>
        <p className="sp-muted">PDF or image, up to 3 MB.</p>
        {attachment ? (
          <div className="sp-attachment-current"><a href={attachment.data} download={attachment.name} target="_blank" rel="noreferrer">{attachment.name}</a>{!locked && <button type="button" className="sp-link sp-link--danger" onClick={removeAttachment}>Remove</button>}</div>
        ) : (!locked && <input className="sp-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void handleAttachment(e)} />)}
      </div>

      <div className="sp-submit-bar">
        <div className="sp-save-state">{locked ? "This assignment is locked." : saveState === "saving" ? "Saving…" : saveState === "saved" ? `Draft saved ${lastSavedAt ? formatDate(lastSavedAt) : ""}` : saveState === "unsaved" ? "Unsaved changes…" : saveState === "error" ? "Save error." : "Draft autosaves every 6 seconds."}</div>
        <div className="sp-submit-actions">
          {!locked && <button type="button" className="sp-btn sp-btn--ghost" onClick={() => void persist(false)} disabled={saveState === "saving"}>Save draft</button>}
          <button type="button" className="sp-btn sp-btn--primary" onClick={() => void handleSubmit()} disabled={locked || submitting}>{locked ? "Already submitted" : submitting ? "Submitting…" : "Submit assignment"}</button>
        </div>
      </div>
      <StudentConfirmDialog open={confirmingSubmit} title="Submit this assignment?" message="Have you reviewed all your answers? You cannot edit this assignment after submitting." confirmLabel="Yes, submit" cancelLabel="Keep editing" busy={submitting} onConfirm={() => void submitAssignment()} onCancel={() => setConfirmingSubmit(false)} />
      <StudentNoticeDialog
        open={Boolean(notice)}
        title={notice?.title || ""}
        message={notice?.message || ""}
        tone={notice?.tone || "info"}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}

function MatchingAnswer({ qid, cfg, value, locked, onChange }: { qid: string; cfg: MatchingConfig; value?: Record<string, string>; locked: boolean; onChange: (v: Record<string, string>) => void }) {
  const map = value || {};
  const rights = cfg.pairs.map((p) => p.right);
  if (locked) {
    return (
      <ol className="sp-matching">
        {cfg.pairs.map((p, i) => (<li key={i}><strong>({toRoman(i + 1)})</strong> {p.left} → <span>{map[String(i)] || "—"}</span></li>))}
      </ol>
    );
  }
  return (
    <div className="sp-matching">
      {cfg.pairs.map((p, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div><strong>({toRoman(i + 1)})</strong> {p.left}</div>
          <select className="ta-input" value={map[String(i)] || ""} onChange={(e) => onChange({ ...map, [String(i)]: e.target.value })}>
            <option value="">— Select match —</option>
            {rights.map((r, ri) => <option key={ri} value={r}>{r}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function McqItemsStudent({ qid, items, instruction, value, locked, onChange }: { qid: string; items: any[]; instruction?: string; value?: Record<string, any>; locked: boolean; onChange: (v: Record<string, any>) => void }) {
  const map = value || {};
  function setItem(key: string, v: any) { onChange({ ...map, [key]: v }); }
  return (
    <div className="sp-mcq-items">
      {instruction && <p style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>{instruction}</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((it, idx) => {
          const key = it.key || `item-${idx}`;
          const label = it.label || toRoman(idx + 1);
          const val = map[key];
          const choices: string[] = Array.isArray(it.choices) ? it.choices : [];
          const labels: string[] = (Array.isArray(it.choiceLabels) && it.choiceLabels.length === choices.length) ? it.choiceLabels : choices.map((_, i) => String.fromCharCode(65 + i));
          const selectedLabel = typeof val === "string" && /^[A-Za-z]+$/.test(val) ? val : (typeof val === "number" ? (labels[val] || String.fromCharCode(65 + val)) : "");
          return (
            <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
              <div style={{ marginBottom: 8 }}><strong>({label})</strong> {it.prompt}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  {choices.map((opt, i) => {
                    const lbl = labels[i] || String.fromCharCode(65 + i);
                    const checked = val === i || val === String(i) || val === lbl;
                    return (
                      <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: locked ? "default" : "pointer" }}>
                        <input type="radio" name={`mcqi-${qid}-${key}`} checked={checked} disabled={locked} onChange={() => setItem(key, lbl)} />
                        <span><strong>{lbl}.</strong> {String(opt)}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ minWidth: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span className="sp-muted" style={{ fontSize: 12 }}>Jibu</span>
                  <select
                    className="ta-input"
                    style={{ width: 88, textAlign: "center", fontWeight: 600 }}
                    value={selectedLabel}
                    disabled={locked}
                    onChange={(e) => { const v = e.target.value; setItem(key, v || ""); }}
                    aria-label={`Jibu la kipengele ${label}`}
                  >
                    <option value="">[ ]</option>
                    {choices.map((_, i) => {
                      const lbl = labels[i] || String.fromCharCode(65 + i);
                      return <option key={i} value={lbl}>{lbl}</option>;
                    })}
                  </select>
                </div>
              </div>
              {locked && <div className="sp-muted" style={{ marginTop: 6 }}>Jibu lililochaguliwa: <strong>[ {selectedLabel || "—"} ]</strong></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructuredAnswer({ qid, parts, value, locked, onChange }: { qid: string; parts: StructuredPart[]; value?: Record<string, any>; locked: boolean; onChange: (v: Record<string, any>) => void }) {
  const map = value || {};
  function setLeaf(key: string, v: any) { onChange({ ...map, [key]: v }); }
  function renderParts(ps: StructuredPart[], depth = 0) {
    return ps.map((p, idx) => {
      const key = p.key || `${depth}-${idx}-${p.label}`;
      const label = p.label || (depth === 0 ? String.fromCharCode(65 + idx) : toRoman(idx + 1));
      const hasChildren = p.children && p.children.length > 0;
      const leafVal = map[key];
      return (
        <div key={key} style={{ marginLeft: depth * 16, marginBottom: 10 }}>
          <div><strong>{label}.</strong> {p.prompt} {!hasChildren && <span className="sp-chip">{partMarks(p)} marks</span>}</div>
          {!hasChildren && (
            p.type === "mcq" ? (
              <div className="sp-mcq" style={{ display: "grid", gap: 6 }}>
                {(p.options || []).map((opt, i) => {
                  const lbl = (p.choiceLabels && p.choiceLabels[i]) || (p.options && p.options.length <= 8 ? String.fromCharCode(65 + i) : toRoman(i + 1));
                  const checked = leafVal === i || leafVal === String(i) || leafVal === lbl || leafVal === String(opt);
                  return (
                    <label key={i} className="sp-mcq-option" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="radio" name={`s-${qid}-${key}`} checked={checked} disabled={locked} onChange={() => setLeaf(key, lbl)} />
                      <span><strong>{lbl}.</strong> {String(opt)}</span>
                    </label>
                  );
                })}
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="sp-muted">Answer (letter):</span>
                  <select
                    className="ta-input"
                    style={{ width: 90 }}
                    value={(typeof leafVal === "string" && /^[A-Za-z]+$/.test(leafVal)) ? leafVal : (typeof leafVal === "number" ? ((p.choiceLabels && p.choiceLabels[leafVal]) || String.fromCharCode(65 + leafVal)) : "")}
                    disabled={locked}
                    onChange={(e) => { const v = e.target.value; if (v) setLeaf(key, v); }}
                  >
                    <option value="">—</option>
                    {(p.options || []).map((_, i) => {
                      const lbl = (p.choiceLabels && p.choiceLabels[i]) || (p.options && p.options.length <= 8 ? String.fromCharCode(65 + i) : toRoman(i + 1));
                      return <option key={i} value={lbl}>{lbl}</option>;
                    })}
                  </select>
                </div>
              </div>
            ) : locked ? (
              <AnswerText html={typeof leafVal === "string" ? leafVal : (leafVal?.html || "")} text={typeof leafVal === "string" && !leafVal.trim().startsWith("<") ? leafVal : ""} />
            ) : (
              <RichTextEditor value={typeof leafVal === "string" ? leafVal : (leafVal?.html || "")} onChange={(html) => setLeaf(key, html)} disabled={locked} ariaLabel={`Answer for part ${label}`} minHeight={p.type === "essay" || p.type === "calculation" ? 220 : 120} />
            )
          )}
          {hasChildren && renderParts(p.children!, depth + 1)}
        </div>
      );
    });
  }
  return <div>{renderParts(parts)}</div>;
}
