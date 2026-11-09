import { NextResponse, type NextRequest } from "next/server";
import { authorizeTimetable, TIMETABLE_READERS } from "@/lib/timetable-auth";
import { timetableDb } from "@/lib/timetable-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeTimetable(request, TIMETABLE_READERS);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const db = timetableDb();

  const { data: version, error } = await db
    .from("timetable_version")
    .select(
      "id, term, academic_year, term_number, label, status, score, solver_status, diagnostics, input_snapshot, created_at, published_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Could not load the version: ${error.message}` }, { status: 500 });
  }
  if (!version) {
    return NextResponse.json({ error: "Timetable version not found." }, { status: 404 });
  }

  if (auth.role === "Teacher" && version.status !== "published") {
    return NextResponse.json(
      { error: "Only the published timetable is available to teachers." },
      { status: 403 },
    );
  }

  const { data: lessons, error: lessonsError } = await db
    .from("timetable_lesson")
    .select(
      "id, version_id, class_id, subject_id, teacher_id, assignment_id, slot_id, size, locked, subject:subjects(code, name), teacher:staff!timetable_lesson_teacher_id_fkey(name, first_name, middle_name, last_name)",
    )
    .eq("version_id", id);

  if (lessonsError) {
    return NextResponse.json(
      { error: `Could not load the lessons: ${lessonsError.message}` },
      { status: 500 },
    );
  }

  const mapped = (lessons ?? []).map((lesson) => {
    const subject = first(lesson.subject);
    const teacher = first(lesson.teacher);
    return {
      id: String(lesson.id),
      versionId: String(lesson.version_id),
      classId: String(lesson.class_id),
      subjectId: lesson.subject_id ? String(lesson.subject_id) : null,
      teacherId: lesson.teacher_id ? String(lesson.teacher_id) : null,
      assignmentId: lesson.assignment_id ? String(lesson.assignment_id) : null,
      slotId: String(lesson.slot_id),
      size: Number(lesson.size) === 2 ? 2 : 1,
      locked: Boolean(lesson.locked),
      subjectCode: subject?.code ?? "SUB",
      subjectName: subject?.name ?? "Subject",
      teacherName:
        teacher?.name?.trim() ||
        [teacher?.first_name, teacher?.middle_name, teacher?.last_name].filter(Boolean).join(" ").trim() ||
        "Teacher",
    };
  });

  return NextResponse.json({ version, lessons: mapped });
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
