import { NextRequest, NextResponse } from "next/server";
import { studentAdmin } from "@/lib/student-auth";
import { normalizeYear } from "@/lib/active-year";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ClassRow {
  id: string;
  name: string;
  form_level: number;
}

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
}

interface StudentRow {
  id: string;
  class_id: string | null;
  stream_id: string | null;
}

type AuthorizeResult = { ok: true; userId: string } | { error: NextResponse };

async function authorize(request: NextRequest): Promise<AuthorizeResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Not authorized. Please sign in again." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await studentAdmin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) };
  }

  const metaRole = user.user_metadata?.role as string | undefined;
  let allowed = metaRole === "Headmaster" || metaRole === "Academic";
  if (!allowed) {
    const { data: staff } = await studentAdmin
      .from("staff")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    allowed = staff?.role === "Headmaster" || staff?.role === "Academic";
  }
  if (!allowed) {
    return { error: NextResponse.json({ error: "Only the Headmaster or Academic office can promote students." }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

async function loadPreview(fromYear: string) {
  const toYear = String(Number(fromYear) + 1);

  const [classesRes, streamsRes, studentsRes, historyRes] = await Promise.all([
    studentAdmin.from("school_classes").select("id, name, form_level").order("form_level"),
    studentAdmin.from("streams").select("id, class_id, name"),
    studentAdmin.from("students").select("id, class_id, stream_id").eq("status", "Active"),
    studentAdmin
      .from("promotion_history")
      .select("id, created_at")
      .eq("from_year", fromYear)
      .eq("to_year", toYear)
      .maybeSingle(),
  ]);

  if (classesRes.error) throw classesRes.error;
  if (streamsRes.error) throw streamsRes.error;
  if (studentsRes.error) throw studentsRes.error;

  const classes = ((classesRes.data ?? []) as ClassRow[]).sort((a, b) => a.form_level - b.form_level);
  const streams = (streamsRes.data ?? []) as StreamRow[];
  const students = (studentsRes.data ?? []) as StudentRow[];
  const classById = new Map(classes.map((cls) => [cls.id, cls]));

  const warnings: string[] = [];
  const unassigned = students.filter((student) => !student.class_id).length;
  if (unassigned > 0) {
    warnings.push(`${unassigned} active student(s) have no class and will be left unchanged.`);
  }

  const promotedIds = students
    .filter((student) => {
      const cls = student.class_id ? classById.get(student.class_id) : null;
      return cls !== null && cls !== undefined && cls.form_level >= 1 && cls.form_level <= 3;
    })
    .map((student) => student.id);

  const rows = classes.map((cls) => {
    const target = classes.find((item) => item.form_level === cls.form_level + 1) ?? null;
    const classStudents = students.filter((student) => student.class_id === cls.id);
    return {
      classId: cls.id,
      className: cls.name,
      formLevel: cls.form_level,
      studentCount: classStudents.length,
      targetClassId: target?.id ?? null,
      targetClassName: target?.name ?? null,
      graduates: cls.form_level >= 4,
    };
  });

  const missingStreams = students.filter((student) => {
    const cls = student.class_id ? classById.get(student.class_id) : null;
    if (!cls || cls.form_level < 1 || cls.form_level > 3) return false;
    if (!student.stream_id) return false;
    const source = streams.find((stream) => stream.id === student.stream_id);
    if (!source) return false;
    const target = classes.find((item) => item.form_level === cls.form_level + 1);
    if (!target) return false;
    return !streams.some(
      (stream) =>
        stream.class_id === target.id &&
        stream.name.toLowerCase() === source.name.toLowerCase(),
    );
  }).length;
  if (missingStreams > 0) {
    warnings.push(
      `${missingStreams} student(s) have a stream that is missing in the next form. Their stream will be left blank.`,
    );
  }

  let enrollments = 0;
  if (promotedIds.length > 0) {
    const { count, error } = await studentAdmin
      .from("student_subjects")
      .select("student_id", { count: "exact", head: true })
      .eq("academic_year", fromYear)
      .in("student_id", promotedIds);
    if (error) throw error;
    enrollments = count ?? 0;
  }

  const sourceClassIds = classes
    .filter((cls) => cls.form_level >= 1 && cls.form_level <= 3)
    .map((cls) => cls.id);

  let teachingAssignments = 0;
  if (sourceClassIds.length > 0) {
    const { count, error } = await studentAdmin
      .from("teaching_assignments")
      .select("id", { count: "exact", head: true })
      .eq("academic_year", fromYear)
      .in("class_id", sourceClassIds);
    if (error) throw error;
    teachingAssignments = count ?? 0;
  }

  const sourceStreamIds = streams
    .filter((stream) => sourceClassIds.includes(stream.class_id))
    .map((stream) => stream.id);

  let streamTeachers = 0;
  if (sourceStreamIds.length > 0) {
    const { count, error } = await studentAdmin
      .from("stream_teachers")
      .select("id", { count: "exact", head: true })
      .eq("academic_year_id", fromYear)
      .eq("is_active", true)
      .in("stream_id", sourceStreamIds);
    if (error) throw error;
    streamTeachers = count ?? 0;
  }

  return {
    fromYear,
    toYear,
    alreadyPromoted: Boolean(historyRes.data),
    totalStudents: promotedIds.length,
    totalGraduating: students.filter((student) => {
      const cls = student.class_id ? classById.get(student.class_id) : null;
      return cls?.form_level === 4;
    }).length,
    totalEnrollments: enrollments,
    totalTeachingAssignments: teachingAssignments,
    totalStreamTeachers: streamTeachers,
    classes: rows,
    warnings,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const fromYear = normalizeYear(request.nextUrl.searchParams.get("fromYear"));
  try {
    return NextResponse.json(await loadPreview(fromYear));
  } catch {
    return NextResponse.json({ error: "Could not load the promotion preview." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  let body: { fromYear?: unknown; toYear?: unknown; setActiveYear?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const fromYear = normalizeYear(body.fromYear);
  const toYear = String(Number(fromYear) + 1);
  if (body.toYear !== undefined && String(body.toYear) !== toYear) {
    return NextResponse.json({ error: "The target year must be the year after the source year." }, { status: 400 });
  }

  const { data, error } = await studentAdmin.rpc("promote_students", {
    p_from_year: fromYear,
    p_to_year: toYear,
    p_set_active: body.setActiveYear !== false,
    p_performed_by: auth.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
