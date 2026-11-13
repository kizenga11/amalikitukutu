import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { canManageTeachingAssignment, createSignedNoteUrl, getNoteWithContext } from "@/lib/study-notes-server";

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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to open this note." }, { status: 403 });
    const isText = !info.note.filePath && typeof info.note.contentHtml === "string" && info.note.contentHtml.trim().length > 0;
    if (isText) {
      return NextResponse.json({ kind: "text", contentHtml: info.note.contentHtml, title: info.note.title });
    }
    const download = request.nextUrl.searchParams.get("download") === "1";
    if (!info.note.filePath) return NextResponse.json({ error: "Note file is not available." }, { status: 404 });
    const url = await createSignedNoteUrl(info.note.filePath, download ? (info.note.fileName || "note.pdf") : undefined);
    if (!url) return NextResponse.json({ error: "Could not open file." }, { status: 500 });
    return NextResponse.json({ kind: "pdf", url });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not open note.") }, { status: 500 });
  }
}
