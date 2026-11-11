import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { authenticate } from "@/lib/stream-teacher-server";
import { loadTeacherOptions } from "@/lib/teacher-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json(
        { error: "This account is not linked to a staff profile." },
        { status: 403 },
      );
    }

    const options = await loadTeacherOptions(auth.staff.id);
    return NextResponse.json({ options });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load your assigned subjects.") },
      { status: 500 },
    );
  }
}
