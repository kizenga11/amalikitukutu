import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import {
  loadTeacherSubmission,
  saveTeacherGrade,
} from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
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

    const { id, submissionId } = await params;
    if (!isUuid(id) || !isUuid(submissionId)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const detail = await loadTeacherSubmission(auth.staff.id, id, submissionId);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load the student's answers.") },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
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

    const { id, submissionId } = await params;
    if (!isUuid(id) || !isUuid(submissionId)) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const detail = await loadTeacherSubmission(auth.staff.id, id, submissionId);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }
    if (detail.submission.status === "draft") {
      return NextResponse.json(
        { error: "The student has not submitted this assignment." },
        { status: 400 },
      );
    }

    const maxByAnswer = new Map(
      detail.answers
        .filter((answer) => answer.id)
        .map((answer) => [answer.id, answer.maxMarks]),
    );

    const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
    const answers: { answerId: string; awardedMarks: number | null; feedback: string }[] = [];

    for (const item of rawAnswers) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const answerId = typeof row.answerId === "string" ? row.answerId : "";
      if (!maxByAnswer.has(answerId)) continue;

      const maxMarks = maxByAnswer.get(answerId) ?? 0;
      let awardedMarks: number | null = null;
      if (row.awardedMarks !== null && row.awardedMarks !== undefined && row.awardedMarks !== "") {
        const value = Number(row.awardedMarks);
        if (!Number.isFinite(value) || value < 0) {
          return NextResponse.json(
            { error: "The marks entered are invalid." },
            { status: 400 },
          );
        }
        if (value > maxMarks + 0.001) {
          return NextResponse.json(
            { error: `Marks cannot exceed ${maxMarks} for a single question.` },
            { status: 400 },
          );
        }
        awardedMarks = Math.round(value * 100) / 100;
      }

      answers.push({
        answerId,
        awardedMarks,
        feedback: typeof row.feedback === "string" ? row.feedback : "",
      });
    }

    const feedback = typeof body.feedback === "string" ? body.feedback : "";
    const result = await saveTeacherGrade(auth.staff.id, id, submissionId, {
      answers,
      feedback,
    });

    return NextResponse.json({ ok: true, totalScore: result.totalScore });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not save the marks.") },
      { status: 500 },
    );
  }
}
