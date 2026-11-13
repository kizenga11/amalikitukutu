import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate } from "@/lib/stream-teacher-server";
import { studentAdmin } from "@/lib/student-auth";
import { canManageTeachingAssignment, loadAllStaffTopics } from "@/lib/study-notes-server";
import { cleanNoteTitle } from "@/lib/study-notes-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const topics = await loadAllStaffTopics(auth.staff.id, unrestricted);
    return NextResponse.json({ topics });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load notes.") }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }
    const unrestricted = auth.role === "Academic" || auth.role === "Headmaster";
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const teachingAssignmentId = typeof body.teachingAssignmentId === "string" ? body.teachingAssignmentId : "";
    const title = cleanNoteTitle(body.title, 200);
    const count = Number(body.subtopicCount);

    if (!teachingAssignmentId) {
      return NextResponse.json({ error: "Select a subject/class/stream." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Enter a topic title." }, { status: 400 });
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return NextResponse.json({ error: "Number of subtopics must be between 1 and 100." }, { status: 400 });
    }

    const allowed = await canManageTeachingAssignment(auth.staff.id, teachingAssignmentId, unrestricted);
    if (!allowed) {
      return NextResponse.json({ error: "You are not allowed to add notes for this subject/class." }, { status: 403 });
    }

    const { data, error } = await studentAdmin
      .from("note_topics")
      .insert({
        teaching_assignment_id: teachingAssignmentId,
        title,
        subtopic_count: count,
        created_by: auth.staff.id,
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not create topic.") }, { status: 500 });
  }
}
