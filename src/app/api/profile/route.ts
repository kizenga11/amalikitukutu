import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
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

interface ProfilePatch {
  name?: string;
  phone?: string;
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isValidName(value: string): boolean {
  return value.length >= 2 && value.length <= 80;
}

function isValidPhone(value: string): boolean {
  return value === "" || /^[0-9+()\-\s]{7,20}$/.test(value);
}

function splitName(name: string): { first_name: string; middle_name: string | null; last_name: string } {
  const parts = name.split(" ").filter(Boolean);
  const first_name = parts[0] ?? name;
  const last_name = parts.length > 1 ? parts[parts.length - 1] : "";
  const middle_name = parts.length > 2 ? parts.slice(1, -1).join(" ") : null;
  return { first_name, middle_name, last_name };
}

async function requireUser(): Promise<User> {
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

  return user;
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Unauthorized" ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    const { data: staff } = await admin
      .from("staff")
      .select("name, first_name, last_name, phone, email, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const staffName = staff
      ? [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim() || (staff.name ?? "")
      : "";

    return NextResponse.json({
      email: user.email ?? "",
      role: (meta.role as string) ?? staff?.role ?? "Teacher",
      name: ((meta.name as string) ?? "").trim() || staffName || "",
      phone: ((meta.phone as string) ?? "").trim() || staff?.phone || "",
    });
  } catch (error) {
    return errorResponse(error, "Failed to load profile");
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: ProfilePatch;
  try {
    body = (await request.json()) as ProfilePatch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanName(body.name ?? "");
  const phone = cleanName(body.phone ?? "");

  if (!isValidName(name)) {
    return NextResponse.json({ error: "Enter your full name (2–80 characters)." }, { status: 400 });
  }

  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Enter a valid phone number or leave it blank." }, { status: 400 });
  }

  try {
    const user = await requireUser();

    const { data: staff, error: staffLookupError } = await admin
      .from("staff")
      .select("id, phone")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (staffLookupError) throw staffLookupError;

    if (staff) {
      const { first_name, middle_name, last_name } = splitName(name);
      const { error: updateError } = await admin
        .from("staff")
        .update({ name, first_name, middle_name, last_name, phone: phone || null })
        .eq("id", staff.id);
      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true, name, phone });
  } catch (error) {
    return errorResponse(error, "Failed to update profile");
  }
}
