// Shared types and helpers for the study-notes feature.
// Safe for both client and server.

export interface NoteContext {
  teachingAssignmentId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  classId: string;
  className: string;
  streamId: string;
  streamName: string;
  formLevel: number;
  teacherId: string;
  teacherName: string;
}

export interface NoteTopic {
  id: string;
  teachingAssignmentId: string;
  title: string;
  subtopicCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  context: NoteContext | null;
}

export interface NoteImage {
  id: string;
  subtopicId: string;
  position: number;
  caption: string | null;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  url: string | null;
}

export interface NoteSubtopic {
  id: string;
  topicId: string;
  position: number;
  title: string;
  note: StudyNote | null;
  images: NoteImage[];
}

export interface StudyNote {
  id: string;
  subtopicId: string;
  title: string;
  description: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  contentHtml: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTopicDetail extends NoteTopic {
  subtopics: NoteSubtopic[];
}

export interface NoteAudienceRow {
  studentId: string;
  registrationNo: string | null;
  fullName: string;
  hasViewed: boolean;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  downloadCount: number;
}

export interface StudentNoteView {
  id: string;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  kind: "pdf" | "text";
  contentHtml?: string | null;
}

export interface StudentSubtopicView {
  id: string;
  position: number;
  title: string;
  note: StudentNoteView | null;
  images: NoteImage[];
}

export interface StudentTopicView {
  id: string;
  title: string;
  teachingAssignmentId: string;
  subjectName: string;
  subjectCode: string;
  className: string;
  streamName: string;
  teacherName: string;
  subtopics: StudentSubtopicView[];
}

export const MAX_NOTE_PDF_BYTES = 2 * 1024 * 1024;
export const MAX_NOTE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_IMAGE_CAPTION = 300;

const NOTE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const NOTE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

export function isPdfFile(file: { type?: string; name?: string; size?: number }): boolean {
  const typeOk = file.type === "application/pdf";
  const nameOk = typeof file.name === "string" && file.name.toLowerCase().endsWith(".pdf");
  const sizeOk = typeof file.size !== "number" || (file.size > 0 && file.size <= MAX_NOTE_PDF_BYTES);
  return (typeOk || nameOk) && sizeOk;
}

export function isNoteImageFile(file: { type?: string; name?: string; size?: number }): boolean {
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const typeOk = NOTE_IMAGE_MIME_TYPES.includes(type) || type === "image/jpg";
  const nameOk = NOTE_IMAGE_EXTENSIONS.some((ext) => name.endsWith(`.${ext}`));
  const sizeOk = typeof file.size !== "number" || (file.size > 0 && file.size <= MAX_NOTE_IMAGE_BYTES);
  return (typeOk || nameOk) && sizeOk;
}

export function noteImageExtension(file: { type?: string; name?: string }): string {
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const dot = name.lastIndexOf(".");
  const fromName = dot >= 0 ? name.slice(dot + 1) : "";
  if (NOTE_IMAGE_EXTENSIONS.includes(fromName)) return fromName === "jpg" ? "jpeg" : fromName;
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpeg";
}

export function noteImageContentType(file: { type?: string; name?: string }): string {
  const ext = noteImageExtension(file);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function cleanNoteTitle(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanNoteCaption(value: unknown, max = MAX_NOTE_IMAGE_CAPTION): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function noteKind(note: { filePath?: string | null; contentHtml?: string | null } | null | undefined): "pdf" | "text" | null {
  if (!note) return null;
  if (note.filePath) return "pdf";
  if (typeof note.contentHtml === "string" && note.contentHtml.trim()) return "text";
  return null;
}

export function sanitizeNoteHtml(input: unknown, max = 200_000): string {
  if (typeof input !== "string") return "";
  let html = input.slice(0, max);
  // remove dangerous blocks
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*\/?\s*>/gi, "");
  // drop event handlers and dangerous urls
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, ' $1="#"');
  // strip style attributes with expression/url risks minimally
  html = html.replace(/\sstyle\s*=\s*("\s*[^"]*expression\([^"]*"|'\s*[^']*expression\([^']*')/gi, "");
  return html.trim();
}

export function noteHtmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const NOTE_BLOCK_TAG_RE =
  /<\s*(?:p|div|br|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|ul|ol|li|h[1-6]|blockquote|pre|img|figure|figcaption|hr|section|article)\b/i;

/**
 * Keeps rich HTML as-is, but converts bare newlines to <br> when the note is
 * plain text (or inline-only HTML). Without this, browsers collapse newlines
 * and a note that looked well spaced in the teacher editor becomes one block
 * for the student.
 */
export function normalizeNoteHtml(input: unknown): string {
  if (typeof input !== "string") return "";
  const html = input.trim();
  if (!html) return "";
  if (NOTE_BLOCK_TAG_RE.test(html)) return html;
  return html.replace(/\r\n?/g, "\n").replace(/\n/g, "<br/>");
}
