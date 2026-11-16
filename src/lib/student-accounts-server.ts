import { NextRequest, NextResponse } from "next/server";
import { authenticate, type AuthResult } from "@/lib/stream-teacher-server";
import {
  DEFAULT_STUDENT_PASSWORD,
  hashPassword,
  LOGIN_WINDOW_MS,
  MAX_REGISTRATION_FAILURES,
  studentAdmin,
} from "@/lib/student-auth";
import type {
  LoginAttemptItem,
  LoginFailureReason,
  LoginFailuresResponse,
  LoginFailuresSummary,
  PageInfo,
  StudentActivityResponse,
  StudentActivitySession,
  StudentLoginRow,
  StudentLoginsFilter,
  StudentLoginsResponse,
  StudentLoginsSummary,
} from "@/lib/student-accounts-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WINDOW_DAYS = 30;
const MAX_ATTEMPTS = 5000;
const MAX_SESSIONS = 2000;
const DEFAULT_PAGE_SIZE = 25;

/** Only the Academic Officer and the Headmaster may inspect student logins. */
export async function requireStudentLoginsAdmin(
  request: NextRequest,
): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  if (auth.role !== "Academic" && auth.role !== "Headmaster") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Only the Academic Officer or Headmaster can manage student logins.",
        },
        { status: 403 },
      ),
    };
  }
  return auth;
}

interface StudentRecord {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  status: string | null;
  class_id: string | null;
  stream_id: string | null;
  school_classes: { name: string } | { name: string }[] | null;
  streams: { name: string } | { name: string }[] | null;
}

interface AccountRecord {
  id: string;
  student_id: string;
  must_change_password: boolean;
  is_active: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AttemptRecord {
  id: string | number;
  registration_no: string;
  success: boolean;
  attempted_at: string;
  ip_address: string | null;
}

interface SessionRecord {
  id: string;
  account_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

interface MonitorSnapshot {
  students: StudentRecord[];
  accounts: AccountRecord[];
  attempts: AttemptRecord[];
  sessions: SessionRecord[];
  studentsByReg: Map<string, StudentRecord>;
  accountByStudent: Map<string, AccountRecord>;
  attemptsByReg: Map<string, AttemptRecord[]>;
  sessionsByAccount: Map<string, SessionRecord[]>;
}

export interface StudentLoginsQuery {
  search?: string;
  filter?: string;
  page?: number;
  pageSize?: number;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normaliseRegistration(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function fullName(row: StudentRecord): string {
  return [row.first_name, row.middle_name, row.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function classNameOf(row: StudentRecord): string {
  return firstRelation(row.school_classes)?.name?.trim() ?? "";
}

function streamNameOf(row: StudentRecord): string {
  return firstRelation(row.streams)?.name?.trim() ?? "";
}

function timeOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(values: (string | null | undefined)[]): string | null {
  let result: string | null = null;
  let best = 0;
  for (const value of values) {
    const ms = timeOf(value);
    if (value && ms >= best) {
      best = ms;
      result = value;
    }
  }
  return result;
}

function parsePage(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function parsePageSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(parsed), 5), 100);
}

function paginate<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; info: PageInfo } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    info: { page: safePage, pageSize, total, totalPages },
  };
}

function isStudentLoginsFilter(value: unknown): value is StudentLoginsFilter {
  return (
    value === "all" ||
    value === "never" ||
    value === "default" ||
    value === "changed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "missing"
  );
}

async function loadSnapshot(): Promise<MonitorSnapshot> {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();

  const [studentsRes, accountsRes, attemptsRes, sessionsRes] = await Promise.all([
    studentAdmin
      .from("students")
      .select(
        "id, registration_no, first_name, middle_name, last_name, gender, status, class_id, stream_id, school_classes(name), streams(name)",
      )
      .order("registration_no", { ascending: true }),
    studentAdmin
      .from("student_accounts")
      .select(
        "id, student_id, must_change_password, is_active, last_login_at, password_changed_at, created_at, updated_at",
      ),
    studentAdmin
      .from("student_login_attempts")
      .select("id, registration_no, success, attempted_at, ip_address")
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(MAX_ATTEMPTS),
    studentAdmin
      .from("student_sessions")
      .select("id, account_id, created_at, last_seen_at, expires_at, ip_address, user_agent")
      .order("created_at", { ascending: false })
      .limit(MAX_SESSIONS),
  ]);

  if (studentsRes.error) throw studentsRes.error;
  if (accountsRes.error) throw accountsRes.error;
  if (attemptsRes.error) throw attemptsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const students = (studentsRes.data ?? []) as unknown as StudentRecord[];
  const accounts = (accountsRes.data ?? []) as AccountRecord[];
  const attempts = (attemptsRes.data ?? []) as AttemptRecord[];
  const sessions = (sessionsRes.data ?? []) as SessionRecord[];

  const studentsByReg = new Map<string, StudentRecord>();
  for (const student of students) {
    const reg = normaliseRegistration(student.registration_no);
    if (reg) studentsByReg.set(reg, student);
  }

  const accountByStudent = new Map<string, AccountRecord>();
  for (const account of accounts) {
    accountByStudent.set(account.student_id, account);
  }

  const attemptsByReg = new Map<string, AttemptRecord[]>();
  for (const attempt of attempts) {
    const reg = normaliseRegistration(attempt.registration_no);
    const list = attemptsByReg.get(reg) ?? [];
    list.push(attempt);
    attemptsByReg.set(reg, list);
  }

  const sessionsByAccount = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    const list = sessionsByAccount.get(session.account_id) ?? [];
    list.push(session);
    sessionsByAccount.set(session.account_id, list);
  }

  return {
    students,
    accounts,
    attempts,
    sessions,
    studentsByReg,
    accountByStudent,
    attemptsByReg,
    sessionsByAccount,
  };
}

function deriveFailureReason(
  attempt: AttemptRecord,
  student: StudentRecord | undefined,
  account: AccountRecord | undefined,
): LoginFailureReason | null {
  if (attempt.success) return null;
  if (!student) return "unknown_registration";
  if (!account) return "account_missing";
  if (!account.is_active) return "inactive_account";
  return "wrong_password";
}

function toAttemptItem(
  attempt: AttemptRecord,
  student: StudentRecord | undefined,
  account: AccountRecord | undefined,
): LoginAttemptItem {
  return {
    id: String(attempt.id),
    registrationNo: attempt.registration_no,
    success: attempt.success,
    failureReason: deriveFailureReason(attempt, student, account),
    attemptedAt: attempt.attempted_at,
    ipAddress: attempt.ip_address,
    studentId: student?.id ?? null,
    studentName: student ? fullName(student) : null,
    className: student ? classNameOf(student) : null,
    streamName: student ? streamNameOf(student) : null,
  };
}

function countRecentFailures(attempts: AttemptRecord[], sinceMs: number): number {
  let count = 0;
  for (const attempt of attempts) {
    if (attempt.success) continue;
    if (timeOf(attempt.attempted_at) >= sinceMs) count += 1;
  }
  return count;
}

interface DerivedStudent {
  row: StudentLoginRow;
  attempts: AttemptRecord[];
}

function deriveStudents(snapshot: MonitorSnapshot): DerivedStudent[] {
  const now = Date.now();
  const windowStart = now - LOGIN_WINDOW_MS;
  const dayAgo = now - DAY_MS;

  return snapshot.students.map((student) => {
    const account = snapshot.accountByStudent.get(student.id);
    const reg = normaliseRegistration(student.registration_no);
    const attempts = snapshot.attemptsByReg.get(reg) ?? [];
    const sessions = account ? snapshot.sessionsByAccount.get(account.id) ?? [] : [];

    const lastSuccessAttempt = attempts.find((attempt) => attempt.success);
    const lastSuccessAt = latest([
      lastSuccessAttempt?.attempted_at ?? null,
      account?.last_login_at ?? null,
    ]);

    const lastFailureAttempt = attempts.find((attempt) => !attempt.success);
    const lastFailure = lastFailureAttempt
      ? toAttemptItem(lastFailureAttempt, student, account)
      : null;

    const lastSuccessMs = timeOf(lastSuccessAt);
    const failureWindowStart = Math.max(windowStart, lastSuccessMs);
    const recentFailures = countRecentFailures(attempts, failureWindowStart);

    const activeSessions = sessions.filter(
      (session) => timeOf(session.expires_at) > now,
    );

    const row: StudentLoginRow = {
      studentId: student.id,
      registrationNo: student.registration_no,
      fullName: fullName(student),
      gender: student.gender,
      className: classNameOf(student),
      streamName: streamNameOf(student),
      status: student.status ?? "Active",
      hasAccount: Boolean(account),
      accountId: account?.id ?? null,
      isActive: account?.is_active ?? false,
      mustChangePassword: account?.must_change_password ?? false,
      passwordChangedAt: account?.password_changed_at ?? null,
      accountUpdatedAt: account?.updated_at ?? null,
      lastLoginAt: lastSuccessAt,
      lastSeenAt: latest(activeSessions.map((session) => session.last_seen_at)),
      activeSessions: activeSessions.length,
      failures24h: attempts.filter(
        (attempt) => !attempt.success && timeOf(attempt.attempted_at) >= dayAgo,
      ).length,
      failures30d: attempts.filter((attempt) => !attempt.success).length,
      blocked: recentFailures >= MAX_REGISTRATION_FAILURES,
      lastFailure,
      lastSuccessAt,
    };

    return { row, attempts };
  });
}

function matchesFilter(row: StudentLoginRow, filter: StudentLoginsFilter): boolean {
  switch (filter) {
    case "never":
      return row.lastLoginAt === null;
    case "default":
      return row.hasAccount && row.mustChangePassword;
    case "changed":
      return row.hasAccount && !row.mustChangePassword && Boolean(row.passwordChangedAt);
    case "failed":
      return row.failures24h > 0;
    case "blocked":
      return row.blocked;
    case "missing":
      return !row.hasAccount;
    default:
      return true;
  }
}

function buildSummary(derived: DerivedStudent[], snapshot: MonitorSnapshot): StudentLoginsSummary {
  const now = Date.now();
  const dayAgo = now - DAY_MS;

  let withoutAccount = 0;
  let neverLoggedIn = 0;
  let defaultPassword = 0;
  let changedPassword = 0;
  let failedStudents24h = 0;
  let blocked = 0;
  let failedAttempts24h = 0;
  let activeSessions = 0;

  for (const { row } of derived) {
    if (!row.hasAccount) withoutAccount += 1;
    if (row.lastLoginAt === null) neverLoggedIn += 1;
    if (row.hasAccount && row.mustChangePassword) defaultPassword += 1;
    if (row.hasAccount && !row.mustChangePassword && row.passwordChangedAt) {
      changedPassword += 1;
    }
    if (row.failures24h > 0) failedStudents24h += 1;
    if (row.blocked) blocked += 1;
    activeSessions += row.activeSessions;
  }

  for (const attempt of snapshot.attempts) {
    if (!attempt.success && timeOf(attempt.attempted_at) >= dayAgo) {
      failedAttempts24h += 1;
    }
  }

  return {
    students: derived.length,
    withoutAccount,
    neverLoggedIn,
    defaultPassword,
    changedPassword,
    failedAttempts24h,
    failedStudents24h,
    blocked,
    activeSessions,
  };
}

export async function listStudentLogins(
  query: StudentLoginsQuery,
): Promise<StudentLoginsResponse> {
  const snapshot = await loadSnapshot();
  const derived = deriveStudents(snapshot);
  const summary = buildSummary(derived, snapshot);

  const search = (query.search ?? "").trim().toLowerCase();
  const filter: StudentLoginsFilter = isStudentLoginsFilter(query.filter)
    ? query.filter
    : "all";
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.pageSize);

  const filtered = derived
    .map((entry) => entry.row)
    .filter((row) => matchesFilter(row, filter))
    .filter((row) => {
      if (!search) return true;
      const haystack = `${row.fullName} ${row.registrationNo ?? ""}`.toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
      if (a.failures24h !== b.failures24h) return b.failures24h - a.failures24h;
      return (a.registrationNo ?? "").localeCompare(b.registrationNo ?? "");
    });

  const { pageItems, info } = paginate(filtered, page, pageSize);

  return { summary, students: pageItems, pagination: info };
}

export async function loadStudentActivity(
  studentId: string,
): Promise<StudentActivityResponse | null> {
  const snapshot = await loadSnapshot();
  const student = snapshot.students.find((entry) => entry.id === studentId);
  if (!student) return null;

  const account = snapshot.accountByStudent.get(student.id);
  const reg = normaliseRegistration(student.registration_no);
  const attempts = (snapshot.attemptsByReg.get(reg) ?? []).map((attempt) =>
    toAttemptItem(attempt, student, account),
  );
  const sessions: StudentActivitySession[] = account
    ? (snapshot.sessionsByAccount.get(account.id) ?? []).map((session) => ({
        id: session.id,
        createdAt: session.created_at,
        lastSeenAt: session.last_seen_at,
        expiresAt: session.expires_at,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
      }))
    : [];

  return {
    student: {
      studentId: student.id,
      registrationNo: student.registration_no,
      fullName: fullName(student),
      gender: student.gender,
      className: classNameOf(student),
      streamName: streamNameOf(student),
      status: student.status ?? "Active",
    },
    account: account
      ? {
          id: account.id,
          isActive: account.is_active,
          mustChangePassword: account.must_change_password,
          lastLoginAt: account.last_login_at,
          passwordChangedAt: account.password_changed_at,
          createdAt: account.created_at,
          updatedAt: account.updated_at,
        }
      : null,
    attempts,
    sessions: sessions.sort(
      (a, b) => timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt),
    ),
  };
}

export async function listLoginFailures(query: StudentLoginsQuery): Promise<LoginFailuresResponse> {
  const snapshot = await loadSnapshot();
  const now = Date.now();
  const dayAgo = now - DAY_MS;
  const weekAgo = now - 7 * DAY_MS;
  const search = (query.search ?? "").trim().toLowerCase();
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.pageSize);

  const allFailed = snapshot.attempts.filter((attempt) => !attempt.success);

  const items = allFailed.map((attempt) => {
    const reg = normaliseRegistration(attempt.registration_no);
    const student = snapshot.studentsByReg.get(reg);
    const account = student ? snapshot.accountByStudent.get(student.id) : undefined;
    return toAttemptItem(attempt, student, account);
  });

  const summary: LoginFailuresSummary = {
    failedAttempts24h: allFailed.filter((attempt) => timeOf(attempt.attempted_at) >= dayAgo).length,
    failedAttempts7d: allFailed.filter((attempt) => timeOf(attempt.attempted_at) >= weekAgo).length,
    unknownRegistration24h: items.filter(
      (item) =>
        item.failureReason === "unknown_registration" && timeOf(item.attemptedAt) >= dayAgo,
    ).length,
    wrongPassword24h: items.filter(
      (item) => item.failureReason === "wrong_password" && timeOf(item.attemptedAt) >= dayAgo,
    ).length,
    distinctStudents24h: new Set(
      items
        .filter((item) => item.studentId && timeOf(item.attemptedAt) >= dayAgo)
        .map((item) => item.studentId),
    ).size,
  };

  const filtered = items.filter((item) => {
    if (!search) return true;
    const haystack = `${item.registrationNo} ${item.studentName ?? ""}`.toLowerCase();
    return haystack.includes(search);
  });

  const { pageItems, info } = paginate(filtered, page, pageSize);

  return { attempts: pageItems, summary, pagination: info };
}

export interface ResetStudentPasswordResult {
  created: boolean;
}

/**
 * Restores the school's initial password for one student only. Nothing is
 * changed automatically: the Academic Officer must trigger this for a single
 * student. Existing sessions are ended and the student must choose a new
 * password on the next sign-in.
 */
export async function resetStudentPassword(
  studentId: string,
): Promise<ResetStudentPasswordResult> {
  const { data: student, error: studentError } = await studentAdmin
    .from("students")
    .select("id, registration_no")
    .eq("id", studentId)
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) throw new Error("Student not found.");

  const { data: account, error: accountError } = await studentAdmin
    .from("student_accounts")
    .select("id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (accountError) throw accountError;

  const passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);
  let created = false;

  if (account) {
    const { error } = await studentAdmin
      .from("student_accounts")
      .update({
        password_hash: passwordHash,
        must_change_password: true,
        password_changed_at: null,
        is_active: true,
      })
      .eq("id", account.id);
    if (error) throw error;

    await studentAdmin.from("student_sessions").delete().eq("account_id", account.id);
  } else {
    const { error } = await studentAdmin.from("student_accounts").insert({
      student_id: studentId,
      password_hash: passwordHash,
      must_change_password: true,
    });
    if (error) throw error;
    created = true;
  }

  // Clear the current lock-out window so the student can sign in right away.
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  await studentAdmin
    .from("student_login_attempts")
    .delete()
    .eq("registration_no", normaliseRegistration(student.registration_no))
    .eq("success", false)
    .gte("attempted_at", windowStart);

  return { created };
}
