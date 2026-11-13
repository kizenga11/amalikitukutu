import {
  buildClassResults,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  rankResults,
  type ClassStudentsInput,
  type CompetencyThreshold,
  type DivisionRange,
  type GradeBoundary,
  type MarksCellInput,
} from "@/lib/grading";
import { studentAdmin, type StudentProfile } from "@/lib/student-auth";
import { currentYearId } from "@/lib/calendar";

interface ExamRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface SubjectRow {
  subject_id: string;
  subject:
    | { code: string; name: string; has_practical: boolean }
    | { code: string; name: string; has_practical: boolean }[]
    | null;
}

interface MarkRow {
  exam_id: string;
  student_id: string;
  subject_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean;
}

interface RawStudentRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream: { name: string } | { name: string }[] | null;
}

export interface ResultSubject {
  subjectId: string;
  code: string;
  name: string;
  theory: number | null;
  practical: number | null;
  score: number | null;
  grade: string;
  points: number;
  isAbsent: boolean;
}

export interface StudentExamResult {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  year: string;
  term: 1 | 2;
  average: number | null;
  division: string;
  points: number | null;
  incomplete: boolean;
  classPosition: number | null;
  classSize: number;
  streamPosition: number | null;
  streamSize: number;
  /** False when no marks have been entered for this student yet. */
  hasMarks: boolean;
  subjects: ResultSubject[];
}

export interface GradingSettings {
  gradeBoundaries: GradeBoundary[];
  divisionRanges: DivisionRange[];
  competencyThresholds: CompetencyThreshold[];
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadGradingSettings(): Promise<GradingSettings> {
  const { data, error } = await studentAdmin
    .from("academic_settings")
    .select("key, value")
    .in("key", ["grade_boundaries", "division_ranges", "competency_thresholds"]);
  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.key, row.value);

  return {
    gradeBoundaries: parseJson<GradeBoundary[]>(
      map.get("grade_boundaries"),
      DEFAULT_GRADE_BOUNDARIES,
    ),
    divisionRanges: parseJson<DivisionRange[]>(
      map.get("division_ranges"),
      DEFAULT_DIVISION_RANGES,
    ),
    competencyThresholds: parseJson<CompetencyThreshold[]>(
      map.get("competency_thresholds"),
      DEFAULT_COMPETENCY_THRESHOLDS,
    ),
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function termForExamDate(date: string): 1 | 2 {
  const month = Number(date.slice(5, 7));
  return month >= 1 && month <= 6 ? 1 : 2;
}

async function loadSubjectsByExam(
  examIds: string[],
  classId: string,
): Promise<Map<string, SubjectRow[]>> {
  const map = new Map<string, SubjectRow[]>();
  if (examIds.length === 0) return map;

  const { data, error } = await studentAdmin
    .from("exam_class_subjects")
    .select("exam_id, subject_id, subject:subjects(code, name, has_practical)")
    .eq("class_id", classId)
    .in("exam_id", examIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as (SubjectRow & { exam_id: string })[]) {
    const list = map.get(row.exam_id) ?? [];
    list.push(row);
    map.set(row.exam_id, list);
  }
  return map;
}

async function loadStudentSubjectLinks(studentIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < studentIds.length; i += 100) {
    const batch = studentIds.slice(i, i + 100);
    const { data, error } = await studentAdmin
      .from("student_subjects")
      .select("student_id, subject_id")
      .in("student_id", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      const list = map.get(row.student_id) ?? [];
      list.push(row.subject_id);
      map.set(row.student_id, list);
    }
  }
  return map;
}

async function loadClassStudents(classId: string): Promise<{
  rows: RawStudentRow[];
  inputs: ClassStudentsInput[];
}> {
  const { data, error } = await studentAdmin
    .from("students")
    .select(
      "id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)",
    )
    .eq("class_id", classId)
    .order("last_name")
    .order("first_name");
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawStudentRow[];
  const links = await loadStudentSubjectLinks(rows.map((row) => row.id));

  return {
    rows,
    inputs: rows.map((row) => {
      const stream = firstRelation(row.stream);
      return {
        student_id: row.id,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        gender: row.gender,
        stream_id: row.stream_id,
        stream_name: stream?.name ?? "",
        subjects: links.get(row.id) ?? [],
      };
    }),
  };
}

async function loadActiveAcademicYear(): Promise<string> {
  const { data, error } = await studentAdmin
    .from("academic_settings")
    .select("value")
    .eq("key", "active_year")
    .maybeSingle();
  if (error) return currentYearId;

  const value = typeof data?.value === "string" ? data.value.trim() : "";
  return /^\d{4}$/.test(value) ? value : currentYearId;
}

export async function loadStudentResults(
  student: StudentProfile,
): Promise<StudentExamResult[]> {
  if (!student.classId) return [];

  const activeYear = await loadActiveAcademicYear();

  const { data: examData, error: examError } = await studentAdmin
    .from("exams")
    .select("id, name, start_date, end_date")
    .eq("status", "published")
    .order("start_date", { ascending: false });
  if (examError) throw examError;

  const publishedExams = (examData ?? []) as ExamRow[];
  if (publishedExams.length === 0) return [];

  // Students should see every exam of the current academic year. If the year
  // setting is ahead of the data, fall back to all published exams so results
  // never disappear because of a configuration mismatch.
  const yearExams = publishedExams.filter(
    (exam) => exam.start_date.slice(0, 4) === activeYear,
  );
  const scopedExams = yearExams.length > 0 ? yearExams : publishedExams;

  const { data: classLinks, error: classLinkError } = await studentAdmin
    .from("exam_classes")
    .select("exam_id")
    .eq("class_id", student.classId)
    .in(
      "exam_id",
      scopedExams.map((exam) => exam.id),
    );
  if (classLinkError) throw classLinkError;

  const participatingExamIds = new Set((classLinks ?? []).map((row) => row.exam_id));
  const exams = scopedExams.filter((exam) => participatingExamIds.has(exam.id));
  if (exams.length === 0) return [];

  const examIds = exams.map((exam) => exam.id);
  const [{ inputs: studentInputs }, subjectsByExam, settings] = await Promise.all([
    loadClassStudents(student.classId),
    loadSubjectsByExam(examIds, student.classId),
    loadGradingSettings(),
  ]);

  const studentInput = studentInputs.find((row) => row.student_id === student.id) ?? null;
  const studentSubjectIds = new Set(studentInput?.subjects ?? []);

  const { data: markData, error: markError } = await studentAdmin
    .from("exam_marks")
    .select("exam_id, student_id, subject_id, theory_score, practical_score, is_absent")
    .eq("class_id", student.classId)
    .in("exam_id", examIds);
  if (markError) throw markError;

  const marksByExam = new Map<string, Record<string, MarksCellInput>>();
  for (const row of (markData ?? []) as MarkRow[]) {
    const marks = marksByExam.get(row.exam_id) ?? {};
    marks[`${row.student_id}|${row.subject_id}`] = {
      theory: row.theory_score === null ? null : Number(row.theory_score),
      practical: row.practical_score === null ? null : Number(row.practical_score),
      is_absent: Boolean(row.is_absent),
    };
    marksByExam.set(row.exam_id, marks);
  }

  const results: StudentExamResult[] = [];

  for (const exam of exams) {
    const subjectRows = subjectsByExam.get(exam.id) ?? [];
    const subjects = subjectRows
      .map((row) => {
        const subject = firstRelation(row.subject);
        return {
          id: row.subject_id,
          code: subject?.code ?? "",
          name: subject?.name || "Subject",
          has_practical: Boolean(subject?.has_practical),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (subjects.length === 0) continue;

    const marks = marksByExam.get(exam.id) ?? {};
    const classResults = buildClassResults(
      {
        class_id: student.classId,
        class_name: student.className,
        subjects,
        students: studentInputs,
      },
      marks,
      settings.gradeBoundaries,
      settings.divisionRanges,
    );

    const current = classResults.students.find((row) => row.student_id === student.id);
    if (!current) {
      // The exam belongs to the student's class but no marks have been entered
      // for this student yet. Keep the exam visible so the portal can show that
      // results are still pending instead of hiding it.
      const pendingSubjects = subjects
        .filter(
          (subject) =>
            studentSubjectIds.size === 0 || studentSubjectIds.has(subject.id),
        )
        .map<ResultSubject>((subject) => ({
          subjectId: subject.id,
          code: subject.code,
          name: subject.name,
          theory: null,
          practical: null,
          score: null,
          grade: "",
          points: 0,
          isAbsent: false,
        }));

      results.push({
        id: exam.id,
        name: exam.name,
        startDate: exam.start_date,
        endDate: exam.end_date,
        year: exam.start_date.slice(0, 4),
        term: termForExamDate(exam.start_date),
        average: null,
        division: "",
        points: null,
        incomplete: true,
        classPosition: null,
        classSize: 0,
        streamPosition: null,
        streamSize: 0,
        hasMarks: false,
        subjects: pendingSubjects,
      });
      continue;
    }

    const ranked = rankResults(classResults.students);
    const classRank = ranked.find((row) => row.student.student_id === student.id);
    const streamResults = classResults.students.filter(
      (row) => row.stream_id === student.streamId,
    );
    const rankedStream = rankResults(streamResults);
    const streamRank = rankedStream.find((row) => row.student.student_id === student.id);

    let hasMarks = false;
    const subjectsOut: ResultSubject[] = current.subjects.map((subject) => {
      const cell = marks[`${student.id}|${subject.subject_id}`];
      if (
        cell &&
        (cell.theory !== null || cell.practical !== null || cell.is_absent)
      ) {
        hasMarks = true;
      }
      return {
        subjectId: subject.subject_id,
        code: subject.subject_code,
        name: subject.subject_name,
        theory: cell?.theory ?? null,
        practical: cell?.practical ?? null,
        score: subject.total_score,
        grade: subject.grade,
        points: subject.points,
        isAbsent: subject.is_absent,
      };
    });

    results.push({
      id: exam.id,
      name: exam.name,
      startDate: exam.start_date,
      endDate: exam.end_date,
      year: exam.start_date.slice(0, 4),
      term: termForExamDate(exam.start_date),
      average: mean(
        subjectsOut
          .map((subject) => subject.score)
          .filter((score): score is number => score !== null),
      ),
      division: current.division,
      points: current.total_points,
      incomplete: current.incomplete,
      classPosition: classRank?.rank ?? null,
      classSize: ranked.length,
      streamPosition: streamRank?.rank ?? null,
      streamSize: rankedStream.length,
      hasMarks,
      subjects: subjectsOut,
    });
  }

  return results;
}
