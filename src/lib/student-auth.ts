import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadActiveYearId } from "@/lib/active-year";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

export const studentAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const STUDENT_SESSION_COOKIE = "amali_student_session";
export const STUDENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATION_FAILURES = 6;
const MAX_IP_FAILURES = 25;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

export interface StudentProfile {
  id: string;
  registrationNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string;
  phone: string | null;
  classId: string | null;
  className: string;
  streamId: string | null;
  streamName: string;
}

export interface StudentAccount {
  id: string;
  studentId: string;
  mustChangePassword: boolean;
  isActive: boolean;
}

export type StudentSessionResult =
  | {
      ok: true;
      account: StudentAccount;
      student: StudentProfile;
      sessionId: string;
    }
  | { ok: false; response: NextResponse };

type ScryptOptions = { N: number; r: number; p: number };

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const key = await scryptAsync(password, salt, expected.length, { N: n, r, p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function requestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 90);
  }
  return request.headers.get("x-real-ip")?.trim().slice(0, 90) ?? null;
}

export function studentCookieOptions(maxAgeSeconds: number) {
  return {
    name: STUDENT_SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setStudentCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    ...studentCookieOptions(Math.floor(STUDENT_SESSION_TTL_MS / 1000)),
    value: token,
  });
}

export function clearStudentCookie(response: NextResponse): void {
  response.cookies.set({ ...studentCookieOptions(0), value: "" });
}

export interface RateLimitState {
  blocked: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginRateLimit(
  registrationNo: string,
  ip: string | null,
): Promise<RateLimitState> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const byRegistration = await studentAdmin
    .from("student_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("registration_no", registrationNo)
    .eq("success", false)
    .gte("attempted_at", since);

  let ipFailures = 0;
  if (ip) {
    const byIp = await studentAdmin
      .from("student_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("success", false)
      .gte("attempted_at", since);
    ipFailures = byIp.count ?? 0;
  }

  const registrationFailures = byRegistration.count ?? 0;
  const blocked =
    registrationFailures >= MAX_REGISTRATION_FAILURES || ipFailures >= MAX_IP_FAILURES;
  return { blocked, retryAfterSeconds: Math.ceil(LOGIN_WINDOW_MS / 1000) };
}

export async function recordLoginAttempt(
  registrationNo: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  await studentAdmin.from("student_login_attempts").insert({
    registration_no: registrationNo,
    ip_address: ip,
    success,
  });

  if (success) {
    await studentAdmin
      .from("student_login_attempts")
      .delete()
      .eq("registration_no", registrationNo)
      .eq("success", false);
  }

  // Opportunistic cleanup so the table cannot grow without bound.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await studentAdmin.from("student_login_attempts").delete().lt("attempted_at", cutoff);
}

interface AccountRow {
  id: string;
  student_id: string;
  must_change_password: boolean;
  is_active: boolean;
}

interface StudentRow {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  phone: string | null;
  class_id: string | null;
  stream_id: string | null;
}

export async function loadStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const { data, error } = await studentAdmin
    .from("students")
    .select(
      "id, registration_no, first_name, middle_name, last_name, gender, phone, class_id, stream_id",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as StudentRow;
  const [classRes, streamRes] = await Promise.all([
    row.class_id
      ? studentAdmin.from("school_classes").select("name").eq("id", row.class_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.stream_id
      ? studentAdmin.from("streams").select("name").eq("id", row.stream_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    id: row.id,
    registrationNo: row.registration_no ?? "",
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    gender: row.gender,
    phone: row.phone,
    classId: row.class_id,
    className: classRes.data?.name ?? "",
    streamId: row.stream_id,
    streamName: streamRes.data?.name ?? "",
  };
}

export async function loadStudentSession(request: NextRequest): Promise<StudentSessionResult | null> {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session, error: sessionError } = await studentAdmin
    .from("student_sessions")
    .select("id, account_id, last_seen_at, expires_at")
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();

  if (sessionError || !session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await studentAdmin.from("student_sessions").delete().eq("id", session.id);
    return null;
  }

  const { data: account, error: accountError } = await studentAdmin
    .from("student_accounts")
    .select("id, student_id, must_change_password, is_active")
    .eq("id", session.account_id)
    .maybeSingle();

  if (accountError || !account) return null;
  const accountRow = account as AccountRow;
  if (!accountRow.is_active) return null;

  const student = await loadStudentProfile(accountRow.student_id);
  if (!student) return null;

  // Keep last_seen_at fresh without writing on every single request.
  if (Date.now() - new Date(session.last_seen_at).getTime() > 60 * 60 * 1000) {
    await studentAdmin
      .from("student_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
  }

  return {
    ok: true,
    account: {
      id: accountRow.id,
      studentId: accountRow.student_id,
      mustChangePassword: accountRow.must_change_password,
      isActive: accountRow.is_active,
    },
    student,
    sessionId: String(session.id),
  };
}

export async function requireStudent(
  request: NextRequest,
  options: { allowPasswordChange?: boolean } = {},
): Promise<StudentSessionResult> {
  const session = await loadStudentSession(request);
  if (!session?.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  if (session.account.mustChangePassword && !options.allowPasswordChange) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "You must change your password before continuing.",
          mustChangePassword: true,
        },
        { status: 403 },
      ),
    };
  }

  return session;
}

export async function findStudentByRegistrationNo(
  registrationNo: string,
): Promise<{ id: string; registrationNo: string } | null> {
  const { data, error } = await studentAdmin
    .from("students")
    .select("id, registration_no")
    .ilike("registration_no", registrationNo)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, registrationNo: data.registration_no ?? registrationNo };
}

export async function loadStudentAccount(studentId: string): Promise<{
  id: string;
  password_hash: string;
  must_change_password: boolean;
  is_active: boolean;
} | null> {
  const { data, error } = await studentAdmin
    .from("student_accounts")
    .select("id, password_hash, must_change_password, is_active")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export function normaliseRegistrationNo(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, 40) : "";
}

export interface StudentSubject {
  id: string;
  code: string;
  name: string;
}

export interface StudentSubjectTeacher {
  name: string;
  phone: string | null;
}

export interface StudentSubjectWithTeacher extends StudentSubject {
  teachers: StudentSubjectTeacher[];
}

interface TeachingAssignmentRow {
  subject_id: string;
  teacher:
    | {
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
        name: string | null;
        phone: string | null;
      }
    | {
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
        name: string | null;
        phone: string | null;
      }[]
    | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadStudentSubjects(
  studentId: string,
  academicYear?: string,
): Promise<StudentSubject[]> {
  const year = academicYear ?? (await loadActiveYearId(studentAdmin));
  const { data, error } = await studentAdmin
    .from("student_subjects")
    .select("subject:subjects(id, code, name)")
    .eq("student_id", studentId)
    .eq("academic_year", year);
  if (error) throw error;

  return ((data ?? []) as unknown as {
    subject: StudentSubject | StudentSubject[] | null;
  }[])
    .map((row) => (Array.isArray(row.subject) ? row.subject[0] : row.subject))
    .filter((subject): subject is StudentSubject => Boolean(subject))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadStudentSubjectsWithTeachers(
  studentId: string,
  classId: string | null,
  streamId: string | null,
  academicYear?: string,
): Promise<StudentSubjectWithTeacher[]> {
  const year = academicYear ?? (await loadActiveYearId(studentAdmin));
  const subjects = await loadStudentSubjects(studentId, year);
  if (subjects.length === 0) return [];
  if (!classId) return subjects.map((subject) => ({ ...subject, teachers: [] }));

  let query = studentAdmin
    .from("teaching_assignments")
    .select("subject_id, teacher:staff(first_name, middle_name, last_name, name, phone)")
    .eq("class_id", classId)
    .eq("academic_year", year)
    .in(
      "subject_id",
      subjects.map((subject) => subject.id),
    );
  if (streamId) query = query.eq("stream_id", streamId);

  const { data, error } = await query;
  if (error) throw error;

  const bySubject = new Map<string, StudentSubjectTeacher[]>();
  for (const row of (data ?? []) as unknown as TeachingAssignmentRow[]) {
    const teacher = firstRelation(row.teacher);
    if (!teacher) continue;

    const name =
      [teacher.first_name, teacher.middle_name, teacher.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      teacher.name ||
      "Teacher";
    const phone = teacher.phone?.trim() || null;
    const list = bySubject.get(row.subject_id) ?? [];
    if (list.some((entry) => entry.name === name && entry.phone === phone)) continue;
    list.push({ name, phone });
    bySubject.set(row.subject_id, list);
  }

  return subjects.map((subject) => ({
    ...subject,
    teachers: bySubject.get(subject.id) ?? [],
  }));
}
