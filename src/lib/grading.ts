// ────────────────────────────────────────────────────────────
// NECTA CSEE O-level grading + division logic.
// Pure functions, no Supabase dependency, so the maths can be
// reused across the portal and changed safely.
// ────────────────────────────────────────────────────────────

export interface GradeBoundary {
  min: number;
  max: number;
  grade: string;
  points: number;
}

export interface DivisionRange {
  min: number;
  max: number | null; // null = no upper limit (e.g. Division 0 / Fail)
  division: string;
}

export interface CompetencyThreshold {
  // Mean grade-points ceiling for this label; null = catch-all for
  // everything above the last explicit ceiling.
  maxMean: number | null;
  label: string;
}

export interface GradingSettings {
  gradeBoundaries: GradeBoundary[];
  divisionRanges: DivisionRange[];
  competencyThresholds: CompetencyThreshold[];
}

export const DEFAULT_GRADE_BOUNDARIES: GradeBoundary[] = [
  { min: 75, max: 100, grade: "A", points: 1 },
  { min: 65, max: 74, grade: "B", points: 2 },
  { min: 45, max: 64, grade: "C", points: 3 },
  { min: 30, max: 44, grade: "D", points: 4 },
  { min: 0, max: 29, grade: "F", points: 5 },
];

export const DEFAULT_DIVISION_RANGES: DivisionRange[] = [
  { min: 7, max: 17, division: "Division I" },
  { min: 18, max: 21, division: "Division II" },
  { min: 22, max: 25, division: "Division III" },
  { min: 26, max: 33, division: "Division IV" },
  { min: 34, max: null, division: "Division 0" },
];

// Mean grade-points ceilings used for the competency labels shown on
// the official-style report. Evaluated top-down.
export const DEFAULT_COMPETENCY_THRESHOLDS: CompetencyThreshold[] = [
  { maxMean: 1.5, label: "Excellent" },
  { maxMean: 2.0, label: "Very Good" },
  { maxMean: 2.5, label: "Good" },
  { maxMean: 3.0, label: "Average" },
  { maxMean: null, label: "Below Average" },
];

// A candidate qualifies for a division only once this many
// non-absent subjects have a recorded score.
export const MIN_SUBJECTS_FOR_DIVISION = 7;

// Theory-only subjects hold the full 0-100 in theory_score.
// Practical subjects carry 0-50 in theory_score and 0-50 in
// practical_score; the total is their sum.
export function computeSubjectScore(
  theory: number | null,
  practical: number | null,
  isAbsent: boolean,
): number | null {
  if (isAbsent) return null;
  if (theory === null && practical === null) return null;
  const total = (theory ?? 0) + (practical ?? 0);
  return Number.isInteger(total) ? total : Math.round(total * 10) / 10;
}

export function computeGradeAndPoints(
  score: number,
  boundaries: GradeBoundary[] = DEFAULT_GRADE_BOUNDARIES,
): { grade: string; points: number } {
  for (const b of boundaries) {
    if (score >= b.min && score <= b.max) return { grade: b.grade, points: b.points };
  }
  const fallback = boundaries[boundaries.length - 1];
  if (!fallback) return { grade: "F", points: 5 };
  return { grade: fallback.grade, points: fallback.points };
}

export interface SubjectResult {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  has_practical: boolean;
  total_score: number | null;
  grade: string;
  points: number;
  is_absent: boolean;
}

export interface ScoredSubjectInput {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  has_practical: boolean;
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface StudentResult {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: SubjectResult[];
  total_points: number | null;
  division: string;
  incomplete: boolean;
}

export interface StudentBase {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
}

export function computeStudentResult(
  base: StudentBase,
  scoredSubjects: ScoredSubjectInput[],
  gradeBoundaries: GradeBoundary[] = DEFAULT_GRADE_BOUNDARIES,
  divisionRanges: DivisionRange[] = DEFAULT_DIVISION_RANGES,
): StudentResult {
  const subjects: SubjectResult[] = scoredSubjects.map((s) => {
    const score = computeSubjectScore(s.theory, s.practical, s.is_absent);
    const grade = score !== null ? computeGradeAndPoints(score, gradeBoundaries).grade : "ABS";
    const points = score !== null ? computeGradeAndPoints(score, gradeBoundaries).points : 0;
    return {
      subject_id: s.subject_id,
      subject_code: s.subject_code,
      subject_name: s.subject_name,
      has_practical: s.has_practical,
      total_score: score,
      grade,
      points,
      is_absent: s.is_absent,
    };
  });

  const valid = subjects.filter((s) => s.total_score !== null);
  const incomplete = valid.length < MIN_SUBJECTS_FOR_DIVISION;
  const total_points = incomplete
    ? null
    : [...valid]
        .sort((a, b) => a.points - b.points)
        .slice(0, MIN_SUBJECTS_FOR_DIVISION)
        .reduce((sum, s) => sum + s.points, 0);

  let division = "Incomplete";
  if (!incomplete && total_points !== null) {
    for (const range of divisionRanges) {
      const withinMax = range.max == null || total_points <= range.max;
      if (total_points >= range.min && withinMax) {
        division = range.division;
        break;
      }
    }
    if (division === "Incomplete") division = "—";
  }

  return { ...base, subjects, total_points, division, incomplete };
}

// ────────────────────────────────────────────────────────────
// Class-level builder. Accepts the shapes returned by
// fetchExamMarks so results can be computed without restructuring.
// ────────────────────────────────────────────────────────────

export interface ClassSubjectsInput {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

export interface ClassStudentsInput {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: string[];
}

export interface MarksCellInput {
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface ClassResults {
  class_id: string;
  class_name: string;
  subjects: ClassSubjectsInput[];
  students: StudentResult[];
}

export function buildClassResults(
  classRow: {
    class_id: string;
    class_name: string;
    subjects: ClassSubjectsInput[];
    students: ClassStudentsInput[];
  },
  marks: Record<string, MarksCellInput>,
  gradeBoundaries: GradeBoundary[] = DEFAULT_GRADE_BOUNDARIES,
  divisionRanges: DivisionRange[] = DEFAULT_DIVISION_RANGES,
): ClassResults {
  const students = classRow.students.map((st) => {
    const scored: ScoredSubjectInput[] = [];
    for (const subj of classRow.subjects) {
      if (!st.subjects.includes(subj.id)) continue;
      const cell = marks[`${st.student_id}|${subj.id}`];
      scored.push({
        subject_id: subj.id,
        subject_code: subj.code,
        subject_name: subj.name,
        has_practical: subj.has_practical,
        theory: cell?.theory ?? null,
        practical: cell?.practical ?? null,
        is_absent: cell?.is_absent ?? false,
      });
    }
    return computeStudentResult(
      {
        student_id: st.student_id,
        first_name: st.first_name,
        middle_name: st.middle_name,
        last_name: st.last_name,
        gender: st.gender,
        stream_id: st.stream_id,
        stream_name: st.stream_name,
      },
      scored,
      gradeBoundaries,
      divisionRanges,
    );
  });
  return { class_id: classRow.class_id, class_name: classRow.class_name, subjects: classRow.subjects, students };
}

export interface RankedStudent {
  student: StudentResult;
  rank: number;
}

// Standard competition ranking: students on equal total points
// share the same rank. Incomplete (disqualified) students are
// not ranked.
export function rankResults(students: StudentResult[]): RankedStudent[] {
  const eligible = students
    .filter((s) => !s.incomplete)
    .sort(
      (a, b) =>
        (a.total_points ?? 0) - (b.total_points ?? 0) ||
        a.last_name.localeCompare(b.last_name) ||
        a.first_name.localeCompare(b.first_name),
    );

  const ranked: RankedStudent[] = [];
  let lastPoints: number | null = null;
  let lastRank = 0;
  eligible.forEach((student, index) => {
    const rank = student.total_points === lastPoints ? lastRank : index + 1;
    lastPoints = student.total_points;
    lastRank = rank;
    ranked.push({ student, rank });
  });
  return ranked;
}

// ────────────────────────────────────────────────────────────
// Official-style school report helpers.
// ────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function divisionCode(division: string, incomplete: boolean): string {
  if (incomplete) return "INC";
  const match = division.match(/(?:Division\s+)?(.+)$/i);
  return match ? match[1] : "—";
}

export function competencyLabel(meanPoints: number | null, thresholds: CompetencyThreshold[]): string {
  if (meanPoints === null || thresholds.length === 0) return "—";
  for (const t of thresholds) {
    if (t.maxMean === null) return t.label;
    if (meanPoints <= t.maxMean) return t.label;
  }
  return thresholds[thresholds.length - 1]?.label ?? "—";
}

export interface StudentReportRow {
  student: StudentResult;
  rank: number;
  avg: number | null;
  grade: string;
  gpa: number | null;
  divisionCode: string;
}

export interface SubjectPerformanceRow {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  registered: number;
  sat: number;
  passed: number;
  counts: Record<string, number>;
  countsF: Record<string, number>;
  countsM: Record<string, number>;
  avg: number | null;
  grade: string;
  gpa: number | null;
  competency: string;
}

export interface DivisionSummaryRow {
  division: string;
  label: string;
  boys: number;
  girls: number;
}

export interface SchoolSummary {
  average: number | null;
  grade: string;
  students: number;
  gpa: number | null;
}

export interface SchoolReportData {
  students: StudentReportRow[];
  divisions: DivisionSummaryRow[];
  subjects: SubjectPerformanceRow[];
  summary: SchoolSummary;
}

interface ReportOpts {
  gradeBoundaries: GradeBoundary[];
  divisionRanges: DivisionRange[];
  competencyThresholds: CompetencyThreshold[];
}

export function buildSchoolReport(
  classes: ClassResults[],
  opts: ReportOpts,
): SchoolReportData {
  const allStudents = classes.flatMap((c) => c.students);

  // Pass threshold = the lowest-boundary grade points (max points = easiest grade).
  const passThreshold =
    opts.gradeBoundaries.length > 0
      ? Math.max(...opts.gradeBoundaries.map((b) => b.points))
      : 5;

  // ── Per-student rows ──
  const rows: StudentReportRow[] = allStudents.map((st) => {
    const valid = st.subjects.filter((s) => s.total_score !== null);
    const avg = valid.length > 0 ? round1(valid.reduce((s, r) => s + (r.total_score ?? 0), 0) / valid.length) : null;
    const grade = avg !== null ? computeGradeAndPoints(avg, opts.gradeBoundaries).grade : "—";
    const gpa = st.incomplete
      ? null
      : st.total_points !== null
        ? round2(st.total_points / MIN_SUBJECTS_FOR_DIVISION)
        : null;
    return {
      student: st,
      rank: 0,
      avg,
      grade,
      gpa,
      divisionCode: divisionCode(st.division, st.incomplete),
    };
  });

  // ── Rank by avg descending (competition ranking) ──
  rows.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.student.last_name.localeCompare(b.student.last_name) || a.student.first_name.localeCompare(b.student.first_name));
  {
    let lastAvg: number | null = null;
    let lastRank = 0;
    rows.forEach((r, i) => {
      const rank = r.avg === lastAvg ? lastRank : i + 1;
      lastAvg = r.avg;
      lastRank = rank;
      r.rank = rank;
    });
  }

  // ── Division summary by sex ──
  const eligibleStudents = allStudents.filter((s) => !s.incomplete);
  const divisions: DivisionSummaryRow[] = opts.divisionRanges.map((r) => {
    const code = divisionCode(r.division, false);
    const inDiv = eligibleStudents.filter((s) => divisionCode(s.division, false) === code);
    return {
      division: code,
      label: r.division,
      boys: inDiv.filter((s) => s.gender === "Male").length,
      girls: inDiv.filter((s) => s.gender === "Female").length,
    };
  });

  // ── Subject performance ──
  const allSubjectsMap = new Map<string, { id: string; code: string; name: string }>();
  for (const cls of classes) {
    for (const sub of cls.subjects) {
      if (!allSubjectsMap.has(sub.id)) allSubjectsMap.set(sub.id, { id: sub.id, code: sub.code, name: sub.name });
    }
  }
  const subjects: SubjectPerformanceRow[] = [];
  for (const [subId, meta] of allSubjectsMap) {
    let registered = 0;
    let sat = 0;
    let passed = 0;
    const counts: Record<string, number> = {};
    const countsF: Record<string, number> = {};
    const countsM: Record<string, number> = {};
    const scores: number[] = [];
    const points: number[] = [];
    for (const st of allStudents) {
      const sr = st.subjects.find((s) => s.subject_id === subId);
      if (!sr) continue;
      registered += 1;
      if (sr.total_score === null) continue;
      sat += 1;
      scores.push(sr.total_score);
      const g = sr.grade;
      counts[g] = (counts[g] ?? 0) + 1;
      if (st.gender.toLowerCase().startsWith("f")) countsF[g] = (countsF[g] ?? 0) + 1;
      else countsM[g] = (countsM[g] ?? 0) + 1;
      if (sr.points > 0) {
        points.push(sr.points);
        if (sr.points < passThreshold) passed += 1;
      }
    }
    const avg = sat > 0 ? round1(scores.reduce((a, b) => a + b, 0) / sat) : null;
    const gpa = sat > 0 ? round2(points.reduce((a, b) => a + b, 0) / points.length) : null;
    subjects.push({
      subject_id: subId,
      subject_code: meta.code,
      subject_name: meta.name,
      registered,
      sat,
      passed,
      counts,
      countsF,
      countsM,
      avg,
      grade: avg !== null ? computeGradeAndPoints(avg, opts.gradeBoundaries).grade : "—",
      gpa,
      competency: competencyLabel(gpa, opts.competencyThresholds),
    });
  }
  subjects.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.subject_name.localeCompare(b.subject_name));

  // ── School summary ──
  const studentAvgs = rows.filter((r) => r.avg !== null).map((r) => r.avg as number);
  const studentGpas = rows.filter((r) => r.gpa !== null).map((r) => r.gpa as number);
  const avgMean = mean(studentAvgs);
  const gpaMean = mean(studentGpas);

  return {
    students: rows,
    divisions,
    subjects,
    summary: {
      average: avgMean !== null ? round1(avgMean) : null,
      grade: avgMean !== null ? computeGradeAndPoints(round1(avgMean), opts.gradeBoundaries).grade : "—",
      students: allStudents.length,
      gpa: gpaMean !== null ? round2(gpaMean) : null,
    },
  };
}