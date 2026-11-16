// Shared shapes for the admin "Student Logins" monitor.
// Kept free of imports so both server routes and client components can use them.

export type LoginFailureReason =
  | "unknown_registration"
  | "account_missing"
  | "inactive_account"
  | "wrong_password"
  | "profile_missing";

export const LOGIN_FAILURE_LABELS: Record<LoginFailureReason, string> = {
  unknown_registration: "Wrong registration no.",
  account_missing: "No portal account",
  inactive_account: "Account disabled",
  wrong_password: "Wrong password",
  profile_missing: "Student profile missing",
};

export const LOGIN_FAILURE_HINTS: Record<LoginFailureReason, string> = {
  unknown_registration:
    "The registration number entered does not match any student record.",
  account_missing: "The student exists but has no portal account yet.",
  inactive_account: "The portal account has been disabled.",
  wrong_password: "The registration number is correct but the password was wrong.",
  profile_missing: "The account exists but the student record could not be loaded.",
};

export type StudentLoginsFilter =
  | "all"
  | "never"
  | "default"
  | "changed"
  | "failed"
  | "blocked"
  | "missing";

export interface LoginAttemptItem {
  id: string;
  registrationNo: string;
  success: boolean;
  failureReason: LoginFailureReason | null;
  attemptedAt: string;
  ipAddress: string | null;
  studentId: string | null;
  studentName: string | null;
  className: string | null;
  streamName: string | null;
}

export interface StudentLoginRow {
  studentId: string;
  registrationNo: string | null;
  fullName: string;
  gender: string;
  className: string;
  streamName: string;
  status: string;
  hasAccount: boolean;
  accountId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  accountUpdatedAt: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  activeSessions: number;
  failures24h: number;
  failures30d: number;
  blocked: boolean;
  lastFailure: LoginAttemptItem | null;
  lastSuccessAt: string | null;
}

export interface StudentLoginsSummary {
  students: number;
  withoutAccount: number;
  neverLoggedIn: number;
  defaultPassword: number;
  changedPassword: number;
  failedAttempts24h: number;
  failedStudents24h: number;
  blocked: number;
  activeSessions: number;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StudentLoginsResponse {
  summary: StudentLoginsSummary;
  students: StudentLoginRow[];
  pagination: PageInfo;
}

export interface StudentActivityAccount {
  id: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentActivitySession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface StudentActivityResponse {
  student: {
    studentId: string;
    registrationNo: string | null;
    fullName: string;
    gender: string;
    className: string;
    streamName: string;
    status: string;
  };
  account: StudentActivityAccount | null;
  attempts: LoginAttemptItem[];
  sessions: StudentActivitySession[];
}

export interface LoginFailuresSummary {
  failedAttempts24h: number;
  failedAttempts7d: number;
  unknownRegistration24h: number;
  wrongPassword24h: number;
  distinctStudents24h: number;
}

export interface LoginFailuresResponse {
  attempts: LoginAttemptItem[];
  summary: LoginFailuresSummary;
  pagination: PageInfo;
}

export interface ResetStudentPasswordResponse {
  ok: true;
  defaultPassword: string;
  created: boolean;
}
