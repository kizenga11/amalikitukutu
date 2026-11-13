import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requireStudent } from "@/lib/student-auth";
import { loadStudentPublishedNotes } from "@/lib/study-notes-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request);
    if (!session.ok) return session.response;
    const topics = await loadStudentPublishedNotes(session.student);
    return NextResponse.json({ topics });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load notes.") }, { status: 500 });
  }
}
