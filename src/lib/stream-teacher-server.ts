import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { examYearOf, studentsForExamYearFilter, yearRange } from "@/lib/active-year";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const streamTeacherAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type StaffRole = "Headmaster" | "Academic" | "Teacher" | "District Officer";

export interface StreamTeacherStaff {
  id: string;
  name: string;
  role: StaffRole;
  auth_user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface StreamTeacherAssignment {
  id: string;
  teacher_id: string;
  stream_id: string;
  academic_year_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  stream_name: string;
  class_id: string;
  class_name: string;
  form_level: number;
  teacher_name: string;
}

export type AuthResult =
  | { ok: true; user: User; staff: StreamTeacherStaff | null; role: StaffRole }
  | { ok: false; response: NextResponse };

export type AssignmentResult =
  | { ok: true; user: User; staff: StreamTeacherStaff; role: StaffRole; assignment: StreamTeacherAssignment }
  | { ok: false; response: NextResponse };

function isStaffRole(value: unknown): value is StaffRole {
  return value === "Headmaster" || value === "Academic" || value === "Teacher" || value === "District Officer";
}

function displayName(row: Record<string, unknown>): string {
  const first = typeof row.first_name === "string" ? row.first_name : "";
  const last = typeof row.last_name === "string" ? row.last_name : "";
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || (typeof row.name === "string" ? row.name : "");
}

export async function requireUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const { data, error } = await streamTeacherAdmin.auth.getUser(authHeader.slice(7).trim());
    if (error || !data.user) return null;
    return data.user;
  }

  const cookieStore = await cookies();
  type CookieSetItem = { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] };
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieSetItem[]) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Ignore cookie write errors during auth checks.
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function authenticate(request: NextRequest): Promise<AuthResult> {
  const user = await requireUser(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authorized. Please sign in again." }, { status: 401 }),
    };
  }

  const { data: staffRow, error } = await streamTeacherAdmin
    .from("staff")
    .select("id, name, first_name, last_name, role, auth_user_id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: NextResponse.json({ error: "Could not verify your account." }, { status: 500 }) };
  }

  const metaRole = (user.user_metadata ?? {}).role;
  const role = isStaffRole(metaRole)
    ? metaRole
    : isStaffRole(staffRow?.role)
      ? staffRow.role
      : "Teacher";

  const staff: StreamTeacherStaff | null = staffRow
    ? {
        id: String(staffRow.id),
        name: displayName(staffRow as Record<string, unknown>),
        role: isStaffRole(staffRow.role) ? staffRow.role : role,
        auth_user_id: (staffRow.auth_user_id as string | null) ?? null,
        email: (staffRow.email as string | null) ?? null,
        first_name: (staffRow.first_name as string | null) ?? null,
        last_name: (staffRow.last_name as string | null) ?? null,
      }
    : null;

  return { ok: true, user, staff, role };
}

export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  if (auth.role !== "Academic" && auth.role !== "Headmaster") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Only the Academic Officer or Headmaster can manage stream teachers." }, { status: 403 }),
    };
  }
  return auth;
}

interface AssignmentRow {
  id: string;
  teacher_id: string;
  stream_id: string;
  academic_year_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  stream:
    | { name: string; class_id: string; school_classes: { name: string; form_level: number } | { name: string; form_level: number }[] | null }
    | { name: string; class_id: string; school_classes: { name: string; form_level: number } | { name: string; form_level: number }[] | null }[]
    | null;
  teacher: { first_name: string | null; last_name: string | null; name: string | null } | { first_name: string | null; last_name: string | null; name: string | null }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toAssignment(row: AssignmentRow): StreamTeacherAssignment | null {
  const stream = firstRelation(row.stream);
  if (!stream) return null;
  const cls = firstRelation(stream.school_classes);
  const teacher = firstRelation(row.teacher);
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    stream_id: row.stream_id,
    academic_year_id: row.academic_year_id,
    assigned_by: row.assigned_by,
    assigned_at: row.assigned_at,
    is_active: row.is_active,
    stream_name: stream.name,
    class_id: stream.class_id,
    class_name: cls?.name ?? "",
    form_level: cls?.form_level ?? 0,
    teacher_name: displayName((teacher ?? {}) as Record<string, unknown>),
  };
}

const ASSIGNMENT_SELECT = `
  id, teacher_id, stream_id, academic_year_id, assigned_by, assigned_at, is_active,
  stream:streams!stream_teachers_stream_id_fkey(name, class_id, school_classes(name, form_level)),
  teacher:staff!stream_teachers_teacher_id_fkey(first_name, last_name, name)
`;

export async function loadAssignments(staffId?: string, yearId?: string): Promise<StreamTeacherAssignment[]> {
  let query = streamTeacherAdmin
    .from("stream_teachers")
    .select(ASSIGNMENT_SELECT)
    .eq("is_active", true)
    .order("assigned_at", { ascending: false });

  if (staffId) query = query.eq("teacher_id", staffId);
  if (yearId) query = query.eq("academic_year_id", yearId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as AssignmentRow[])
    .map(toAssignment)
    .filter((row): row is StreamTeacherAssignment => row !== null);
}

export async function requireStreamTeacher(
  request: NextRequest,
  streamId: string,
  yearId: string,
): Promise<AssignmentResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;

  if (!auth.staff) {
    return {
      ok: false,
      response: NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 }),
    };
  }

  const { data, error } = await streamTeacherAdmin
    .from("stream_teachers")
    .select(ASSIGNMENT_SELECT)
    .eq("teacher_id", auth.staff.id)
    .eq("stream_id", streamId)
    .eq("academic_year_id", yearId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { ok: false, response: NextResponse.json({ error: "Could not verify stream access." }, { status: 500 }) };
  }

  const assignment = data ? toAssignment(data as unknown as AssignmentRow) : null;
  if (!assignment) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You are not assigned to this stream." }, { status: 403 }),
    };
  }

  return { ok: true, user: auth.user, staff: auth.staff, role: auth.role, assignment };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isAcademicYear(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export function cleanText(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export interface ScopedExam {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  status: string;
}

export interface ScopedExamSubject {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

export interface ScopedExamStudent {
  student_id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream_name: string;
  subjects: string[];
}

export interface ScopedMarkCell {
  theory: number | null;
  practical: number | null;
  is_absent: boolean;
}

export interface ScopedExamMarks {
  exam: ScopedExam;
  marks: Record<string, ScopedMarkCell>;
  classRow: {
    class_id: string;
    class_name: string;
    subjects: ScopedExamSubject[];
    students: ScopedExamStudent[];
  };
}

export async function loadScopedExams(classId: string, yearId?: string): Promise<ScopedExam[]> {
  let query = streamTeacherAdmin
    .from("exam_classes")
    .select("exam:exams!inner(id, name, start_date, end_date, has_practical, status)")
    .eq("class_id", classId);

  if (yearId) {
    const { start, end } = yearRange(yearId);
    query = query.gte("exam.start_date", start).lt("exam.start_date", end);
  }

  const { data, error } = await query;

  if (error) throw error;

  const exams: ScopedExam[] = [];
  for (const row of (data ?? []) as unknown as { exam: ScopedExam | ScopedExam[] | null }[]) {
    const exam = firstRelation(row.exam);
    if (exam && exam.status !== "draft") exams.push(exam);
  }

  return exams.sort((a, b) => b.start_date.localeCompare(a.start_date));
}

export async function loadScopedExamMarks(
  assignment: StreamTeacherAssignment,
  examId: string,
): Promise<ScopedExamMarks | null> {
  const { data: examRow, error: examError } = await streamTeacherAdmin
    .from("exams")
    .select("id, name, start_date, end_date, has_practical, status")
    .eq("id", examId)
    .maybeSingle();
  if (examError) throw examError;
  if (!examRow || examRow.status === "draft") return null;
  const examYear = examYearOf(examRow.start_date);

  const { data: classLink, error: classError } = await streamTeacherAdmin
    .from("exam_classes")
    .select("class_id")
    .eq("exam_id", examId)
    .eq("class_id", assignment.class_id)
    .maybeSingle();
  if (classError) throw classError;
  if (!classLink) return null;

  const [classRes, subjectRes, studentRes] = await Promise.all([
    streamTeacherAdmin
      .from("school_classes")
      .select("id, name")
      .eq("id", assignment.class_id)
      .maybeSingle(),
    streamTeacherAdmin
      .from("exam_class_subjects")
      .select("subject_id, subject:subjects(code, name, has_practical, stream)")
      .eq("exam_id", examId)
      .eq("class_id", assignment.class_id),
    streamTeacherAdmin
      .from("students")
      .select("id, registration_no, first_name, middle_name, last_name, gender, class_id, stream_id, stream:streams(name)")
      .eq("class_id", assignment.class_id)
      .eq("stream_id", assignment.stream_id)
      .or(studentsForExamYearFilter(examYear))
      .order("registration_no", { ascending: true, nullsFirst: false })
      .order("last_name")
      .order("first_name"),
  ]);

  if (classRes.error) throw classRes.error;
  if (subjectRes.error) throw subjectRes.error;
  if (studentRes.error) throw studentRes.error;

  const subjects: ScopedExamSubject[] = [];
  for (const row of (subjectRes.data ?? []) as unknown as {
    subject_id: string;
    subject: { code: string; name: string; has_practical: boolean; stream: string | null } | { code: string; name: string; has_practical: boolean; stream: string | null }[] | null;
  }[]) {
    const subject = firstRelation(row.subject);
    const subjectStream = subject?.stream?.trim() ?? "";
    if (subjectStream !== "Both" && subjectStream !== assignment.stream_name) continue;
    subjects.push({
      id: row.subject_id,
      code: subject?.code ?? "",
      name: subject?.name ?? "Unknown",
      has_practical: subject?.has_practical ?? false,
    });
  }
  subjects.sort((a, b) => a.name.localeCompare(b.name));
  const allowedSubjectIds = new Set(subjects.map((subject) => subject.id));

  const studentIds: string[] = [];
  const studentRows: ScopedExamStudent[] = [];
  for (const row of (studentRes.data ?? []) as unknown as {
    id: string;
    registration_no: string | null;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    gender: string;
    class_id: string;
    stream_id: string | null;
    stream: { name: string } | { name: string }[] | null;
  }[]) {
    const stream = firstRelation(row.stream);
    studentIds.push(row.id);
    studentRows.push({
      student_id: row.id,
      registration_no: row.registration_no,
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      gender: row.gender,
      stream_id: row.stream_id,
      stream_name: stream?.name ?? assignment.stream_name,
      subjects: [],
    });
  }

  const subjectLinks = new Map<string, string[]>();
  if (studentIds.length > 0) {
    const { data: linkRows, error: linkError } = await streamTeacherAdmin
      .from("student_subjects")
      .select("student_id, subject_id")
      .eq("academic_year", examYear)
      .in("student_id", studentIds);
    if (linkError) throw linkError;
    for (const row of (linkRows ?? []) as { student_id: string; subject_id: string }[]) {
      const list = subjectLinks.get(row.student_id) ?? [];
      list.push(row.subject_id);
      subjectLinks.set(row.student_id, list);
    }
  }

  const marks: Record<string, ScopedMarkCell> = {};
  if (studentIds.length > 0) {
    const { data: markRows, error: markError } = await streamTeacherAdmin
      .from("exam_marks")
      .select("student_id, subject_id, theory_score, practical_score, is_absent")
      .eq("exam_id", examId)
      .eq("class_id", assignment.class_id)
      .eq("stream_id", assignment.stream_id)
      .in("student_id", studentIds);
    if (markError) throw markError;

    for (const row of (markRows ?? []) as {
      student_id: string;
      subject_id: string;
      theory_score: number | null;
      practical_score: number | null;
      is_absent: boolean;
    }[]) {
      marks[`${row.student_id}|${row.subject_id}`] = {
        theory: row.theory_score,
        practical: row.practical_score,
        is_absent: Boolean(row.is_absent),
      };
    }
  }

  for (const student of studentRows) {
    student.subjects = (subjectLinks.get(student.student_id) ?? []).filter((subjectId) =>
      allowedSubjectIds.has(subjectId),
    );
  }

  const exam: ScopedExam = {
    id: String(examRow.id),
    name: String(examRow.name),
    start_date: String(examRow.start_date),
    end_date: String(examRow.end_date),
    has_practical: Boolean(examRow.has_practical),
    status: String(examRow.status),
  };

  return {
    exam,
    marks,
    classRow: {
      class_id: assignment.class_id,
      class_name: String(classRes.data?.name ?? assignment.class_name),
      subjects,
      students: studentRows,
    },
  };
}
