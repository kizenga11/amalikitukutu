import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  DEFAULT_COMPETENCY_THRESHOLDS,
  type GradeBoundary,
  type DivisionRange,
  type CompetencyThreshold,
  type ClassStudentsInput,
} from "@/lib/grading";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface RawStudent {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  class_id: string;
  stream_id: string | null;
  stream: { name: string }[] | { name: string } | null;
}

interface RawMark {
  student_id: string;
  subject_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean;
}

interface RawSubjectRel {
  class_id: string;
  subject_id: string;
  subject: { code: string; name: string; has_practical: boolean }[] | { code: string; name: string; has_practical: boolean } | null;
}

interface RawClassRel {
  class_id: string;
  class: { name: string }[] | { name: string } | null;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const examId = url.searchParams.get("examId")?.trim();

  if (!examId) {
    return NextResponse.json({ error: "examId is required" }, { status: 400 });
  }

  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("id, name, start_date, end_date, has_practical, status")
    .eq("id", examId)
    .single();
  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
  if (exam.status !== "published") {
    return NextResponse.json({ error: "Results are not published yet" }, { status: 404 });
  }

  const [classRels, subjectRels] = await Promise.all([
    admin.from("exam_classes").select("class_id, class:school_classes(name)").eq("exam_id", examId),
    admin.from("exam_class_subjects").select("class_id, subject_id, subject:subjects(code, name, has_practical)").eq("exam_id", examId),
  ]);
  if (classRels.error || subjectRels.error) {
    return NextResponse.json({ error: "Could not load exam structure" }, { status: 500 });
  }

  const classNames = new Map<string, string>();
  for (const row of (classRels.data ?? []) as unknown as RawClassRel[]) {
    const name = Array.isArray(row.class) ? row.class[0] : row.class;
    classNames.set(row.class_id, name?.name ?? "Unknown");
  }

  const subjectByClass = new Map<string, { id: string; code: string; name: string; has_practical: boolean }[]>();
  for (const row of (subjectRels.data ?? []) as unknown as RawSubjectRel[]) {
    const s = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const subject = { id: row.subject_id, code: s?.code ?? "", name: s?.name ?? "Unknown", has_practical: s?.has_practical ?? false };
    const list = subjectByClass.get(row.class_id) ?? [];
    list.push(subject);
    subjectByClass.set(row.class_id, list);
  }

  const classIds = Array.from(classNames.keys());
  if (classIds.length === 0) {
    return NextResponse.json({ exam, students: [] });
  }

  const { data: studentData, error: studentErr } = await admin
    .from("students")
    .select("id, registration_no, first_name, middle_name, last_name, gender, class_id, stream_id, stream:streams(name)")
    .in("class_id", classIds);
  if (studentErr) return NextResponse.json({ error: "Could not load students" }, { status: 500 });

  const studentIds = (studentData ?? []).map((s) => s.id);
  const subjectLinks: { student_id: string; subject_id: string }[] = [];
  const marksRows: RawMark[] = [];
  if (studentIds.length > 0) {
    for (let i = 0; i < studentIds.length; i += 100) {
      const batch = studentIds.slice(i, i + 100);
      const { data, error } = await admin.from("student_subjects").select("student_id, subject_id").in("student_id", batch);
      if (error) return NextResponse.json({ error: "Could not load student subjects" }, { status: 500 });
      subjectLinks.push(...(data ?? []));
    }
    const { data: marks, error: marksErr } = await admin
      .from("exam_marks")
      .select("student_id, subject_id, theory_score, practical_score, is_absent")
      .eq("exam_id", examId)
      .in("class_id", classIds);
    if (marksErr) return NextResponse.json({ error: "Could not load exam marks" }, { status: 500 });
    marksRows.push(...(marks ?? []));
  }

  const studentSubjects = new Map<string, Set<string>>();
  for (const row of subjectLinks) {
    const set = studentSubjects.get(row.student_id) ?? new Set<string>();
    set.add(row.subject_id);
    studentSubjects.set(row.student_id, set);
  }

  const marks: Record<string, { theory: number | null; practical: number | null; is_absent: boolean }> = {};
  for (const row of marksRows) {
    marks[`${row.student_id}|${row.subject_id}`] = {
      theory: row.theory_score !== null ? Number(row.theory_score) : null,
      practical: row.practical_score !== null ? Number(row.practical_score) : null,
      is_absent: row.is_absent ?? false,
    };
  }

  const registrationByStudent = new Map<string, string | null>();
  for (const raw of (studentData ?? []) as unknown as RawStudent[]) {
    registrationByStudent.set(raw.id, raw.registration_no);
  }

  const classes = Array.from(classNames.entries())
    .map(([class_id, class_name]) => {
      const students = (studentData ?? [] as unknown as RawStudent[])
        .filter((raw) => raw.class_id === class_id)
        .map((raw) => {
          let streamName = "—";
          if (raw.stream_id) {
            const s = Array.isArray(raw.stream) ? raw.stream[0] : raw.stream;
            streamName = s?.name ?? "—";
          }
          return {
            student_id: raw.id,
            first_name: raw.first_name,
            middle_name: raw.middle_name,
            last_name: raw.last_name,
            gender: raw.gender,
            stream_id: raw.stream_id,
            stream_name: streamName,
            subjects: Array.from(studentSubjects.get(raw.id) ?? []),
          };
        })
        .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));

      const classRow: {
        class_id: string;
        class_name: string;
        subjects: { id: string; code: string; name: string; has_practical: boolean }[];
        students: ClassStudentsInput[];
      } = {
        class_id,
        class_name,
        subjects: (subjectByClass.get(class_id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
        students,
      };
      return classRow;
    })
    .sort((a, b) => a.class_name.localeCompare(b.class_name));

  const { data: settingsRows, error: settingsErr } = await admin
    .from("academic_settings")
    .select("key, value")
    .in("key", ["grade_boundaries", "division_ranges", "competency_thresholds"]);
  if (settingsErr) return NextResponse.json({ error: "Could not load grading settings" }, { status: 500 });

  const settingsMap = new Map<string, string>();
  for (const row of settingsRows ?? []) settingsMap.set(row.key, row.value);

  const settings = {
    gradeBoundaries: parseJson<GradeBoundary[]>(settingsMap.get("grade_boundaries"), DEFAULT_GRADE_BOUNDARIES),
    divisionRanges: parseJson<DivisionRange[]>(settingsMap.get("division_ranges"), DEFAULT_DIVISION_RANGES),
    competencyThresholds: parseJson<CompetencyThreshold[]>(settingsMap.get("competency_thresholds"), DEFAULT_COMPETENCY_THRESHOLDS),
  };

  const report = buildSchoolReport(
    classes.map((classRow) => buildClassResults(classRow, marks, settings.gradeBoundaries, settings.divisionRanges)),
    settings,
  );

  const classById = new Map<string, string>();
  for (const c of classes) classById.set(c.class_id, c.class_name);

  const students = report.students.map((row) => {
    const classId = classes.find((c) => c.students.some((s) => s.student_id === row.student.student_id))?.class_id ?? null;
    return {
      student_id: row.student.student_id,
      registration_no: registrationByStudent.get(row.student.student_id) ?? null,
      gender: row.student.gender,
      class_id: classId,
      class_name: classId ? classById.get(classId) ?? "—" : "—",
      stream_id: row.student.stream_id,
      stream_name: row.student.stream_name,
      rank: row.rank,
      avg: row.avg,
      grade: row.grade,
      points: row.student.total_points,
      division: row.student.division,
      divisionCode: row.divisionCode,
      incomplete: row.student.incomplete,
      subjects: row.student.subjects.map((s) => ({
        subject_code: s.subject_code,
        subject_name: s.subject_name,
        score: s.total_score,
        grade: s.grade,
        points: s.points,
        is_absent: s.is_absent,
      })),
    };
  });

  return NextResponse.json({
    exam: {
      id: exam.id,
      name: exam.name,
      start_date: exam.start_date,
      end_date: exam.end_date,
    },
    students,
    generatedAt: new Date().toISOString(),
  });
}