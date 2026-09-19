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

const SELECT = `id, teacher_id, subject_id, form_id, form, class_stream, term, year,
  school_name, teacher_name, title, sow_data, status, created_at, updated_at,
  subject:subjects(name)`;

interface SowUpdates {
  class_stream?: string | null;
  term?: string | null;
  year?: string | null;
  title?: string | null;
  sow_data?: SowRow[];
  status?: "draft" | "final";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { user } = await requireRoles(["Teacher"]);

    const { data: sow, error } = await admin.from("generated_sow_plans").select(SELECT).eq("id", id).single();
    if (error || !sow) return NextResponse.json({ error: "Scheme of work not found" }, { status: 404 });

    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "Teacher")
      .maybeSingle();
    if (staff && sow.teacher_id !== staff.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ sow: { ...(sow as Record<string, unknown>), subject_name: (sow as { subject?: { name?: string } | null }).subject?.name ?? "" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load scheme of work";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  let body: SowUpdates;
  try {
    body = (await request.json()) as SowUpdates;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const { user } = await requireRoles(["Teacher"]);

    const { data: existing } = await admin.from("generated_sow_plans").select("teacher_id").eq("id", id).single();
    if (!existing) return NextResponse.json({ error: "Scheme of work not found" }, { status: 404 });

    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "Teacher")
      .maybeSingle();
    if (!staff || existing.teacher_id !== staff.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (body.class_stream !== undefined) patch.class_stream = body.class_stream || null;
    if (body.term !== undefined) patch.term = body.term || null;
    if (body.year !== undefined) patch.year = body.year || null;
    if (body.title !== undefined) patch.title = body.title || null;
    if (body.sow_data !== undefined) patch.sow_data = body.sow_data;
    if (body.status !== undefined) patch.status = body.status;

    const { data: sow, error } = await admin.from("generated_sow_plans").update(patch).eq("id", id).select(SELECT).single();
    if (error) throw error;

    return NextResponse.json({ sow: { ...(sow as Record<string, unknown>), subject_name: (sow as { subject?: { name?: string } | null }).subject?.name ?? "" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update scheme of work";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { user } = await requireRoles(["Teacher"]);

    const { data: existing } = await admin.from("generated_sow_plans").select("teacher_id").eq("id", id).single();
    if (!existing) return NextResponse.json({ error: "Scheme of work not found" }, { status: 404 });

    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "Teacher")
      .maybeSingle();
    if (!staff || existing.teacher_id !== staff.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await admin.from("generated_sow_plans").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete scheme of work";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 });
  }
}