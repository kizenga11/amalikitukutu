import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requireStudent } from "@/lib/student-auth";
import { loadVisibleAssignments } from "@/lib/student-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request);
    if (!session.ok) return session.response;

    const assignments = await loadVisibleAssignments(session.student);
    // Let the client count down from the server clock: a student's phone time
    // may be wrong by hours, which would make the remaining time misleading.
    return NextResponse.json({ assignments, serverTime: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load assignments.") },
      { status: 500 },
    );
  }
}
