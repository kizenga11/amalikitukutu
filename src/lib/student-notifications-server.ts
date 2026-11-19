import { loadActiveYearId } from "@/lib/active-year";
import { studentAdmin, type StudentProfile } from "@/lib/student-auth";
import { visibleSubjectIds } from "@/lib/student-assignments-server";
import { loadStudentNoteActivity } from "@/lib/study-notes-server";
import type {
  StudentNotification,
  StudentNotificationsResponse,
} from "@/lib/student-notifications-types";

const EVENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 60;
const MAX_ASSIGNMENTS = 300;

interface AssignmentActivityRow {
  id: string;
  title: string;
  status: string;
  previous_status: string | null;
  status_changed_at: string | null;
  created_at: string | null;
  subject?: { name: string } | { name: string }[] | null;
}

function timeOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function subjectName(row: AssignmentActivityRow): string {
  const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
  return subject?.name || "Somo";
}

/**
 * Student alerts are derived on demand from the same tables the portal already
 * reads. Note "opened" state comes from note_views, so no extra read table is
 * needed. Assignment status changes are remembered by the DB trigger added in
 * supabase/migrations/20261122000001_student_notifications.sql.
 */
export async function loadStudentNotifications(
  student: StudentProfile,
): Promise<StudentNotificationsResponse> {
  const generatedAt = new Date();
  const since = generatedAt.getTime() - EVENT_WINDOW_MS;
  const [year, subjectIds] = await Promise.all([
    loadActiveYearId(studentAdmin),
    visibleSubjectIds(student),
  ]);

  const notifications: StudentNotification[] = [];

  let assignments: AssignmentActivityRow[] = [];
  if (student.classId && student.streamId && subjectIds.length > 0) {
    const { data, error } = await studentAdmin
      .from("assignments")
      .select(
        "id, title, status, previous_status, status_changed_at, created_at, subject:subjects(name)",
      )
      .eq("class_id", student.classId)
      .eq("stream_id", student.streamId)
      .eq("academic_year_id", year)
      .in("subject_id", subjectIds)
      .order("created_at", { ascending: false })
      .limit(MAX_ASSIGNMENTS);
    if (error) throw error;
    assignments = (data ?? []) as unknown as AssignmentActivityRow[];
  }

  const assignmentById = new Map(assignments.map((row) => [row.id, row]));
  const classLabel = [student.className, student.streamName].filter(Boolean).join(" ").trim();

  for (const row of assignments) {
    const subject = subjectName(row);

    // A newly published assignment: either created as published, or moved from
    // draft/closed back to published.
    const publishedAt =
      row.previous_status && row.previous_status !== "published"
        ? row.status_changed_at
        : row.created_at;
    if (
      row.status === "published" &&
      publishedAt &&
      timeOf(publishedAt) >= since &&
      timeOf(publishedAt) <= generatedAt.getTime()
    ) {
      notifications.push({
        id: `assignment:${row.id}:published:${timeOf(publishedAt)}`,
        kind: "assignment_published",
        severity: "info",
        title: `Kazi mpya: ${row.title}`,
        message: `${subject}${classLabel ? ` · ${classLabel}` : ""} · Mwalimu amechapisha kazi hii.`,
        timestamp: publishedAt,
        target: "assignments",
        assignmentId: row.id,
      });
    }

    // Published/closed assignment moved back to draft – it disappears from the
    // student's list, so link to the list rather than the now-hidden detail.
    if (
      row.status === "draft" &&
      row.previous_status &&
      row.previous_status !== "draft" &&
      row.status_changed_at &&
      timeOf(row.status_changed_at) >= since &&
      timeOf(row.status_changed_at) <= generatedAt.getTime()
    ) {
      notifications.push({
        id: `assignment:${row.id}:rolled-back:${timeOf(row.status_changed_at)}`,
        kind: "assignment_rolled_back",
        severity: "warning",
        title: `Kazi ilirudishwa: ${row.title}`,
        message: `${subject} · Mwalimu ameirudisha kwenye draft, kwa sasa huionekani kwenye orodha yako.`,
        timestamp: row.status_changed_at,
        target: "assignments",
      });
    }
  }

  if (assignmentById.size > 0) {
    const { data, error } = await studentAdmin
      .from("assignment_submissions")
      .select("id, assignment_id, returned_for_rework_at")
      .eq("student_id", student.id)
      .in("assignment_id", Array.from(assignmentById.keys()))
      .gte("returned_for_rework_at", new Date(since).toISOString())
      .order("returned_for_rework_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    for (const submission of data ?? []) {
      const timestamp = submission.returned_for_rework_at;
      if (!timestamp) continue;
      const row = assignmentById.get(submission.assignment_id);
      if (!row) continue;
      notifications.push({
        id: `rework:${submission.id}:${timeOf(timestamp)}`,
        kind: "assignment_rework",
        severity: "warning",
        title: `Kazi ilirudishwa kwako: ${row.title}`,
        message: `${subjectName(row)} · Mwalimu amekuomba uboreshe kazi yako na uisubmit tena.`,
        timestamp,
        target: "assignments",
        assignmentId: row.id,
      });
    }
  }

  const notes = await loadStudentNoteActivity(student);
  for (const note of notes) {
    const timestamp = note.publishedAt || note.createdAt;
    if (!timestamp || timeOf(timestamp) < since || timeOf(timestamp) > generatedAt.getTime()) {
      continue;
    }
    notifications.push({
      id: `note:${note.id}:${timeOf(timestamp)}`,
      kind: "note_published",
      severity: "info",
      title: `Note mpya: ${note.title}`,
      message: `${note.subjectName}${note.topicTitle ? ` · ${note.topicTitle}` : ""} · Fungua notes kuisoma.`,
      timestamp,
      target: "notes",
      noteId: note.id,
    });
  }

  notifications.sort((a, b) => timeOf(b.timestamp) - timeOf(a.timestamp));

  return {
    notifications: notifications.slice(0, MAX_NOTIFICATIONS),
    summary: {
      newAssignments: notifications.filter((n) => n.kind === "assignment_published").length,
      rolledBack: notifications.filter((n) => n.kind === "assignment_rolled_back").length,
      rework: notifications.filter((n) => n.kind === "assignment_rework").length,
      newNotes: notifications.filter((n) => n.kind === "note_published").length,
      unreadNotes: notes.filter((note) => !note.isViewed).length,
    },
    generatedAt: generatedAt.toISOString(),
  };
}
