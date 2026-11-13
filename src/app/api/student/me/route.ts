import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { loadStudentSubjectsWithTeachers, requireStudent } from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request, { allowPasswordChange: true });
    if (!session.ok) return session.response;

    const subjects = await loadStudentSubjectsWithTeachers(
      session.student.id,
      session.student.classId,
      session.student.streamId,
    );

    return NextResponse.json({
      student: {
        ...session.student,
        fullName: [session.student.firstName, session.student.middleName, session.student.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
      },
      subjects,
      mustChangePassword: session.account.mustChangePassword,
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load your information.") },
      { status: 500 },
    );
  }
}
