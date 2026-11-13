import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment } from "@/lib/study-notes-server";
import {
  cleanNoteCaption,
  isNoteImageFile,
  MAX_NOTE_IMAGE_BYTES,
  noteImageContentType,
  noteImageExtension,
} from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSubtopicContext(subtopicId: string) {
  const { data, error } = await studentAdmin
    .from("note_subtopics")
    .select("id, topic:note_topics(id, teaching_assignment_id)")
    .eq("id", subtopicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const topic: any = Array.isArray((data as any).topic) ? (data as any).topic[0] : (data as any).topic;
  return { subtopic: data, topic };
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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to upload diagrams here." }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Select an image file to upload." }, { status: 400 });
    }
    if (!isNoteImageFile(file)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WEBP or GIF images are allowed (max 5 MB)." },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_NOTE_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
    }

    const caption = cleanNoteCaption(form.get("caption")) || null;
    const ext = noteImageExtension(file);
    const contentType = noteImageContentType(file);
    const path = `${row.topic.teaching_assignment_id}/${row.topic.id}/${id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await studentAdmin.storage.from("note-images").upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (upErr) throw upErr;

    const { count } = await studentAdmin
      .from("note_images")
      .select("id", { count: "exact", head: true })
      .eq("subtopic_id", id);

    const { data: inserted, error: insErr } = await studentAdmin
      .from("note_images")
      .insert({
        subtopic_id: id,
        file_path: path,
        file_name: file.name.slice(0, 255),
        file_size: file.size,
        mime_type: contentType,
        caption,
        position: (count ?? 0) + 1,
        created_by: auth.staff.id,
      })
      .select("id")
      .single();

    if (insErr) {
      await studentAdmin.storage.from("note-images").remove([path]);
      throw insErr;
    }

    return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not upload diagram.") }, { status: 500 });
  }
}
