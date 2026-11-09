import { describe, expect, it } from "vitest";
import {
  buildSlotIndex,
  normalizeRules,
  patternLabel,
  splitBlocks,
  type SolverInput,
  type SolverLesson,
} from "./timetable";
import { validateTimetable } from "./timetable-validator";
import { solveTimetable } from "./timetable-solver";

function sampleInput(): SolverInput {
  return {
    days: [
      {
        id: 1,
        slots: [
          { id: "MON-1", start: "07:30", end: "08:10", kind: "lesson", appliesTo: ["*"] },
          { id: "MON-2", start: "08:10", end: "08:40", kind: "lesson", appliesTo: ["*"] },
          { id: "MON-3", start: "08:40", end: "09:20", kind: "lesson", appliesTo: ["*"] },
          { id: "MON-4", start: "09:30", end: "10:10", kind: "lesson", appliesTo: ["*"] },
          { id: "MON-T", start: "10:10", end: "10:40", kind: "break", label: "TEA BREAK", appliesTo: ["*"] },
        ],
      },
    ],
    classes: [{ id: "IA" }, { id: "IB" }],
    assignments: [
      { id: "a1", classId: "IA", subjectId: "MATH", teacherId: "Joyce", periods: 2 },
      { id: "a2", classId: "IB", subjectId: "MATH", teacherId: "Kaiza", periods: 2 },
      { id: "a3", classId: "IA", subjectId: "ENG", teacherId: "Makinda", periods: 1 },
      { id: "a4", classId: "IB", subjectId: "ENG", teacherId: "Makinda", periods: 1 },
    ],
    subjectPriority: { MATH: 3, ENG: 3 },
    teacherUnavailable: [],
    locked: [],
    rules: normalizeRules({}),
  };
}

describe("splitBlocks", () => {
  it("follows the splitting rule for 6..1", () => {
    expect(splitBlocks(6)).toEqual([2, 2, 2]);
    expect(splitBlocks(5)).toEqual([2, 2, 1]);
    expect(splitBlocks(4)).toEqual([2, 2]);
    expect(splitBlocks(3)).toEqual([2, 1]);
    expect(splitBlocks(2)).toEqual([2]);
    expect(splitBlocks(1)).toEqual([1]);
  });

  it("labels patterns", () => {
    expect(patternLabel(5)).toBe("2 doubles + 1 single");
    expect(patternLabel(4)).toBe("2 doubles");
  });
});

describe("slot index", () => {
  it("only allows doubles inside one open run", () => {
    const index = buildSlotIndex(sampleInput());
    expect(index.starts.get("IA")?.[1]).toEqual([0, 1, 2, 3]);
    expect(index.starts.get("IA")?.[2]).toEqual([0, 1, 2]);
  });

  it("closes special slots for the classes they apply to", () => {
    const input = sampleInput();
    input.days[0].slots.push({
      id: "MON-S",
      start: "09:20",
      end: "09:30",
      kind: "special",
      label: "ASSEMBLY",
      appliesTo: ["IA"],
    });
    const index = buildSlotIndex(input);
    expect(index.classOpen("IA", index.slotOf[5])).toBe(false);
    expect(index.classOpen("IB", index.slotOf[5])).toBe(true);
  });
});

describe("solver + validator", () => {
  it("solves the sample input with no clashes", () => {
    const input = sampleInput();
    const result = solveTimetable(input, { timeLimitMs: 5000 });
    expect(result.status).toBe("feasible");
    const issues = validateTimetable(input, result.lessons);
    expect(issues).toEqual([]);
  });

  it("keeps locked lessons in place", () => {
    const input = sampleInput();
    const first = solveTimetable(input, { timeLimitMs: 5000 });
    const locked = first.lessons.find((lesson) => lesson.assignmentId === "a1");
    expect(locked).toBeTruthy();
    input.locked = [{ assignmentId: "a1", slotId: locked!.slotId, size: locked!.size }];

    const second = solveTimetable(input, { timeLimitMs: 5000 });
    expect(second.status).toBe("feasible");
    const again = second.lessons.find((lesson) => lesson.assignmentId === "a1");
    expect(again?.slotId).toBe(locked!.slotId);
    expect(validateTimetable(input, second.lessons, { locked: second.lessons.filter((l) => l.assignmentId === "a1") })).toEqual([]);
  });

  it("detects a class clash and a teacher clash", () => {
    const input = sampleInput();
    const lessons: SolverLesson[] = [
      { classId: "IA", subjectId: "MATH", teacherId: "Joyce", day: 1, slotId: "MON-1", size: 1 },
      { classId: "IA", subjectId: "ENG", teacherId: "Makinda", day: 1, slotId: "MON-1", size: 1 },
      { classId: "IB", subjectId: "ENG", teacherId: "Makinda", day: 1, slotId: "MON-1", size: 1 },
    ];
    const issues = validateTimetable(input, lessons);
    expect(issues.some((issue) => issue.code === "class-clash")).toBe(true);
    expect(issues.some((issue) => issue.code === "teacher-clash")).toBe(true);
  });

  it("rejects a double that has no adjacent slot", () => {
    const input = sampleInput();
    const lessons: SolverLesson[] = [
      { classId: "IA", subjectId: "MATH", teacherId: "Joyce", day: 1, slotId: "MON-4", size: 2 },
    ];
    const issues = validateTimetable(input, lessons);
    expect(issues.some((issue) => issue.code === "no-adjacent-slot")).toBe(true);
  });

  it("honours an optional teacher daily maximum", () => {
    const input = sampleInput();
    input.teacherLimits = [{ teacherId: "Makinda", maxPerDay: 1 }];
    const result = solveTimetable(input, { timeLimitMs: 3000 });
    expect(result.status).toBe("infeasible");
  });

  it("detects a teacher over the daily maximum", () => {
    const input = sampleInput();
    input.teacherLimits = [{ teacherId: "Makinda", maxPerDay: 1 }];
    const lessons: SolverLesson[] = [
      { classId: "IA", subjectId: "ENG", teacherId: "Makinda", day: 1, slotId: "MON-1", size: 1 },
      { classId: "IB", subjectId: "ENG", teacherId: "Makinda", day: 1, slotId: "MON-2", size: 1 },
    ];
    const issues = validateTimetable(input, lessons);
    expect(issues.some((issue) => issue.code === "teacher-daily-limit")).toBe(true);
  });
});
