/* ============================================================
   Timetable — TypeScript fallback solver
   ------------------------------------------------------------
   The production solver is the Python OR-Tools service reached
   through SOLVER_URL. When that service is not configured (for
   example during local development) this file provides a
   dependency-free constraint-search solver with the same JSON
   contract. It honours every hard rule and approximates the
   weighted soft rules.
   ============================================================ */

import {
  buildSlotIndex,
  normalizeRules,
  splitBlocks,
  timeToMinutes,
  type SolverInput,
  type SolverLesson,
  type SolverOutput,
} from "./timetable";

interface Block {
  /** Position in the global block array (used as map key). */
  ref: number;
  key: string;
  assignmentId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  size: 1 | 2;
  priority: number;
  candidates: number[];
  forced: number | null;
}

interface SolveOptions {
  /** Wall-clock budget for the search. Defaults to rules.timeLimit seconds. */
  timeLimitMs?: number;
  seed?: number;
}

export function solveTimetable(input: SolverInput, options: SolveOptions = {}): SolverOutput {
  const rules = normalizeRules(input.rules);
  const index = buildSlotIndex(input);
  const deadline = Date.now() + (options.timeLimitMs ?? Math.max(5, rules.timeLimit) * 1000);

  if (input.assignments.length === 0) {
    return {
      status: "feasible",
      objective: 0,
      lessons: [],
      diagnostics: ["No subject periods configured, so there is nothing to place."],
    };
  }

  const unavailable = new Set<string>();
  for (const entry of input.teacherUnavailable ?? []) {
    for (const slotId of entry.slotIds) unavailable.add(`${entry.teacherId}|${slotId}`);
  }

  const dailyLimit = new Map<string, number>();
  for (const entry of input.teacherLimits ?? []) {
    if (entry.maxPerDay > 0) dailyLimit.set(entry.teacherId, entry.maxPerDay);
  }

  const blocks: Block[] = [];
  const byAssignment = new Map<string, number[]>();

  for (const assignment of input.assignments) {
    const pattern = splitBlocks(assignment.periods);
    pattern.forEach((size, indexInAssignment) => {
      const blockSize: 1 | 2 = size === 2 ? 2 : 1;
      const anchors = index.starts.get(assignment.classId)?.[blockSize === 2 ? 2 : 1] ?? [];
      const candidates = anchors.filter((anchor) => {
        const cells = cellsOf(index, assignment.classId, anchor, blockSize);
        if (!cells) return false;
        return cells.every((gid) => !unavailable.has(`${assignment.teacherId}|${index.slotOf[gid].id}`));
      });
      const ref = blocks.length;
      blocks.push({
        ref,
        key: `${assignment.id}#${indexInAssignment}`,
        assignmentId: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        size: blockSize,
        priority: input.subjectPriority?.[assignment.subjectId] ?? 0,
        candidates,
        forced: null,
      });
      byAssignment.set(assignment.id, [...(byAssignment.get(assignment.id) ?? []), ref]);
    });
  }

  // Map locked lessons to concrete blocks.
  for (const locked of input.locked ?? []) {
    const refs = byAssignment.get(locked.assignmentId) ?? [];
    const ref = refs.find((candidate) => blocks[candidate].forced === null && blocks[candidate].size === locked.size);
    if (ref === undefined) continue;
    const gid = index.gidOf.get(locked.slotId);
    if (gid === undefined || !blocks[ref].candidates.includes(gid)) {
      return {
        status: "infeasible",
        objective: null,
        lessons: [],
        diagnostics: [
          `A locked lesson cannot be placed at slot ${locked.slotId}. Unlock it or restore the slot.`,
        ],
      };
    }
    blocks[ref].forced = gid;
  }

  const forcedBlocks = blocks.filter((block) => block.forced !== null);
  const rest = blocks.filter((block) => block.forced === null);
  const seed = options.seed ?? 1;
  let attempt = 0;

  while (Date.now() < deadline) {
    const rng = mulberry32(seed + attempt * 7919);
    const order = orderBlocks(rest, rng);
    const state = newSearchState();
    const assignment = new Map<number, number>();
    let conflict = false;

    for (const block of forcedBlocks) {
      const anchor = block.forced!;
      if (!canPlace(block, anchor, state, index, rules, dailyLimit)) {
        conflict = true;
        break;
      }
      place(block, anchor, state, index);
      assignment.set(block.ref, anchor);
    }
    if (conflict) {
      return {
        status: "infeasible",
        objective: null,
        lessons: [],
        diagnostics: ["Two locked lessons overlap on the same class or teacher. Unlock one of them."],
      };
    }

    let nodes = attempt === 0 ? 150_000 : 60_000;
    const found = search(order, state, assignment, index, rules, dailyLimit, deadline, rng, () => nodes-- > 0);
    if (found) {
      const lessons = toLessons(blocks, assignment, index);
      return {
        status: "feasible",
        objective: scoreSolution(input, lessons),
        lessons,
        diagnostics: [],
      };
    }
    attempt += 1;
  }

  return {
    status: "infeasible",
    objective: null,
    lessons: [],
    diagnostics: [
      "No timetable satisfies all hard rules. Relax a rule, add lesson slots, or reduce subject periods.",
    ],
  };
}

/* ------------------------------------------------------------
   Search
   ------------------------------------------------------------ */

interface SearchState {
  classUsed: Map<string, Set<number>>;
  teacherUsed: Map<string, Set<number>>;
  teacherClassDay: Map<string, number>;
}

function newSearchState(): SearchState {
  return { classUsed: new Map(), teacherUsed: new Map(), teacherClassDay: new Map() };
}

type Index = ReturnType<typeof buildSlotIndex>;
type Rules = ReturnType<typeof normalizeRules>;

function search(
  order: Block[],
  state: SearchState,
  assignment: Map<number, number>,
  index: Index,
  rules: Rules,
  dailyLimit: Map<string, number>,
  deadline: number,
  rng: () => number,
  budget: () => boolean,
): boolean {
  if (order.length === 0) return true;
  if (Date.now() > deadline) return false;
  if (!budget()) return false;

  // Most constrained first: pick the unassigned block with the fewest
  // candidates still valid in the current state.
  let chosen = -1;
  let chosenOptions: number[] | null = null;
  for (let i = 0; i < order.length; i += 1) {
    const block = order[i];
    const options = block.candidates.filter((gid) => canPlace(block, gid, state, index, rules, dailyLimit));
    if (options.length === 0) return false;
    if (chosenOptions === null || options.length < chosenOptions.length) {
      chosen = i;
      chosenOptions = options;
      if (options.length === 1) break;
    }
  }
  if (chosen < 0 || !chosenOptions) return false;

  const block = order[chosen];
  const nextOrder = order.slice(0, chosen).concat(order.slice(chosen + 1));

  const ordered = chosenOptions
    .map((gid) => ({ gid, score: candidateScore(block, gid, index, rules, rng) }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.gid);

  for (const gid of ordered) {
    place(block, gid, state, index);
    assignment.set(block.ref, gid);
    if (search(nextOrder, state, assignment, index, rules, dailyLimit, deadline, rng, budget)) return true;
    unplace(block, gid, state, index);
    assignment.delete(block.ref);
  }
  return false;
}

function orderBlocks(blocks: Block[], rng: () => number): Block[] {
  const scored = blocks.map((block) => {
    const jitter = rng();
    const harder = block.size === 2 ? 0 : 1;
    const constrained = Math.min(block.candidates.length, 200) / 1000;
    return { block, score: harder + constrained + jitter * 0.01 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry) => entry.block);
}

function candidateScore(
  block: Block,
  gid: number,
  index: Index,
  rules: Rules,
  rng: () => number,
): number {
  const cells = cellsOf(index, block.classId, gid, block.size) ?? [];
  const cutoff = timeToMinutes(rules.morningEnds);
  let score = rng() * 0.4;
  for (const cell of cells) {
    if (timeToMinutes(index.slotOf[cell].start) >= cutoff) score += block.priority * 2;
  }
  score += (index.slotOf[gid]?.position ?? 0) * 0.02;
  return score;
}

/* ------------------------------------------------------------
   Placement primitives
   ------------------------------------------------------------ */

function cellsOf(index: Index, classId: string, anchor: number, size: 1 | 2): number[] | null {
  const cells = [anchor];
  if (size === 2) {
    const next = index.nextOf.get(classId)?.get(anchor);
    if (next === undefined) return null;
    cells.push(next);
  }
  return cells;
}

function canPlace(
  block: Block,
  anchor: number,
  state: SearchState,
  index: Index,
  rules: Rules,
  dailyLimit: Map<string, number>,
): boolean {
  if (block.forced !== null && anchor !== block.forced) return false;
  const cells = cellsOf(index, block.classId, anchor, block.size);
  if (!cells) return false;

  const classSet = state.classUsed.get(block.classId);
  const teacherSet = state.teacherUsed.get(block.teacherId);
  for (const cell of cells) {
    if (classSet?.has(cell)) return false;
    if (teacherSet?.has(cell)) return false;
  }

  const day = index.slotOf[anchor].day;
  const limit = dailyLimit.get(block.teacherId);
  if (limit !== undefined) {
    let usedToday = 0;
    for (const cell of teacherSet ?? []) {
      if (index.slotOf[cell]?.day === day) usedToday += 1;
    }
    const addedToday = cells.filter((cell) => index.slotOf[cell]?.day === day).length;
    if (usedToday + addedToday > limit) return false;
  }

  if (rules.oneSessionPerTeacherClassPerDay) {
    const key = `${block.teacherId}|${block.classId}|${day}`;
    if ((state.teacherClassDay.get(key) ?? 0) >= 1) return false;
  }

  return !exceedsConsecutive(block.teacherId, cells, teacherSet, index, rules);
}

function exceedsConsecutive(
  _teacherId: string,
  cells: number[],
  teacherSet: Set<number> | undefined,
  index: Index,
  rules: Rules,
): boolean {
  const used = new Set(teacherSet ?? []);
  for (const cell of cells) used.add(cell);
  const max = rules.maxConsecutiveTeacher;
  for (const cell of cells) {
    const loc = index.teacherRunAt.get(cell);
    if (!loc) continue;
    const { run, pos } = loc;
    const firstStart = Math.max(0, pos - max);
    const lastStart = Math.min(pos, run.length - max - 1);
    for (let start = firstStart; start <= lastStart; start += 1) {
      const end = start + max;
      if (pos < start || pos > end) continue;
      let full = true;
      for (let i = start; i <= end; i += 1) {
        if (!used.has(run[i])) {
          full = false;
          break;
        }
      }
      if (full) return true;
    }
  }
  return false;
}

function place(block: Block, anchor: number, state: SearchState, index: Index): void {
  const cells = cellsOf(index, block.classId, anchor, block.size) ?? [];
  const classSet = state.classUsed.get(block.classId) ?? new Set<number>();
  const teacherSet = state.teacherUsed.get(block.teacherId) ?? new Set<number>();
  for (const cell of cells) {
    classSet.add(cell);
    teacherSet.add(cell);
  }
  state.classUsed.set(block.classId, classSet);
  state.teacherUsed.set(block.teacherId, teacherSet);
  const day = index.slotOf[anchor].day;
  const key = `${block.teacherId}|${block.classId}|${day}`;
  state.teacherClassDay.set(key, (state.teacherClassDay.get(key) ?? 0) + 1);
}

function unplace(block: Block, anchor: number, state: SearchState, index: Index): void {
  const cells = cellsOf(index, block.classId, anchor, block.size) ?? [];
  const classSet = state.classUsed.get(block.classId);
  const teacherSet = state.teacherUsed.get(block.teacherId);
  for (const cell of cells) {
    classSet?.delete(cell);
    teacherSet?.delete(cell);
  }
  const day = index.slotOf[anchor].day;
  const key = `${block.teacherId}|${block.classId}|${day}`;
  const count = state.teacherClassDay.get(key) ?? 0;
  if (count <= 1) state.teacherClassDay.delete(key);
  else state.teacherClassDay.set(key, count - 1);
}

/* ------------------------------------------------------------
   Output + soft scoring
   ------------------------------------------------------------ */

function toLessons(blocks: Block[], assignment: Map<number, number>, index: Index): SolverLesson[] {
  const lessons: SolverLesson[] = [];
  for (const block of blocks) {
    const anchor = assignment.get(block.ref);
    if (anchor === undefined) continue;
    lessons.push({
      classId: block.classId,
      subjectId: block.subjectId,
      teacherId: block.teacherId,
      day: index.slotOf[anchor].day,
      slotId: index.slotOf[anchor].id,
      size: block.size,
      assignmentId: block.assignmentId,
    });
  }
  return lessons;
}

function scoreSolution(input: SolverInput, lessons: SolverLesson[]): number {
  const rules = normalizeRules(input.rules);
  const index = buildSlotIndex(input);
  const weights = rules.weights;
  const cutoff = timeToMinutes(rules.morningEnds);
  const priorities = input.subjectPriority ?? {};
  let total = 0;

  const classUsed = new Map<string, Set<number>>();
  const teacherUsed = new Map<string, Set<number>>();
  const teacherDays = new Map<string, Set<number>>();

  for (const lesson of lessons) {
    const gid = index.gidOf.get(lesson.slotId);
    if (gid === undefined) continue;
    const cells = cellsOf(index, lesson.classId, gid, lesson.size) ?? [gid];
    const priority = priorities[lesson.subjectId] ?? 0;
    if (priority > 0) {
      for (const cell of cells) {
        if (timeToMinutes(index.slotOf[cell].start) >= cutoff) {
          total += weights.morning * priority;
        }
      }
    }
    const cls = classUsed.get(lesson.classId) ?? new Set<number>();
    const teacher = teacherUsed.get(lesson.teacherId) ?? new Set<number>();
    for (const cell of cells) {
      cls.add(cell);
      teacher.add(cell);
    }
    classUsed.set(lesson.classId, cls);
    teacherUsed.set(lesson.teacherId, teacher);
    const days = teacherDays.get(lesson.teacherId) ?? new Set<number>();
    days.add(index.slotOf[gid].day);
    teacherDays.set(lesson.teacherId, days);
  }

  for (const days of teacherDays.values()) {
    const sorted = [...days].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] === sorted[i - 1] + 1) total += weights.adjacentDays;
    }
  }

  const gapWeight = (used: Set<number>, run: number[], weight: number) => {
    for (let i = 0; i + 2 < run.length; i += 1) {
      if (used.has(run[i]) && used.has(run[i + 2]) && !used.has(run[i + 1])) total += weight;
    }
  };

  for (const [classId, used] of classUsed) {
    for (const run of index.classRuns.get(classId) ?? []) gapWeight(used, run, weights.classGap);
  }
  for (const used of teacherUsed.values()) {
    for (const run of index.teacherRuns) gapWeight(used, run, weights.teacherGap);
  }

  return total;
}

/* ------------------------------------------------------------
   Deterministic PRNG
   ------------------------------------------------------------ */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
