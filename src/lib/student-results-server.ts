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
import { loadActiveYearId, studentsForExamYearFilter } from "@/lib/active-year";

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

export interface StudentResultsPayload {
  /** Academic year currently being viewed (defaults to the active year). */
  year: string;
  /** Academic year the school is running right now. */
  activeYear: string;
  /** Years this student has results in, plus the active year. */
  years: string[];
  exams: StudentExamResult[];
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

// PostgREST caps every response at 1,000 rows by default. An exam season has
// thousands of mark rows, so fetch every page or older exams silently look as
// if their marks were never entered.
const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
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

async function loadStudentSubjectLinks(
  studentIds: string[],
  academicYear: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < studentIds.length; i += 100) {
    const batch = studentIds.slice(i, i + 100);
    const rows = await fetchAllRows<{ student_id: string; subject_id: string }>(
      (from, to) =>
        studentAdmin
          .from("student_subjects")
          .select("student_id, subject_id")
          .eq("academic_year", academicYear)
          .in("student_id", batch)
          .order("student_id")
          .order("subject_id")
          .range(from, to),
    );
    for (const row of rows) {
      const list = map.get(row.student_id) ?? [];
      list.push(row.subject_id);
      map.set(row.student_id, list);
    }
  }
  return map;
}

async function loadClassStudents(classId: string, academicYear: string): Promise<{
  rows: RawStudentRow[];
  inputs: ClassStudentsInput[];
}> {
  const { data, error } = await studentAdmin
    .from("students")
    .select(
      "id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)",
    )
    .eq("class_id", classId)
    .or(studentsForExamYearFilter(academicYear))
    .order("last_name")
    .order("first_name");
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawStudentRow[];
  const links = await loadStudentSubjectLinks(rows.map((row) => row.id), academicYear);

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
  return loadActiveYearId(studentAdmin);
}

function isAcademicYear(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

function examYear(exam: ExamRow): string {
  return exam.start_date.slice(0, 4);
}

function groupMarks(rows: MarkRow[]): Map<string, Record<string, MarksCellInput>> {
  const map = new Map<string, Record<string, MarksCellInput>>();
  for (const row of rows) {
    const marks = map.get(row.exam_id) ?? {};
    marks[`${row.student_id}|${row.subject_id}`] = {
      theory: row.theory_score === null ? null : Number(row.theory_score),
      practical: row.practical_score === null ? null : Number(row.practical_score),
      is_absent: Boolean(row.is_absent),
    };
    map.set(row.exam_id, marks);
  }
  return map;
}

interface ExamSubject {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

function toExamSubjects(rows: SubjectRow[]): ExamSubject[] {
  return rows
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
}

/** Exam id -> the class the student sat that exam in (from the mark snapshot). */
async function loadMarkedExamClasses(studentId: string): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{ exam_id: string; class_id: string }>((from, to) =>
    studentAdmin
      .from("exam_marks")
      .select("exam_id, class_id")
      .eq("student_id", studentId)
      .order("exam_id")
      .range(from, to),
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.exam_id)) map.set(row.exam_id, row.class_id);
  }
  return map;
}

/**
 * Roster for a past exam. The students table only holds current classes, so the
 * class list is rebuilt from the mark snapshots of that exam.
 */
async function loadExamRoster(
  examId: string,
  classId: string,
  academicYear: string,
): Promise<ClassStudentsInput[]> {
  const markRows = await fetchAllRows<{ student_id: string; stream_id: string | null }>(
    (from, to) =>
      studentAdmin
        .from("exam_marks")
        .select("student_id, stream_id")
        .eq("exam_id", examId)
        .eq("class_id", classId)
        .order("student_id")
        .range(from, to),
  );

  const streamByStudent = new Map<string, string | null>();
  for (const row of markRows) {
    if (!streamByStudent.has(row.student_id)) {
      streamByStudent.set(row.student_id, row.stream_id);
    }
  }
  const studentIds = [...streamByStudent.keys()];
  if (studentIds.length === 0) return [];

  const { data, error } = await studentAdmin
    .from("students")
    .select(
      "id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)",
    )
    .in("id", studentIds)
    .order("last_name")
    .order("first_name");
  if (error) throw error;

  const links = await loadStudentSubjectLinks(studentIds, academicYear);

  return ((data ?? []) as unknown as RawStudentRow[]).map((row) => {
    const stream = firstRelation(row.stream);
    return {
      student_id: row.id,
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      gender: row.gender,
      stream_id: streamByStudent.get(row.id) ?? row.stream_id,
      stream_name: stream?.name ?? "",
      subjects: links.get(row.id) ?? [],
    };
  });
}

function buildExamResult(params: {
  exam: ExamRow;
  student: StudentProfile;
  classId: string;
  subjects: ExamSubject[];
  studentInputs: ClassStudentsInput[];
  marks: Record<string, MarksCellInput>;
  settings: GradingSettings;
}): StudentExamResult | null {
  const { exam, student, classId, subjects, studentInputs, marks, settings } = params;
  if (subjects.length === 0) return null;

  const classResults = buildClassResults(
    {
      class_id: classId,
      class_name: student.className,
      subjects,
      students: studentInputs,
    },
    marks,
    settings.gradeBoundaries,
    settings.divisionRanges,
  );

  const studentInput = studentInputs.find((row) => row.student_id === student.id) ?? null;
  const current = classResults.students.find((row) => row.student_id === student.id);

  if (!current) {
    // The exam belongs to the student's class but no marks have been entered
    // for this student yet. Keep the exam visible so the portal can show that
    // results are still pending instead of hiding it.
    const studentSubjectIds = new Set(studentInput?.subjects ?? []);
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

    return {
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
    };
  }

  const ranked = rankResults(classResults.students);
  const classRank = ranked.find((row) => row.student.student_id === student.id);
  const studentStreamId = studentInput?.stream_id ?? student.streamId;
  const streamResults = classResults.students.filter(
    (row) => row.stream_id === studentStreamId,
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

  return {
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
  };
}

/**
 * Results for one academic year. The active year shows the student's current
 * class (pending exams included); any earlier year is rebuilt from the mark
 * snapshots so promoted students can still open last year's results. This only
 * changes what the portal displays — the school's active year is untouched.
 */
export async function loadStudentResults(
  student: StudentProfile,
  requestedYear?: string,
): Promise<StudentResultsPayload> {
  const activeYear = await loadActiveAcademicYear();
  const year = isAcademicYear(requestedYear) ? requestedYear : activeYear;

  const { data: examData, error: examError } = await studentAdmin
    .from("exams")
    .select("id, name, start_date, end_date")
    .eq("status", "published")
    .order("start_date", { ascending: false });
  if (examError) throw examError;

  const publishedExams = (examData ?? []) as ExamRow[];
  const markedClasses = await loadMarkedExamClasses(student.id);

  const years = Array.from(
    new Set([
      activeYear,
      ...publishedExams
        .filter((exam) => markedClasses.has(exam.id))
        .map((exam) => examYear(exam)),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  const payload = (exams: StudentExamResult[]): StudentResultsPayload => ({
    year,
    activeYear,
    years,
    exams,
  });

  if (!student.classId) return payload([]);

  const scopedExams = publishedExams.filter((exam) => examYear(exam) === year);
  if (scopedExams.length === 0) return payload([]);

  const settings = await loadGradingSettings();

  if (year === activeYear) {
    // Current year: only exams the student's class sits, including ones whose
    // marks have not been entered yet.
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
    if (exams.length === 0) return payload([]);

    const examIds = exams.map((exam) => exam.id);
    const [{ inputs: studentInputs }, subjectsByExam] = await Promise.all([
      loadClassStudents(student.classId, activeYear),
      loadSubjectsByExam(examIds, student.classId),
    ]);

    const markRows = await fetchAllRows<MarkRow>((from, to) =>
      studentAdmin
        .from("exam_marks")
        .select("exam_id, student_id, subject_id, theory_score, practical_score, is_absent")
        .eq("class_id", student.classId)
        .in("exam_id", examIds)
        .order("exam_id")
        .order("student_id")
        .order("subject_id")
        .range(from, to),
    );
    const marksByExam = groupMarks(markRows);

    const results: StudentExamResult[] = [];
    for (const exam of exams) {
      const result = buildExamResult({
        exam,
        student,
        classId: student.classId,
        subjects: toExamSubjects(subjectsByExam.get(exam.id) ?? []),
        studentInputs,
        marks: marksByExam.get(exam.id) ?? {},
        settings,
      });
      if (result) results.push(result);
    }
    return payload(results);
  }

  // Earlier year: only exams the student actually sat.
  const exams = scopedExams.filter((exam) => markedClasses.has(exam.id));
  if (exams.length === 0) return payload([]);

  const results: StudentExamResult[] = [];
  for (const exam of exams) {
    const classId = markedClasses.get(exam.id);
    if (!classId) continue;

    const [subjectsByExam, studentInputs] = await Promise.all([
      loadSubjectsByExam([exam.id], classId),
      loadExamRoster(exam.id, classId, year),
    ]);

    const markRows = await fetchAllRows<MarkRow>((from, to) =>
      studentAdmin
        .from("exam_marks")
        .select("exam_id, student_id, subject_id, theory_score, practical_score, is_absent")
        .eq("exam_id", exam.id)
        .eq("class_id", classId)
        .order("student_id")
        .order("subject_id")
        .range(from, to),
    );

    const result = buildExamResult({
      exam,
      student,
      classId,
      subjects: toExamSubjects(subjectsByExam.get(exam.id) ?? []),
      studentInputs,
      marks: groupMarks(markRows).get(exam.id) ?? {},
      settings,
    });
    if (result) results.push(result);
  }

  return payload(results);
}
