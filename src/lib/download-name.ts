export function fileNamePart(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 80);
}

export function yearFromDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return String(date.getFullYear());
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

export function buildDownloadName(
  parts: Array<string | null | undefined>,
  fallback = "document",
): string {
  const clean = parts.map((part) => fileNamePart(part)).filter(Boolean);
  return clean.length > 0 ? clean.join(" - ") : fallback;
}

export function printWithFileName(fileName: string, print: () => void = () => window.print()): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const previous = document.title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  document.title = fileName;

  try {
    print();
  } finally {
    window.setTimeout(restore, 1000);
  }
}
