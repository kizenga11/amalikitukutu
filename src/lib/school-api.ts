import { supabase } from "./supabase";
import {
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  DEFAULT_COMPETENCY_THRESHOLDS,
  type GradeBoundary,
  type DivisionRange,
  type CompetencyThreshold,
  type GradingSettings,
} from "./grading";

export type AttendancePoint = { label: string; value: number };

export type DashboardData = {
  totalStudents: number;
  teachingStaff: number;
  activeClasses: number;
  totalSubjects: number;
  avgPerformance: number;
  attendance: AttendancePoint[];
  genderDistribution: { label: string; value: number }[];
  performanceTrend: { label: string; value: number }[];
  subjectPerformance: { subject: string; class: string; score: number; up: boolean }[];
};

// ---------------------------------------------------------------
// Academic calendar / settings
// ---------------------------------------------------------------
export interface AcademicSettings {
  activeYearId: string;
  activeTerm: 1 | 2;
}

export async function fetchAcademicSettings(): Promise<AcademicSettings | null> {
  const { data, error } = await supabase.from("academic_settings").select("key, value");
  if (error) throw error;
  const settings = (data ?? []).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  if (!settings.active_year || !settings.active_term) return null;
  const term = Number(settings.active_term);
  if (term !== 1 && term !== 2) return null;
  return { activeYearId: settings.active_year, activeTerm: term };
}

export async function saveAcademicSettings(settings: AcademicSettings): Promise<void> {
  const rows = [
    { key: "active_year", value: settings.activeYearId },
    { key: "active_term", value: String(settings.activeTerm) },
  ];
  for (const row of rows) {
    const { error } = await supabase
      .from("academic_settings")
      .upsert(row, { onConflict: "key" });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------
// Shared row types for DB-backed modules
// ---------------------------------------------------------------
export interface DbStream {
  id: string;
  class_id: string;
  name: string;
}

export interface DbClassRow {
  id: string;
  form_level: 1 | 2 | 3 | 4;
  name: string;
  streams: DbStream[];
}

export interface DbSubjectRow {
  id: string;
  code: string;
  name: string;
  subject_type: "Compulsory" | "Optional";
  has_practical: boolean;
  stream: "General" | "Vocational" | "Both";
}

// ---------------------------------------------------------------
// Classes + Streams
// ---------------------------------------------------------------
export async function fetchClassesWithStreams(): Promise<DbClassRow[]> {
  const { data: classes, error: classesError } = await supabase
    .from("school_classes")
    .select("id, form_level, name")
    .order("form_level");
  if (classesError) throw classesError;

  const { data: streams, error: streamsError } = await supabase.from("streams").select("id, class_id, name");
  if (streamsError) throw streamsError;

  return (classes ?? []).map((cls) => ({
    id: cls.id,
    form_level: cls.form_level as 1 | 2 | 3 | 4,
    name: cls.name,
    streams: (streams ?? []).filter((s) => s.class_id === cls.id).map((s) => ({ id: s.id, class_id: s.class_id, name: s.name })),
  }));
}

export async function insertStream(classId: string, name: string): Promise<DbStream> {
  const { data, error } = await supabase.from("streams").insert({ class_id: classId, name }).select().single();
  if (error) throw error;
  return data;
}

export async function updateStream(streamId: string, name: string): Promise<void> {
  const { error } = await supabase.from("streams").update({ name }).eq("id", streamId);
  if (error) throw error;
}

export async function deleteStream(streamId: string): Promise<void> {
  const { error } = await supabase.from("streams").delete().eq("id", streamId);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------
export async function fetchSubjects(): Promise<DbSubjectRow[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name, subject_type, has_practical, stream")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    subject_type: row.subject_type as DbSubjectRow["subject_type"],
    has_practical: row.has_practical,
    stream: row.stream as DbSubjectRow["stream"],
  }));
}

export async function insertSubject(row: Omit<DbSubjectRow, "id">): Promise<DbSubjectRow> {
  const { data, error } = await supabase.from("subjects").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateSubject(id: string, patch: Partial<Omit<DbSubjectRow, "id">>): Promise<void> {
  const { error } = await supabase.from("subjects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSubjectRow(id: string): Promise<void> {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------
async function count(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

interface PerformanceRow {
  class_name: string;
  subject_name: string;
  mean_score: number;
  term: number;
  academic_year: string;
}

function mondayOfCurrentWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  return monday;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchDashboardData(yearId: string, term: number): Promise<DashboardData> {
  const [totalStudents, teachingStaff, activeClasses, totalSubjects] = await Promise.all([
    count("students"),
    count("staff"),
    count("streams"),
    count("subjects"),
  ]);

  // ---- Attendance: Mon–Fri of the current week ----
  const monday = mondayOfCurrentWeek();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance")
    .select("attendance_date, present, total")
    .gte("attendance_date", formatDate(monday))
    .lt("attendance_date", formatDate(sunday));
  if (attendanceError) throw attendanceError;

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const attendanceMap = new Map<string, { present: number; total: number }>();
  for (const row of attendanceRows ?? []) {
    const dayName = new Date(`${row.attendance_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
    if (!WEEKDAYS.includes(dayName)) continue;
    const acc = attendanceMap.get(dayName) ?? { present: 0, total: 0 };
    acc.present += row.present;
    acc.total += row.total;
    attendanceMap.set(dayName, acc);
  }
  const attendance = WEEKDAYS.map((label) => {
    const acc = attendanceMap.get(label);
    return { label, value: acc ? Math.round((acc.present / acc.total) * 100) : 0 };
  });

  // ---- Gender distribution ----
  const { data: studentGenders, error: gendersError } = await supabase
    .from("students")
    .select("gender");
  if (gendersError) throw gendersError;
  const genderCounts = { Male: 0, Female: 0 };
  for (const row of studentGenders ?? []) {
    if (row.gender === "Male") genderCounts.Male += 1;
    if (row.gender === "Female") genderCounts.Female += 1;
  }
  const genderTotal = genderCounts.Male + genderCounts.Female;
  const genderDistribution = [
    { label: "Boys", value: genderTotal ? Math.round((genderCounts.Male / genderTotal) * 100) : 0 },
    { label: "Girls", value: genderTotal ? Math.round((genderCounts.Female / genderTotal) * 100) : 0 },
  ];

  // ---- Performance ----
  interface RawPerformanceRow {
    mean_score: number;
    term: number;
    academic_year: string;
    subject: { name: string }[] | { name: string } | null;
    class: { name: string }[] | { name: string } | null;
  }

  const { data: performanceRows, error: perfError } = await supabase
    .from("performance")
    .select("mean_score, term, academic_year, subject:subjects(name), class:school_classes(name)");
  if (perfError) throw perfError;

  const typedRows: PerformanceRow[] = (performanceRows ?? []).map((row) => {
    const raw = row as unknown as RawPerformanceRow;
    const subject = Array.isArray(raw.subject) ? raw.subject[0] : raw.subject;
    const klass = Array.isArray(raw.class) ? raw.class[0] : raw.class;
    return {
      mean_score: Number(raw.mean_score),
      term: raw.term,
      academic_year: raw.academic_year,
      subject_name: subject?.name ?? "Unknown",
      class_name: klass?.name ?? "Unknown",
    };
  });

  // Average performance for the selected period
  const periodRows = typedRows.filter((r) => r.academic_year === yearId && r.term === term);
  const avgPerformance = average(periodRows.map((r) => r.mean_score));

  // Trend per term for the selected year
  const performanceTrend = [1, 2].map((t) => {
    const vals = typedRows.filter((r) => r.academic_year === yearId && r.term === t).map((r) => r.mean_score);
    return { label: `Term ${t}`, value: average(vals) };
  });

  // Subject performance for current period, top 5 with "up" vs previous term
  const prevTerm = term === 1 ? 2 : 1;
  const prevYear = term === 1 ? String(Number(yearId) - 1) : yearId;
  const subjectAgg = new Map<string, { subject: string; klass: string; scores: number[]; prevAvg: number }>();
  for (const r of typedRows) {
    if (r.academic_year === yearId && r.term === term) {
      const acc = subjectAgg.get(r.subject_name) ?? { subject: r.subject_name, klass: r.class_name, scores: [], prevAvg: 0 };
      acc.scores.push(r.mean_score);
      subjectAgg.set(r.subject_name, acc);
    }
  }
  for (const r of typedRows) {
    if (r.academic_year === prevYear && r.term === prevTerm) {
      const acc = subjectAgg.get(r.subject_name);
      if (acc) acc.prevAvg += r.mean_score;
    }
  }
  const subjectPerformance = Array.from(subjectAgg.values())
    .map((s) => {
      const count = s.prevAvg > 0 ? 4 : 1;
      const current = average(s.scores);
      const prev = s.prevAvg > 0 ? Math.round((s.prevAvg / count) * 10) / 10 : current;
      return { subject: s.subject, class: `${s.klass} · ${yearId}`, score: current, up: current >= prev };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    totalStudents,
    teachingStaff,
    activeClasses,
    totalSubjects,
    avgPerformance,
    attendance,
    genderDistribution,
    performanceTrend,
    subjectPerformance,
  };
}

// ---------------------------------------------------------------
// Students (Registration CRUD)
// ---------------------------------------------------------------
export type Gender = "Male" | "Female";

export interface DbStudentRow {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender;
  phone: string | null;
  class_id: string | null;
  stream_id: string | null;
  school_classes?: { name: string } | null;
  streams?: { name: string } | null;
}

export interface StudentListResult {
  rows: DbStudentRow[];
  total: number;
}

export interface StudentListParams {
  search?: string;
  classId?: string;
  streamId?: string;
  page: number;
  pageSize: number;
}

export async function fetchStudents(params: StudentListParams): Promise<StudentListResult> {
  let query = supabase
    .from("students")
    .select("*, school_classes(name), streams(name)", { count: "exact" });

  if (params.classId) query = query.eq("class_id", params.classId);
  if (params.streamId) query = query.eq("stream_id", params.streamId);

  const keyword = params.search?.trim().toLowerCase();
  if (keyword) {
    query = query.or(
      `first_name.ilike.%${keyword}%,middle_name.ilike.%${keyword}%,last_name.ilike.%${keyword}%,phone.ilike.%${keyword}%`,
    );
  }

  query = query
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as DbStudentRow[], total: count ?? 0 };
}

export interface StudentInput {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender;
  phone: string | null;
  class_id: string | null;
  stream_id: string | null;
}

export async function insertStudent(input: StudentInput): Promise<DbStudentRow> {
  const { data, error } = await supabase.from("students").insert(input).select().single();
  if (error) throw error;
  return data as DbStudentRow;
}

export async function updateStudent(id: string, input: StudentInput): Promise<DbStudentRow> {
  const { data, error } = await supabase.from("students").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data as DbStudentRow;
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Students — Subject assignments
// ---------------------------------------------------------------
export async function fetchStudentSubjects(studentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("student_subjects")
    .select("subject_id")
    .eq("student_id", studentId);
  if (error) throw error;
  return (data ?? []).map((row) => row.subject_id);
}

export async function saveStudentSubjects(studentId: string, subjectIds: string[]): Promise<void> {
  const { data: currentRows, error: currentError } = await supabase
    .from("student_subjects")
    .select("subject_id, subjects(subject_type)")
    .eq("student_id", studentId);
  if (currentError) throw currentError;

  const currentIds = (currentRows ?? []).map((row) => row.subject_id);
  const currentSubjectTypes = new Map(
    (currentRows ?? []).map((row) => {
      const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
      return [row.subject_id, subject?.subject_type] as const;
    }),
  );
  const desiredIds = new Set(subjectIds);
  const optionalIdsToRemove = currentIds.filter(
    (id) => currentSubjectTypes.get(id) !== "Compulsory" && !desiredIds.has(id),
  );

  if (optionalIdsToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("student_subjects")
      .delete()
      .eq("student_id", studentId)
      .in("subject_id", optionalIdsToRemove);
    if (deleteError) throw deleteError;
  }

  const idsToAdd = subjectIds.filter((id) => !currentIds.includes(id));
  if (idsToAdd.length === 0) return;
  const { error: insertError } = await supabase
    .from("student_subjects")
    .upsert(
      idsToAdd.map((subject_id) => ({ student_id: studentId, subject_id })),
      { onConflict: "student_id,subject_id", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;
}

// ---------------------------------------------------------------
// Teachers (Staff CRUD)
// ---------------------------------------------------------------
export interface DbTeacherRow {
  id: string;
  name: string;
  role: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  gender: Gender | null;
  phone: string | null;
  email: string | null;
  password: string | null;
  auth_user_id: string | null;
  subject_id: string | null;
  created_at: string;
}

export interface TeacherInput {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender;
  phone: string | null;
  email: string | null;
  password: string | null;
}

export interface TeacherListParams {
  search?: string;
  page: number;
  pageSize: number;
}

export async function fetchTeachers(params: TeacherListParams): Promise<{ rows: DbTeacherRow[]; total: number }> {
  let query = supabase
    .from("staff")
    .select("*", { count: "exact" })
    .eq("role", "Teacher")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const keyword = params.search?.trim().toLowerCase();
  if (keyword) {
    query = query.or(
      `name.ilike.%${keyword}%,first_name.ilike.%${keyword}%,last_name.ilike.%${keyword}%,email.ilike.%${keyword}%,phone.ilike.%${keyword}%`,
    );
  }

  query = query.range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as DbTeacherRow[], total: count ?? 0 };
}

export async function insertTeacher(input: TeacherInput): Promise<DbTeacherRow> {
  const fullName = [input.first_name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const { data, error } = await supabase
    .from("staff")
    .insert({
      name: fullName,
      role: "Teacher",
      first_name: input.first_name,
      middle_name: input.middle_name,
      last_name: input.last_name,
      gender: input.gender,
      phone: input.phone,
      email: input.email,
      password: input.password,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbTeacherRow;
}

export async function updateTeacher(id: string, input: TeacherInput): Promise<DbTeacherRow> {
  const fullName = [input.first_name, input.middle_name, input.last_name].filter(Boolean).join(" ");
  const { data, error } = await supabase
    .from("staff")
    .update({
      name: fullName,
      first_name: input.first_name,
      middle_name: input.middle_name,
      last_name: input.last_name,
      gender: input.gender,
      phone: input.phone,
      email: input.email,
      password: input.password,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as DbTeacherRow;
}

export async function deleteTeacher(id: string): Promise<void> {
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Teaching Assignments
// ---------------------------------------------------------------
export interface TeachingAssignment {
  id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
  stream_id: string;
}

export type TeachingScope = "General" | "Vocational" | "Both";

export async function fetchTeachingAssignments(teacherId: string): Promise<TeachingAssignment[]> {
  const { data, error } = await supabase
    .from("teaching_assignments")
    .select("id, teacher_id, subject_id, class_id, stream_id")
    .eq("teacher_id", teacherId);
  if (error) throw error;
  return (data ?? []) as TeachingAssignment[];
}

export async function fetchTeachingAssignmentCounts(teacherIds: string[]): Promise<Record<string, number>> {
  if (teacherIds.length === 0) return {};
  const { data, error } = await supabase
    .from("teaching_assignments")
    .select("teacher_id");
  if (error) throw error;
  const counts: Record<string, number> = Object.fromEntries(teacherIds.map((id) => [id, 0]));
  for (const row of data ?? []) {
    if (row.teacher_id in counts) counts[row.teacher_id] += 1;
  }
  return counts;
}

export async function saveTeachingAssignments(
  teacherId: string,
  assignments: { subject_id: string; class_id: string; stream_id: string }[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("teaching_assignments")
    .delete()
    .eq("teacher_id", teacherId);
  if (deleteError) throw deleteError;
  if (assignments.length === 0) return;
  const { error: insertError } = await supabase
    .from("teaching_assignments")
    .insert(assignments.map((a) => ({ ...a, teacher_id: teacherId })));
  if (insertError) throw insertError;
}

// ---------------------------------------------------------------
// Teacher dashboard (assignments + students + subject-scoped stats)
// ---------------------------------------------------------------
export async function fetchTeacherByAuth(authUserId: string): Promise<DbTeacherRow | null> {
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("auth_user_id", authUserId)
    .eq("role", "Teacher")
    .maybeSingle();
  if (error) throw error;
  return (data as DbTeacherRow | null) ?? null;
}

export interface TeacherSubjectStudent {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: Gender;
  phone: string | null;
}

export interface TeacherAssignmentGroup {
  assignment_id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  class_id: string;
  class_name: string;
  stream_id: string;
  stream_name: string;
  students: TeacherSubjectStudent[];
}

export interface TeacherDashboardData {
  assignments: TeacherAssignmentGroup[];
  subjectCount: number;
  classCount: number;
  studentCount: number;
  enrollmentCount: number;
  avgPerformance: number;
  performanceTrend: { label: string; value: number }[];
  subjectPerformance: { subject: string; class: string; score: number; up: boolean }[];
  genderDistribution: { label: string; value: number }[];
}

function emptyTeacherDashboard(): TeacherDashboardData {
  return {
    assignments: [],
    subjectCount: 0,
    classCount: 0,
    studentCount: 0,
    enrollmentCount: 0,
    avgPerformance: 0,
    performanceTrend: [
      { label: "Term 1", value: 0 },
      { label: "Term 2", value: 0 },
    ],
    subjectPerformance: [],
    genderDistribution: [
      { label: "Boys", value: 0 },
      { label: "Girls", value: 0 },
    ],
  };
}

export async function fetchTeacherDashboard(teacherId: string, yearId: string, term: number): Promise<TeacherDashboardData> {
  const { data: assignmentRows, error: taError } = await supabase
    .from("teaching_assignments")
    .select("id, subject_id, class_id, stream_id, subject:subjects(code, name), class:school_classes(name), stream:streams(name)")
    .eq("teacher_id", teacherId);
  if (taError) throw taError;

  interface RawTa {
    id: string;
    subject_id: string;
    class_id: string;
    stream_id: string;
    subject: { code: string; name: string }[] | { code: string; name: string } | null;
    class: { name: string }[] | { name: string } | null;
    stream: { name: string }[] | { name: string } | null;
  }

  const base = (assignmentRows ?? []).map((row) => {
    const raw = row as unknown as RawTa;
    const subject = Array.isArray(raw.subject) ? raw.subject[0] : raw.subject;
    const klass = Array.isArray(raw.class) ? raw.class[0] : raw.class;
    const stream = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
    return {
      assignment_id: raw.id,
      subject_id: raw.subject_id,
      class_id: raw.class_id,
      stream_id: raw.stream_id,
      subject_code: subject?.code ?? "",
      subject_name: subject?.name ?? "Unknown",
      class_name: klass?.name ?? "Unknown",
      stream_name: stream?.name ?? "Unknown",
    };
  });

  if (base.length === 0) return emptyTeacherDashboard();

  const streamIds = [...new Set(base.map((a) => a.stream_id))];
  const subjectIds = [...new Set(base.map((a) => a.subject_id))];
  const classIds = [...new Set(base.map((a) => a.class_id))];

  const [{ data: students, error: studentsError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, middle_name, last_name, gender, phone, stream_id")
      .in("stream_id", streamIds),
    supabase
      .from("student_subjects")
      .select("student_id, subject_id")
      .in("subject_id", subjectIds),
  ]);
  if (studentsError) throw studentsError;
  if (membershipError) throw membershipError;

  const studentById = new Map<string, TeacherSubjectStudent>();
  for (const s of students ?? []) {
    studentById.set(s.id, {
      id: s.id,
      first_name: s.first_name,
      middle_name: s.middle_name,
      last_name: s.last_name,
      gender: s.gender as Gender,
      phone: s.phone,
    });
  }
  const membershipSet = new Set((membership ?? []).map((m) => `${m.student_id}:${m.subject_id}`));

  const assignments = base
    .map((a) => ({
      ...a,
      students: (students ?? [])
        .filter((s) => s.stream_id === a.stream_id && membershipSet.has(`${s.id}:${a.subject_id}`))
        .map((s) => studentById.get(s.id)!)
        .sort((x, y) => x.last_name.localeCompare(y.last_name) || x.first_name.localeCompare(y.first_name)),
    }))
    .sort((x, y) => x.subject_name.localeCompare(y.subject_name) || x.class_name.localeCompare(y.class_name) || x.stream_name.localeCompare(y.stream_name));

  const distinctStudents = new Map<string, TeacherSubjectStudent>();
  for (const a of assignments) for (const s of a.students) distinctStudents.set(s.id, s);
  const subjectCount = new Set(assignments.map((a) => a.subject_id)).size;
  const classCount = new Set(assignments.map((a) => a.class_id)).size;
  const studentCount = distinctStudents.size;
  const enrollmentCount = assignments.reduce((sum, a) => sum + a.students.length, 0);

  // ---- Performance scoped to the teacher's subject × class pairs ----
  const pairKey = (subjectId: string, classId: string) => `${subjectId}:${classId}`;
  const pairSet = new Set(assignments.map((a) => pairKey(a.subject_id, a.class_id)));
  const subjectNameById = new Map(assignments.map((a) => [a.subject_id, a.subject_name]));
  const classNameById = new Map(assignments.map((a) => [a.class_id, a.class_name]));

  const { data: perfRows, error: perfError } = await supabase
    .from("performance")
    .select("subject_id, class_id, mean_score, term, academic_year")
    .in("subject_id", subjectIds)
    .in("class_id", classIds);
  if (perfError) throw perfError;

  const myRows: { subject_id: string; class_id: string; mean_score: number; term: number; academic_year: string }[] = (
    perfRows ?? []
  )
    .filter((r) => pairSet.has(pairKey(r.subject_id, r.class_id)))
    .map((r) => ({ subject_id: r.subject_id, class_id: r.class_id, mean_score: Number(r.mean_score), term: r.term, academic_year: r.academic_year }));

  const periodRows = myRows.filter((r) => r.academic_year === yearId && r.term === term);
  const avgPerformance = average(periodRows.map((r) => r.mean_score));

  const performanceTrend = [1, 2].map((t) => ({
    label: `Term ${t}`,
    value: average(myRows.filter((r) => r.academic_year === yearId && r.term === t).map((r) => r.mean_score)),
  }));

  const prevTerm = term === 1 ? 2 : 1;
  const prevYear = term === 1 ? String(Number(yearId) - 1) : yearId;
  const subjAgg = new Map<string, { subject: string; klass: string; scores: number[]; prevScores: number[] }>();
  for (const r of myRows) {
    const key = pairKey(r.subject_id, r.class_id);
    const acc = subjAgg.get(key) ?? {
      subject: subjectNameById.get(r.subject_id) ?? "Unknown",
      klass: classNameById.get(r.class_id) ?? "Unknown",
      scores: [],
      prevScores: [],
    };
    if (r.academic_year === yearId && r.term === term) acc.scores.push(r.mean_score);
    if (r.academic_year === prevYear && r.term === prevTerm) acc.prevScores.push(r.mean_score);
    subjAgg.set(key, acc);
  }
  const subjectPerformance = Array.from(subjAgg.values())
    .map((s) => {
      const current = average(s.scores);
      const prev = average(s.prevScores);
      return { subject: s.subject, class: s.klass, score: current, up: current >= prev };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // ---- Gender distribution across the teacher's students ----
  const male = [...distinctStudents.values()].filter((s) => s.gender === "Male").length;
  const female = [...distinctStudents.values()].filter((s) => s.gender === "Female").length;
  const genderTotal = male + female;
  const genderDistribution = [
    { label: "Boys", value: genderTotal ? Math.round((male / genderTotal) * 100) : 0 },
    { label: "Girls", value: genderTotal ? Math.round((female / genderTotal) * 100) : 0 },
  ];

  return {
    assignments,
    subjectCount,
    classCount,
    studentCount,
    enrollmentCount,
    avgPerformance,
    performanceTrend,
    subjectPerformance,
    genderDistribution,
  };
}

// ---------------------------------------------------------------
// Exams
// ---------------------------------------------------------------
export type ExamStatus = "draft" | "active" | "processing" | "published";

export interface DbExamRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  status: ExamStatus;
  created_at: string;
  class_count: number;
  subject_count: number;
}

export interface DbExamClass {
  id: string;
  name: string;
  subjects: { id: string; code: string; name: string; has_practical: boolean }[];
}

export interface DbExamDetail {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  status: ExamStatus;
  created_at: string;
  classes: DbExamClass[];
}

export interface ExamClassSubjects {
  class_id: string;
  subject_ids: string[];
}

export interface ExamInput {
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  class_subjects: ExamClassSubjects[];
}

export interface ExamListParams {
  search?: string;
  page: number;
  pageSize: number;
}

export async function fetchExams(params: ExamListParams): Promise<{ rows: DbExamRow[]; total: number }> {
  let query = supabase
    .from("exams")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  const keyword = params.search?.trim().toLowerCase();
  if (keyword) query = query.ilike("name", `%${keyword}%`);

  query = query.range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id);
  let classRows: { data: { exam_id: string }[] | null; error: unknown } | null = null;
  let subjectRows: { data: { exam_id: string }[] | null; error: unknown } | null = null;

  if (ids.length > 0) {
    [classRows, subjectRows] = await Promise.all([
      supabase.from("exam_classes").select("exam_id").in("exam_id", ids),
      supabase.from("exam_class_subjects").select("exam_id").in("exam_id", ids),
    ]);
  } else {
    classRows = { data: [], error: null };
    subjectRows = { data: [], error: null };
  }
  if (classRows.error) throw classRows.error;
  if (subjectRows.error) throw subjectRows.error;

  const classCounts = new Map<string, number>();
  for (const row of classRows.data ?? []) classCounts.set(row.exam_id, (classCounts.get(row.exam_id) ?? 0) + 1);
  const subjectCounts = new Map<string, number>();
  for (const row of subjectRows.data ?? []) subjectCounts.set(row.exam_id, (subjectCounts.get(row.exam_id) ?? 0) + 1);

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    start_date: r.start_date,
    end_date: r.end_date,
    has_practical: r.has_practical,
    status: r.status as ExamStatus,
    created_at: r.created_at,
    class_count: classCounts.get(r.id) ?? 0,
    subject_count: subjectCounts.get(r.id) ?? 0,
  }));

  return { rows, total: count ?? 0 };
}

async function replaceExamRelations(
  examId: string,
  classSubjects: ExamClassSubjects[],
): Promise<void> {
  const { error: delClasses } = await supabase.from("exam_classes").delete().eq("exam_id", examId);
  if (delClasses) throw delClasses;
  const { error: delSubjectLinks } = await supabase.from("exam_class_subjects").delete().eq("exam_id", examId);
  if (delSubjectLinks) throw delSubjectLinks;

  const classIds = classSubjects.map((c) => c.class_id);
  if (classIds.length > 0) {
    const { error: insClasses } = await supabase
      .from("exam_classes")
      .insert(classIds.map((class_id) => ({ exam_id: examId, class_id })));
    if (insClasses) throw insClasses;
  }

  const subjectLinks = classSubjects.flatMap((c) =>
    c.subject_ids.map((subject_id) => ({ exam_id: examId, class_id: c.class_id, subject_id })),
  );
  if (subjectLinks.length > 0) {
    const { error: insSubjects } = await supabase.from("exam_class_subjects").insert(subjectLinks);
    if (insSubjects) throw insSubjects;
  }
}

export async function insertExam(input: ExamInput): Promise<DbExamRow> {
  const { data, error } = await supabase
    .from("exams")
    .insert({ name: input.name, start_date: input.start_date, end_date: input.end_date, has_practical: input.has_practical })
    .select()
    .single();
  if (error) throw error;
  await replaceExamRelations(data.id, input.class_subjects);
  const subjectCount = input.class_subjects.reduce((sum, c) => sum + c.subject_ids.length, 0);
  return {
    ...(data as Omit<DbExamRow, "class_count" | "subject_count">),
    class_count: input.class_subjects.length,
    subject_count: subjectCount,
  };
}

export async function updateExam(id: string, input: ExamInput): Promise<void> {
  const { error } = await supabase
    .from("exams")
    .update({ name: input.name, start_date: input.start_date, end_date: input.end_date, has_practical: input.has_practical })
    .eq("id", id);
  if (error) throw error;
  await replaceExamRelations(id, input.class_subjects);
}

export async function updateExamStatus(id: string, status: ExamStatus): Promise<void> {
  const { error } = await supabase.from("exams").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await supabase.from("exams").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchExamDetail(examId: string): Promise<DbExamDetail> {
  const { data: exam, error } = await supabase.from("exams").select("*").eq("id", examId).single();
  if (error) throw error;

  interface ClassSubjectRel {
    class_id: string;
    subject: { code: string; name: string; has_practical: boolean }[] | { code: string; name: string; has_practical: boolean } | null;
    subject_id: string;
  }

  const [classRels, subjectRels] = await Promise.all([
    supabase
      .from("exam_classes")
      .select("class_id, class:school_classes(name)")
      .eq("exam_id", examId),
    supabase
      .from("exam_class_subjects")
      .select("class_id, subject_id, subject:subjects(code, name, has_practical)")
      .eq("exam_id", examId),
  ]);
  if (classRels.error) throw classRels.error;
  if (subjectRels.error) throw subjectRels.error;

  const classNames = new Map<string, string>();
  for (const row of classRels.data ?? []) {
    const raw = row as unknown as { class_id: string; class: { name: string }[] | { name: string } | null };
    const name = Array.isArray(raw.class) ? raw.class[0] : raw.class;
    classNames.set(raw.class_id, name?.name ?? "Unknown");
  }

  const subjectByClass = new Map<string, { id: string; code: string; name: string; has_practical: boolean }[]>();
  for (const row of (subjectRels.data ?? []) as unknown as ClassSubjectRel[]) {
    const s = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const subject = { id: row.subject_id, code: s?.code ?? "", name: s?.name ?? "Unknown", has_practical: s?.has_practical ?? false };
    const list = subjectByClass.get(row.class_id) ?? [];
    list.push(subject);
    subjectByClass.set(row.class_id, list);
  }

  const classes: DbExamClass[] = Array.from(classNames.entries())
    .map(([id, name]) => ({
      id,
      name,
      subjects: (subjectByClass.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...(exam as Omit<DbExamDetail, "classes">),
    classes,
  };
}

// ── Exam marks ────────────────────────────────────────────

export interface DbExamMarkStudent {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: string[];
}

export interface ExamMarksClass {
  class_id: string;
  class_name: string;
  subjects: { id: string; code: string; name: string; has_practical: boolean }[];
  students: DbExamMarkStudent[];
}

export interface ExamMarkCell {
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface ExamMarksData {
  marks: Record<string, ExamMarkCell>;
  classes: ExamMarksClass[];
}

function markKey(studentId: string, subjectId: string): string {
  return `${studentId}|${subjectId}`;
}

export async function fetchExamMarks(examId: string): Promise<ExamMarksData> {
  const detail = await fetchExamDetail(examId);
  const classIds = detail.classes.map((c) => c.id);

  const { data: studentData, error: studentErr } =
    classIds.length > 0
      ? await supabase
          .from("students")
          .select("id, first_name, middle_name, last_name, gender, class_id, stream_id, stream:streams(name)")
          .in("class_id", classIds)
      : { data: null, error: null };
  if (studentErr) throw studentErr;

  let subjectLinks: { data: { student_id: string; subject_id: string }[] | null; error: unknown } = { data: [], error: null };
  let marksRows: { data: { student_id: string; subject_id: string; theory_score: number | null; practical_score: number | null; is_absent: boolean }[] | null; error: unknown } = { data: [], error: null };

  if (classIds.length > 0) {
    const studentIds = (studentData ?? []).map((student) => student.id);
    const studentIdBatches: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 100) {
      studentIdBatches.push(studentIds.slice(i, i + 100));
    }

    const [subjectLinkBatches, fetchedMarks] = await Promise.all([
      Promise.all(
        studentIdBatches.map((batch) =>
          supabase
            .from("student_subjects")
            .select("student_id, subject_id")
            .in("student_id", batch),
        ),
      ),
      supabase.from("exam_marks").select("student_id, subject_id, theory_score, practical_score, is_absent").eq("exam_id", examId).in("class_id", classIds),
    ]);

    const subjectLinkError = subjectLinkBatches.find((result) => result.error)?.error;
    subjectLinks = {
      data: subjectLinkBatches.flatMap((result) => result.data ?? []),
      error: subjectLinkError ?? null,
    };
    marksRows = fetchedMarks;
  }
  if (subjectLinks.error) throw subjectLinks.error;
  if (marksRows.error) throw marksRows.error;

  interface StudentRaw {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string;
    class_id: string;
    stream_id: string | null;
    stream: { name: string }[] | { name: string } | null;
  }

  const studentSubjects = new Map<string, Set<string>>();
  for (const row of subjectLinks.data ?? []) {
    const set = studentSubjects.get(row.student_id) ?? new Set<string>();
    set.add(row.subject_id);
    studentSubjects.set(row.student_id, set);
  }

  const marks: Record<string, ExamMarkCell> = {};
  for (const row of marksRows.data ?? []) {
    marks[markKey(row.student_id, row.subject_id)] = {
      theory: row.theory_score !== null ? Number(row.theory_score) : null,
      practical: row.practical_score !== null ? Number(row.practical_score) : null,
      is_absent: row.is_absent ?? false,
    };
  }

  const classes: ExamMarksClass[] = detail.classes.map((c) => {
    const studentsInClass: DbExamMarkStudent[] = [];
    for (const raw of (studentData ?? []) as unknown as StudentRaw[]) {
      if (raw.class_id !== c.id) continue;
      let streamName = "—";
      if (raw.stream_id) {
        const s = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
        streamName = s?.name ?? "—";
      }
      studentsInClass.push({
        student_id: raw.id,
        first_name: raw.first_name,
        middle_name: raw.middle_name,
        last_name: raw.last_name,
        gender: raw.gender,
        stream_id: raw.stream_id,
        stream_name: streamName,
        subjects: Array.from(studentSubjects.get(raw.id) ?? []),
      });
    }
    studentsInClass.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
    return {
      class_id: c.id,
      class_name: c.name,
      subjects: c.subjects,
      students: studentsInClass,
    };
  });

  return { marks, classes };
}

export interface ExamMarkEntry {
  subject_id: string;
  student_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean;
  stream_id: string | null;
}

export async function saveExamMarks(
  examId: string,
  classId: string,
  entries: ExamMarkEntry[],
  clearKeys: { student_id: string; subject_id: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // Delete rows the user explicitly cleared (blanked a score that was previously
  // saved). Scoped per (student, subject) so marks saved earlier for other
  // students/subjects are never touched.
  if (clearKeys.length > 0) {
    const CLEAR_BATCH = 100;
    for (let i = 0; i < clearKeys.length; i += CLEAR_BATCH) {
      const chunk = clearKeys.slice(i, i + CLEAR_BATCH);
      const orFilter = chunk
        .map((k) => `and(subject_id.eq.${k.subject_id},student_id.eq.${k.student_id})`)
        .join(",");
      const { error: clearErr } = await supabase
        .from("exam_marks")
        .delete()
        .eq("exam_id", examId)
        .eq("class_id", classId)
        .or(orFilter);
      if (clearErr) throw clearErr;
    }
  }

  const BATCH_SIZE = 500;
  const rows = entries.map((e) => ({
    exam_id: examId,
    class_id: classId,
    stream_id: e.stream_id,
    subject_id: e.subject_id,
    student_id: e.student_id,
    theory_score: e.theory_score,
    practical_score: e.practical_score,
    is_absent: e.is_absent,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("exam_marks").upsert(batch, {
      onConflict: "exam_id,class_id,subject_id,student_id",
    });
    if (error) throw error;
    onProgress?.(Math.min(i + batch.length, rows.length), rows.length);
  }
}

// ---------------------------------------------------------------
// Grading settings (NECTA boundaries stored as JSON in academic_settings)
// ---------------------------------------------------------------
const GRADE_BOUNDARIES_KEY = "grade_boundaries";
const DIVISION_RANGES_KEY = "division_ranges";
const COMPETENCY_THRESHOLDS_KEY = "competency_thresholds";

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function fetchGradingSettings(): Promise<GradingSettings> {
  const { data, error } = await supabase
    .from("academic_settings")
    .select("key, value")
    .in("key", [GRADE_BOUNDARIES_KEY, DIVISION_RANGES_KEY, COMPETENCY_THRESHOLDS_KEY]);
  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.key, row.value);

  return {
    gradeBoundaries: parseJson<GradeBoundary[]>(map.get(GRADE_BOUNDARIES_KEY), DEFAULT_GRADE_BOUNDARIES),
    divisionRanges: parseJson<DivisionRange[]>(map.get(DIVISION_RANGES_KEY), DEFAULT_DIVISION_RANGES),
    competencyThresholds: parseJson<CompetencyThreshold[]>(map.get(COMPETENCY_THRESHOLDS_KEY), DEFAULT_COMPETENCY_THRESHOLDS),
  };
}

export async function saveGradingSettings(settings: GradingSettings): Promise<void> {
  const rows = [
    { key: GRADE_BOUNDARIES_KEY, value: JSON.stringify(settings.gradeBoundaries) },
    { key: DIVISION_RANGES_KEY, value: JSON.stringify(settings.divisionRanges) },
    { key: COMPETENCY_THRESHOLDS_KEY, value: JSON.stringify(settings.competencyThresholds) },
  ];
  for (const row of rows) {
    const { error } = await supabase.from("academic_settings").upsert(row, { onConflict: "key" });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------
// School info (persisted in academic_settings)
// ---------------------------------------------------------------
export interface SchoolInfo {
  council: string;
  district: string;
  name: string;
  address: string;
  unionLogo: string;
  schoolLogo: string;
}

export const DEFAULT_SCHOOL_INFO: SchoolInfo = {
  council: "",
  district: "",
  name: "AMALI SCHOOL",
  address: "",
  unionLogo: "",
  schoolLogo: "",
};

const SCHOOL_COUNCIL_KEY = "school_council";
const SCHOOL_DISTRICT_KEY = "school_district";
const SCHOOL_NAME_KEY = "school_name";
const SCHOOL_ADDRESS_KEY = "school_address";
const UNION_LOGO_KEY = "union_logo";
const SCHOOL_LOGO_KEY = "school_logo";

export async function fetchSchoolInfo(): Promise<SchoolInfo> {
  const { data, error } = await supabase
    .from("academic_settings")
    .select("key, value")
    .in("key", [SCHOOL_COUNCIL_KEY, SCHOOL_DISTRICT_KEY, SCHOOL_NAME_KEY, SCHOOL_ADDRESS_KEY, UNION_LOGO_KEY, SCHOOL_LOGO_KEY]);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.key, row.value);
  return {
    council: map.get(SCHOOL_COUNCIL_KEY) ?? DEFAULT_SCHOOL_INFO.council,
    district: map.get(SCHOOL_DISTRICT_KEY) ?? DEFAULT_SCHOOL_INFO.district,
    name: map.get(SCHOOL_NAME_KEY) ?? DEFAULT_SCHOOL_INFO.name,
    address: map.get(SCHOOL_ADDRESS_KEY) ?? DEFAULT_SCHOOL_INFO.address,
    unionLogo: map.get(UNION_LOGO_KEY) ?? DEFAULT_SCHOOL_INFO.unionLogo,
    schoolLogo: map.get(SCHOOL_LOGO_KEY) ?? DEFAULT_SCHOOL_INFO.schoolLogo,
  };
}

export async function saveSchoolInfo(info: SchoolInfo): Promise<void> {
  const rows = [
    { key: SCHOOL_COUNCIL_KEY, value: info.council },
    { key: SCHOOL_DISTRICT_KEY, value: info.district },
    { key: SCHOOL_NAME_KEY, value: info.name },
    { key: SCHOOL_ADDRESS_KEY, value: info.address },
    { key: UNION_LOGO_KEY, value: info.unionLogo },
    { key: SCHOOL_LOGO_KEY, value: info.schoolLogo },
  ];
  for (const row of rows) {
    const { error } = await supabase.from("academic_settings").upsert(row, { onConflict: "key" });
    if (error) throw error;
  }
}