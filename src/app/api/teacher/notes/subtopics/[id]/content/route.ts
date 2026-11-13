import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment } from "@/lib/study-notes-server";
import { cleanNoteTitle, normalizeNoteHtml, noteHtmlToPlainText, sanitizeNoteHtml } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSubtopicContext(subtopicId: string) {
  const { data, error } = await studentAdmin
    .from("note_subtopics")
    .select("id, topic:note_topics(id, teaching_assignment_id), notes(id, file_path)")
    .eq("id", subtopicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const topic: any = Array.isArray((data as any).topic) ? (data as any).topic[0] : (data as any).topic;
  const note: any = Array.isArray((data as any).notes) ? (data as any).notes[0] : (data as any).notes;
  return { subtopic: data, topic, note };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid subtopic." }, { status: 400 });
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";

    const row = await getSubtopicContext(id);
    if (!row?.topic) return NextResponse.json({ error: "Subtopic not found." }, { status: 404 });
    const allowed = await canManageTeachingAssignment(auth.staff.id, row.topic.teaching_assignment_id, unrestricted);
    if (!allowed) return NextResponse.json({ error: "You are not allowed to save notes here." }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = cleanNoteTitle(body?.title, 200) || "Note";
    const contentHtml = normalizeNoteHtml(sanitizeNoteHtml(body?.contentHtml, 200_000));
    const plain = noteHtmlToPlainText(contentHtml);
    if (!plain) {
      return NextResponse.json({ error: "Enter or paste note content before saving." }, { status: 400 });
    }

    // remove previous PDF file/note if exists (one note per subtopic)
    if (row.note?.file_path) {
      await studentAdmin.storage.from("notes").remove([row.note.file_path]);
    }
    if (row.note?.id) {
      await studentAdmin.from("notes").delete().eq("id", row.note.id);
    }

    const { data: inserted, error: insErr } = await studentAdmin
      .from("notes")
      .insert({
        subtopic_id: id,
        title,
        description: null,
        file_path: null,
        file_name: null,
        file_size: null,
        mime_type: null,
        content_html: contentHtml,
        is_published: false,
        created_by: auth.staff.id,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;
    return NextResponse.json({ ok: true, id: inserted.id, kind: "text" });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save text note.") }, { status: 500 });
  }
}