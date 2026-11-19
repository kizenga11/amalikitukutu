/** Types shared by the student notification API and the student portal bell. */

export const STUDENT_NOTIFICATIONS_REFRESH_EVENT = "student-notifications-refresh";

export type StudentNotificationKind =
  | "assignment_published"
  | "assignment_rolled_back"
  | "assignment_rework"
  | "note_published";

export type StudentNotificationSeverity = "info" | "warning" | "danger";
export type StudentNotificationTarget = "assignments" | "notes";

export interface StudentNotification {
  id: string;
  kind: StudentNotificationKind;
  severity: StudentNotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  target: StudentNotificationTarget;
  assignmentId?: string;
  noteId?: string;
}

export interface StudentNotificationsSummary {
  newAssignments: number;
  rolledBack: number;
  rework: number;
  newNotes: number;
  unreadNotes: number;
}

export interface StudentNotificationsResponse {
  notifications: StudentNotification[];
  summary: StudentNotificationsSummary;
  generatedAt: string;
}

export const STUDENT_NOTIFICATION_KIND_LABELS: Record<StudentNotificationKind, string> = {
  assignment_published: "New assignment",
  assignment_rolled_back: "Assignment returned",
  assignment_rework: "Assignment returned for rework",
  note_published: "New note",
};
