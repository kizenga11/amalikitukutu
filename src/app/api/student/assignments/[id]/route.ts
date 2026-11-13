import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { isUuid } from "@/lib/stream-teacher-server";
import { requireStudent, studentAdmin } from "@/lib/student-auth";
import {
  loadAccessibleAssignment,
  loadSubmission,
  rowToSummary,
  teacherName,
} from "@/lib/student-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requireStudent(request);
    if (!session.ok) return session.response;

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const assignment = await loadAccessibleAssignment(id, session.student);
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const [{ data: questionData, error: questionError }, submission] = await Promise.all([
      studentAdmin
        .from("assignment_questions")
        .select("id, position, question_type, prompt, options, marks")
        .eq("assignment_id", assignment.id)
        .order("position", { ascending: true }),
      loadSubmission(assignment.id, session.student.id),
    ]);
    if (questionError) throw questionError;

    let answers: {
      questionId: string;
      answerHtml: string;
      answerText: string;
      awardedMarks: number | null;
      feedback: string | null;
    }[] = [];

    if (submission) {
      const { data: answerData, error: answerError } = await studentAdmin
        .from("assignment_answers")
        .select("question_id, answer_html, answer_text, awarded_marks, feedback")
        .eq("submission_id", submission.id);
      if (answerError) throw answerError;
      answers = (answerData ?? []).map((row) => {
        let answerValue: unknown = undefined;
        const text = row.answer_text ?? "";
        if (text && (text.trim().startsWith("{") || text.trim().startsWith("["))) {
          try { answerValue = JSON.parse(text); } catch { answerValue = undefined; }
        }
        return {
          questionId: row.question_id,
          answerHtml: row.answer_html ?? "",
          answerText: text,
          ...(answerValue !== undefined ? { answerValue } : {}),
          awardedMarks: row.awarded_marks === null ? null : Number(row.awarded_marks),
          feedback: row.feedback ?? null,
        };
      });
    }

    const deadlinePassed = assignment.deadline
      ? Date.now() > new Date(assignment.deadline).getTime()
      : false;
    const alreadySubmitted = Boolean(
      submission && (submission.status === "submitted" || submission.status === "marked"),
    );
    const locked =
      alreadySubmitted || (deadlinePassed && !assignment.allow_late_submission);

    return NextResponse.json({
      assignment: {
        ...rowToSummary(assignment, submission),
        teacherName: teacherName(assignment),
        attachmentType: assignment.attachment_type,
        attachmentData: assignment.attachment_data,
      },
      questions: (questionData ?? []).map((row) => ({
        id: row.id,
        position: row.position,
        questionType: row.question_type,
        prompt: row.prompt,
        options: row.options ?? null,
        marks: Number(row.marks ?? 0),
      })),
      submission: submission
        ? {
            id: submission.id,
            status: submission.status,
            submittedAt: submission.submitted_at,
            lastSavedAt: submission.last_saved_at,
            isLate: submission.is_late,
            totalScore: submission.total_score === null ? null : Number(submission.total_score),
            feedback: submission.feedback,
            attachmentName: submission.attachment_name,
            attachmentType: submission.attachment_type,
            attachmentData: submission.attachment_data,
          }
        : null,
      answers,
      locked,
      deadlinePassed,
      canSubmit: !locked,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load this assignment.") },
      { status: 500 },
    );
  }
}
