import { NextRequest, NextResponse } from "next/server";
import {
  clearStudentCookie,
  hashSessionToken,
  STUDENT_SESSION_COOKIE,
  studentAdmin,
} from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
  if (token) {
    await studentAdmin
      .from("student_sessions")
      .delete()
      .eq("token_hash", hashSessionToken(token));
  }
  const response = NextResponse.json({ ok: true });
  clearStudentCookie(response);
  return response;
}
