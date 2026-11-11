import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  hashPassword,
  loadStudentAccount,
  requireStudent,
  studentAdmin,
  verifyPassword,
} from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireStudent(request, { allowPasswordChange: true });
    if (!session.ok) return session.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Enter your current and new password." },
        { status: 400 },
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "The new password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "The new password must be different from the current one." },
        { status: 400 },
      );
    }
    if (newPassword === "Kitukutu_TECH") {
      return NextResponse.json(
        { error: "Do not reuse the school's initial password. Choose your own." },
        { status: 400 },
      );
    }

    const account = await loadStudentAccount(session.student.id);
    if (!account) {
      return NextResponse.json(
        { error: "Your account was not found." },
        { status: 404 },
      );
    }

    const valid = await verifyPassword(currentPassword, account.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "The current password is incorrect." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const { error: updateError } = await studentAdmin
      .from("student_accounts")
      .update({
        password_hash: passwordHash,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    if (updateError) throw updateError;

    // Keep the current session, end any other devices.
    await studentAdmin
      .from("student_sessions")
      .delete()
      .eq("account_id", account.id)
      .neq("id", session.sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not change the password.") },
      { status: 500 },
    );
  }
}
