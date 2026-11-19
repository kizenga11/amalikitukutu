import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requireStudent } from "@/lib/student-auth";
import { loadStudentNotifications } from "@/lib/student-notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request);
    if (!session.ok) return session.response;
    const data = await loadStudentNotifications(session.student);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load notifications.") },
      { status: 500 },
    );
  }
}
