import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { normaliseAttachment } from "@/lib/assignments-shared";
import { isUuid } from "@/lib/stream-teacher-server";
import { requireStudent, studentAdmin } from "@/lib/student-auth";
import {
  loadAccessibleAssignment,
  loadQuestionRows,
  loadSubmission,
  normaliseAnswers,
  saveAnswers,
} from "@/lib/student-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

    const existing = await loadSubmission(assignment.id, session.student.id);
    if (existing && (existing.status === "submitted" || existing.status === "marked")) {
      // Idempotent: if a previous request already submitted (or the client retried),
      // treat it as success so the UI doesn't show a false error.
      return NextResponse.json({
        ok: true,
        submittedAt: existing.submitted_at ?? new Date().toISOString(),
        isLate: Boolean(existing.is_late),
        alreadySubmitted: true,
      });
    }

    const now = new Date();
    const deadlinePassed = assignment.deadline
      ? now.getTime() > new Date(assignment.deadline).getTime()
      : false;
    if (deadlinePassed && !assignment.allow_late_submission) {
      return NextResponse.json(
        { error: "The submission deadline has passed. This assignment can no longer be submitted." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const questions = await loadQuestionRows(assignment.id);
    const parsed = normaliseAnswers(body?.answers, questions);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const attachmentResult = normaliseAttachment(body?.attachment);
    if (!attachmentResult.ok) {
      return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
    }
    const attachment = attachmentResult.attachment;
    const submittedAt = now.toISOString();
    const isLate = Boolean(assignment.deadline && deadlinePassed);

    let submissionId: string;
    if (existing) {
      const { error } = await studentAdmin
        .from("assignment_submissions")
        .update({
          status: "submitted",
          submitted_at: submittedAt,
          last_saved_at: submittedAt,
          is_late: isLate,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_data: attachment?.data ?? null,
        })
        .eq("id", existing.id);
      if (error) throw error;
      submissionId = existing.id;
    } else {
      const { data, error } = await studentAdmin
        .from("assignment_submissions")
        .insert({
          assignment_id: assignment.id,
          student_id: session.student.id,
          status: "submitted",
          submitted_at: submittedAt,
          last_saved_at: submittedAt,
          is_late: isLate,
          attachment_name: attachment?.name ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_data: attachment?.data ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      submissionId = String(data.id);
    }

    try {
      await saveAnswers(submissionId, parsed.answers);
    } catch (answerError) {
      // The submission itself is already recorded; don't report failure to the client
      // or students may think they didn't submit when they did.
      console.error("Failed to save answers after submission:", answerError);
    }

    return NextResponse.json({ ok: true, submittedAt, isLate });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not submit the assignment.") },
      { status: 500 },
    );
  }
}
