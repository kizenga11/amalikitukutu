import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { DEFAULT_STUDENT_PASSWORD } from "@/lib/student-auth";
import {
  requireStudentLoginsAdmin,
  resetStudentPassword,
} from "@/lib/student-accounts-server";
import type { ResetStudentPasswordResponse } from "@/lib/student-accounts-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireStudentLoginsAdmin(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    const result = await resetStudentPassword(studentId);
    const payload: ResetStudentPasswordResponse = {
      ok: true,
      defaultPassword: DEFAULT_STUDENT_PASSWORD,
      created: result.created,
    };
    return NextResponse.json(payload);
  } catch (error) {
    const message = errorMessage(error, "Could not reset the password.");
    const status = message === "Student not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
