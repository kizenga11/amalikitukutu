import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { cleanLine, cleanMultiline, normaliseAttachment } from "@/lib/assignments-shared";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import {
  canTeach,
  loadActivePeriod,
  loadTeacherAssignments,
  parseQuestions,
} from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const [assignments, period] = await Promise.all([
      loadTeacherAssignments(auth.staff.id),
      loadActivePeriod(),
    ]);

    return NextResponse.json({ assignments, period });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load assignments.") },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const subjectId = typeof body.subjectId === "string" ? body.subjectId : "";
    const classId = typeof body.classId === "string" ? body.classId : "";
    const streamId = typeof body.streamId === "string" ? body.streamId : "";
    if (!isUuid(subjectId) || !isUuid(classId) || !isUuid(streamId)) {
      return NextResponse.json(
        { error: "Select a valid subject, class and stream." },
        { status: 400 },
      );
    }

    const unrestricted = auth.role === "Academic";
    if (!unrestricted && !(await canTeach(auth.staff.id, subjectId, classId, streamId))) {
      return NextResponse.json(
        { error: "You are not allowed to create assignments for this subject, class or stream." },
        { status: 403 },
      );
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

    const parsed = parseQuestions(body.questions);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const questionTotal = parsed.questions.reduce((sum, question) => sum + question.marks, 0);
    const requestedTotal = Number(body.totalMarks);
    const totalMarks = Number.isFinite(requestedTotal) && requestedTotal > 0
      ? requestedTotal
      : questionTotal;

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

    const attachmentResult = normaliseAttachment(body.attachment);
    if (!attachmentResult.ok) {
      return NextResponse.json(
        { error: "Invalid attachment. Use a PDF or image (PNG, JPG, WEBP, GIF) up to 3 MB." },
        { status: 400 },
      );
    }
    const attachment = attachmentResult.attachment;

    const status = body.status === "draft" ? "draft" : "published";
    const allowLateSubmission = Boolean(body.allowLateSubmission);
    const period = await loadActivePeriod();

    const { data: assignment, error: insertError } = await studentAdmin
      .from("assignments")
      .insert({
        teacher_id: auth.staff.id,
        subject_id: subjectId,
        class_id: classId,
        stream_id: streamId,
        academic_year_id: period.academicYearId,
        term: period.term,
        title,
        instructions,
        deadline,
        total_marks: totalMarks,
        allow_late_submission: allowLateSubmission,
        status,
        attachment_name: attachment?.name ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_data: attachment?.data ?? null,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const assignmentId = String(assignment.id);
    const rows = parsed.questions.map((question, index) => ({
      assignment_id: assignmentId,
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

    if (questionError) {
      await studentAdmin.from("assignments").delete().eq("id", assignmentId);
      throw questionError;
    }

    return NextResponse.json({ ok: true, id: assignmentId, status }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not create this assignment.") },
      { status: 500 },
    );
  }
}
