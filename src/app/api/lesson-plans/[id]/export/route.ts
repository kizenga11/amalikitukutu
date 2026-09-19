import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireRoles, type PortalRole } from "@/lib/lesson-plan-auth";
import { buildLessonPlanDocx, type LessonPlanExportData } from "@/lib/lesson-plan-docx";
import type { LessonPlanContent } from "@/lib/lesson-plan-server";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { user, role } = await requireRoles(["Teacher", "Headmaster", "Academic"]);

    const { data: plan, error: planError } = await admin
      .from("generated_lesson_plans")
      .select(
        `id, teacher_id, subject_id, form_id, specific_competence_id, learning_activity_ids,
         date, number_of_periods, time_minutes, registered_boys, registered_girls,
         present_boys, present_girls, class_stream, lesson_time, remarks, reference,
         content, status,
         teacher:staff(name, first_name, middle_name, last_name),
         subject:subjects(name),
         form:forms(name)`,
      )
      .eq("id", id)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) {
      return NextResponse.json({ error: "Lesson plan not found" }, { status: 404 });
    }

    if (role === "Teacher") {
      const { data: staffRow } = await admin
        .from("staff")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!staffRow || staffRow.id !== plan.teacher_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const teacher = Array.isArray(plan.teacher) ? plan.teacher[0] : plan.teacher;
    const subject = Array.isArray(plan.subject) ? plan.subject[0] : plan.subject;
    const form = Array.isArray(plan.form) ? plan.form[0] : plan.form || null;
    const teacherName = [teacher?.first_name, teacher?.middle_name, teacher?.last_name]
      .filter(Boolean)
      .join(" ") || teacher?.name || "";

    // ---- School info ----
    const { data: schoolRows } = await admin.from("schools").select("id, name").limit(1);
    let schoolName = schoolRows?.[0]?.name ?? "";
    if (!schoolName) {
      const { data: settings } = await admin
        .from("academic_settings")
        .select("value")
        .eq("key", "school_name")
        .maybeSingle();
      schoolName = (settings?.value as string | undefined) ?? "";
    }

    // ---- Competence + activity titles ----
    const { data: competence } = await admin
      .from("specific_competences")
      .select("code, title, main_competence:main_competences(code, title)")
      .eq("id", plan.specific_competence_id)
      .maybeSingle();
    const main = competence
      ? Array.isArray(competence.main_competence)
        ? competence.main_competence[0]
        : competence.main_competence
      : null;

    const activityIds = Array.isArray(plan.learning_activity_ids)
      ? (plan.learning_activity_ids as string[])
      : [];
    let activities: string[] = [];
    if (activityIds.length > 0) {
      const { data: activityRows } = await admin
        .from("learning_activities")
        .select("id, activity_description")
        .in("id", activityIds);
      const byId = new Map((activityRows ?? []).map((a) => [a.id, a.activity_description]));
      activities = activityIds.map((aid) => byId.get(aid) ?? "").filter(Boolean);
    }

    const exportData: LessonPlanExportData = {
      schoolName,
      teacherName,
      subjectName: subject?.name ?? "Subject",
      formName: form?.name ?? "",
      mainCompetenceCode: main?.code ?? "",
      mainCompetenceTitle: main?.title ?? "",
      specificCompetenceCode: competence?.code ?? "",
      specificCompetenceTitle: competence?.title ?? "",
      date: plan.date,
      number_of_periods: Number(plan.number_of_periods),
      time_minutes: Number(plan.time_minutes),
      registered_boys: Number(plan.registered_boys),
      registered_girls: Number(plan.registered_girls),
      present_boys: Number(plan.present_boys),
      present_girls: Number(plan.present_girls),
      class_stream: (plan.class_stream as string | null) ?? null,
      lesson_time: (plan.lesson_time as string | null) ?? null,
      remarks: (plan.remarks as string | null) ?? null,
      reference: (plan.reference as string | null) ?? null,
      activities,
      content: (plan.content ?? {}) as LessonPlanContent,
    };

    const buffer = await buildLessonPlanDocx(exportData);
    const safeSubject = (subject?.name ?? "subject").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_");
    const safeForm = (form?.name ?? "form").replace(/\s+/g, "_").toLowerCase();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Lesson_Plan_${safeSubject}_${safeForm}.docx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export type { PortalRole };