// Shared shapes for the Academic/Headmaster smart notification bell.
// Kept free of imports so both the API route and the client can use them.

export type SmartNotificationKind =
  | "login_failed"
  | "unknown_login"
  | "submission"
  | "assignment";

export type SmartNotificationSeverity = "info" | "warning" | "danger";

export type NotificationTarget = "studentlogins" | "assignments";

export interface SmartNotification {
  id: string;
  kind: SmartNotificationKind;
  severity: SmartNotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  target: NotificationTarget | null;
  /** Grouped events (e.g. repeated failed sign-ins) report how many happened. */
  count: number;
}

export interface NotificationsSummary {
  total: number;
  /** Number of grouped sign-in events in the window. */
  loginFailed: number;
  /** Raw failed attempts in the last 7 days, not grouped. */
  failedAttempts: number;
  /** Students currently locked out by the 15-minute rate limit. */
  blocked: number;
  submissions: number;
  assignments: number;
}

export interface NotificationsResponse {
  notifications: SmartNotification[];
  summary: NotificationsSummary;
  /** Server time used to compute "x minutes ago" labels and read state. */
  generatedAt: string;
}

export const NOTIFICATION_KIND_LABELS: Record<SmartNotificationKind, string> = {
  login_failed: "Failed sign-in",
  unknown_login: "Unknown registration",
  submission: "Student submission",
  assignment: "New assignment",
};
