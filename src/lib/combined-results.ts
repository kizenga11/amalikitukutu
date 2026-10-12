// ────────────────────────────────────────────────────────────
// Combined results: show the results of ONE OR MORE selected
// students per exam.
//
// Marks are NOT combined across exams. Each selected exam gets its
// own table: the subjects the student sat, the score and grade for
// each subject, the average, the division and the position. Position
// is the average rank among EVERY student who sat that exam (matching
// the official student report card), so it reads like "70/70".
//
// The division still uses the NECTA rule (best 7 subjects), so a
// student needs at least 7 scored subjects in an exam to receive a
// division, otherwise they are marked incomplete and unranked.
// ────────────────────────────────────────────────────────────

import {
  MIN_SUBJECTS_FOR_DIVISION,
  computeGradeAndPoints,
  computeStudentResult,
  type CompetencyThreshold,
  type DivisionRange,
  type GradeBoundary,
  type ScoredSubjectInput,
  type StudentResult,
} from "@/lib/grading";

export interface CombinedMarkInput {
  exam_id: string;
  student_id: string;
  subject_id: string;
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface CombinedStudentInput {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
}

export interface CombinedSubjectMeta {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

export interface CombinedExamMeta {
  id: string;
  name: string;
  start_date: string;
}

export interface CombinedSettings {
  gradeBoundaries: GradeBoundary[];
  divisionRanges: DivisionRange[];
  competencyThresholds: CompetencyThreshold[];
}

export interface ExamSubjectCell {
  subject_id: string;
  code: string;
  name: string;
  score: number | null;
  grade: string;
  points: number | null;
  is_absent: boolean;
}

export interface ExamStudentRow {
  student_id: string;
  name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: ExamSubjectCell[];
  sat_subjects: number;
  attempted: number;
  total_marks: number;
  average: number | null;
  grade: string;
  total_points: number | null;
  division: string;
  incomplete: boolean;
  position: number | null;
  best: SubjectHighlight | null;
  weakest: SubjectHighlight | null;
}

export interface SubjectHighlight {
  code: string;
  name: string;
  average: number;
}

export interface ExamReportSummary {
  students: number;
  average: number | null;
  ranked: number;
  highest: SubjectHighlight | null;
  lowest: SubjectHighlight | null;
}

export interface ExamReport {
  exam_id: string;
  exam_name: string;
  start_date: string;
  columns: { subject_id: string; code: string; name: string }[];
  students: ExamStudentRow[];
  summary: ExamReportSummary;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function displayName(st: CombinedStudentInput): string {
  return `${st.first_name}${st.middle_name ? ` ${st.middle_name}` : ""} ${st.last_name}`.trim();
}

export function buildExamResults(params: {
  students: CombinedStudentInput[];
  subjects: CombinedSubjectMeta[];
  marks: CombinedMarkInput[];
  exams: CombinedExamMeta[];
  settings: CombinedSettings;
  selectedStudentIds?: string[];
}): ExamReport[] {
  const { students, subjects, marks, exams, settings } = params;
  const { gradeBoundaries, divisionRanges } = settings;
  const selection =
    params.selectedStudentIds && params.selectedStudentIds.length > 0
      ? new Set(params.selectedStudentIds)
      : null;

  const subjectMeta = new Map(subjects.map((s) => [s.id, s]));
  const studentMeta = new Map(students.map((s) => [s.student_id, s]));

  // exam -> student -> subject -> mark
  const byExam = new Map<string, Map<string, Map<string, CombinedMarkInput>>>();
  for (const mark of marks) {
    let examMap = byExam.get(mark.exam_id);
    if (!examMap) {
      examMap = new Map();
      byExam.set(mark.exam_id, examMap);
    }
    let studentMap = examMap.get(mark.student_id);
    if (!studentMap) {
      studentMap = new Map();
      examMap.set(mark.student_id, studentMap);
    }
    studentMap.set(mark.subject_id, mark);
  }

  const reports: ExamReport[] = [];

  for (const exam of exams) {
    const examMap = byExam.get(exam.id);
    if (!examMap || examMap.size === 0) continue;

    interface Built {
      meta: CombinedStudentInput;
      result: StudentResult;
      cells: ExamSubjectCell[];
      average: number | null;
    }

    const built: Built[] = [];

    for (const [studentId, subjectMap] of examMap) {
      const st = studentMeta.get(studentId);
      if (!st) continue;

      const inputs: ScoredSubjectInput[] = [];
      for (const [subjectId, mark] of subjectMap) {
        const meta = subjectMeta.get(subjectId);
        if (!meta) continue;
        inputs.push({
          subject_id: subjectId,
          subject_code: meta.code,
          subject_name: meta.name,
          has_practical: meta.has_practical,
          theory: mark.theory,
          practical: mark.practical,
          is_absent: mark.is_absent,
        });
      }
      if (inputs.length === 0) continue;

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
        inputs,
        gradeBoundaries,
        divisionRanges,
      );

      const cells: ExamSubjectCell[] = result.subjects.map((s) => ({
        subject_id: s.subject_id,
        code: s.subject_code,
        name: s.subject_name,
        score: s.total_score,
        grade: s.grade,
        points: s.total_score !== null ? s.points : null,
        is_absent: s.is_absent,
      }));

      const scores = result.subjects
        .map((s) => s.total_score)
        .filter((score): score is number => score !== null);
      const average = scores.length > 0 ? round1(mean(scores) as number) : null;

      built.push({ meta: st, result, cells, average });
    }

    if (built.length === 0) continue;

    const rows: ExamStudentRow[] = built.map((b) => {
      let best: SubjectHighlight | null = null;
      let weakest: SubjectHighlight | null = null;
      for (const cell of b.cells) {
        if (cell.score === null) continue;
        if (!best || cell.score > best.average) best = { code: cell.code, name: cell.name, average: cell.score };
        if (!weakest || cell.score < weakest.average) weakest = { code: cell.code, name: cell.name, average: cell.score };
      }
      return {
        student_id: b.meta.student_id,
        name: displayName(b.meta),
        gender: b.meta.gender,
        stream_id: b.meta.stream_id,
        stream_name: b.meta.stream_name,
        subjects: b.cells,
        sat_subjects: b.cells.filter((c) => c.score !== null).length,
        attempted: b.cells.length,
        total_marks: b.cells.reduce((sum, c) => (c.score === null ? sum : sum + c.score), 0),
        average: b.average,
        grade: b.average !== null ? computeGradeAndPoints(b.average, gradeBoundaries).grade : "—",
        total_points: b.result.total_points,
        division: b.result.division,
        incomplete: b.result.incomplete,
        position: null,
        best,
        weakest,
      };
    });

    // Position = average rank among EVERY student who sat this exam, matching
    // the official student report card. Students on an equal average share the
    // same position; incomplete students are still ranked.
    const rankedRows = [...rows].sort(
      (a, b) =>
        (b.average ?? -1) - (a.average ?? -1) ||
        a.name.localeCompare(b.name),
    );
    let lastAverage: number | null = null;
    let lastPosition = 0;
    rankedRows.forEach((row, index) => {
      if (index === 0 || row.average !== lastAverage) {
        lastPosition = index + 1;
        lastAverage = row.average;
      }
      row.position = lastPosition;
    });

    rows.sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );

    const columnMap = new Map<string, { subject_id: string; code: string; name: string }>();
    for (const row of rows) {
      for (const cell of row.subjects) {
        if (!columnMap.has(cell.subject_id)) {
          columnMap.set(cell.subject_id, { subject_id: cell.subject_id, code: cell.code, name: cell.name });
        }
      }
    }
    const columns = [...columnMap.values()].sort((a, b) => a.code.localeCompare(b.code));

    const averages = rows
      .map((r) => r.average)
      .filter((value): value is number => value !== null);

    // Best / weakest subject for this exam: the subject with the highest and
    // lowest mean score across every student who sat the exam.
    const subjectAgg = new Map<string, { code: string; name: string; sum: number; count: number }>();
    for (const row of rows) {
      for (const cell of row.subjects) {
        if (cell.score === null) continue;
        let agg = subjectAgg.get(cell.subject_id);
        if (!agg) {
          agg = { code: cell.code, name: cell.name, sum: 0, count: 0 };
          subjectAgg.set(cell.subject_id, agg);
        }
        agg.sum += cell.score;
        agg.count += 1;
      }
    }
    const subjectAverages: SubjectHighlight[] = [...subjectAgg.values()].map((agg) => ({
      code: agg.code,
      name: agg.name,
      average: round1(agg.sum / agg.count),
    }));
    let highest: SubjectHighlight | null = null;
    let lowest: SubjectHighlight | null = null;
    for (const subject of subjectAverages) {
      if (!highest || subject.average > highest.average) highest = subject;
      if (!lowest || subject.average < lowest.average) lowest = subject;
    }

    const displayRows = selection ? rows.filter((row) => selection.has(row.student_id)) : rows;

    reports.push({
      exam_id: exam.id,
      exam_name: exam.name,
      start_date: exam.start_date,
      columns,
      students: displayRows,
      summary: {
        students: rows.length,
        average: averages.length > 0 ? round1(mean(averages) as number) : null,
        ranked: rows.filter((r) => !r.incomplete).length,
        highest,
        lowest,
      },
    });
  }

  return reports;
}

export { MIN_SUBJECTS_FOR_DIVISION };
