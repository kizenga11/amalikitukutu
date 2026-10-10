// ────────────────────────────────────────────────────────────
// Yearly aggregation for the "Best Student of the Year" report.
// Pure functions only: they reuse the NECTA grading helpers so
// the maths stays identical to the rest of the portal.
//
// Eligibility rules (see the report page):
//   • A subject counts only when the student is enrolled in it
//     (student_subjects) AND sat at least MIN_EXAMS_PER_SUBJECT
//     of the selected exams in that subject.
//   • A student is ranked overall only when at least
//     MIN_SUBJECTS_FOR_DIVISION subjects qualify.
//   • Students who left a subject (marks but no enrollment) or who
//     sat too few exams are listed as "not ranked" with a reason;
//     their scores remain in their personal detail.
//
// A student's subject average is the mean of the scores recorded
// for that subject across the selected exams they actually sat
// (absences are excluded, never counted as zero).
// ────────────────────────────────────────────────────────────

import {
  MIN_SUBJECTS_FOR_DIVISION,
  computeGradeAndPoints,
  computeStudentResult,
  computeSubjectScore,
  competencyLabel,
  type CompetencyThreshold,
  type DivisionRange,
  type GradeBoundary,
  type ScoredSubjectInput,
} from "@/lib/grading";

// Minimum number of selected exams a student must sit in a subject
// before that subject can count. Single source of truth — do not
// hard-code this number anywhere else.
export const MIN_EXAMS_PER_SUBJECT = 5;

// A student is ranked overall only when this many subjects qualify.
export const MIN_SUBJECTS_FOR_YEARLY_RANKING = MIN_SUBJECTS_FOR_DIVISION;

export interface YearlyMarkInput {
  exam_id: string;
  student_id: string;
  subject_id: string;
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface YearlyStudentInput {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
}

export interface YearlySubjectMeta {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

export interface YearlyExamMeta {
  id: string;
  name: string;
  start_date: string;
}

// Enrollment as read from student_subjects. `academic_year` is
// optional and kept so real year-scoped enrollment can be plugged
// in later without changing callers: a null year applies to every
// year (current behaviour).
export interface YearlyEnrollmentInput {
  student_id: string;
  subject_id: string;
  academic_year?: string | null;
}

export interface YearlySettings {
  gradeBoundaries: GradeBoundary[];
  divisionRanges: DivisionRange[];
  competencyThresholds: CompetencyThreshold[];
}

export interface YearlyStudentSubject {
  subject_id: string;
  code: string;
  name: string;
  sat: number;
  average: number | null;
  grade: string;
  enrolled: boolean;
  left: boolean;
  eligible: boolean;
}

export interface YearlyExamScore {
  exam_id: string;
  scores: Record<string, number | null>;
}

export interface YearlyStudentRow {
  student_id: string;
  name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  exams_sat: number;
  qualifying_subjects: number;
  subjects: YearlyStudentSubject[];
  byExam: YearlyExamScore[];
  average: number | null;
  total_points: number | null;
  division: string;
  incomplete: boolean;
  ranked: boolean;
  pos_form: number | null;
  pos_class: number | null;
}

export interface YearlySubjectRow {
  subject_id: string;
  code: string;
  name: string;
  sat: number;
  average: number | null;
  passRate: number | null;
  grade: string;
  competency: string;
  gradeCounts: Record<string, number>;
  bestStudentId: string | null;
  bestStudentName: string | null;
  bestAverage: number | null;
}

export interface BestPerSubject {
  subject: YearlySubjectRow;
  top: { student_id: string; name: string; stream_name: string; average: number | null; grade: string }[];
}

export interface PodiumEntry {
  student_id: string;
  name: string;
  stream_name: string;
  average: number | null;
  grade: string;
  division: string;
  position: number;
}

export type ExcludedReason = "left_subject" | "too_few_exams";

export interface ExcludedStudent {
  student_id: string;
  name: string;
  stream_name: string;
  reason: ExcludedReason;
  detail: string;
  left_subject_codes: string[];
}

export interface YearlyReport {
  exams: YearlyExamMeta[];
  method: string;
  minExamsPerSubject: number;
  minSubjectsForRanking: number;
  includeLeft: boolean;
  summary: {
    ranked: number;
    excluded: number;
    exams: number;
    mean: number | null;
    meanGrade: string;
    meanGpa: number | null;
    highest: number | null;
    lowest: number | null;
    bestSubject: { code: string; name: string; average: number | null } | null;
    weakestSubject: { code: string; name: string; average: number | null } | null;
  };
  podium: PodiumEntry[];
  ranking: YearlyStudentRow[];
  notRanked: YearlyStudentRow[];
  excluded: ExcludedStudent[];
  subjects: YearlySubjectRow[];
  bestPerSubject: BestPerSubject[];
}

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

function displayName(st: YearlyStudentInput): string {
  return `${st.first_name}${st.middle_name ? ` ${st.middle_name}` : ""} ${st.last_name}`.trim();
}

function byAverageThenName(a: { average: number | null; name: string }, b: { average: number | null; name: string }): number {
  return (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name);
}

export function buildYearlyReport(params: {
  students: YearlyStudentInput[];
  subjects: YearlySubjectMeta[];
  marks: YearlyMarkInput[];
  enrollment: YearlyEnrollmentInput[];
  exams: YearlyExamMeta[];
  settings: YearlySettings;
  year?: string;
  includeLeft?: boolean;
  minExamsOverride?: number | null;
}): YearlyReport {
  const { students, subjects, marks, enrollment, exams, settings } = params;
  const { gradeBoundaries, divisionRanges, competencyThresholds } = settings;
  const includeLeft = params.includeLeft ?? false;
  const year = params.year ?? "";

  const passThreshold =
    gradeBoundaries.length > 0 ? Math.max(...gradeBoundaries.map((b) => b.points)) : 5;

  const examCount = exams.length;
  // Default threshold is MIN_EXAMS_PER_SUBJECT. A smaller override is only
  // honoured when the caller explicitly confirms it (fewer than 5 exams).
  const minExams =
    params.minExamsOverride && params.minExamsOverride > 0
      ? Math.min(params.minExamsOverride, Math.max(examCount, 1))
      : MIN_EXAMS_PER_SUBJECT;

  const subjectMeta = new Map(subjects.map((s) => [s.id, s]));

  // Enrollment lookup: a null academic year applies to every year.
  const enrolledSet = new Set<string>();
  for (const entry of enrollment) {
    if (entry.academic_year == null || entry.academic_year === year) {
      enrolledSet.add(`${entry.student_id}|${entry.subject_id}`);
    }
  }

  // student -> subject -> recorded (non-null) scores
  const subjectScores = new Map<string, Map<string, number[]>>();
  // student -> exam -> subject -> score|null (for the per-exam detail)
  const examDetail = new Map<string, Map<string, Map<string, number | null>>>();
  // student -> set of exams they sat (had at least one non-absent score)
  const satExams = new Map<string, Set<string>>();

  for (const mark of marks) {
    const score = computeSubjectScore(mark.theory, mark.practical, mark.is_absent);

    let scoresBySubject = subjectScores.get(mark.student_id);
    if (!scoresBySubject) {
      scoresBySubject = new Map();
      subjectScores.set(mark.student_id, scoresBySubject);
    }
    const list = scoresBySubject.get(mark.subject_id) ?? [];
    if (score !== null) list.push(score);
    scoresBySubject.set(mark.subject_id, list);

    let byExam = examDetail.get(mark.student_id);
    if (!byExam) {
      byExam = new Map();
      examDetail.set(mark.student_id, byExam);
    }
    let examScores = byExam.get(mark.exam_id);
    if (!examScores) {
      examScores = new Map();
      byExam.set(mark.exam_id, examScores);
    }
    examScores.set(mark.subject_id, score);

    if (score !== null) {
      let sat = satExams.get(mark.student_id);
      if (!sat) {
        sat = new Set();
        satExams.set(mark.student_id, sat);
      }
      sat.add(mark.exam_id);
    }
  }

  // ── Per-student yearly rows ──
  const rows: YearlyStudentRow[] = [];
  for (const st of students) {
    const scoresBySubject = subjectScores.get(st.student_id);
    if (!scoresBySubject || scoresBySubject.size === 0) continue;

    const subjectRows: YearlyStudentSubject[] = [];
    const scoredInputs: ScoredSubjectInput[] = [];
    let qualifyingSubjects = 0;
    for (const [subjectId, list] of scoresBySubject) {
      const meta = subjectMeta.get(subjectId);
      if (!meta) continue;
      const sat = list.length;
      const average = sat > 0 ? round1(mean(list) as number) : null;
      const enrolled = enrolledSet.has(`${st.student_id}|${subjectId}`);
      const left = !enrolled && sat > 0;
      const eligible = enrolled && sat >= minExams && average !== null;
      const grade = average !== null ? computeGradeAndPoints(average, gradeBoundaries).grade : "ABS";
      subjectRows.push({ subject_id: subjectId, code: meta.code, name: meta.name, sat, average, grade, enrolled, left, eligible });
      if (eligible && average !== null) {
        qualifyingSubjects += 1;
        scoredInputs.push({
          subject_id: subjectId,
          subject_code: meta.code,
          subject_name: meta.name,
          has_practical: meta.has_practical,
          theory: average,
          practical: null,
          is_absent: false,
        });
      }
    }
    subjectRows.sort((a, b) => a.code.localeCompare(b.code));

    const result = computeStudentResult(
      {
        student_id: st.student_id,
        first_name: st.first_name,
        middle_name: st.middle_name,
        last_name: st.last_name,
        gender: st.gender,
        stream_id: st.stream_id,
        stream_name: st.stream_name,
      },
      scoredInputs,
      gradeBoundaries,
      divisionRanges,
    );

    const qualifyingAvgs = subjectRows
      .filter((s) => s.eligible && s.average !== null)
      .map((s) => s.average as number);
    const average = qualifyingAvgs.length > 0 ? round1(mean(qualifyingAvgs) as number) : null;
    const examsSat = satExams.get(st.student_id)?.size ?? 0;
    const ranked = qualifyingSubjects >= MIN_SUBJECTS_FOR_YEARLY_RANKING;

    const detail = examDetail.get(st.student_id);
    const byExam: YearlyExamScore[] = exams.map((exam) => {
      const examScores = detail?.get(exam.id);
      const scores: Record<string, number | null> = {};
      for (const subject of subjects) {
        scores[subject.id] = examScores?.get(subject.id) ?? null;
      }
      return { exam_id: exam.id, scores };
    });

    rows.push({
      student_id: st.student_id,
      name: displayName(st),
      gender: st.gender,
      stream_id: st.stream_id,
      stream_name: st.stream_name,
      exams_sat: examsSat,
      qualifying_subjects: qualifyingSubjects,
      subjects: subjectRows,
      byExam,
      average,
      total_points: result.total_points,
      division: result.division,
      incomplete: result.incomplete,
      ranked,
      pos_form: null,
      pos_class: null,
    });
  }

  const rankedRows = rows.filter((r) => r.ranked).sort(byAverageThenName);
  assignPositions(rankedRows);

  const byStream = new Map<string, YearlyStudentRow[]>();
  for (const row of rankedRows) {
    const key = row.stream_name || "—";
    const group = byStream.get(key) ?? [];
    group.push(row);
    byStream.set(key, group);
  }
  for (const group of byStream.values()) {
    let lastAvg: number | null = null;
    let lastPos = 0;
    group.forEach((row, index) => {
      const pos = row.average === lastAvg ? lastPos : index + 1;
      row.pos_class = pos;
      lastAvg = row.average;
      lastPos = pos;
    });
  }

  const notRanked = rows.filter((r) => !r.ranked).sort(byAverageThenName);

  const excluded: ExcludedStudent[] = notRanked.map((row) => {
    const leftCodes = row.subjects.filter((s) => s.left).map((s) => s.code);
    if (leftCodes.length > 0) {
      return {
        student_id: row.student_id,
        name: row.name,
        stream_name: row.stream_name,
        reason: "left_subject" as const,
        detail: `Left subject${leftCodes.length > 1 ? "s" : ""}: ${leftCodes.join(", ")} (no longer enrolled)`,
        left_subject_codes: leftCodes,
      };
    }
    const enrolledSubjectSats = row.subjects.filter((s) => s.enrolled).map((s) => s.sat);
    const bestSat = enrolledSubjectSats.length > 0 ? Math.max(...enrolledSubjectSats) : 0;
    const detail =
      row.qualifying_subjects > 0
        ? `Qualifies in ${row.qualifying_subjects} subject(s); ${MIN_SUBJECTS_FOR_YEARLY_RANKING} required`
        : `Sat ${bestSat} of ${minExams} required exam(s)`;
    return {
      student_id: row.student_id,
      name: row.name,
      stream_name: row.stream_name,
      reason: "too_few_exams" as const,
      detail,
      left_subject_codes: [],
    };
  });

  const podium: PodiumEntry[] = rankedRows
    .filter((r) => (r.pos_form ?? 99) <= 3)
    .map((r) => ({
      student_id: r.student_id,
      name: r.name,
      stream_name: r.stream_name,
      average: r.average,
      grade: r.average !== null ? computeGradeAndPoints(r.average, gradeBoundaries).grade : "—",
      division: r.division,
      position: r.pos_form ?? 0,
    }));

  // ── Subject performance across the year (eligible students only) ──
  interface SubjectStudentEntry { student_id: string; name: string; stream_name: string; average: number; points: number; grade: string; }
  const subjectEntries = new Map<string, SubjectStudentEntry[]>();
  for (const row of rows) {
    for (const subject of row.subjects) {
      if (subject.average === null) continue;
      const countsForStats =
        subject.eligible || (includeLeft && subject.left && subject.sat >= minExams);
      if (!countsForStats) continue;
      const { points } = computeGradeAndPoints(subject.average, gradeBoundaries);
      const list = subjectEntries.get(subject.subject_id) ?? [];
      list.push({
        student_id: row.student_id,
        name: row.name,
        stream_name: row.stream_name,
        average: subject.average,
        points,
        grade: subject.grade,
      });
      subjectEntries.set(subject.subject_id, list);
    }
  }

  const subjectRows: YearlySubjectRow[] = [];
  for (const [subjectId, entries] of subjectEntries) {
    const meta = subjectMeta.get(subjectId);
    if (!meta) continue;
    const avgs = entries.map((e) => e.average);
    const average = avgs.length > 0 ? round1(mean(avgs) as number) : null;
    const passed = entries.filter((e) => e.points < passThreshold).length;
    const best = [...entries].sort((a, b) => b.average - a.average)[0] ?? null;
    const gradeCounts: Record<string, number> = {};
    for (const boundary of gradeBoundaries) gradeCounts[boundary.grade] = 0;
    for (const entry of entries) gradeCounts[entry.grade] = (gradeCounts[entry.grade] ?? 0) + 1;
    subjectRows.push({
      subject_id: subjectId,
      code: meta.code,
      name: meta.name,
      sat: entries.length,
      average,
      passRate: entries.length > 0 ? round1((passed / entries.length) * 100) : null,
      grade: average !== null ? computeGradeAndPoints(average, gradeBoundaries).grade : "—",
      competency: competencyLabel(average, competencyThresholds),
      gradeCounts,
      bestStudentId: best?.student_id ?? null,
      bestStudentName: best?.name ?? null,
      bestAverage: best?.average ?? null,
    });
  }
  subjectRows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));

  const bestPerSubject: BestPerSubject[] = subjectRows.map((subject) => {
    const entries = subjectEntries.get(subject.subject_id) ?? [];
    const sorted = [...entries].sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));
    const top: BestPerSubject["top"] = [];
    let lastAvg: number | null = null;
    let lastPos = 0;
    sorted.forEach((entry, index) => {
      const pos = entry.average === lastAvg ? lastPos : index + 1;
      lastAvg = entry.average;
      lastPos = pos;
      if (pos <= 3) top.push({ student_id: entry.student_id, name: entry.name, stream_name: entry.stream_name, average: entry.average, grade: entry.grade });
    });
    return { subject, top };
  });

  const rankedAvgs = rankedRows.map((r) => r.average as number);
  const summaryMean = mean(rankedAvgs);
  const meanGpa =
    rankedRows.length > 0
      ? round2(
          rankedRows.reduce(
            (sum, row) => sum + (row.total_points ?? 0) / MIN_SUBJECTS_FOR_YEARLY_RANKING,
            0,
          ) / rankedRows.length,
        )
      : null;

  return {
    exams,
    method:
      `Subject average = mean of the scores recorded across the selected exams the student sat (absences excluded). ` +
      `A subject counts only when the student is enrolled in it and sat at least ${minExams} of the selected exams. ` +
      `Yearly average = mean of the qualifying subjects; a student is ranked overall only with at least ${MIN_SUBJECTS_FOR_YEARLY_RANKING} qualifying subjects.`,
    minExamsPerSubject: minExams,
    minSubjectsForRanking: MIN_SUBJECTS_FOR_YEARLY_RANKING,
    includeLeft,
    summary: {
      ranked: rankedRows.length,
      excluded: excluded.length,
      exams: examCount,
      mean: summaryMean !== null ? round1(summaryMean) : null,
      meanGrade: summaryMean !== null ? computeGradeAndPoints(round1(summaryMean), gradeBoundaries).grade : "—",
      meanGpa,
      highest: rankedAvgs.length > 0 ? Math.max(...rankedAvgs) : null,
      lowest: rankedAvgs.length > 0 ? Math.min(...rankedAvgs) : null,
      bestSubject: subjectRows[0] ? { code: subjectRows[0].code, name: subjectRows[0].name, average: subjectRows[0].average } : null,
      weakestSubject: subjectRows.length > 0
        ? {
            code: subjectRows[subjectRows.length - 1].code,
            name: subjectRows[subjectRows.length - 1].name,
            average: subjectRows[subjectRows.length - 1].average,
          }
        : null,
    },
    podium,
    ranking: rankedRows,
    notRanked,
    excluded,
    subjects: subjectRows,
    bestPerSubject,
  };
}

function assignPositions(rows: YearlyStudentRow[]): void {
  let lastAvg: number | null = null;
  let lastPos = 0;
  rows.forEach((row, index) => {
    const pos = row.average === lastAvg ? lastPos : index + 1;
    row.pos_form = pos;
    lastAvg = row.average;
    lastPos = pos;
  });
}
