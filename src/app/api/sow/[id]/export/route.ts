import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireRoles } from "@/lib/lesson-plan-auth";
import { buildSchemeOfWorkDocx, type SowRow } from "@/lib/scheme-of-work-docx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    await requireRoles(["Teacher"]);

    const { data: sow, error } = await admin.from("generated_sow_plans").select(
      `id, title, form, class_stream, term, year, school_name, teacher_name, sow_data,
       subject:subjects(name)`,
    ).eq("id", id).single();
    if (error || !sow) return NextResponse.json({ error: "Scheme of work not found" }, { status: 404 });

    const detail = sow as unknown as {
      id: string;
      title: string | null;
      form: string | null;
      class_stream: string | null;
      term: string | null;
      year: string | null;
      school_name: string | null;
      teacher_name: string | null;
      sow_data: unknown;
      subject: { name: string } | { name: string }[] | null;
    };

    const subjectName = Array.isArray(detail.subject)
      ? (detail.subject[0]?.name ?? "")
      : (detail.subject?.name ?? "");

    const buffer = await buildSchemeOfWorkDocx({
      schoolName: detail.school_name ?? "",
      title: detail.title ?? "Scheme of Work",
      subjectName,
      form: detail.form ?? "",
      classStream: detail.class_stream ?? "",
      term: detail.term ?? "",
      year: detail.year ?? "",
      teacherName: detail.teacher_name ?? "",
      rows: (detail.sow_data as unknown as SowRow[]) ?? [],
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="scheme-of-work-${id}.docx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export scheme of work";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500 });
  }
}