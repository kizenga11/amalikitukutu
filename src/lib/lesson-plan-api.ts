import { supabase } from "./supabase";
import type { LessonPlanContent } from "@/lib/lesson-plan-server";

// ---------------------------------------------------------------
// Forms
// ---------------------------------------------------------------
export interface DbForm {
  id: string;
  name: string;
  form_level: number;
}

export async function fetchForms(): Promise<DbForm[]> {
  const { data, error } = await supabase.from("forms").select("id, name, form_level").order("form_level");
  if (error) throw error;
  return (data ?? []) as DbForm[];
}

// ---------------------------------------------------------------
// Teacher scope: subjects and forms the teacher is assigned to
// ---------------------------------------------------------------
export interface TeacherScopeSubject {
  id: string;
  name: string;
  code: string;
}

export interface TeacherScope {
  subjects: TeacherScopeSubject[];
  forms: DbForm[];
}

export async function fetchTeacherScope(teacherId: string): Promise<TeacherScope> {
  const { data, error } = await supabase
    .from("teacher_subjects")
    .select("subject_id, form_id, subject:subjects(id, name, code), form:forms(id, name, form_level)")
    .eq("user_id", teacherId)
    .order("created_at");
  if (error) throw error;

  const subjects = new Map<string, TeacherScopeSubject>();
  const forms = new Map<string, DbForm>();
  for (const row of data ?? []) {
    const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const form = Array.isArray(row.form) ? row.form[0] : row.form;
    if (subject) subjects.set(subject.id, { id: subject.id, name: subject.name, code: subject.code });
    if (form) forms.set(form.id, { id: form.id, name: form.name, form_level: form.form_level });
  }
  return {
    subjects: Array.from(subjects.values()),
    forms: Array.from(forms.values()).sort((a, b) => a.form_level - b.form_level),
  };
}

// ---------------------------------------------------------------
// Competences + learning activities
// ---------------------------------------------------------------
export interface DbMainCompetence {
  id: string;
  subject_id: string;
  form_id: string;
  code: string;
  title: string;
}

export interface DbSpecificCompetence {
  id: string;
  main_competence_id: string;
  code: string;
  title: string;
}

export interface DbLearningActivity {
  id: string;
  specific_competence_id: string;
  code: string;
  activity_description: string;
  suggested_methods: string | null;
  assessment_criteria: string | null;
  resources: string | null;
  periods_allocated: number | null;
}

export async function fetchMainCompetences(subjectId: string, formId: string): Promise<DbMainCompetence[]> {
  const { data, error } = await supabase
    .from("main_competences")
    .select("id, subject_id, form_id, code, title")
    .eq("subject_id", subjectId)
    .eq("form_id", formId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as DbMainCompetence[];
}

export async function fetchSpecificCompetences(mainCompetenceId: string): Promise<DbSpecificCompetence[]> {
  const { data, error } = await supabase
    .from("specific_competences")
    .select("id, main_competence_id, code, title")
    .eq("main_competence_id", mainCompetenceId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as DbSpecificCompetence[];
}

export async function fetchLearningActivities(specificCompetenceId: string): Promise<DbLearningActivity[]> {
  const { data, error } = await supabase
    .from("learning_activities")
    .select("id, specific_competence_id, code, activity_description, suggested_methods, assessment_criteria, resources, periods_allocated")
    .eq("specific_competence_id", specificCompetenceId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as DbLearningActivity[];
}

// ---------------------------------------------------------------
// Generated lesson plans
// ---------------------------------------------------------------
export type LessonPlanStatus = "draft" | "final";

export interface LessonPlanRow {
  id: string;
  teacher_id: string;
  subject_id: string;
  form_id: string;
  specific_competence_id: string | null;
  learning_activity_ids: string[];
  date: string | null;
  number_of_periods: number;
  time_minutes: number;
  registered_boys: number;
  registered_girls: number;
  present_boys: number;
  present_girls: number;
  content: LessonPlanContent | null;
  status: LessonPlanStatus;
  class_stream: string | null;
  lesson_time: string | null;
  remarks: string | null;
  reference: string | null;
  created_at: string;
  updated_at: string;
  subject_name: string;
  form_name: string;
  main_competence_code: string | null;
  main_competence_title: string | null;
  specific_competence_code: string | null;
  specific_competence_title: string | null;
  teacher_name: string;
}

export async function fetchMyLessonPlans(teacherId: string): Promise<LessonPlanRow[]> {
  const { data, error } = await supabase
    .from("generated_lesson_plans")
    .select(
      `*, subject:subjects(name), form:forms(name),
       specific_competence:specific_competences(code, title, main_competence:main_competences(code, title))`,
    )
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapPlanRow(row, ""));
}

export async function fetchAllLessonPlans(): Promise<LessonPlanRow[]> {
  const { data, error } = await supabase
    .from("generated_lesson_plans")
    .select(
      `*, teacher:staff(name, first_name, middle_name, last_name),
       subject:subjects(name), form:forms(name),
       specific_competence:specific_competences(code, title, main_competence:main_competences(code, title))`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
    const teacherName = [teacher?.first_name, teacher?.middle_name, teacher?.last_name]
      .filter(Boolean)
      .join(" ") || teacher?.name || "";
    return mapPlanRow(row, teacherName);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlanRow(row: any, teacherNameFallback: string): LessonPlanRow {
  const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
  const form = Array.isArray(row.form) ? row.form[0] : row.form;
  const specific = Array.isArray(row.specific_competence) ? row.specific_competence[0] : row.specific_competence;
  const main = Array.isArray(specific?.main_competence) ? specific.main_competence[0] : specific?.main_competence;
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    subject_id: row.subject_id,
    form_id: row.form_id,
    specific_competence_id: row.specific_competence_id,
    learning_activity_ids: Array.isArray(row.learning_activity_ids) ? row.learning_activity_ids : [],
    date: row.date,
    number_of_periods: Number(row.number_of_periods),
    time_minutes: Number(row.time_minutes),
    registered_boys: Number(row.registered_boys),
    registered_girls: Number(row.registered_girls),
    present_boys: Number(row.present_boys),
    present_girls: Number(row.present_girls),
    content: (row.content ?? null) as LessonPlanContent | null,
    status: row.status as LessonPlanStatus,
    class_stream: (row.class_stream as string | null) ?? null,
    lesson_time: (row.lesson_time as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    subject_name: subject?.name ?? "Unknown",
    form_name: form?.name ?? "",
    main_competence_code: main?.code ?? null,
    main_competence_title: main?.title ?? null,
    specific_competence_code: specific?.code ?? null,
    specific_competence_title: specific?.title ?? null,
    teacher_name: row.teacher_name || teacherNameFallback,
  };
}

export interface LessonPlanPatch {
  date?: string | null;
  number_of_periods?: number;
  time_minutes?: number;
  registered_boys?: number;
  registered_girls?: number;
  present_boys?: number;
  present_girls?: number;
  class_stream?: string | null;
  lesson_time?: string | null;
  remarks?: string | null;
  reference?: string | null;
  content?: LessonPlanContent;
  status?: LessonPlanStatus;
}

export async function updateLessonPlan(id: string, patch: LessonPlanPatch): Promise<void> {
  const { error } = await supabase.from("generated_lesson_plans").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteLessonPlan(id: string): Promise<void> {
  const { error } = await supabase.from("generated_lesson_plans").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Syllabus manager (headmaster / admin)
// ---------------------------------------------------------------
export interface CurriculumActivity extends DbLearningActivity {
  specific_competence_title: string;
}

export interface CurriculumSpecific extends DbSpecificCompetence {
  activities: CurriculumActivity[];
}

export interface CurriculumMain extends DbMainCompetence {
  specific_competences: CurriculumSpecific[];
}

export interface CurriculumSubject {
  subject: { id: string; name: string; code: string };
  forms: {
    form: DbForm;
    main_competences: CurriculumMain[];
  }[];
}

export interface CurriculumForm extends DbForm {
  main_competences: CurriculumMain[];
}

export async function fetchCurriculum(): Promise<
  { subject: { id: string; name: string; code: string }; forms: CurriculumForm[] }[]
> {
  const [subjects, forms, mains, specifics, activities] = await Promise.all([
    supabase.from("subjects").select("id, name, code").order("name"),
    supabase.from("forms").select("id, name, form_level").order("form_level"),
    supabase.from("main_competences").select("id, subject_id, form_id, code, title").order("code"),
    supabase.from("specific_competences").select("id, main_competence_id, code, title").order("code"),
    supabase.from("learning_activities").select("*").order("code"),
  ]);

  for (const result of [subjects, forms, mains, specifics, activities]) {
    if (result.error) throw result.error;
  }

  const activitiesBySpecific = new Map<string, CurriculumActivity[]>();
  for (const row of activities.data ?? []) {
    const list = activitiesBySpecific.get(row.specific_competence_id) ?? [];
    list.push(row as CurriculumActivity);
    activitiesBySpecific.set(row.specific_competence_id, list);
  }

  const specificByMain = new Map<string, CurriculumSpecific[]>();
  for (const row of specifics.data ?? []) {
    const list = specificByMain.get(row.main_competence_id) ?? [];
    list.push({ ...(row as DbSpecificCompetence), activities: activitiesBySpecific.get(row.id) ?? [] });
    specificByMain.set(row.main_competence_id, list);
  }

  const mainBySubjectForm = new Map<string, CurriculumMain[]>();
  for (const row of mains.data ?? []) {
    const key = `${row.subject_id}:${row.form_id}`;
    const list = mainBySubjectForm.get(key) ?? [];
    list.push({ ...(row as DbMainCompetence), specific_competences: specificByMain.get(row.id) ?? [] });
    mainBySubjectForm.set(key, list);
  }

  const formById = new Map<string, DbForm>((forms.data ?? []).map((f) => [f.id, f as DbForm]));
  const subjectById = new Map<string, { id: string; name: string; code: string }>(
    (subjects.data ?? []).map((s) => [s.id, { id: s.id, name: s.name, code: s.code }]),
  );

  const result: { subject: { id: string; name: string; code: string }; forms: CurriculumForm[] }[] = [];
  for (const [key, mains] of mainBySubjectForm.entries()) {
    const [subjectId, formId] = key.split(":");
    const subject = subjectById.get(subjectId);
    const form = formById.get(formId);
    if (!subject || !form) continue;

    let entry = result.find((r) => r.subject.id === subjectId);
    if (!entry) {
      entry = { subject, forms: [] };
      result.push(entry);
    }
    const formEntry = entry.forms.find((f) => f.id === formId);
    if (formEntry) {
      formEntry.main_competences.push(...mains);
    } else {
      entry.forms.push({ ...form, main_competences: mains });
    }
  }

  return result.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

export type MainCompetenceInput = Omit<DbMainCompetence, "id">;
export type SpecificCompetenceInput = Omit<DbSpecificCompetence, "id">;
export type LearningActivityInput = Omit<DbLearningActivity, "id">;

export async function insertMainCompetence(input: MainCompetenceInput): Promise<DbMainCompetence> {
  const { data, error } = await supabase
    .from("main_competences")
    .insert(input)
    .select("id, subject_id, form_id, code, title")
    .single();
  if (error) throw error;
  return data as DbMainCompetence;
}

export async function updateMainCompetence(id: string, patch: Partial<Omit<DbMainCompetence, "id">>): Promise<void> {
  const { error } = await supabase.from("main_competences").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMainCompetence(id: string): Promise<void> {
  const { error } = await supabase.from("main_competences").delete().eq("id", id);
  if (error) throw error;
}

export async function insertSpecificCompetence(input: SpecificCompetenceInput): Promise<DbSpecificCompetence> {
  const { data, error } = await supabase
    .from("specific_competences")
    .insert(input)
    .select("id, main_competence_id, code, title")
    .single();
  if (error) throw error;
  return data as DbSpecificCompetence;
}

export async function updateSpecificCompetence(id: string, patch: Partial<Omit<DbSpecificCompetence, "id">>): Promise<void> {
  const { error } = await supabase.from("specific_competences").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSpecificCompetence(id: string): Promise<void> {
  const { error } = await supabase.from("specific_competences").delete().eq("id", id);
  if (error) throw error;
}

export async function insertLearningActivity(input: LearningActivityInput): Promise<DbLearningActivity> {
  const { data, error } = await supabase
    .from("learning_activities")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as DbLearningActivity;
}

export async function updateLearningActivity(id: string, patch: Partial<Omit<DbLearningActivity, "id">>): Promise<void> {
  const { error } = await supabase
    .from("learning_activities")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLearningActivity(id: string): Promise<void> {
  const { error } = await supabase.from("learning_activities").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------
// Bulk import resolution helpers (client side, used by syllabus manager)
// ---------------------------------------------------------------
export async function resolveImportMaps() {
  const [subjects, forms] = await Promise.all([
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("forms").select("id, name").order("form_level"),
  ]);
  for (const result of [subjects, forms]) if (result.error) throw result.error;

  const byName = (rows: { id: string; name: string }[]) => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.name.toLowerCase().trim(), row.id);
    return map;
  };
  return {
    subjectIdByName: byName((subjects.data ?? []) as { id: string; name: string }[]),
    formIdByName: byName((forms.data ?? []) as { id: string; name: string }[]),
  };
}