import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/errors";
import {
  computeGradeAndPoints,
  computeSubjectScore,
  competencyLabel,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_GRADE_BOUNDARIES,
  type CompetencyThreshold,
  type GradeBoundary,
} from "@/lib/grading";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface SubjectMeta {
  id: string;
  code: string;
  name: string;
  has_practical: boolean;
}

interface AssignmentRow {
  subject_id: string;
  class_id: string;
  subject: SubjectMeta[] | SubjectMeta | null;
  class: { id: string; name: string; form_level: number }[] | { id: string; name: string; form_level: number } | null;
}

interface FormOption {
  class_id: string;
  class_name: string;
  form_level: number;
  subjects: SubjectMeta[];
}

interface TeacherContext {
  teacherId: string;
  teacherName: string;
  assignmentKeys: Set<string>;
  forms: Map<string, { class_id: string; class_name: string; form_level: number; subjects: Map<string, SubjectMeta> }>;
}

type AuthorizeResult = { ctx: TeacherContext } | { error: NextResponse };

async function authorize(request: NextRequest): Promise<AuthorizeResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Not authorized. Please sign in again." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) };
  }

  const { data: staff } = await admin
    .from("staff")
    .select("id, name, first_name, middle_name, last_name, role")
    .eq("auth_user_id", user.id)
    .eq("role", "Teacher")
    .maybeSingle();
  if (!staff) {
    return { error: NextResponse.json({ error: "This account is not a teacher account." }, { status: 403 }) };
  }

  const { data: assignmentRows, error: assignmentError } = await admin
    .from("teaching_assignments")
    .select("subject_id, class_id, subject:subjects(id, code, name, has_practical), class:school_classes(id, name, form_level)")
    .eq("teacher_id", staff.id);
  if (assignmentError) {
    return { error: NextResponse.json({ error: "Could not load your subjects." }, { status: 500 }) };
  }

  const assignmentKeys = new Set<string>();
  const forms = new Map<string, { class_id: string; class_name: string; form_level: number; subjects: Map<string, SubjectMeta> }>();

  for (const raw of (assignmentRows ?? []) as unknown as AssignmentRow[]) {
    const klass = Array.isArray(raw.class) ? raw.class[0] : raw.class;
    const subject = Array.isArray(raw.subject) ? raw.subject[0] : raw.subject;
    if (!klass || !subject) continue;
    assignmentKeys.add(`${raw.class_id}|${raw.subject_id}`);
    const form = forms.get(klass.id) ?? {
      class_id: klass.id,
      class_name: klass.name,
      form_level: klass.form_level ?? 0,
      subjects: new Map<string, SubjectMeta>(),
    };
    form.subjects.set(subject.id, subject);
    forms.set(klass.id, form);
  }

  const displayName =
    (staff.name as string | null)?.trim() ||
    [staff.first_name, staff.middle_name, staff.last_name].filter(Boolean).join(" ") ||
    "Teacher";

  return { ctx: { teacherId: staff.id, teacherName: displayName, assignmentKeys, forms } };
}

function optionsResponse(ctx: TeacherContext): NextResponse {
  const forms: FormOption[] = Array.from(ctx.forms.values())
    .map((form) => ({
      class_id: form.class_id,
      class_name: form.class_name,
      form_level: form.form_level,
      subjects: Array.from(form.subjects.values()).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.form_level - b.form_level || a.class_name.localeCompare(b.class_name));
  return NextResponse.json({ teacherName: ctx.teacherName, forms });
}

async function allowedExamIds(classId: string, subjectId: string): Promise<{ ids: Set<string> } | { error: NextResponse }> {
  const { data, error } = await admin
    .from("exam_marks")
    .select("exam_id")
    .eq("class_id", classId)
    .eq("subject_id", subjectId);
  if (error) {
    return { error: NextResponse.json({ error: "Could not load exams." }, { status: 500 }) };
  }
  return { ids: new Set((data ?? []).map((row) => row.exam_id as string)) };
}

async function examsResponse(ctx: TeacherContext, url: URL): Promise<NextResponse> {
  const classId = url.searchParams.get("classId")?.trim() ?? "";
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";
  if (!classId || !subjectId) {
    return NextResponse.json({ error: "Select a form and subject first." }, { status: 400 });
  }
  if (!ctx.assignmentKeys.has(`${classId}|${subjectId}`)) {
    return NextResponse.json({ error: "You are not allowed to compare this subject." }, { status: 403 });
  }

  const allowed = await allowedExamIds(classId, subjectId);
  if ("error" in allowed) return allowed.error;
  if (allowed.ids.size === 0) return NextResponse.json({ exams: [] });

  const { data, error } = await admin
    .from("exams")
    .select("id, name, start_date, end_date, status")
    .in("id", Array.from(allowed.ids))
    .neq("status", "draft")
    .order("start_date", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Could not load exams." }, { status: 500 });
  }
  return NextResponse.json({ exams: data ?? [] });
}

interface RawMark {
  student_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean | null;
}

interface RawStudent {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  stream_id: string | null;
  stream: { name: string }[] | { name: string } | null;
}

interface ExamStats {
  byStudent: Map<string, number | null>;
  sat: number;
  absent: number;
  mean: number | null;
  highest: number | null;
  lowest: number | null;
  passed: number;
  passRate: number | null;
  competency: string;
  gradeCounts: Record<string, number>;
}

function analyseMarks(rows: RawMark[], boundaries: GradeBoundary[], passThreshold: number, thresholds: CompetencyThreshold[]): ExamStats {
  const byStudent = new Map<string, number | null>();
  for (const row of rows) {
    byStudent.set(row.student_id, computeSubjectScore(row.theory_score, row.practical_score, row.is_absent ?? false));
  }

  const scores: number[] = [];
  let absent = 0;
  for (const score of byStudent.values()) {
    if (score === null) absent += 1;
    else scores.push(score);
  }

  const gradeCounts: Record<string, number> = {};
  for (const boundary of boundaries) gradeCounts[boundary.grade] = 0;

  let passed = 0;
  for (const score of scores) {
    const { grade, points } = computeGradeAndPoints(score, boundaries);
    gradeCounts[grade] = (gradeCounts[grade] ?? 0) + 1;
    if (points < passThreshold) passed += 1;
  }

  const mean = scores.length > 0 ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return {
    byStudent,
    sat: scores.length,
    absent,
    mean,
    highest: scores.length > 0 ? Math.max(...scores) : null,
    lowest: scores.length > 0 ? Math.min(...scores) : null,
    passed,
    passRate: scores.length > 0 ? round1((passed / scores.length) * 100) : null,
    competency: competencyLabel(mean, thresholds),
    gradeCounts,
  };
}

async function compareResponse(ctx: TeacherContext, url: URL): Promise<NextResponse> {
  const classId = url.searchParams.get("classId")?.trim() ?? "";
  const subjectId = url.searchParams.get("subjectId")?.trim() ?? "";
  const examAId = url.searchParams.get("examA")?.trim() ?? "";
  const examBId = url.searchParams.get("examB")?.trim() ?? "";

  if (!classId || !subjectId || !examAId || !examBId) {
    return NextResponse.json({ error: "Select a form, subject, Exam A and Exam B." }, { status: 400 });
  }
  if (examAId === examBId) {
    return NextResponse.json({ error: "Exam A and Exam B must be different." }, { status: 400 });
  }
  if (!ctx.assignmentKeys.has(`${classId}|${subjectId}`)) {
    return NextResponse.json({ error: "You are not allowed to compare this subject." }, { status: 403 });
  }

  const allowed = await allowedExamIds(classId, subjectId);
  if ("error" in allowed) return allowed.error;
  if (!allowed.ids.has(examAId) || !allowed.ids.has(examBId)) {
    return NextResponse.json({ error: "The selected exam has no results for this form and subject." }, { status: 400 });
  }

  const [marksA, marksB, studentsRes, subjectRes, settingsRes, examARes, examBRes, enrolRes] = await Promise.all([
    admin.from("exam_marks").select("student_id, theory_score, practical_score, is_absent").eq("exam_id", examAId).eq("class_id", classId).eq("subject_id", subjectId),
    admin.from("exam_marks").select("student_id, theory_score, practical_score, is_absent").eq("exam_id", examBId).eq("class_id", classId).eq("subject_id", subjectId),
    admin.from("students").select("id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)").eq("class_id", classId),
    admin.from("subjects").select("id, code, name, has_practical").eq("id", subjectId).maybeSingle(),
    admin.from("academic_settings").select("key, value").in("key", ["grade_boundaries", "competency_thresholds"]),
    admin.from("exams").select("id, name, start_date").eq("id", examAId).maybeSingle(),
    admin.from("exams").select("id, name, start_date").eq("id", examBId).maybeSingle(),
    admin.from("student_subjects").select("student_id").eq("subject_id", subjectId),
  ]);

  if (marksA.error || marksB.error || studentsRes.error || settingsRes.error) {
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }

  // Only compare students who actually study this subject. When no enrollment
  // is recorded for the subject at all we keep the previous behaviour.
  const enrolledIds = new Set((enrolRes.data ?? []).map((row) => row.student_id as string));
  const restrictMarks = (rows: RawMark[]): RawMark[] =>
    enrolledIds.size === 0 ? rows : rows.filter((row) => enrolledIds.has(row.student_id));

  const settingsMap = new Map<string, string>();
  for (const row of settingsRes.data ?? []) settingsMap.set(row.key as string, row.value as string);

  const boundaries = parseJson<GradeBoundary[]>(settingsMap.get("grade_boundaries"), DEFAULT_GRADE_BOUNDARIES);
  const thresholds = parseJson<CompetencyThreshold[]>(settingsMap.get("competency_thresholds"), DEFAULT_COMPETENCY_THRESHOLDS);
  const passThreshold = boundaries.length > 0 ? Math.max(...boundaries.map((b) => b.points)) : 5;

  const statsA = analyseMarks(restrictMarks((marksA.data ?? []) as RawMark[]), boundaries, passThreshold, thresholds);
  const statsB = analyseMarks(restrictMarks((marksB.data ?? []) as RawMark[]), boundaries, passThreshold, thresholds);

  const studentById = new Map<string, { name: string; stream: string; gender: string }>();
  for (const raw of (studentsRes.data ?? []) as unknown as RawStudent[]) {
    const stream = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
    studentById.set(raw.id, {
      name: `${raw.first_name}${raw.middle_name ? ` ${raw.middle_name}` : ""} ${raw.last_name}`,
      stream: stream?.name ?? "—",
      gender: raw.gender,
    });
  }

  const ids = new Set<string>([...statsA.byStudent.keys(), ...statsB.byStudent.keys()]);
  const students: {
    student_id: string;
    name: string;
    stream: string;
    gender: string;
    scoreA: number | null;
    gradeA: string;
    scoreB: number | null;
    gradeB: string;
    diff: number | null;
    status: "improved" | "dropped" | "same" | "absent";
  }[] = [];

  let improved = 0;
  let dropped = 0;
  let unchanged = 0;
  let absent = 0;

  for (const id of ids) {
    const info = studentById.get(id);
    const hasA = statsA.byStudent.has(id);
    const hasB = statsB.byStudent.has(id);
    const scoreA = hasA ? statsA.byStudent.get(id) ?? null : null;
    const scoreB = hasB ? statsB.byStudent.get(id) ?? null : null;
    const gradeA = scoreA !== null ? computeGradeAndPoints(scoreA, boundaries).grade : "";
    const gradeB = scoreB !== null ? computeGradeAndPoints(scoreB, boundaries).grade : "";
    const diff = scoreA !== null && scoreB !== null ? round1(scoreB - scoreA) : null;

    let status: "improved" | "dropped" | "same" | "absent";
    if (diff === null) {
      status = "absent";
      absent += 1;
    } else if (diff > 0) {
      status = "improved";
      improved += 1;
    } else if (diff < 0) {
      status = "dropped";
      dropped += 1;
    } else {
      status = "same";
      unchanged += 1;
    }

    students.push({
      student_id: id,
      name: info?.name ?? "—",
      stream: info?.stream ?? "—",
      gender: info?.gender ?? "—",
      scoreA,
      gradeA,
      scoreB,
      gradeB,
      diff,
      status,
    });
  }

  const meanDiff = statsA.mean !== null && statsB.mean !== null ? round1(statsB.mean - statsA.mean) : null;
  const verdict = meanDiff === null ? "same" : meanDiff > 0 ? "improved" : meanDiff < 0 ? "dropped" : "same";

  return NextResponse.json({
    teacherName: ctx.teacherName,
    className: ctx.forms.get(classId)?.class_name ?? "—",
    formLevel: ctx.forms.get(classId)?.form_level ?? null,
    subject: subjectRes.data ?? null,
    examA: examARes.data ?? { id: examAId, name: "Exam A", start_date: "" },
    examB: examBRes.data ?? { id: examBId, name: "Exam B", start_date: "" },
    gradeOrder: boundaries.map((b) => b.grade),
    summary: {
      a: { sat: statsA.sat, absent: statsA.absent, mean: statsA.mean, highest: statsA.highest, lowest: statsA.lowest, passed: statsA.passed, passRate: statsA.passRate, competency: statsA.competency, gradeCounts: statsA.gradeCounts },
      b: { sat: statsB.sat, absent: statsB.absent, mean: statsB.mean, highest: statsB.highest, lowest: statsB.lowest, passed: statsB.passed, passRate: statsB.passRate, competency: statsB.competency, gradeCounts: statsB.gradeCounts },
      meanDiff,
      verdict,
    },
    students,
    counts: { improved, dropped, unchanged, absent },
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await authorize(request);
  if ("error" in result) return result.error;
  const { ctx } = result;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "options";

  try {
    if (action === "options") return optionsResponse(ctx);
    if (action === "exams") return await examsResponse(ctx, url);
    if (action === "compare") return await compareResponse(ctx, url);
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    const message = errorMessage(error, "Unknown error.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
