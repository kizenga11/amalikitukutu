import type { SupabaseClient } from "@supabase/supabase-js";
import { currentYearId } from "@/lib/calendar";

/** Turn any stored academic-year value into a safe four-digit id. */
export function normalizeYear(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}$/.test(text) ? text : currentYearId;
}

/** Academic year the portal is currently showing. */
export async function loadActiveYearId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("academic_settings")
    .select("key, value")
    .in("key", ["active_year"]);
  if (error) return currentYearId;

  const row = (data ?? []).find((item) => item.key === "active_year");
  return normalizeYear(row?.value);
}

/** The year an exam belongs to, taken from its start date. */
export function examYearOf(date: string | null | undefined): string {
  const year = typeof date === "string" ? date.slice(0, 4) : "";
  return /^\d{4}$/.test(year) ? year : currentYearId;
}

export function yearRange(year: string): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` };
}

/**
 * PostgREST `or` filter for exam rosters: active students plus students who
 * graduated in (or after) the exam year. A 2026 graduate still belongs in the
 * 2026 results but must not appear in 2027 mark-entry sheets.
 */
export function studentsForExamYearFilter(examYear: string): string {
  return `status.eq.Active,and(status.eq.Graduated,graduated_year.gte.${examYear})`;
}
