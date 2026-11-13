import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment } from "@/lib/study-notes-server";
import { cleanNoteTitle, MAX_NOTE_PDF_BYTES } from "@/lib/study-notes-shared";

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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to upload notes here." }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Select a PDF file to upload." }, { status: 400 });
    }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_NOTE_PDF_BYTES) {
      return NextResponse.json({ error: "PDF must be 2 MB or smaller." }, { status: 400 });
    }

    const title = cleanNoteTitle(form.get("title"), 200) || cleanNoteTitle(file.name.replace(/\.pdf$/i, ""), 200) || "Note";
    const descriptionRaw = form.get("description");
    const description = typeof descriptionRaw === "string" && descriptionRaw.trim() ? descriptionRaw.trim().slice(0, 2000) : null;

    // remove previous file/note if exists (one note per subtopic)
    if (row.note?.file_path) {
      await studentAdmin.storage.from("notes").remove([row.note.file_path]);
    }
    if (row.note?.id) {
      await studentAdmin.from("notes").delete().eq("id", row.note.id);
    }

    const path = `${row.topic.teaching_assignment_id}/${row.topic.id}/${id}/${randomUUID()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await studentAdmin.storage.from("notes").upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: inserted, error: insErr } = await studentAdmin
      .from("notes")
      .insert({
        subtopic_id: id,
        title,
        description,
        file_path: path,
        file_name: file.name.slice(0, 255),
        file_size: file.size,
        mime_type: "application/pdf",
        content_html: null,
        is_published: false,
        created_by: auth.staff.id,
      })
      .select("id")
      .single();

    if (insErr) {
      // cleanup uploaded file on db failure
      await studentAdmin.storage.from("notes").remove([path]);
      throw insErr;
    }

    return NextResponse.json({ ok: true, id: inserted.id, filePath: path });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not upload note.") }, { status: 500 });
  }
}
