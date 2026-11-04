import { NextRequest, NextResponse } from "next/server";
import { authenticate, loadAssignments } from "@/lib/stream-teacher-server";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ staffId: null, name: "", role: auth.role, assignments: [] });
    }

    const assignments = await loadAssignments(auth.staff.id);
    return NextResponse.json({
      staffId: auth.staff.id,
      name: auth.staff.name,
      role: auth.role,
      assignments,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load your stream assignment.") }, { status: 500 });
  }
}
