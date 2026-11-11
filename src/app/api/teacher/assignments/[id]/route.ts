import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { cleanLine, cleanMultiline, normaliseAttachment } from "@/lib/assignments-shared";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import {
  countAssignmentSubmissions,
  deleteTeacherAssignment,
  loadTeacherAssignment,
  parseQuestions,
  type IncomingQuestion,
} from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLISH_STATUSES = new Set(["draft", "published", "closed"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const detail = await loadTeacherAssignment(auth.staff.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load this assignment.") },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!PUBLISH_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid assignment status." }, { status: 400 });
    }

    const { data, error } = await studentAdmin
      .from("assignments")
      .update({ status })
      .eq("id", id)
      .eq("teacher_id", auth.staff.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: data.status });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not change the assignment status.") },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await studentAdmin
      .from("assignments")
      .select("id, attachment_name, attachment_type, attachment_data")
      .eq("id", id)
      .eq("teacher_id", auth.staff.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const title = cleanLine(body.title, 200);
    if (title.length < 3) {
      return NextResponse.json(
        { error: "Enter an assignment title (at least 3 characters)." },
        { status: 400 },
      );
    }

    const instructions = cleanMultiline(body.instructions, 20_000);

    let deadline: string | null = null;
    if (body.deadline != null && body.deadline !== "") {
      const date = new Date(String(body.deadline));
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "The deadline is invalid." }, { status: 400 });
      }
      deadline = date.toISOString();
    }

    const status = typeof body.status === "string" ? body.status : "published";
    if (!PUBLISH_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid assignment status." }, { status: 400 });
    }

    const allowLateSubmission = Boolean(body.allowLateSubmission);

    const submissionCount = await countAssignmentSubmissions(id);
    const questionsLocked = submissionCount > 0;

    let parsedQuestions: IncomingQuestion[] | null = null;
    let questionTotal = 0;

    if (questionsLocked) {
      const { data: questionRows, error: questionError } = await studentAdmin
        .from("assignment_questions")
        .select("marks")
        .eq("assignment_id", id);
      if (questionError) throw questionError;
      questionTotal = (questionRows ?? []).reduce(
        (sum, question) => sum + Number(question.marks ?? 0),
        0,
      );
    } else {
      const parsed = parseQuestions(body.questions);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      parsedQuestions = parsed.questions;
      questionTotal = parsedQuestions.reduce((sum, question) => sum + question.marks, 0);
    }

    const requestedTotal = Number(body.totalMarks);
    const totalMarks =
      Number.isFinite(requestedTotal) && requestedTotal > 0 ? requestedTotal : questionTotal;

    if (!Number.isFinite(totalMarks) || totalMarks <= 0 || totalMarks > 10000) {
      return NextResponse.json(
        { error: "Total marks must be between 1 and 10000." },
        { status: 400 },
      );
    }
    if (questionTotal > totalMarks) {
      return NextResponse.json(
        {
          error: `The questions total (${questionTotal}) exceeds the assignment total (${totalMarks}).`,
        },
        { status: 400 },
      );
    }

    let attachment = {
      name: existing.attachment_name as string | null,
      type: existing.attachment_type as string | null,
      data: existing.attachment_data as string | null,
    };
    if ("attachment" in body) {
      const attachmentResult = normaliseAttachment(body.attachment);
      if (!attachmentResult.ok) {
        return NextResponse.json(
          { error: "Invalid attachment. Use a PDF or image (PNG, JPG, WEBP, GIF) up to 3 MB." },
          { status: 400 },
        );
      }
      attachment = {
        name: attachmentResult.attachment?.name ?? null,
        type: attachmentResult.attachment?.type ?? null,
        data: attachmentResult.attachment?.data ?? null,
      };
    }

    const { data: updated, error: updateError } = await studentAdmin
      .from("assignments")
      .update({
        title,
        instructions,
        deadline,
        total_marks: totalMarks,
        allow_late_submission: allowLateSubmission,
        status,
        attachment_name: attachment.name,
        attachment_type: attachment.type,
        attachment_data: attachment.data,
      })
      .eq("id", id)
      .eq("teacher_id", auth.staff.id)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    if (parsedQuestions) {
      const { error: deleteError } = await studentAdmin
        .from("assignment_questions")
        .delete()
        .eq("assignment_id", id);
      if (deleteError) throw deleteError;

      const rows = parsedQuestions.map((question, index) => ({
        assignment_id: id,
        position: index + 1,
        question_type: question.questionType,
        prompt: question.prompt,
        options: question.questionType === "mcq" ? question.options : null,
        correct_option: question.questionType === "mcq" ? question.correctOption : null,
        marks: question.marks,
      }));

      const { error: questionError } = await studentAdmin
        .from("assignment_questions")
        .insert(rows);
      if (questionError) throw questionError;
    }

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not update this assignment.") },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const deleted = await deleteTeacherAssignment(auth.staff.id, id);
    if (!deleted) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not delete this assignment.") },
      { status: 500 },
    );
  }
}
