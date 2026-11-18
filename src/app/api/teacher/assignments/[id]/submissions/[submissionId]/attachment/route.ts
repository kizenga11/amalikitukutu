import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { loadTeacherSubmission } from "@/lib/teacher-assignments-server";
import { studentAdmin } from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
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
        { error: "Please provide a reason for removing the attachment." },
        { status: 400 },
      );
    }

    const detail = await loadTeacherSubmission(auth.staff.id, id, submissionId);
    if (!detail) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error } = await studentAdmin
      .from("assignment_submissions")
      .update({
        attachment_name: null,
        attachment_type: null,
        attachment_data: null,
        attachment_removed_at: now,
        attachment_removed_reason: reason,
        attachment_removed_by: auth.staff.id,
      })
      .eq("id", submissionId)
      .eq("assignment_id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not remove the attachment.") },
      { status: 500 },
    );
  }
}
