import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment, getNoteWithContext } from "@/lib/study-notes-server";
import { cleanNoteTitle } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to edit this note." }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = cleanNoteTitle(body?.title, 200);
    if (!title) return NextResponse.json({ error: "Enter a note title." }, { status: 400 });
    const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
    const { error } = await studentAdmin.from("notes").update({ title, description }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update note.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to delete this note." }, { status: 403 });

    if (info.note.filePath) {
      await studentAdmin.storage.from("notes").remove([info.note.filePath]);
    }
    const { error } = await studentAdmin.from("notes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete note.") }, { status: 500 });
  }
}
