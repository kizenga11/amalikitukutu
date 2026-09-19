import { academicYears, currentTerm, currentYearId, type TermNumber } from "@/lib/calendar";

export type StoredPeriod = { yearId: string; term: TermNumber };

const PERIOD_KEY = "period";

function isValidPeriod(value: unknown): value is StoredPeriod {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.yearId !== "string") return false;
  if (candidate.term !== 1 && candidate.term !== 2) return false;
  return academicYears.some((year) => year.id === candidate.yearId);
}

export function defaultPeriod(): StoredPeriod {
  return { yearId: currentYearId, term: currentTerm };
}

export function readStoredPeriod(): StoredPeriod {
  if (typeof window === "undefined") return defaultPeriod();
  try {
    const raw = window.localStorage.getItem(PERIOD_KEY);
    if (!raw) return defaultPeriod();
    const parsed = JSON.parse(raw) as unknown;
    return isValidPeriod(parsed) ? parsed : defaultPeriod();
  } catch {
    return defaultPeriod();
  }
}

export function writeStoredPeriod(period: StoredPeriod): void {
  if (typeof window === "undefined") return;
  try {
    if (!isValidPeriod(period)) return;
    window.localStorage.setItem(PERIOD_KEY, JSON.stringify(period));
  } catch {
    // Ignore storage write failures when the browser blocks local storage.
  }
}

export function readStoredJson<T>(key: string, fallback: T, validator: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return validator(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failures when the browser blocks local storage.
  }
}
