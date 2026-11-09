/* ============================================================
   Timetable — independent hard-rule validator
   ------------------------------------------------------------
   Checks every hard constraint (spec §3.1) on any saved or
   generated timetable. It intentionally shares only the pure
   slot-index helpers with the solver, so a solver bug cannot
   hide a clash.
   ============================================================ */

import {
  DAY_NAMES,
  buildSlotIndex,
  normalizeRules,
  type SolverInput,
  type SolverLesson,
} from "./timetable";

export interface ValidationIssue {
  code:
    | "unknown-class"
    | "unknown-slot"
    | "slot-not-open"
    | "no-adjacent-slot"
    | "class-clash"
    | "teacher-clash"
    | "teacher-unavailable"
    | "teacher-consecutive"
    | "teacher-class-repeat"
    | "teacher-daily-limit"
    | "locked-moved";
  message: string;
  lesson?: SolverLesson;
}

export interface ValidateOptions {
  /** Lessons that must remain exactly where they are (used after generation). */
  locked?: SolverLesson[];
  labels?: {
    class?: (id: string) => string;
    teacher?: (id: string) => string;
    subject?: (id: string) => string;
    slot?: (id: string) => string;
  };
}

export function validateTimetable(
  input: SolverInput,
  lessons: SolverLesson[],
  options: ValidateOptions = {},
): ValidationIssue[] {
  const index = buildSlotIndex(input);
  const rules = normalizeRules(input.rules);
  const issues: ValidationIssue[] = [];
  const classIds = new Set(input.classes.map((cls) => cls.id));

  const unavailable = new Set<string>();
  for (const entry of input.teacherUnavailable ?? []) {
    for (const slotId of entry.slotIds) unavailable.add(`${entry.teacherId}|${slotId}`);
  }

  const classCells = new Map<string, SolverLesson>();
  const teacherCells = new Map<string, SolverLesson>();
  const teacherGids = new Map<string, Set<number>>();
  const teacherClassDay = new Map<string, number>();

  const className = (id: string) => options.labels?.class?.(id) ?? id;
  const teacherName = (id: string) => options.labels?.teacher?.(id) ?? id;
  const subjectName = (id: string) => options.labels?.subject?.(id) ?? id;
  const slotName = (id: string) => options.labels?.slot?.(id) ?? id;

  for (const lesson of lessons) {
    if (!classIds.has(lesson.classId)) {
      issues.push({ code: "unknown-class", message: `Unknown class ${className(lesson.classId)}.`, lesson });
      continue;
    }
    const gid = index.gidOf.get(lesson.slotId);
    if (gid === undefined) {
      issues.push({ code: "unknown-slot", message: `Unknown slot ${slotName(lesson.slotId)}.`, lesson });
      continue;
    }
    const anchor = index.slotOf[gid];
    const cells: number[] = [gid];
    if (lesson.size === 2) {
      const next = index.nextOf.get(lesson.classId)?.get(gid);
      if (next === undefined) {
        issues.push({
          code: "no-adjacent-slot",
          message: `${className(lesson.classId)} · ${subjectName(lesson.subjectId)} is a double but there is no adjacent lesson slot after ${slotName(lesson.slotId)}.`,
          lesson,
        });
      } else {
        cells.push(next);
      }
    }

    for (const cell of cells) {
      const slot = index.slotOf[cell];
      if (!index.classOpen(lesson.classId, slot)) {
        issues.push({
          code: "slot-not-open",
          message: `${className(lesson.classId)} · ${subjectName(lesson.subjectId)} is placed in a slot that is not a lesson slot for that class (${slot.label ?? slotName(slot.id)}).`,
          lesson,
        });
      }
    }

    for (const cell of cells) {
      const slot = index.slotOf[cell];
      if (unavailable.has(`${lesson.teacherId}|${slot.id}`)) {
        issues.push({
          code: "teacher-unavailable",
          message: `${teacherName(lesson.teacherId)} is marked unavailable at ${slotName(slot.id)}.`,
          lesson,
        });
      }
    }

    for (const cell of cells) {
      const key = `${lesson.classId}|${cell}`;
      const existing = classCells.get(key);
      if (existing) {
        issues.push({
          code: "class-clash",
          message: `${className(lesson.classId)} has two lessons at ${slotName(index.slotOf[cell].id)} (${subjectName(existing.subjectId)} and ${subjectName(lesson.subjectId)}).`,
          lesson,
        });
      } else {
        classCells.set(key, lesson);
      }
    }

    for (const cell of cells) {
      const key = `${lesson.teacherId}|${cell}`;
      const existing = teacherCells.get(key);
      if (existing) {
        issues.push({
          code: "teacher-clash",
          message: `${teacherName(lesson.teacherId)} is in two classes at ${slotName(index.slotOf[cell].id)} (${className(existing.classId)} and ${className(lesson.classId)}).`,
          lesson,
        });
      } else {
        teacherCells.set(key, lesson);
      }
      const set = teacherGids.get(lesson.teacherId) ?? new Set<number>();
      set.add(cell);
      teacherGids.set(lesson.teacherId, set);
    }

    const day = anchor.day;
    const repeatKey = `${lesson.teacherId}|${lesson.classId}|${day}`;
    const seen = (teacherClassDay.get(repeatKey) ?? 0) + 1;
    teacherClassDay.set(repeatKey, seen);
    if (rules.oneSessionPerTeacherClassPerDay && seen > 1) {
      issues.push({
        code: "teacher-class-repeat",
        message: `${teacherName(lesson.teacherId)} enters ${className(lesson.classId)} more than once on day ${day}.`,
        lesson,
      });
    }
  }

  // Hard rule 3.1.5 — no more than maxConsecutiveTeacher lesson slots in a run.
  for (const [teacherId, gids] of teacherGids) {
    for (const run of index.teacherRuns) {
      let streak = 0;
      for (const gid of run) {
        if (gids.has(gid)) {
          streak += 1;
          if (streak > rules.maxConsecutiveTeacher) {
            issues.push({
              code: "teacher-consecutive",
              message: `${teacherName(teacherId)} has ${streak} consecutive lessons (maximum is ${rules.maxConsecutiveTeacher}) around ${slotName(index.slotOf[gid].id)}.`,
            });
            break;
          }
        } else {
          streak = 0;
        }
      }
    }
  }

  // Optional rule — a teacher's daily periods never exceed their own limit.
  const dailyLimit = new Map(
    (input.teacherLimits ?? []).map((entry) => [entry.teacherId, entry.maxPerDay]),
  );
  for (const [teacherId, gids] of teacherGids) {
    const limit = dailyLimit.get(teacherId);
    if (limit === undefined) continue;
    const perDay = new Map<number, number>();
    for (const gid of gids) {
      const day = index.slotOf[gid]?.day;
      if (day === undefined) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    for (const [day, count] of perDay) {
      if (count > limit) {
        issues.push({
          code: "teacher-daily-limit",
          message: `${teacherName(teacherId)} has ${count} periods on ${DAY_NAMES[day - 1] ?? `day ${day}`} (maximum is ${limit}).`,
        });
      }
    }
  }

  // Hard rule 3.1.7 — locked lessons do not move.
  for (const locked of options.locked ?? []) {
    const found = lessons.some(
      (lesson) =>
        lesson.slotId === locked.slotId &&
        lesson.size === locked.size &&
        lesson.classId === locked.classId &&
        lesson.subjectId === locked.subjectId &&
        lesson.teacherId === locked.teacherId,
    );
    if (!found) {
      issues.push({
        code: "locked-moved",
        message: `A locked lesson (${className(locked.classId)} · ${subjectName(locked.subjectId)}) is no longer at ${slotName(locked.slotId)}.`,
        lesson: locked,
      });
    }
  }

  return dedupe(issues);
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
