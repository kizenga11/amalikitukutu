import { NextResponse, type NextRequest } from "next/server";
import { authorizeTimetable, TIMETABLE_ADMIN } from "@/lib/timetable-auth";
import { loadTimetableData, timetableDb } from "@/lib/timetable-server";
import type { SolverInput, SolverLesson, TimetableLabels } from "@/lib/timetable";
import { validateTimetable } from "@/lib/timetable-validator";

export const dynamic = "force-dynamic";

interface PatchBody {
  slotId?: string;
  locked?: boolean;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeTimetable(request, TIMETABLE_ADMIN);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const db = timetableDb();
  const { data: lesson, error } = await db
    .from("timetable_lesson")
    .select("id, version_id, class_id, subject_id, teacher_id, assignment_id, slot_id, size, locked")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Could not load the lesson: ${error.message}` }, { status: 500 });
  }
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  const { data: version, error: versionError } = await db
    .from("timetable_version")
    .select("id, term, status, input_snapshot")
    .eq("id", lesson.version_id)
    .maybeSingle();
  if (versionError) {
    return NextResponse.json({ error: `Could not load the version: ${versionError.message}` }, { status: 500 });
  }
  if (!version) {
    return NextResponse.json({ error: "Timetable version not found." }, { status: 404 });
  }
  if (version.status !== "draft") {
    return NextResponse.json(
      { error: "This timetable is published. Unpublish it before editing lessons." },
      { status: 409 },
    );
  }

  const targetSlot = body.slotId?.trim() || String(lesson.slot_id);
  const isMoving = targetSlot !== String(lesson.slot_id);
  if (isMoving && lesson.locked) {
    return NextResponse.json(
      { error: "This lesson is locked. Unlock it before moving it." },
      { status: 409 },
    );
  }

  let input: SolverInput;
  let labels: Required<TimetableLabels>;
  try {
    if (version.input_snapshot) {
      input = version.input_snapshot as SolverInput;
      const current = await loadTimetableData();
      labels = current.labels;
    } else {
      const current = await loadTimetableData();
      input = current.input;
      labels = current.labels;
    }
  } catch (loadError) {
    return NextResponse.json(
      { error: loadError instanceof Error ? loadError.message : "Could not load timetable data." },
      { status: 500 },
    );
  }

  const { data: rows, error: rowsError } = await db
    .from("timetable_lesson")
    .select("id, class_id, subject_id, teacher_id, assignment_id, slot_id, size, locked")
    .eq("version_id", lesson.version_id);
  if (rowsError) {
    return NextResponse.json({ error: `Could not load the lessons: ${rowsError.message}` }, { status: 500 });
  }

  const dayBySlot = new Map<string, number>();
  for (const day of input.days) {
    for (const slot of day.slots) dayBySlot.set(slot.id, day.id);
  }

  const nextLocked = body.locked ?? Boolean(lesson.locked);
  const lessons: SolverLesson[] = [];
  const lockedLessons: SolverLesson[] = [];

  for (const row of rows ?? []) {
    const isTarget = String(row.id) === id;
    const slotId = isTarget ? targetSlot : String(row.slot_id);
    const entry: SolverLesson = {
      classId: String(row.class_id),
      subjectId: row.subject_id ? String(row.subject_id) : "",
      teacherId: row.teacher_id ? String(row.teacher_id) : "",
      assignmentId: row.assignment_id ? String(row.assignment_id) : undefined,
      slotId,
      size: Number(row.size) === 2 ? 2 : 1,
      day: dayBySlot.get(slotId) ?? 1,
    };
    lessons.push(entry);
    if (isTarget ? nextLocked : Boolean(row.locked)) lockedLessons.push(entry);
  }

  const issues = validateTimetable(input, lessons, { locked: lockedLessons, labels });
  if (issues.length > 0) {
    return NextResponse.json(
      {
        error: "Move refused: the timetable would break a hard rule.",
        issues,
      },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await db
    .from("timetable_lesson")
    .update({ slot_id: targetSlot, locked: nextLocked })
    .eq("id", id)
    .select("id, version_id, class_id, subject_id, teacher_id, assignment_id, slot_id, size, locked")
    .single();

  if (updateError) {
    return NextResponse.json({ error: `Could not save the lesson: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ lesson: updated, issues: [] });
}
