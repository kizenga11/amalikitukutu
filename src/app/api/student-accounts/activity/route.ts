import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  loadStudentActivity,
  requireStudentLoginsAdmin,
} from "@/lib/student-accounts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireStudentLoginsAdmin(request);
    if (!auth.ok) return auth.response;

    const studentId = request.nextUrl.searchParams.get("studentId")?.trim() ?? "";
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    const activity = await loadStudentActivity(studentId);
    if (!activity) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    return NextResponse.json(activity);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load the login history.") },
      { status: 500 },
    );
  }
}
