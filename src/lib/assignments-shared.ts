// Shared, dependency-free helpers for the assignments feature.
// This module is imported by both client components and server routes,
// so it must never import Node-only APIs.

export type QuestionType =
  | "essay"
  | "calculation"
  | "short_answer"
  | "mcq"
  | "matching"
  | "structured";
export type AssignmentPublishStatus = "draft" | "published" | "closed";
export type SubmissionRowStatus = "draft" | "submitted" | "marked";
export type StudentAssignmentStatus = "not_done" | "submitted" | "late" | "marked";

/** Text-answer question types that a teacher can mark as practical (C++ IDE). */
export const PRACTICAL_QUESTION_TYPES = new Set<QuestionType>([
  "essay",
  "calculation",
  "short_answer",
]);

/**
 * A practical question is a normal text-answer question whose options carry
 * { practical: true }. The flag is not a hidden test: it is safe to expose to
 * students because it only tells the page which answer mode to render.
 */
export function isPracticalQuestion(question: {
  questionType: QuestionType;
  options?: unknown;
}): boolean {
  if (!PRACTICAL_QUESTION_TYPES.has(question.questionType)) return false;
  const options = question.options;
  return Boolean(
    options &&
      typeof options === "object" &&
      (options as { practical?: unknown }).practical === true,
  );
}

export type StructuredPartType = "essay" | "calculation" | "short_answer" | "mcq";

export interface StructuredPart {
  key: string;
  label: string;
  prompt: string;
  marks: number;
  type: StructuredPartType;
  options?: string[];
  /** Labels for MCQ options, e.g. A,B,C,D or i,ii,iii. */
  choiceLabels?: string[];
  correctOption?: number | null;
  children?: StructuredPart[];
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface MatchingConfig {
  pairs: MatchingPair[];
  /** Optional labels/numbering style hint, e.g. roman. */
  labelStyle?: "roman" | "alpha" | "numeric";
}

export interface McqItem {
  key: string;
  label: string; // e.g. i, ii, iii
  prompt: string;
  choices: string[];
  choiceLabels?: string[]; // A,B,C,D
  correctOption: number | null;
  marks?: number;
}

export interface McqConfig {
  /** Simple MCQ choices (single question). */
  choices: string[];
  correctOption: number | null;
  /** Optional display labels like i, ii, iii or A, B, C. */
  choiceLabels?: string[];
  /** Itemized MCQ: question 1 with items (i)-(x), each with A-D options. */
  items?: McqItem[];
  instruction?: string;
}

export interface QuestionPayload {
  id?: string;
  position?: number;
  questionType: QuestionType;
  prompt: string;
  options?: unknown;
  correctOption?: number | null;
  marks?: number;
}

export interface AssignmentAttachment {
  name: string;
  type: string;
  /** A full data URL: data:<mime>;base64,.... */
  data: string;
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
  /** Rich config: MCQ {choices,choiceLabels,correctOption? not exposed}, matching {pairs,labelStyle}, structured {parts}, or legacy string[] */
  options: unknown;
  marks: number;
}

export interface StudentAnswer {
  questionId: string;
  answerHtml: string;
  answerText: string;
  /** Optional structured value for matching/structured answers (JSON object) */
  answerValue?: unknown;
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
  calculation: "Essay / Calculation (show working)",
  short_answer: "Short answer",
  mcq: "Multiple choice",
  matching: "Matching items",
  structured: "Structured / Multi-part",
};

export function toRoman(num: number): string {
  if (!Number.isInteger(num) || num <= 0) return String(num);
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let n = num;
  let out = "";
  for (let i = 0; i < vals.length; i += 1) {
    while (n >= vals[i]) {
      out += syms[i];
      n -= vals[i];
    }
  }
  return out.toLowerCase();
}

export function defaultMcqLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => toRoman(i + 1));
}

export function alphaLabel(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function defaultAlphaMcqLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => alphaLabel(i));
}

export function normaliseMcqConfig(raw: unknown): { choices: string[]; correctOption: number | null; choiceLabels: string[]; items?: McqItem[]; instruction?: string } {
  // Backward compat: options stored as string[]
  if (Array.isArray(raw)) {
    const choices = raw.map((x) => cleanLine(x, 500)).filter(Boolean);
    return { choices, correctOption: null, choiceLabels: defaultMcqLabels(choices.length) };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Itemized MCQ: { items: [...], instruction? }
    if (Array.isArray(obj.items)) {
      const items: McqItem[] = obj.items.map((it, idx) => {
        const r = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const choices = (Array.isArray(r.choices) ? r.choices : Array.isArray(r.options) ? r.options : [])
          .map((x) => cleanLine(x, 500));
        const filled = choices.some((c) => c.trim()) ? choices : ["", "", "", ""];
        const trimmedChoices = filled.map((c) => String(c));
        const labelsRaw = Array.isArray(r.choiceLabels) ? r.choiceLabels.map((x) => cleanLine(x, 20)) : [];
        const choiceLabels = labelsRaw.length === trimmedChoices.length && labelsRaw.every(Boolean)
          ? labelsRaw
          : defaultAlphaMcqLabels(trimmedChoices.length);
        const cRaw = r.correctOption ?? r.correct_option;
        const cNum = Number(cRaw);
        const correctOption = Number.isInteger(cNum) && cNum >= 0 && cNum < trimmedChoices.length ? cNum : null;
        const marksNum = Number(r.marks);
        return {
          key: cleanLine(r.key, 80) || `item-${idx}`,
          label: cleanLine(r.label, 20) || toRoman(idx + 1),
          prompt: cleanMultiline(r.prompt, 2000),
          choices: trimmedChoices,
          choiceLabels,
          correctOption,
          marks: Number.isFinite(marksNum) && marksNum >= 0 ? marksNum : undefined,
        };
      });
      const instruction = cleanMultiline(obj.instruction, 2000);
      return { choices: [], correctOption: null, choiceLabels: [], items, instruction: instruction || undefined };
    }
    const choicesRaw = Array.isArray(obj.choices) ? obj.choices : Array.isArray(obj.options) ? obj.options : [];
    const choices = choicesRaw.map((x) => cleanLine(x, 500)).filter(Boolean);
    const correctRaw = obj.correctOption ?? obj.correct_option;
    const correctNum = Number(correctRaw);
    const correctOption =
      Number.isInteger(correctNum) && correctNum >= 0 && correctNum < choices.length ? correctNum : null;
    const labelsRaw = Array.isArray(obj.choiceLabels) ? obj.choiceLabels.map((x) => cleanLine(x, 20)) : [];
    const choiceLabels =
      labelsRaw.length === choices.length && labelsRaw.every(Boolean)
        ? labelsRaw
        : defaultMcqLabels(choices.length);
    return { choices, correctOption, choiceLabels };
  }
  return { choices: [], correctOption: null, choiceLabels: [] };
}

export function normaliseMatchingConfig(raw: unknown): { pairs: { left: string; right: string }[]; labelStyle: "roman" | "alpha" | "numeric" } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const pairsRaw = Array.isArray(obj.pairs) ? obj.pairs : [];
    const pairs = pairsRaw
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const pr = p as Record<string, unknown>;
        const left = cleanMultiline(pr.left, 1000);
        const right = cleanMultiline(pr.right, 1000);
        if (!left || !right) return null;
        return { left, right };
      })
      .filter((p): p is { left: string; right: string } => Boolean(p));
    const style = obj.labelStyle === "alpha" || obj.labelStyle === "numeric" ? obj.labelStyle : "roman";
    return { pairs, labelStyle: style };
  }
  return { pairs: [], labelStyle: "roman" };
}

export function normaliseStructuredParts(raw: unknown): StructuredPart[] {
  const walk = (items: unknown[], depth: number): StructuredPart[] => {
    if (depth > 3) return [];
    return items
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        const typeRaw = r.type as StructuredPartType;
        const type: StructuredPartType =
          typeRaw === "calculation" || typeRaw === "short_answer" || typeRaw === "mcq" || typeRaw === "essay"
            ? typeRaw
            : "short_answer";
        const label = cleanLine(r.label, 20) || (depth === 0 ? String.fromCharCode(65 + idx) : toRoman(idx + 1));
        const prompt = cleanMultiline(r.prompt, 5000);
        const marksNum = Number(r.marks);
        const marks = Number.isFinite(marksNum) && marksNum >= 0 ? marksNum : 0;
        const key = cleanLine(r.key, 80) || `${depth}-${idx}-${label}`;
        const childrenRaw = Array.isArray(r.children) ? r.children : [];
        const children = walk(childrenRaw, depth + 1);
        const part: StructuredPart = { key, label, prompt, marks, type, children: children.length ? children : undefined };
        if (type === "mcq") {
          const mcq = normaliseMcqConfig(r.options ?? r.mcq ?? r.choices ?? r);
          part.options = mcq.choices;
          part.correctOption = mcq.correctOption;
          part.choiceLabels = mcq.choiceLabels.length === mcq.choices.length ? mcq.choiceLabels : (mcq.choices.length <= 8 ? defaultAlphaMcqLabels(mcq.choices.length) : defaultMcqLabels(mcq.choices.length));
        }
        return part;
      })
      .filter((p): p is StructuredPart => Boolean(p));
  };
  // Accept either array of parts or {parts:[...]}
  if (Array.isArray(raw)) return walk(raw, 0);
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.parts)) return walk(obj.parts, 0);
  }
  return [];
}

export function isItemizedMcq(config: { items?: unknown[] }): boolean {
  return Array.isArray(config.items) && config.items.length > 0;
}

export function normaliseQuestionConfig(questionType: QuestionType, raw: unknown): unknown {
  if (questionType === "mcq") return normaliseMcqConfig(raw);
  if (questionType === "matching") return normaliseMatchingConfig(raw);
  if (questionType === "structured") return { parts: normaliseStructuredParts(raw) };
  return raw ?? null;
}
