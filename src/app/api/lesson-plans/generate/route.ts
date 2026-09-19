import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireRoles } from "@/lib/lesson-plan-auth";
import {
  generateLessonPlanContent,
  type LessonPlanContent,
  type SyllabusActivity,
} from "@/lib/lesson-plan-server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface GenerateBody {
  subject_id?: string;
  form_id?: string;
  specific_competence_id?: string;
  learning_activity_ids?: string[];
  number_of_periods?: number;
  time_minutes?: number;
  date?: string | null;
  registered_boys?: number;
  registered_girls?: number;
  present_boys?: number;
  present_girls?: number;
  class_stream?: string | null;
  lesson_time?: string | null;
  remarks?: string | null;
  reference?: string | null;
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.subject_id ||
    !body.form_id ||
    !body.specific_competence_id ||
    !Array.isArray(body.learning_activity_ids) ||
    body.learning_activity_ids.length === 0
  ) {
    return NextResponse.json(
      { error: "subject, form, specific competence and at least one learning activity are required" },
      { status: 400 },
    );
  }

  try {
    const { user } = await requireRoles(["Teacher"]);

    // ---- Teacher identity ----
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

    // ---- Competence chain ----
    const { data: specific, error: specificError } = await admin
      .from("specific_competences")
      .select("id, code, title, main_competence:main_competences(*)")
      .eq("id", body.specific_competence_id)
      .single();
    if (specificError || !specific) {
      return NextResponse.json({ error: "Specific competence not found" }, { status: 404 });
    }

    const main = Array.isArray(specific.main_competence)
      ? specific.main_competence[0]
      : specific.main_competence;
    if (!main) {
      return NextResponse.json({ error: "Main competence not found" }, { status: 404 });
    }

    const [subjectResult, formResult] = await Promise.all([
      admin.from("subjects").select("id, name").eq("id", body.subject_id).maybeSingle(),
      admin.from("forms").select("id, name").eq("id", body.form_id).maybeSingle(),
    ]);
    if (subjectResult.error) throw subjectResult.error;
    if (formResult.error) throw formResult.error;
    const subject = subjectResult.data;
    const form = formResult.data;
    if (!subject || !form) {
      return NextResponse.json({ error: "Subject or form not found" }, { status: 404 });
    }

    // ---- Learning activities (real syllabus data, not invented) ----
    const { data: activityRows, error: activitiesError } = await admin
      .from("learning_activities")
      .select("id, code, activity_description, suggested_methods, assessment_criteria, resources, periods_allocated, stage_content")
      .eq("specific_competence_id", body.specific_competence_id)
      .in("id", body.learning_activity_ids);
    if (activitiesError) throw activitiesError;
    // Keep the order the teacher selected them in.
    const activityById = new Map((activityRows ?? []).map((a) => [a.id, a]));
    const activities: SyllabusActivity[] = body.learning_activity_ids
      .map((id) => activityById.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));

    // ---- School ----
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

    const teacherName = [staff.first_name, staff.middle_name, staff.last_name]
      .filter(Boolean)
      .join(" ") || staff.name;

    const number_of_periods = intOr(body.number_of_periods, 1);
    const time_minutes = intOr(body.time_minutes, 40);

    const content: LessonPlanContent = await generateLessonPlanContent({
      schoolName,
      teacherName,
      subjectName: subject.name,
      formName: form.name,
      mainCompetenceCode: main.code,
      mainCompetenceTitle: main.title,
      specificCompetenceCode: specific.code,
      specificCompetenceTitle: specific.title,
      activities,
      number_of_periods,
      time_minutes,
    });

    // ---- Persist as a draft ----
    const { data: plan, error: insertError } = await admin
      .from("generated_lesson_plans")
      .insert({
        teacher_id: staff.id,
        subject_id: body.subject_id,
        form_id: body.form_id,
        specific_competence_id: body.specific_competence_id,
        learning_activity_ids: body.learning_activity_ids,
        date: body.date || null,
        number_of_periods,
        time_minutes,
        registered_boys: intOr(body.registered_boys, 0),
        registered_girls: intOr(body.registered_girls, 0),
        present_boys: intOr(body.present_boys, 0),
        present_girls: intOr(body.present_girls, 0),
        class_stream: body.class_stream || null,
        lesson_time: body.lesson_time || null,
        remarks: body.remarks || null,
        reference: body.reference || null,
        content,
        status: "draft",
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({
      plan: {
        ...(plan as Record<string, unknown>),
        subject_name: subject.name,
        form_name: form.name,
        teacher_name: teacherName,
        school_name: schoolName,
        specific_competence_title: specific.title,
        specific_competence_code: specific.code,
        main_competence_title: main.title,
        main_competence_code: main.code,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate lesson plan";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}