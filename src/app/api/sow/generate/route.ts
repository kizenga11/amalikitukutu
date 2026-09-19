import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireRoles } from "@/lib/lesson-plan-auth";
import type { SowRow } from "@/lib/scheme-of-work-docx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SowBody {
  subject_id: string;
  form: string;
  class_stream?: string | null;
  term?: string | null;
  year?: string | null;
  school_name?: string | null;
  teacher_name?: string | null;
  title?: string | null;
  sow_data: SowRow[];
  status?: "draft" | "final";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: SowBody;
  try {
    body = (await request.json()) as SowBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.subject_id || !body.form || !Array.isArray(body.sow_data)) {
    return NextResponse.json({ error: "subject_id, form and sow_data rows are required" }, { status: 400 });
  }

  try {
    const { user } = await requireRoles(["Teacher"]);

    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("id, first_name, middle_name, last_name, name")
      .eq("auth_user_id", user.id)
      .eq("role", "Teacher")
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff) {
      return NextResponse.json({ error: "No linked teacher profile found for this account" }, { status: 403 });
    }

    const teacherName =
      [staff.first_name, staff.middle_name, staff.last_name].filter(Boolean).join(" ") || staff.name;

    let schoolName = body.school_name || "";
    if (!schoolName) {
      const { data: schoolRows } = await admin.from("schools").select("id, name").limit(1);
      schoolName = schoolRows?.[0]?.name ?? "";
    }
    if (!schoolName) {
      const { data: settings } = await admin
        .from("academic_settings")
        .select("value")
        .eq("key", "school_name")
        .maybeSingle();
      schoolName = (settings?.value as string | undefined) ?? "";
    }

    const { data: subject } = await admin.from("subjects").select("id, name, code").eq("id", body.subject_id).maybeSingle();
    const { data: form } = await admin.from("forms").select("id, name").ilike("name", body.form).maybeSingle();

    const { data: sow, error: insertError } = await admin
      .from("generated_sow_plans")
      .insert({
        teacher_id: staff.id,
        subject_id: body.subject_id,
        form_id: form?.id ?? null,
        form: form?.name ?? body.form,
        class_stream: body.class_stream || null,
        term: body.term || null,
        year: body.year || null,
        school_name: schoolName,
        teacher_name: teacherName,
        title: body.title || `Scheme of Work — ${subject?.name ?? body.subject_id}`,
        sow_data: body.sow_data,
        status: body.status || "draft",
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({
      sow: { ...(sow as Record<string, unknown>), subject_name: subject?.name ?? "" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save scheme of work";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}