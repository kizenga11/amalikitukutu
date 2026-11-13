import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate, isUuid } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment } from "@/lib/study-notes-server";
import { cleanNoteTitle } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSubtopicContext(subtopicId: string) {
  const { data, error } = await studentAdmin
    .from("note_subtopics")
    .select("id, title, topic:note_topics(id, teaching_assignment_id)")
    .eq("id", subtopicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const topic: any = Array.isArray((data as any).topic) ? (data as any).topic[0] : (data as any).topic;
  return { subtopic: data, topic };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
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
    if (!allowed) return NextResponse.json({ error: "You are not allowed to edit this." }, { status: 403 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const title = cleanNoteTitle(body?.title, 200);
    if (!title) return NextResponse.json({ error: "Enter a subtopic title." }, { status: 400 });
    const { error } = await studentAdmin.from("note_subtopics").update({ title }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update subtopic.") }, { status: 500 });
  }
}
