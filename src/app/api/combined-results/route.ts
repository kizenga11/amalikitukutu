import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { academicYears } from "@/lib/calendar";
import {
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  type CompetencyThreshold,
  type DivisionRange,
  type GradeBoundary,
} from "@/lib/grading";
import {
  buildExamResults,
  type CombinedExamMeta,
  type CombinedMarkInput,
  type CombinedSettings,
  type CombinedStudentInput,
  type CombinedSubjectMeta,
} from "@/lib/combined-results";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isValidYear(value: string): boolean {
  return /^\d{4}$/.test(value);
}

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

type AuthorizeResult = { ok: true } | { error: NextResponse };

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

  const metaRole = user.user_metadata?.role as string | undefined;
  let allowed = metaRole === "Headmaster" || metaRole === "Academic" || metaRole === "Teacher";
  if (!allowed) {
    const { data: staff } = await admin
      .from("staff")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    allowed = staff?.role === "Headmaster" || staff?.role === "Academic" || staff?.role === "Teacher";
  }
  if (!allowed) {
    return { error: NextResponse.json({ error: "You do not have access to this report." }, { status: 403 }) };
  }

  return { ok: true };
}

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
}

async function optionsResponse(): Promise<NextResponse> {
  const [classesRes, streamsRes] = await Promise.all([
    admin.from("school_classes").select("id, form_level, name").order("form_level"),
    admin.from("streams").select("id, class_id, name"),
  ]);
  if (classesRes.error || streamsRes.error) {
    return NextResponse.json({ error: "Could not load forms." }, { status: 500 });
  }
  const streams = (streamsRes.data ?? []) as StreamRow[];
  const forms = (classesRes.data ?? []).map((cls) => ({
    class_id: cls.id as string,
    class_name: cls.name as string,
    form_level: cls.form_level as number,
    streams: streams
      .filter((s) => s.class_id === cls.id)
      .map((s) => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return NextResponse.json({
    years: academicYears.map((y) => ({ id: y.id, label: y.label })),
    forms,
  });
}

async function examsResponse(url: URL): Promise<NextResponse> {
  const year = url.searchParams.get("year")?.trim() ?? "";
  const classId = url.searchParams.get("classId")?.trim() ?? "";
  if (!isValidYear(year) || !classId) {
    return NextResponse.json({ error: "Select an academic year and a form first." }, { status: 400 });
  }

  const { data: links, error: linkError } = await admin
    .from("exam_classes")
    .select("exam_id")
    .eq("class_id", classId);
  if (linkError) {
    return NextResponse.json({ error: "Could not load exams." }, { status: 500 });
  }
  const examIds = [...new Set((links ?? []).map((row) => row.exam_id as string))];
  if (examIds.length === 0) return NextResponse.json({ exams: [] });

  const { data, error } = await admin
    .from("exams")
    .select("id, name, start_date, status")
    .in("id", examIds)
    .neq("status", "draft")
    .gte("start_date", `${year}-01-01`)
    .lt("start_date", `${Number(year) + 1}-01-01`)
    .order("start_date", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Could not load exams." }, { status: 500 });
  }

  return NextResponse.json({
    exams: (data ?? []).map((row) => ({ id: row.id, name: row.name, start_date: row.start_date })),
  });
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

async function studentsResponse(url: URL): Promise<NextResponse> {
  const classId = url.searchParams.get("classId")?.trim() ?? "";
  const streamId = url.searchParams.get("streamId")?.trim() ?? "";
  if (!classId) {
    return NextResponse.json({ error: "Select a form first." }, { status: 400 });
  }

  let query = admin
    .from("students")
    .select("id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)")
    .eq("class_id", classId);
  if (streamId) query = query.eq("stream_id", streamId);

  const { data, error } = await query.order("first_name").order("last_name");
  if (error) {
    return NextResponse.json({ error: "Could not load students." }, { status: 500 });
  }

  const students = ((data ?? []) as RawStudent[]).map((raw) => {
    const stream = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
    return {
      id: raw.id,
      name: `${raw.first_name}${raw.middle_name ? ` ${raw.middle_name}` : ""} ${raw.last_name}`.trim(),
      stream_id: raw.stream_id,
      stream_name: stream?.name ?? "—",
    };
  });

  return NextResponse.json({ students });
}

interface RawMark {
  exam_id: string;
  student_id: string;
  subject_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean | null;
}

async function reportResponse(url: URL): Promise<NextResponse> {
  const year = url.searchParams.get("year")?.trim() ?? "";
  const classId = url.searchParams.get("classId")?.trim() ?? "";
  const examIds = (url.searchParams.get("examIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const studentIds = (url.searchParams.get("studentIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!isValidYear(year) || !classId) {
    return NextResponse.json({ error: "Select an academic year and a form." }, { status: 400 });
  }
  if (examIds.length === 0) {
    return NextResponse.json({ error: "Select at least one exam." }, { status: 400 });
  }
  if (studentIds.length === 0) {
    return NextResponse.json({ error: "Select at least one student." }, { status: 400 });
  }

  const { data: links, error: linkError } = await admin
    .from("exam_classes")
    .select("exam_id")
    .eq("class_id", classId)
    .in("exam_id", examIds);
  if (linkError) {
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }
  const allowedIds = new Set((links ?? []).map((row) => row.exam_id as string));
  if (examIds.some((id) => !allowedIds.has(id))) {
    return NextResponse.json({ error: "One of the selected exams has no results for this form." }, { status: 400 });
  }

  const [settingsRes, classRes, examsRes] = await Promise.all([
    admin
      .from("academic_settings")
      .select("key, value")
      .in("key", ["grade_boundaries", "division_ranges", "competency_thresholds"]),
    admin.from("school_classes").select("id, name, form_level").eq("id", classId).maybeSingle(),
    admin.from("exams").select("id, name, start_date").in("id", examIds).order("start_date", { ascending: true }),
  ]);

  let studentsData: RawStudent[];
  let marksData: RawMark[];
  try {
    studentsData = await fetchAllRows<RawStudent>((from, to) =>
      admin
        .from("students")
        .select("id, first_name, middle_name, last_name, gender, stream_id, stream:streams(name)")
        .eq("class_id", classId)
        .order("id")
        .range(from, to),
    );
    marksData = await fetchAllRows<RawMark>((from, to) =>
      admin
        .from("exam_marks")
        .select("exam_id, student_id, subject_id, theory_score, practical_score, is_absent")
        .eq("class_id", classId)
        .in("exam_id", examIds)
        .order("id")
        .range(from, to),
    );
  } catch {
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }

  if (settingsRes.error || examsRes.error) {
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }

  const exams: CombinedExamMeta[] = (examsRes.data ?? [])
    .filter((exam) => exam.start_date && exam.start_date.slice(0, 4) === year)
    .map((exam) => ({ id: exam.id as string, name: exam.name as string, start_date: exam.start_date as string }));
  if (exams.length === 0) {
    return NextResponse.json({ error: "No results found for the selected year." }, { status: 400 });
  }

  const settingsMap = new Map<string, string>();
  for (const row of settingsRes.data ?? []) settingsMap.set(row.key as string, row.value as string);

  const settings: CombinedSettings = {
    gradeBoundaries: parseJson<GradeBoundary[]>(settingsMap.get("grade_boundaries"), DEFAULT_GRADE_BOUNDARIES),
    divisionRanges: parseJson<DivisionRange[]>(settingsMap.get("division_ranges"), DEFAULT_DIVISION_RANGES),
    competencyThresholds: parseJson<CompetencyThreshold[]>(settingsMap.get("competency_thresholds"), DEFAULT_COMPETENCY_THRESHOLDS),
  };

  const students: CombinedStudentInput[] = studentsData.map((raw) => {
    const stream = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
    return {
      student_id: raw.id,
      first_name: raw.first_name,
      middle_name: raw.middle_name,
      last_name: raw.last_name,
      gender: raw.gender,
      stream_id: raw.stream_id,
      stream_name: stream?.name ?? "—",
    };
  });

  const allowedStudentIds = new Set(students.map((student) => student.student_id));
  const marks: CombinedMarkInput[] = marksData
    .filter((mark) => allowedStudentIds.has(mark.student_id))
    .map((mark) => ({
      exam_id: mark.exam_id,
      student_id: mark.student_id,
      subject_id: mark.subject_id,
      theory: mark.theory_score,
      practical: mark.practical_score,
      is_absent: mark.is_absent ?? false,
    }));

  const subjectIds = [...new Set(marks.map((mark) => mark.subject_id))];
  const { data: subjectsData, error: subjectsError } = subjectIds.length
    ? await admin.from("subjects").select("id, code, name, has_practical").in("id", subjectIds)
    : { data: [], error: null };
  if (subjectsError) {
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }

  const subjectMetas: CombinedSubjectMeta[] = (subjectsData ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    has_practical: row.has_practical as boolean,
  }));

  const reports = buildExamResults({
    students,
    subjects: subjectMetas,
    marks,
    exams,
    settings,
    selectedStudentIds: studentIds,
  });

  return NextResponse.json({
    className: (classRes.data?.name as string | undefined) ?? "—",
    formLevel: (classRes.data?.form_level as number | undefined) ?? null,
    year,
    exams,
    reports,
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "options";

  try {
    if (action === "options") return await optionsResponse();
    if (action === "exams") return await examsResponse(url);
    if (action === "students") return await studentsResponse(url);
    if (action === "report") return await reportResponse(url);
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
