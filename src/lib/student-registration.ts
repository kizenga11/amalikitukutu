// Registration numbers are stored without the year a student joined
// (e.g. S7811/0020), but many students type the year too
// (e.g. S7811/0020/2026). These helpers keep both forms working.
// Kept dependency-free so they can be unit tested without the Supabase env.

export function normaliseRegistrationNo(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 40) : "";
}

// Only a four-digit entry year (1900-2099) counts as a suffix. Anything else
// is left untouched, so a real registration number is never altered.
const ENTRY_YEAR_SUFFIX = /\/(?:19|20)\d{2}$/;

/**
 * The registration exactly as typed first, followed by the same number without
 * a trailing /YYYY. Callers try each variant in order, so the plain form keeps
 * working even if a future registration really ends in a year.
 */
export function registrationVariants(value: unknown): string[] {
  const registration = normaliseRegistrationNo(value);
  if (!registration) return [];

  const variants = [registration];
  if (ENTRY_YEAR_SUFFIX.test(registration)) {
    const withoutYear = registration.replace(ENTRY_YEAR_SUFFIX, "").trim();
    if (withoutYear) variants.push(withoutYear);
  }
  return variants;
}
