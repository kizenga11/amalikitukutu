import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requireStudent } from "@/lib/student-auth";
import { isUuid } from "@/lib/stream-teacher-server";
import { createSignedNoteUrl, getNoteWithContext, recordStudentNoteView, studentCanViewNote } from "@/lib/study-notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
    const session = await requireStudent(request);
    if (!session.ok) return session.response;

    const allowed = await studentCanViewNote(session.student, id);
    if (!allowed) {
      return NextResponse.json({ error: "You are not allowed to open this note." }, { status: 403 });
    }

    const info = await getNoteWithContext(id);
    if (!info || !info.note.isPublished) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const download = request.nextUrl.searchParams.get("download") === "1";
    const action: "open" | "download" = download ? "download" : "open";
    try {
      await recordStudentNoteView(id, session.student.id, action);
    } catch {
      // ignore tracking failure
    }

    const isText = !info.note.filePath && typeof info.note.contentHtml === "string" && info.note.contentHtml.trim().length > 0;
    if (isText) {
      return NextResponse.json({ kind: "text", contentHtml: info.note.contentHtml, title: info.note.title, fileName: null });
    }

    if (!info.note.filePath) {
      return NextResponse.json({ error: "Note file is not available." }, { status: 404 });
    }
    const url = await createSignedNoteUrl(info.note.filePath, download ? (info.note.fileName || "note.pdf") : undefined);
    if (!url) return NextResponse.json({ error: "Could not open file." }, { status: 500 });
    return NextResponse.json({ kind: "pdf", url, fileName: info.note.fileName });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not open note.") }, { status: 500 });
  }
}
