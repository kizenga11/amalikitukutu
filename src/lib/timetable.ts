/* ============================================================
   Timetable — shared types and pure helpers
   ------------------------------------------------------------
   Used by the UI, the API routes, the TypeScript fallback solver
   and the validator. Keep this file free of React / Supabase.
   ============================================================ */

export type SlotKind = "lesson" | "break" | "special";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DaySlot {
  id: string;
  /** 1 = Monday … 6 = Saturday */
  day: number;
  position: number;
  /** "HH:MM" 24h */
  start: string;
  end: string;
  kind: SlotKind;
  label: string | null;
  /** Class (stream) ids. ["*"] means every class. */
  appliesTo: string[];
}

export interface TimetableClass {
  id: string;
  /** e.g. "IA" — Form + stream */
  label: string;
  formLevel: number;
  streamName: string;
}

export interface TimetableAssignment {
  /** `timetable_subject_periods.id` — also used as the solver assignment id. */
  id: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  periods: number;
  /** 0 none, 1 low, 2 normal, 3 high */
  priority: number;
}

export interface TimetableWeights {
  morning: number;
  adjacentDays: number;
  classGap: number;
  teacherGap: number;
}

export interface TimetableRules {
  maxConsecutiveTeacher: number;
  oneSessionPerTeacherClassPerDay: boolean;
  breaksCountAsRest: boolean;
  morningEnds: string;
  timeLimit: number;
  weights: TimetableWeights;
}

export const DEFAULT_RULES: TimetableRules = {
  maxConsecutiveTeacher: 2,
  oneSessionPerTeacherClassPerDay: true,
  breaksCountAsRest: true,
  morningEnds: "12:40",
  timeLimit: 60,
  weights: { morning: 10, adjacentDays: 3, classGap: 6, teacherGap: 4 },
};

export function normalizeRules(partial: Partial<TimetableRules> | null | undefined): TimetableRules {
  const weights = { ...DEFAULT_RULES.weights, ...(partial?.weights ?? {}) };
  return {
    maxConsecutiveTeacher: clampInt(partial?.maxConsecutiveTeacher, 1, 6, DEFAULT_RULES.maxConsecutiveTeacher),
    oneSessionPerTeacherClassPerDay:
      partial?.oneSessionPerTeacherClassPerDay ?? DEFAULT_RULES.oneSessionPerTeacherClassPerDay,
    breaksCountAsRest: partial?.breaksCountAsRest ?? DEFAULT_RULES.breaksCountAsRest,
    morningEnds: /^\d{2}:\d{2}$/.test(partial?.morningEnds ?? "") ? partial!.morningEnds! : DEFAULT_RULES.morningEnds,
    timeLimit: clampInt(partial?.timeLimit, 5, 600, DEFAULT_RULES.timeLimit),
    weights: {
      morning: clampInt(weights.morning, 0, 1000, DEFAULT_RULES.weights.morning),
      adjacentDays: clampInt(weights.adjacentDays, 0, 1000, DEFAULT_RULES.weights.adjacentDays),
      classGap: clampInt(weights.classGap, 0, 1000, DEFAULT_RULES.weights.classGap),
      teacherGap: clampInt(weights.teacherGap, 0, 1000, DEFAULT_RULES.weights.teacherGap),
    },
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ------------------------------------------------------------
   Time helpers
   ------------------------------------------------------------ */

export function timeToMinutes(value: string): number {
  const [h, m] = String(value).split(":");
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function displayTime(value: string): string {
  return String(value).slice(0, 5);
}

export function slotRangeLabel(slot: Pick<DaySlot, "start" | "end">): string {
  return `${displayTime(slot.start)} - ${displayTime(slot.end)}`;
}

/* ------------------------------------------------------------
   Splitting rule (spec §2)
   ------------------------------------------------------------ */

/** 6 → [2,2,2] · 5 → [2,2,1] · 4 → [2,2] · 3 → [2,1] · 2 → [2] · 1 → [1] · 0 → [] */
export function splitBlocks(periods: number): number[] {
  const n = Math.max(0, Math.floor(Number(periods) || 0));
  return [...Array(Math.floor(n / 2)).fill(2), ...(n % 2 ? [1] : [])];
}

export function patternLabel(periods: number): string {
  const blocks = splitBlocks(periods);
  if (blocks.length === 0) return "No periods";
  const doubles = blocks.filter((b) => b === 2).length;
  const singles = blocks.filter((b) => b === 1).length;
  const parts: string[] = [];
  if (doubles) parts.push(`${doubles} double${doubles === 1 ? "" : "s"}`);
  if (singles) parts.push(`${singles} single${singles === 1 ? "" : "s"}`);
  return parts.join(" + ");
}

/* ------------------------------------------------------------
   Solver contract (spec §9)
   ------------------------------------------------------------ */

export interface SolverInputDaySlot {
  id: string;
  start: string;
  end: string;
  kind: SlotKind;
  label?: string;
  appliesTo: string[];
}

export interface SolverInputDay {
  id: number;
  slots: SolverInputDaySlot[];
}

export interface SolverInputAssignment {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  periods: number;
}

export interface SolverLockedLesson {
  assignmentId: string;
  slotId: string;
  size: 1 | 2;
}

export interface SolverInput {
  days: SolverInputDay[];
  classes: { id: string }[];
  assignments: SolverInputAssignment[];
  subjectPriority: Record<string, number>;
  teacherUnavailable: { teacherId: string; slotIds: string[] }[];
  /** Optional per-teacher daily maximum. Missing entry means no limit. */
  teacherLimits?: { teacherId: string; maxPerDay: number }[];
  locked: SolverLockedLesson[];
  rules: TimetableRules;
}

export interface SolverLesson {
  classId: string;
  subjectId: string;
  teacherId: string;
  day: number;
  slotId: string;
  size: 1 | 2;
  /** Not required by the wire format but very useful when persisting. */
  assignmentId?: string;
}

export type SolverStatus = "optimal" | "feasible" | "infeasible";

export interface SolverOutput {
  status: SolverStatus;
  objective: number | null;
  lessons: SolverLesson[];
  diagnostics: string[];
}

/* ------------------------------------------------------------
   Slot indexing shared by solver + validator
   ------------------------------------------------------------ */

export interface IndexedSlot extends SolverInputDaySlot {
  gid: number;
  day: number;
  position: number;
}

export interface SlotIndex {
  slots: IndexedSlot[];
  gidOf: Map<string, number>;
  slotOf: IndexedSlot[];
  /** Open lesson runs per class, as gid sequences. */
  classRuns: Map<string, number[][]>;
  /** Anchors per class and block size. */
  starts: Map<string, { 1: number[]; 2: number[] }>;
  /** gid of the next open slot for a class (only valid inside the same run). */
  nextOf: Map<string, Map<number, number>>;
  teacherRuns: number[][];
  /** gid → its position inside a teacher run (used for consecutive checks). */
  teacherRunAt: Map<number, { run: number[]; pos: number }>;
  classOpen: (classId: string, slot: IndexedSlot) => boolean;
  teacherOpen: (slot: IndexedSlot) => boolean;
}

export function classSlotOpen(classId: string, slot: Pick<DaySlot, "kind" | "appliesTo">): boolean {
  if (slot.kind === "lesson") return true;
  if (slot.kind !== "special") return false;
  const scope = slot.appliesTo ?? [];
  // No scope rows means the special period applies to every class.
  if (scope.length === 0 || scope.includes("*")) return false;
  return !scope.includes(classId);
}

export function teacherSlotOpen(slot: Pick<DaySlot, "kind" | "appliesTo">): boolean {
  if (slot.kind === "break") return false;
  if (slot.kind === "special") {
    const scope = slot.appliesTo ?? [];
    if (scope.length === 0 || scope.includes("*")) return false;
  }
  return true;
}

export function buildSlotIndex(input: SolverInput): SlotIndex {
  const slots: IndexedSlot[] = [];
  for (const day of input.days) {
    day.slots.forEach((slot, position) => {
      slots.push({ ...slot, gid: slots.length, day: day.id, position });
    });
  }
  const gidOf = new Map<string, number>();
  for (const slot of slots) gidOf.set(slot.id, slot.gid);
  const slotOf = slots;

  const classOpen = (classId: string, slot: IndexedSlot) => classSlotOpen(classId, slot);
  const teacherOpen = (slot: IndexedSlot) => teacherSlotOpen(slot);

  const classRuns = new Map<string, number[][]>();
  const starts = new Map<string, { 1: number[]; 2: number[] }>();
  const nextOf = new Map<string, Map<number, number>>();

  for (const cls of input.classes) {
    const runs: number[][] = [];
    for (const day of input.days) {
      let current: number[] = [];
      for (const gid of slots.filter((s) => s.day === day.id).map((s) => s.gid)) {
        const slot = slotOf[gid];
        if (classOpen(cls.id, slot)) {
          current.push(gid);
        } else if (current.length) {
          runs.push(current);
          current = [];
        }
      }
      if (current.length) runs.push(current);
    }
    classRuns.set(cls.id, runs);

    const nexts = new Map<number, number>();
    const all: number[] = [];
    const doubles: number[] = [];
    for (const run of runs) {
      for (let i = 0; i < run.length; i += 1) {
        all.push(run[i]);
        if (i + 1 < run.length) {
          doubles.push(run[i]);
          nexts.set(run[i], run[i + 1]);
        }
      }
    }
    starts.set(cls.id, { 1: all, 2: doubles });
    nextOf.set(cls.id, nexts);
  }

  const teacherRuns: number[][] = [];
  const teacherRunAt = new Map<number, { run: number[]; pos: number }>();
  for (const day of input.days) {
    let current: number[] = [];
    for (const gid of slots.filter((s) => s.day === day.id).map((s) => s.gid)) {
      if (teacherOpen(slotOf[gid])) current.push(gid);
      else if (current.length) {
        teacherRuns.push(current);
        current = [];
      }
    }
    if (current.length) teacherRuns.push(current);
  }
  teacherRuns.forEach((run) => {
    run.forEach((gid, pos) => teacherRunAt.set(gid, { run, pos }));
  });

  return { slots, gidOf, slotOf, classRuns, starts, nextOf, teacherRuns, teacherRunAt, classOpen, teacherOpen };
}

/* ------------------------------------------------------------
   Pre-checks (spec §4)
   ------------------------------------------------------------ */

export interface TimetableLabels {
  class?: (id: string) => string;
  teacher?: (id: string) => string;
  subject?: (id: string) => string;
  slot?: (id: string) => string;
}

export function precheck(input: SolverInput, labels: TimetableLabels = {}): string[] {
  const issues: string[] = [];
  const index = buildSlotIndex(input);
  const rules = normalizeRules(input.rules);
  const days = input.days.length;
  const className = (id: string) => labels.class?.(id) ?? id;
  const teacherName = (id: string) => labels.teacher?.(id) ?? id;
  const subjectName = (id: string) => labels.subject?.(id) ?? id;

  const perClass = new Map<string, number>();
  const perTeacher = new Map<string, number>();
  const perTeacherClass = new Map<string, number>();

  for (const assignment of input.assignments) {
    perClass.set(assignment.classId, (perClass.get(assignment.classId) ?? 0) + assignment.periods);
    perTeacher.set(assignment.teacherId, (perTeacher.get(assignment.teacherId) ?? 0) + assignment.periods);
    const key = `${assignment.teacherId}|${assignment.classId}`;
    perTeacherClass.set(key, (perTeacherClass.get(key) ?? 0) + splitBlocks(assignment.periods).length);
  }

  for (const cls of input.classes) {
    const assigned = perClass.get(cls.id) ?? 0;
    const capacity = index.starts.get(cls.id)?.[1].length ?? 0;
    if (assigned > capacity) {
      issues.push(
        `${className(cls.id)}: ${assigned} periods assigned but only ${capacity} lesson slots are available per week.`,
      );
    }
  }

  if (rules.oneSessionPerTeacherClassPerDay) {
    for (const [key, sessions] of perTeacherClass) {
      const [teacherId, classId] = key.split("|");
      if (sessions > days) {
        issues.push(
          `${teacherName(teacherId)} needs ${sessions} separate sessions in ${className(classId)} but there are only ${days} days.`,
        );
      }
    }
  }

  const openSlots = new Set<number>();
  for (const entry of index.starts.values()) {
    for (const gid of entry[1]) openSlots.add(gid);
  }
  for (const [teacherId, periods] of perTeacher) {
    if (periods > openSlots.size) {
      issues.push(
        `${teacherName(teacherId)}: ${periods} periods scheduled but only ${openSlots.size} lesson slots exist in the week.`,
      );
    }
  }

  const teacherLimits = new Map(
    (input.teacherLimits ?? []).map((entry) => [entry.teacherId, entry.maxPerDay]),
  );
  for (const [teacherId, periods] of perTeacher) {
    const limit = teacherLimits.get(teacherId);
    if (limit !== undefined && periods > limit * days) {
      issues.push(
        `${teacherName(teacherId)}: ${periods} periods scheduled but the daily maximum is ${limit} over ${days} days.`,
      );
    }
  }

  for (const assignment of input.assignments) {
    for (const size of splitBlocks(assignment.periods)) {
      const anchors = index.starts.get(assignment.classId)?.[size === 2 ? 2 : 1] ?? [];
      if (anchors.length === 0) {
        issues.push(
          `${className(assignment.classId)}: ${subjectName(assignment.subjectId)} needs a ${size === 2 ? "double" : "single"} but the class has no ${size === 2 ? "adjacent lesson pair" : "lesson slot"}.`,
        );
        break;
      }
    }
  }

  return issues;
}

/* ------------------------------------------------------------
   DB row mapping helpers
   ------------------------------------------------------------ */

export function dayLabel(day: number): string {
  return DAY_NAMES[day - 1] ?? `Day ${day}`;
}

export function priorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "Low";
    case 2:
      return "Normal";
    case 3:
      return "High";
    default:
      return "None";
  }
}

/** Serialise rules into the key/value rows stored in `timetable_rules`. */
export function ruleRowsFrom(rules: TimetableRules): { key: string; value_json: unknown }[] {
  return [
    { key: "maxConsecutiveTeacher", value_json: { value: rules.maxConsecutiveTeacher } },
    { key: "oneSessionPerTeacherClassPerDay", value_json: { value: rules.oneSessionPerTeacherClassPerDay } },
    { key: "breaksCountAsRest", value_json: { value: rules.breaksCountAsRest } },
    { key: "morningEnds", value_json: { value: rules.morningEnds } },
    { key: "timeLimit", value_json: { value: rules.timeLimit } },
    { key: "weights", value_json: rules.weights },
  ];
}
