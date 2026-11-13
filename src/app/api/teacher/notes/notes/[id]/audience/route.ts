import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { canManageTeachingAssignment, getNoteWithContext, loadNoteAudience } from "@/lib/study-notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to view this." }, { status: 403 });
    const audience = await loadNoteAudience(id);
    const viewed = audience.filter((a) => a.hasViewed).length;
    return NextResponse.json({ audience, summary: { total: audience.length, viewed, notViewed: audience.length - viewed } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load audience.") }, { status: 500 });
  }
}
