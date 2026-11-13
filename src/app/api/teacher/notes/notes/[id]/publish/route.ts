import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment, getNoteWithContext } from "@/lib/study-notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const info = await getNoteWithContext(id);
    if (!info) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    const allowed = await canManageTeachingAssignment(auth.staff.id, info.context.teachingAssignmentId, unrestricted);
    if (!allowed) return NextResponse.json({ error: "You are not allowed to change this note." }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const publish = typeof body?.publish === "boolean" ? body.publish : !info.note.isPublished;
    const { error } = await studentAdmin
      .from("notes")
      .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, isPublished: publish });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update note.") }, { status: 500 });
  }
}
