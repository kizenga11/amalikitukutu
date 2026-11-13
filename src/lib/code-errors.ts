// Dependency-free helpers for the C++ IDE.
// Used by both the browser (Monaco markers) and the server (answer storage),
// so this module must never import Node-only APIs.

export type CodeSeverity = "error" | "warning" | "note";

export interface CodeDiagnostic {
  /** File name as printed by g++, e.g. "main.cpp". */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number (0 when g++ did not print one). */
  column: number;
  severity: CodeSeverity;
  message: string;
}

/** Matches "main.cpp:5:7: error: message" and "main.cpp:5: error: message". */
const DIAGNOSTIC_LINE =
  /^(.*?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.*)$/i;

/**
 * Parses g++ / clang style compiler output into structured diagnostics.
 * Lines that are not diagnostics (source excerpts, "In function…", etc.)
 * are ignored so the editor only receives real markers.
 */
export function parseCompilerDiagnostics(output: string): CodeDiagnostic[] {
  if (!output) return [];
  const diagnostics: CodeDiagnostic[] = [];
  const seen = new Set<string>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = DIAGNOSTIC_LINE.exec(line);
    if (!match) continue;

    const file = match[1].trim() || "main.cpp";
    const lineNumber = Number(match[2]);
    const column = match[3] ? Number(match[3]) : 0;
    if (!Number.isFinite(lineNumber) || lineNumber < 1) continue;

    const rawSeverity = match[4].toLowerCase();
    const severity: CodeSeverity =
      rawSeverity === "warning" ? "warning" : rawSeverity === "note" ? "note" : "error";
    const message = match[5].trim();
    if (!message) continue;

    // g++ can repeat the same diagnostic; keep the editor clean.
    const key = `${file}:${lineNumber}:${column}:${severity}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);

    diagnostics.push({ file, line: lineNumber, column, severity, message });
  }

  return diagnostics;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function unescapeHtml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|#x27|apos);/gi, (entity) => {
    return HTML_UNESCAPES[entity.toLowerCase()] ?? entity;
  });
}

/**
 * Turns raw C++ code into the sanitised rich-text HTML the assignment
 * answers table already accepts. Newlines inside <pre> are preserved.
 */
export function codeToAnswerHtml(code: string): string {
  const clean = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `<pre><code>${escapeHtml(clean)}</code></pre>`;
}

/**
 * Recovers code from a saved answer. Prefers the <pre><code> block the IDE
 * writes, but also tolerates plain rich text so switching modes is safe.
 */
export function codeFromAnswerHtml(html: string): string {
  if (!html) return "";
  const match = html.match(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/i);
  const body = match
    ? match[1]
    : html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, "\n")
        .replace(/<[^>]*>/g, "");
  const decoded = unescapeHtml(body).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return match ? decoded : decoded.replace(/\n+$/, "");
}

/** Judge0 counts bytes, not characters. TextEncoder exists in Node and browsers. */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
