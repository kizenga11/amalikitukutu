import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { timetableDb } from "./timetable-server";

export type TimetableRole = "Headmaster" | "Academic" | "Teacher" | "District Officer";

const KNOWN_ROLES: TimetableRole[] = ["Headmaster", "Academic", "Teacher", "District Officer"];

export type TimetableAuth =
  | { ok: true; user: User; role: TimetableRole }
  | { ok: false; response: NextResponse };

export async function authorizeTimetable(
  request: NextRequest,
  allowed: TimetableRole[],
): Promise<TimetableAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authorized. Please sign in again." }, { status: 401 }),
    };
  }

  const { data, error } = await timetableDb().auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }),
    };
  }

  const rawRole = String(user.user_metadata?.role ?? "");
  const role = KNOWN_ROLES.find((known) => known === rawRole);
  if (!role) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your account has no timetable role." }, { status: 403 }),
    };
  }
  if (!allowed.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to perform this timetable action." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user, role };
}

export const TIMETABLE_ADMIN: TimetableRole[] = ["Headmaster", "Academic"];
export const TIMETABLE_READERS: TimetableRole[] = ["Headmaster", "Academic", "Teacher", "District Officer"];
