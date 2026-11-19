// Dependency-free helpers for the student assignment deadline countdown.
// Kept separate from React so the time maths can be unit tested.

/** The live countdown appears once the deadline is inside 24 hours. */
export const DEADLINE_WARNING_MS = 24 * 60 * 60 * 1000;

export function remainingMs(
  deadline: string | null | undefined,
  nowMs: number,
): number | null {
  if (!deadline) return null;
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return null;
  return deadlineMs - nowMs;
}

/** Short Swahili label that fits on a phone. */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Muda umepita";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Inabaki ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `Inabaki ${hours}h ${minutes}m`;
  if (minutes > 0) return `Inabaki ${minutes}m ${seconds}s`;
  return `Inabaki ${seconds}s`;
}
