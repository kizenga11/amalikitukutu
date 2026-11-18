import { NextRequest, NextResponse } from "next/server";
import { authenticate, type AuthResult } from "@/lib/stream-teacher-server";
import { loadActiveYearId } from "@/lib/active-year";
import { studentAdmin } from "@/lib/student-auth";
import {
  LOGIN_FAILURE_LABELS,
  type LoginFailureReason,
} from "@/lib/student-accounts-types";
import type {
  NotificationsResponse,
  SmartNotification,
  SmartNotificationSeverity,
} from "@/lib/notifications-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_DAYS = 7;
const EVENT_WINDOW_DAYS = 14;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_THRESHOLD = 6;
const MAX_EVENTS = 60;
const MAX_ASSIGNMENTS = 500;
const MAX_SUBMISSIONS = 500;

/** Only the Academic Officer and the Headmaster receive these alerts. */
export async function requireNotificationsAdmin(
  request: NextRequest,
): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  if (auth.role !== "Academic" && auth.role !== "Headmaster") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Only the Academic Officer or Headmaster can view school alerts." },
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
}

interface AccountRecord {
  student_id: string;
  is_active: boolean;
}

interface AttemptRecord {
  id: string | number;
  registration_no: string;
  success: boolean;
  attempted_at: string;
}

interface Named {
  name: string;
}

interface AssignmentRecord {
  id: string;
  teacher_id: string | null;
  title: string;
  created_at: string;
  status: string;
  academic_year_id: string;
  subject: Named | Named[] | null;
  class: Named | Named[] | null;
  stream: Named | Named[] | null;
  teacher:
    | { first_name: string | null; last_name: string | null; name: string | null }
    | { first_name: string | null; last_name: string | null; name: string | null }[]
    | null;
}

interface SubmissionRecord {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at: string | null;
  is_late: boolean;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function timeOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

function teacherName(row: AssignmentRecord): string {
  const teacher = firstRelation(row.teacher);
  const joined = [teacher?.first_name, teacher?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return joined || teacher?.name?.trim() || "A teacher";
}

function classLabel(row: AssignmentRecord): string {
  const className = firstRelation(row.class)?.name?.trim() ?? "";
  const streamName = firstRelation(row.stream)?.name?.trim() ?? "";
  return [className, streamName].filter(Boolean).join(" · ");
}

function subjectLabel(row: AssignmentRecord): string {
  return firstRelation(row.subject)?.name?.trim() ?? "Subject";
}

function failureReason(
  student: StudentRecord | undefined,
  account: AccountRecord | undefined,
): LoginFailureReason {
  if (!student) return "unknown_registration";
  if (!account) return "account_missing";
  if (!account.is_active) return "inactive_account";
  return "wrong_password";
}

function reasonSummary(counts: Map<LoginFailureReason, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${LOGIN_FAILURE_LABELS[reason]} (${count})`)
    .join(" · ");
}

function dayBucket(iso: string): number {
  return Math.floor(timeOf(iso) / DAY_MS);
}

interface LoginGroup {
  key: string;
  student: StudentRecord | undefined;
  registration: string;
  latest: string;
  count: number;
  knownFailure: boolean;
  reasons: Map<LoginFailureReason, number>;
  registrations: Set<string>;
}

interface RegistrationFailures {
  rows: AttemptRecord[];
  blocked: boolean;
}

function buildLoginEvents(
  attempts: AttemptRecord[],
  studentsByReg: Map<string, StudentRecord>,
  accountsByStudent: Map<string, AccountRecord>,
  now: number,
): { events: SmartNotification[]; failedAttempts: number; blocked: number } {
  const failuresByReg = new Map<string, AttemptRecord[]>();
  const successesByReg = new Map<string, number>();

  for (const attempt of attempts) {
    const reg = normaliseRegistration(attempt.registration_no);
    if (attempt.success) {
      const ms = timeOf(attempt.attempted_at);
      successesByReg.set(reg, Math.max(successesByReg.get(reg) ?? 0, ms));
      continue;
    }
    const list = failuresByReg.get(reg) ?? [];
    list.push(attempt);
    failuresByReg.set(reg, list);
  }

  let failedAttempts = 0;
  let blocked = 0;
  const failureState = new Map<string, RegistrationFailures>();

  for (const [reg, rows] of failuresByReg) {
    failedAttempts += rows.length;
    const lastSuccessMs = successesByReg.get(reg) ?? 0;
    const cutoff = Math.max(now - FAILURE_WINDOW_MS, lastSuccessMs);
    const recent = rows.filter((row) => timeOf(row.attempted_at) >= cutoff).length;
    const isBlocked = recent >= BLOCK_THRESHOLD;
    if (isBlocked) blocked += 1;
    failureState.set(reg, { rows, blocked: isBlocked });
  }

  const groups = new Map<string, LoginGroup>();

  for (const attempt of attempts) {
    if (attempt.success) continue;
    const reg = normaliseRegistration(attempt.registration_no);
    const student = studentsByReg.get(reg);
    const account = student ? accountsByStudent.get(student.id) : undefined;
    const reason = failureReason(student, account);
    const bucket = dayBucket(attempt.attempted_at);
    const key = student
      ? `login:${student.id}:${bucket}`
      : `unknown:${bucket}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.reasons.set(reason, (existing.reasons.get(reason) ?? 0) + 1);
      existing.registrations.add(reg);
      if (timeOf(attempt.attempted_at) > timeOf(existing.latest)) {
        existing.latest = attempt.attempted_at;
      }
      continue;
    }

    groups.set(key, {
      key,
      student,
      registration: reg,
      latest: attempt.attempted_at,
      count: 1,
      knownFailure: Boolean(student),
      reasons: new Map([[reason, 1]]),
      registrations: new Set([reg]),
    });
  }

  const events: SmartNotification[] = [];

  for (const group of groups.values()) {
    const state = failureState.get(group.registration);
    if (group.knownFailure && group.student) {
      const severity: SmartNotificationSeverity =
        state?.blocked || group.count >= 3 ? "danger" : "warning";
      const reasons = reasonSummary(group.reasons);
      events.push({
        id: group.key,
        kind: "login_failed",
        severity,
        title: `${fullName(group.student)} failed to sign in`,
        message:
          group.count === 1
            ? reasons
            : `${group.count} failed attempts · ${reasons}`,
        timestamp: group.latest,
        target: "studentlogins",
        studentId: group.student.id,
        count: group.count,
      });
      continue;
    }

    const registrations = [...group.registrations].filter(Boolean);
    const sample = registrations.slice(0, 3).join(", ");
    const severity: SmartNotificationSeverity =
      group.count >= 10 ? "danger" : "warning";
    events.push({
      id: group.key,
      kind: "unknown_login",
      severity,
      title: "Wrong registration numbers used",
      message:
        group.count === 1
          ? `${sample || "Empty"} is not a known registration number`
          : `${group.count} attempts · ${registrations.length} unknown number${
              registrations.length === 1 ? "" : "s"
            }${sample ? ` · e.g. ${sample}` : ""}`,
      timestamp: group.latest,
      target: "studentlogins",
      count: group.count,
    });
  }

  return { events, failedAttempts, blocked };
}

export async function loadSmartNotifications(options: {
  staffId: string | null;
}): Promise<NotificationsResponse> {
  const now = Date.now();
  const loginSince = new Date(now - LOGIN_WINDOW_DAYS * DAY_MS).toISOString();
  const eventSince = new Date(now - EVENT_WINDOW_DAYS * DAY_MS).toISOString();
  const activeYear = await loadActiveYearId(studentAdmin);

  const [studentsRes, accountsRes, attemptsRes, assignmentsRes] = await Promise.all([
    studentAdmin
      .from("students")
      .select("id, registration_no, first_name, middle_name, last_name"),
    studentAdmin.from("student_accounts").select("student_id, is_active"),
    studentAdmin
      .from("student_login_attempts")
      .select("id, registration_no, success, attempted_at")
      .gte("attempted_at", loginSince)
      .order("attempted_at", { ascending: false })
      .limit(5000),
    studentAdmin
      .from("assignments")
      .select(
        "id, teacher_id, title, created_at, status, academic_year_id, subject:subjects(name), class:school_classes(name), stream:streams(name), teacher:staff(first_name, last_name, name)",
      )
      .in("status", ["published", "closed"])
      .eq("academic_year_id", activeYear)
      .order("created_at", { ascending: false })
      .limit(MAX_ASSIGNMENTS),
  ]);

  if (studentsRes.error) throw studentsRes.error;
  if (accountsRes.error) throw accountsRes.error;
  if (attemptsRes.error) throw attemptsRes.error;
  if (assignmentsRes.error) throw assignmentsRes.error;

  const students = (studentsRes.data ?? []) as StudentRecord[];
  const accounts = (accountsRes.data ?? []) as AccountRecord[];
  const attempts = (attemptsRes.data ?? []) as AttemptRecord[];
  const assignments = (assignmentsRes.data ?? []) as unknown as AssignmentRecord[];

  const studentsByReg = new Map<string, StudentRecord>();
  for (const student of students) {
    const reg = normaliseRegistration(student.registration_no);
    if (reg) studentsByReg.set(reg, student);
  }

  const accountsByStudent = new Map<string, AccountRecord>();
  for (const account of accounts) {
    accountsByStudent.set(account.student_id, account);
  }

  const assignmentsById = new Map<string, AssignmentRecord>();
  for (const assignment of assignments) {
    assignmentsById.set(assignment.id, assignment);
  }

  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const submissionsRes = await studentAdmin
    .from("assignment_submissions")
    .select("id, assignment_id, student_id, submitted_at, is_late")
    .in("status", ["submitted", "marked"])
    .gte("submitted_at", eventSince)
    .order("submitted_at", { ascending: false })
    .limit(MAX_SUBMISSIONS);
  if (submissionsRes.error) throw submissionsRes.error;
  const submissions = ((submissionsRes.data ?? []) as SubmissionRecord[]).filter(
    (submission) => assignmentIds.has(submission.assignment_id),
  );

  const login = buildLoginEvents(attempts, studentsByReg, accountsByStudent, now);

  const assignmentEvents: SmartNotification[] = assignments
    .filter(
      (assignment) =>
        timeOf(assignment.created_at) >= timeOf(eventSince) &&
        assignment.teacher_id !== options.staffId,
    )
    .map((assignment) => ({
      id: `assignment:${assignment.id}`,
      kind: "assignment" as const,
      severity: "info" as const,
      title: `New assignment: ${assignment.title}`,
      message: `${teacherName(assignment)} · ${subjectLabel(assignment)}${
        classLabel(assignment) ? ` · ${classLabel(assignment)}` : ""
      }`,
      timestamp: assignment.created_at,
      target: "assignments" as const,
      assignmentId: assignment.id,
      count: 1,
    }));

  const studentsById = new Map(students.map((student) => [student.id, student]));

  const submissionEvents: SmartNotification[] = submissions
    .filter((submission) => submission.submitted_at)
    .map((submission) => {
      const assignment = assignmentsById.get(submission.assignment_id);
      const student = studentsById.get(submission.student_id);
      const who = student ? fullName(student) : "A student";
      return {
        id: `submission:${submission.id}`,
        kind: "submission" as const,
        severity: "info" as const,
        title: `${who} submitted work`,
        message: assignment
          ? `${assignment.title} · ${subjectLabel(assignment)}${
              classLabel(assignment) ? ` · ${classLabel(assignment)}` : ""
            }${submission.is_late ? " · late" : ""}`
          : "Assignment submission",
        timestamp: submission.submitted_at ?? "",
        target: "assignments" as const,
        assignmentId: submission.assignment_id,
        submissionId: submission.id,
        count: 1,
      };
    });

  const allEvents = [
    ...login.events,
    ...submissionEvents,
    ...assignmentEvents,
  ].sort((a, b) => timeOf(b.timestamp) - timeOf(a.timestamp));

  return {
    notifications: allEvents.slice(0, MAX_EVENTS),
    summary: {
      total: allEvents.length,
      loginFailed: login.events.length,
      failedAttempts: login.failedAttempts,
      blocked: login.blocked,
      submissions: submissionEvents.length,
      assignments: assignmentEvents.length,
    },
    generatedAt: new Date(now).toISOString(),
  };
}
