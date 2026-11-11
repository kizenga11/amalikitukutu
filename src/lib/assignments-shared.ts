// Shared, dependency-free helpers for the assignments feature.
// This module is imported by both client components and server routes,
// so it must never import Node-only APIs.

export type QuestionType = "essay" | "short_answer" | "mcq";
export type AssignmentPublishStatus = "draft" | "published" | "closed";
export type SubmissionRowStatus = "draft" | "submitted" | "marked";
export type StudentAssignmentStatus = "not_done" | "submitted" | "late" | "marked";

export interface AssignmentAttachment {
  name: string;
  type: string;
  /** A full data URL: data:<mime>;base64,.... */
  data: string;
}

export interface QuestionPayload {
  id?: string;
  position?: number;
  questionType: QuestionType;
  prompt: string;
  options?: string[] | null;
  correctOption?: number | null;
  marks?: number;
}

export interface AssignmentSummary {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  academicYearId: string;
  term: number;
  deadline: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  status: AssignmentPublishStatus;
  instructions: string;
  attachmentName: string | null;
  createdAt: string;
  submissionStatus: StudentAssignmentStatus;
  submittedAt: string | null;
  isLate: boolean;
  awardedMarks: number | null;
  feedback: string | null;
}

export interface StudentAssignmentQuestion {
  id: string;
  position: number;
  questionType: QuestionType;
  prompt: string;
  options: string[];
  marks: number;
}

export interface StudentAnswer {
  questionId: string;
  answerHtml: string;
  answerText: string;
  awardedMarks: number | null;
  feedback: string | null;
}

export const ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type AttachmentResult =
  | { ok: true; attachment: AssignmentAttachment | null }
  | { ok: false; error: string };

export function normaliseAttachment(input: unknown): AttachmentResult {
  if (input == null) return { ok: true, attachment: null };
  if (typeof input !== "object") {
    return { ok: false, error: "Invalid attachment." };
  }
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : "";
  const data = typeof raw.data === "string" ? raw.data.trim() : "";
  if (!data) return { ok: true, attachment: null };
  if (!name) return { ok: false, error: "The attachment has no file name." };

  const match = data.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return { ok: false, error: "The attachment must be a PDF or an image." };

  const type = match[1].toLowerCase();
  if (!ATTACHMENT_TYPES.has(type)) {
    return { ok: false, error: "Unsupported file type. Use PDF, PNG, JPG, WEBP or GIF." };
  }

  if (dataUrlBytes(match[2]) > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "The attachment is too large. The limit is 3 MB." };
  }

  return { ok: true, attachment: { name, type, data } };
}

export function dataUrlBytes(base64: string): number {
  const clean = base64.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "p",
  "br",
  "div",
  "span",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "pre",
  "code",
]);

const DANGEROUS_BLOCKS =
  /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select|option|svg|math|video|audio|canvas)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_VOID =
  /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select|option|svg|math|video|audio|canvas)[^>]*\/?>/gi;
const EVENT_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_ATTR = /(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi;

/**
 * Keeps only the small HTML subset the rich-text editor produces.
 * Everything else (scripts, iframes, event handlers, external links) is
 * removed before the value is stored or rendered.
 */
export function sanitizeRichHtml(input: unknown, maxLength = 120_000): string {
  if (typeof input !== "string") return "";
  let html = input.slice(0, maxLength);

  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(DANGEROUS_BLOCKS, "");
  html = html.replace(DANGEROUS_VOID, "");
  html = html.replace(EVENT_ATTR, "");
  html = html.replace(JS_ATTR, "");

  html = html.replace(
    /<\/?([a-z0-9]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi,
    (whole, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (whole.startsWith("</")) return `</${tag}>`;

      let attrs = "";
      const styleMatch = rawAttrs.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (styleMatch) {
        const style = styleMatch[1] ?? styleMatch[2] ?? "";
        const align = style.match(/text-align\s*:\s*(left|right|center|justify)/i);
        if (align) attrs = ` style="text-align:${align[1].toLowerCase()}"`;
      }
      return `<${tag}${attrs}>`;
    },
  );

  // Catch malformed leftovers after the normalisation pass.
  html = html.replace(/<[^>]*>/g, (tag) =>
    /^<\/?(b|strong|i|em|u|s|p|br|div|span|ul|ol|li|h1|h2|h3|h4|blockquote|pre|code)(\s+style="text-align:(left|right|center|justify)")?\/?>$/i.test(
      tag,
    )
      ? tag
      : "",
  );

  return html.trim().slice(0, maxLength);
}

export function richTextToPlain(input: unknown, maxLength = 120_000): string {
  if (typeof input !== "string") return "";
  return input
    .slice(0, maxLength)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-4]|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanLine(value: unknown, max = 500): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function cleanMultiline(value: unknown, max = 20_000): string {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, max)
    : "";
}

export function studentStatus(
  status: SubmissionRowStatus | null | undefined,
  isLate: boolean,
): StudentAssignmentStatus {
  if (!status || status === "draft") return "not_done";
  if (status === "marked") return "marked";
  return isLate ? "late" : "submitted";
}

export const studentStatusLabel: Record<StudentAssignmentStatus, string> = {
  not_done: "Not done",
  submitted: "Submitted",
  late: "Late",
  marked: "Marked",
};

export const questionTypeLabel: Record<QuestionType, string> = {
  essay: "Essay / Long answer",
  short_answer: "Short answer",
  mcq: "Multiple choice",
};
