import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import {
  loadTeacherSubmission,
  returnSubmissionForRework,
} from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Teacher sends a graded/submitted work back so the student can redo it. */
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
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json(
        { error: "Please tell the student what to improve." },
        { status: 400 },
      );
    }

    const detail = await loadTeacherSubmission(auth.staff.id, id, submissionId);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }
    if (detail.submission.status === "draft") {
      return NextResponse.json(
        { error: "This assignment has already been returned to the student." },
        { status: 400 },
      );
    }

    await returnSubmissionForRework(auth.staff.id, id, submissionId, reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not return the assignment to the student.") },
      { status: 500 },
    );
  }
}
