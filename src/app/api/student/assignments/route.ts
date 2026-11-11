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
    return NextResponse.json({ assignments });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load assignments.") },
      { status: 500 },
    );
  }
}
