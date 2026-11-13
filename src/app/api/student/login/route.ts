import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  checkLoginRateLimit,
  findStudentByRegistrationNo,
  hashSessionToken,
  loadStudentAccount,
  loadStudentProfile,
  loadStudentSubjects,
  newSessionToken,
  normaliseRegistrationNo,
  recordLoginAttempt,
  requestIp,
  setStudentCookie,
  studentAdmin,
  STUDENT_SESSION_TTL_MS,
  verifyPassword,
} from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const registrationNo = normaliseRegistrationNo(body?.registrationNo);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!registrationNo || !password) {
      return NextResponse.json(
        { error: "Enter your registration number and password." },
        { status: 400 },
      );
    }

    const ip = requestIp(request);
    const limit = await checkLoginRateLimit(registrationNo, ip);
    if (limit.blocked) {
      return NextResponse.json(
        {
          error:
            "Too many sign-in attempts. Please wait 15 minutes and try again.",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    const found = await findStudentByRegistrationNo(registrationNo);
    if (!found) {
      await recordLoginAttempt(registrationNo, ip, false);
      return NextResponse.json(
        { error: "The registration number or password is incorrect." },
        { status: 401 },
      );
    }

    const account = await loadStudentAccount(found.id);
    if (!account || !account.is_active) {
      await recordLoginAttempt(registrationNo, ip, false);
      return NextResponse.json(
        { error: "The registration number or password is incorrect." },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(password, account.password_hash);
    if (!valid) {
      await recordLoginAttempt(registrationNo, ip, false);
      return NextResponse.json(
        { error: "The registration number or password is incorrect." },
        { status: 401 },
      );
    }

    const profile = await loadStudentProfile(found.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Student information is unavailable. Contact the school office." },
        { status: 500 },
      );
    }

    await recordLoginAttempt(registrationNo, ip, true);

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + STUDENT_SESSION_TTL_MS).toISOString();

    // Remove expired sessions for this account before creating a new one.
    await studentAdmin
      .from("student_sessions")
      .delete()
      .eq("account_id", account.id)
      .lt("expires_at", new Date().toISOString());

    const { error: insertError } = await studentAdmin.from("student_sessions").insert({
      account_id: account.id,
      token_hash: hashSessionToken(token),
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      ip_address: ip,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    await studentAdmin
      .from("student_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", account.id);

    const subjects = await loadStudentSubjects(profile.id);

    const response = NextResponse.json({
      ok: true,
      mustChangePassword: account.must_change_password,
      student: {
        ...profile,
        fullName: [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
      },
      subjects,
    });
    setStudentCookie(response, token);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not sign in. Please try again.") },
      { status: 500 },
    );
  }
}
