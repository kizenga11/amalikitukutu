import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { requireStudent } from "@/lib/student-auth";
import { loadStudentResults } from "@/lib/student-results-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request);
    if (!session.ok) return session.response;

    const exams = await loadStudentResults(session.student);
    return NextResponse.json({ exams });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load your results.") },
      { status: 500 },
    );
  }
}
