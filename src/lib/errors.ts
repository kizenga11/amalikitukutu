// Supabase/PostgREST failures resolve with a plain object
// ({ message, details, hint, code }) rather than an Error instance, so
// `error instanceof Error` is false and the real reason gets hidden behind a
// generic "Unknown error". This helper extracts a useful message from any
// thrown value.
type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error) {
    const { details, hint } = error as Error & ErrorLike;
    const base = nonEmptyString(error.message) ?? fallback;
    const extra = nonEmptyString(hint) ?? nonEmptyString(details);
    return extra && extra !== base ? `${base} (${extra})` : base;
  }

  if (typeof error === "string") {
    return nonEmptyString(error) ?? fallback;
  }

  if (error && typeof error === "object") {
    const { message, hint, details, code } = error as ErrorLike;
    const base = nonEmptyString(message) ?? nonEmptyString(hint) ?? nonEmptyString(details);
    if (base) {
      const code_ = nonEmptyString(code);
      return code_ ? `${base} [${code_}]` : base;
    }
    const code_ = nonEmptyString(code);
    if (code_) return `Request failed [${code_}]`;
  }

  return fallback;
}
