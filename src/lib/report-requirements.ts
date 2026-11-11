export const REQUIREMENT_MAX_ITEMS = 20;
export const REQUIREMENT_MAX_LENGTH = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanRequirementItem(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const item = value.replace(/\s+/g, " ").trim().slice(0, REQUIREMENT_MAX_LENGTH);
  return item ? item : null;
}

export function sanitizeRequirementItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const item = cleanRequirementItem(entry);
    if (!item) continue;
    if (items.includes(item)) continue;
    items.push(item);
    if (items.length >= REQUIREMENT_MAX_ITEMS) break;
  }
  return items;
}

export function parseRequirementText(text: string): string[] {
  return sanitizeRequirementItems(text.split(/[\n,;]+/));
}

/**
 * Requirements are shared by every student report in a stream/term, so they are
 * stored as a plain list. Older saves used a per-student map; those entries are
 * merged into a single list so no data is lost.
 */
export function sanitizeRequirementList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return sanitizeRequirementItems(value);
  if (typeof value !== "object") return null;

  const legacy = Object.entries(value as Record<string, unknown>)
    .filter(([studentId]) => UUID_PATTERN.test(studentId))
    .flatMap(([, rawItems]) => (Array.isArray(rawItems) ? rawItems : []));
  return sanitizeRequirementItems(legacy);
}
