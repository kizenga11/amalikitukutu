import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment, loadTopicDetail } from "@/lib/study-notes-server";
import { cleanNoteTitle } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getTopic(id: string) {
  const { data, error } = await studentAdmin
    .from("note_topics")
    .select("id, teaching_assignment_id, title")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    const allowed = await canManageTeachingAssignment(auth.staff.id, topic.teaching_assignment_id, unrestricted);
    if (!allowed) return NextResponse.json({ error: "You are not allowed to view this topic." }, { status: 403 });
    const detail = await loadTopicDetail(id);
    return NextResponse.json({ topic: detail });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load topic.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    const allowed = await canManageTeachingAssignment(auth.staff.id, topic.teaching_assignment_id, unrestricted);
    if (!allowed) return NextResponse.json({ error: "You are not allowed to edit this topic." }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = cleanNoteTitle(body?.title, 200);
    if (!title) return NextResponse.json({ error: "Enter a topic title." }, { status: 400 });
    const { error } = await studentAdmin.from("note_topics").update({ title }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update topic.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });
    const allowed = await canManageTeachingAssignment(auth.staff.id, topic.teaching_assignment_id, unrestricted);
    if (!allowed) return NextResponse.json({ error: "You are not allowed to delete this topic." }, { status: 403 });

    // collect file paths to remove from storage
    const { data: subs } = await studentAdmin
      .from("note_subtopics")
      .select("id, notes(file_path)")
      .eq("topic_id", id);
    const paths: string[] = [];
    for (const s of subs ?? []) {
      const noteRow: any = Array.isArray((s as any).notes) ? (s as any).notes[0] : (s as any).notes;
      if (noteRow?.file_path) paths.push(noteRow.file_path);
    }
    if (paths.length) {
      await studentAdmin.storage.from("notes").remove(paths);
    }
    const { error } = await studentAdmin.from("note_topics").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete topic.") }, { status: 500 });
  }
}
