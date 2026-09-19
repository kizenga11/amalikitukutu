import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface UpsertPayload {
  staffId: string;
  email: string;
  password: string;
  displayName: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPassword(value: string): boolean {
  return value.length >= 8 && !/\s/.test(value);
}

async function requireAuthorizedStaff() {
  const cookieStore = await cookies();
  type CookieSetItem = { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieSetItem[]) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Ignore cookie write errors during auth checks.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  const role = user.user_metadata?.role;
  if (role !== "Headmaster" && role !== "Academic") {
    throw new Error("Forbidden");
  }

  return user;
}

async function findUserByEmail(email: string) {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data?.users?.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    const pagination = data as unknown as { nextPage?: number | null; lastPage?: number | null };
    if (!pagination.nextPage || page >= (pagination.lastPage ?? 0)) return null;
    page += 1;
  }
}

async function upsertAuthUser(payload: UpsertPayload): Promise<void> {
  const { data: staff } = await admin
    .from("staff")
    .select("auth_user_id")
    .eq("id", payload.staffId)
    .single();

  const meta = { role: "Teacher", staff_id: payload.staffId, name: payload.displayName };

  if (staff?.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, {
      email: payload.email,
      password: payload.password,
      user_metadata: meta,
    });
    if (error) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: meta,
      });
      if (createError) throw createError;
      await admin.from("staff").update({ auth_user_id: created.user.id }).eq("id", payload.staffId);
    }
    return;
  }

  const existing = await findUserByEmail(payload.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      email: payload.email,
      password: payload.password,
      user_metadata: meta,
    });
    if (error) throw error;
    await admin.from("staff").update({ auth_user_id: existing.id }).eq("id", payload.staffId);
    return;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (createError) throw createError;
  await admin.from("staff").update({ auth_user_id: created.user.id }).eq("id", payload.staffId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: UpsertPayload;
  try {
    payload = (await request.json()) as UpsertPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.staffId || !payload.email || !payload.password) {
    return NextResponse.json({ error: "staffId, email and password are required" }, { status: 400 });
  }

  if (!isValidEmail(payload.email) || !isValidPassword(payload.password)) {
    return NextResponse.json({ error: "Provide a valid email and a password with at least 8 characters and no spaces." }, { status: 400 });
  }

  try {
    await requireAuthorizedStaff();
    await upsertAuthUser({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      displayName: payload.displayName.trim() || "Teacher",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save teacher account";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let staffId: string;
  try {
    staffId = ((await request.json()) as { staffId?: string }).staffId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!staffId) {
    return NextResponse.json({ error: "staffId is required" }, { status: 400 });
  }

  try {
    await requireAuthorizedStaff();
    const { data: staff } = await admin.from("staff").select("auth_user_id").eq("id", staffId).single();
    if (staff?.auth_user_id) {
      await admin.auth.admin.deleteUser(staff.auth_user_id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete teacher account";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}