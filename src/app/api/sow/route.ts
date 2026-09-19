import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireRoles } from "@/lib/lesson-plan-auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SELECT = `id, teacher_id, subject_id, form_id, form, class_stream, term, year,
  school_name, teacher_name, title, status, created_at, updated_at,
  subject:subjects(name)`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireRoles(["Teacher"]);

    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "Teacher")
      .maybeSingle();

    let query = admin.from("generated_sow_plans").select(SELECT);
    if (staff) query = query.eq("teacher_id", staff.id);
    query = query.order("created_at", { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw error;

    const items = (rows ?? []).map((row) => ({
      ...(row as Record<string, unknown>),
      subject_name:
        (Array.isArray(row.subject) ? row.subject[0]?.name : (row as { subject?: { name?: string } | null }).subject?.name) ?? "",
    }));

    return NextResponse.json({ sows: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load schemes of work";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 });
  }
}