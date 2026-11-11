import { studentAdmin, type StudentProfile, loadStudentSubjects } from "@/lib/student-auth";
import {
  cleanLine,
  richTextToPlain,
  sanitizeRichHtml,
  type AssignmentSummary,
  studentStatus,
} from "@/lib/assignments-shared";

export interface AssignmentRow {
  id: string;
  teacher_id: string | null;
  subject_id: string;
  class_id: string;
  stream_id: string;
  academic_year_id: string;
  term: number;
  title: string;
  instructions: string;
  deadline: string | null;
  total_marks: number;
  allow_late_submission: boolean;
  status: "draft" | "published" | "closed";
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_data: string | null;
  created_at: string;
  subject: { code: string; name: string } | { code: string; name: string }[] | null;
  class: { name: string } | { name: string }[] | null;
  stream: { name: string } | { name: string }[] | null;
  teacher:
    | { first_name: string | null; last_name: string | null; name: string | null }
    | { first_name: string | null; last_name: string | null; name: string | null }[]
    | null;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  status: "draft" | "submitted" | "marked";
  last_saved_at: string | null;
  submitted_at: string | null;
  is_late: boolean;
  total_score: number | null;
  feedback: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_data: string | null;
}

export const ASSIGNMENT_SELECT =
  "id, teacher_id, subject_id, class_id, stream_id, academic_year_id, term, title, instructions, deadline, total_marks, allow_late_submission, status, attachment_name, attachment_type, attachment_data, created_at, subject:subjects(code, name), class:school_classes(name), stream:streams(name), teacher:staff(first_name, last_name, name)";

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function teacherName(row: AssignmentRow): string {
  const teacher = firstRelation(row.teacher);
  return [teacher?.first_name, teacher?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || teacher?.name || "Teacher";
}

export function rowToSummary(row: AssignmentRow, submission: SubmissionRow | null): AssignmentSummary {
  const subject = firstRelation(row.subject);
  const cls = firstRelation(row.class);
  const stream = firstRelation(row.stream);
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    subjectName: subject?.name ?? "Subject",
    subjectCode: subject?.code ?? "",
    classId: row.class_id,
    className: cls?.name ?? "",
    streamId: row.stream_id,
    streamName: stream?.name ?? "",
    academicYearId: row.academic_year_id,
    term: row.term,
    deadline: row.deadline,
    totalMarks: Number(row.total_marks ?? 0),
    allowLateSubmission: Boolean(row.allow_late_submission),
    status: row.status,
    instructions: row.instructions,
    attachmentName: row.attachment_name,
    createdAt: row.created_at,
    submissionStatus: studentStatus(submission?.status ?? null, Boolean(submission?.is_late)),
    submittedAt: submission?.submitted_at ?? null,
    isLate: Boolean(submission?.is_late),
    awardedMarks: submission?.total_score === null || submission?.total_score === undefined
      ? null
      : Number(submission.total_score),
    feedback: submission?.feedback ?? null,
  };
}

export async function visibleSubjectIds(student: StudentProfile): Promise<string[]> {
  const subjects = await loadStudentSubjects(student.id);
  return subjects.map((subject) => subject.id);
}

export async function loadVisibleAssignments(
  student: StudentProfile,
): Promise<AssignmentSummary[]> {
  if (!student.classId || !student.streamId) return [];
  const subjectIds = await visibleSubjectIds(student);
  if (subjectIds.length === 0) return [];

  const { data, error } = await studentAdmin
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("class_id", student.classId)
    .eq("stream_id", student.streamId)
    .eq("status", "published")
    .in("subject_id", subjectIds)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as AssignmentRow[];
  if (rows.length === 0) return [];

  const { data: submissionData, error: submissionError } = await studentAdmin
    .from("assignment_submissions")
    .select(
      "id, assignment_id, student_id, status, last_saved_at, submitted_at, is_late, total_score, feedback, attachment_name, attachment_type, attachment_data",
    )
    .eq("student_id", student.id)
    .in(
      "assignment_id",
      rows.map((row) => row.id),
    );
  if (submissionError) throw submissionError;

  const byAssignment = new Map<string, SubmissionRow>();
  for (const submission of (submissionData ?? []) as SubmissionRow[]) {
    byAssignment.set(submission.assignment_id, submission);
  }

  return rows.map((row) => rowToSummary(row, byAssignment.get(row.id) ?? null));
}

export async function loadAccessibleAssignment(
  assignmentId: string,
  student: StudentProfile,
): Promise<AssignmentRow | null> {
  if (!student.classId || !student.streamId) return null;

  const { data, error } = await studentAdmin
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as AssignmentRow;
  if (row.status !== "published") return null;
  if (row.class_id !== student.classId || row.stream_id !== student.streamId) return null;

  const subjectIds = await visibleSubjectIds(student);
  if (!subjectIds.includes(row.subject_id)) return null;
  return row;
}

export async function loadSubmission(
  assignmentId: string,
  studentId: string,
): Promise<SubmissionRow | null> {
  const { data, error } = await studentAdmin
    .from("assignment_submissions")
    .select(
      "id, assignment_id, student_id, status, last_saved_at, submitted_at, is_late, total_score, feedback, attachment_name, attachment_type, attachment_data",
    )
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return (data as SubmissionRow | null) ?? null;
}

export interface AssignmentQuestionRow {
  id: string;
  question_type: "essay" | "short_answer" | "mcq";
  prompt: string;
}

export interface IncomingAnswer {
  questionId: string;
  answerHtml: string;
  answerText: string;
}

export async function loadQuestionRows(assignmentId: string): Promise<AssignmentQuestionRow[]> {
  const { data, error } = await studentAdmin
    .from("assignment_questions")
    .select("id, question_type, prompt")
    .eq("assignment_id", assignmentId);
  if (error) throw error;
  return (data ?? []) as AssignmentQuestionRow[];
}

export function normaliseAnswers(
  raw: unknown,
  questions: AssignmentQuestionRow[],
): { ok: true; answers: IncomingAnswer[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, answers: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "The answers are invalid." };
  }

  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const answers: IncomingAnswer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const questionId = typeof row.questionId === "string" ? row.questionId : "";
    const question = questionMap.get(questionId);
    if (!question || seen.has(questionId)) continue;
    seen.add(questionId);

    if (question.question_type === "mcq") {
      answers.push({
        questionId,
        answerHtml: "",
        answerText: cleanLine(row.answerText, 2000),
      });
      continue;
    }

    const answerHtml = sanitizeRichHtml(row.answerHtml);
    answers.push({
      questionId,
      answerHtml,
      answerText: richTextToPlain(answerHtml, 120_000),
    });
  }

  return { ok: true, answers };
}

export async function saveAnswers(
  submissionId: string,
  answers: IncomingAnswer[],
): Promise<void> {
  if (answers.length === 0) return;
  const rows = answers.map((answer) => ({
    submission_id: submissionId,
    question_id: answer.questionId,
    answer_html: answer.answerHtml,
    answer_text: answer.answerText,
  }));
  const { error } = await studentAdmin
    .from("assignment_answers")
    .upsert(rows, { onConflict: "submission_id,question_id" });
  if (error) throw error;
}

