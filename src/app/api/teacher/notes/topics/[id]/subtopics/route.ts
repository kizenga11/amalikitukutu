import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment } from "@/lib/study-notes-server";
import { cleanNoteTitle } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getTopic(id: string) {
  const { data, error } = await studentAdmin
    .from("note_topics")
    .select("id, teaching_assignment_id, title, subtopic_count")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; teaching_assignment_id: string; title: string; subtopic_count: number } | null;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Invalid topic." }, { status: 400 });

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }

    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const topic = await getTopic(id);
    if (!topic) return NextResponse.json({ error: "Topic not found." }, { status: 404 });

    const allowed = await canManageTeachingAssignment(auth.staff.id, topic.teaching_assignment_id, unrestricted);
    if (!allowed) {
      return NextResponse.json({ error: "You are not allowed to edit this topic." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const requestedTitle = cleanNoteTitle(body?.title, 200);

    const { data: maxRow, error: maxErr } = await studentAdmin
      .from("note_subtopics")
      .select("position")
      .eq("topic_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;

    const nextPosition = ((maxRow?.position as number | null | undefined) ?? 0) + 1;
    if (nextPosition > 100) {
      return NextResponse.json({ error: "A topic can have at most 100 subtopics." }, { status: 400 });
    }

    const title = requestedTitle || `Subtopic ${nextPosition}`;
    const { data: inserted, error: insErr } = await studentAdmin
      .from("note_subtopics")
      .insert({ topic_id: id, position: nextPosition, title })
      .select("id, position")
      .single();
    if (insErr) throw insErr;

    const newCount = Math.max(Number(topic.subtopic_count || 0), nextPosition);
    const { error: updErr } = await studentAdmin
      .from("note_topics")
      .update({ subtopic_count: newCount })
      .eq("id", id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, id: inserted.id, position: inserted.position }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not add subtopic.") }, { status: 500 });
  }
}
