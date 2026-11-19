import { describe, expect, it } from "vitest";
import {
  DEADLINE_WARNING_MS,
  formatTimeLeft,
  remainingMs,
} from "./deadline-countdown";

const NOW = new Date("2026-11-19T10:00:00.000Z").getTime();

describe("remainingMs", () => {
  it("counts down towards the deadline", () => {
    expect(remainingMs("2026-11-19T12:30:00.000Z", NOW)).toBe(2.5 * 60 * 60 * 1000);
  });

  it("goes negative once the deadline has passed", () => {
    expect(remainingMs("2026-11-19T09:00:00.000Z", NOW)).toBe(-60 * 60 * 1000);
  });

  it("ignores missing or invalid deadlines", () => {
    expect(remainingMs(null, NOW)).toBeNull();
    expect(remainingMs(undefined, NOW)).toBeNull();
    expect(remainingMs("not a date", NOW)).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it("uses the 24 hour warning window", () => {
    expect(DEADLINE_WARNING_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("shows hours and minutes inside the warning window", () => {
    expect(formatTimeLeft(12 * 60 * 60 * 1000 + 34 * 60 * 1000)).toBe("Inabaki 12h 34m");
  });

  it("shows minutes and seconds as time runs out", () => {
    expect(formatTimeLeft(5 * 60 * 1000 + 9 * 1000)).toBe("Inabaki 5m 9s");
    expect(formatTimeLeft(9 * 1000)).toBe("Inabaki 9s");
  });

  it("handles longer spans and passed deadlines", () => {
    expect(formatTimeLeft(50 * 60 * 60 * 1000)).toBe("Inabaki 2d 2h");
    expect(formatTimeLeft(0)).toBe("Muda umepita");
    expect(formatTimeLeft(-1000)).toBe("Muda umepita");
  });
});
