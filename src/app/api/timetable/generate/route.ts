import { NextResponse, type NextRequest } from "next/server";
import { authorizeTimetable, TIMETABLE_ADMIN } from "@/lib/timetable-auth";
import { loadTimetableData, timetableDb } from "@/lib/timetable-server";
import { solveTimetable } from "@/lib/timetable-solver";
import { precheck, type SolverInput, type SolverOutput } from "@/lib/timetable";
import { validateTimetable } from "@/lib/timetable-validator";

export const dynamic = "force-dynamic";

interface GenerateBody {
  term?: string;
  academicYear?: string;
  termNumber?: number;
  label?: string;
  sourceVersionId?: string;
  timeLimit?: number;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeTimetable(request, TIMETABLE_ADMIN);
  if (!auth.ok) return auth.response;

  let body: GenerateBody = {};
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    body = {};
  }

  let data;
  try {
    data = await loadTimetableData(body.sourceVersionId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load timetable data." },
      { status: 500 },
    );
  }

  const input: SolverInput = {
    ...data.input,
    rules: {
      ...data.input.rules,
      ...(body.timeLimit ? { timeLimit: Math.max(5, Math.min(600, body.timeLimit)) } : {}),
    },
  };

  const diagnostics = precheck(input, data.labels);
  let result: SolverOutput;

  if (diagnostics.length > 0) {
    result = { status: "infeasible", objective: null, lessons: [], diagnostics };
  } else if (process.env.SOLVER_URL) {
    try {
      const response = await fetch(
        `${process.env.SOLVER_URL.replace(/\/$/, "")}/generate?timeLimit=${input.rules.timeLimit}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout((input.rules.timeLimit + 15) * 1000),
        },
      );
      if (!response.ok) {
        return NextResponse.json(
          { error: `The solver service returned ${response.status}.` },
          { status: 502 },
        );
      }
      result = (await response.json()) as SolverOutput;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Could not reach the solver service: ${error.message}`
              : "Could not reach the solver service.",
        },
        { status: 502 },
      );
    }
  } else {
    result = solveTimetable(input, { timeLimitMs: input.rules.timeLimit * 1000 });
  }

  // The Python reference solver does not echo assignmentId. Infer it from the
  // class + subject + teacher triple so persistence, locks and validation agree.
  result = normalizeResult(result, input);

  const missingLocked =
    result.status === "infeasible"
      ? []
      : (input.locked ?? []).filter(
          (locked) =>
            !result.lessons.some(
              (lesson) =>
                lesson.assignmentId === locked.assignmentId &&
                lesson.slotId === locked.slotId &&
                lesson.size === locked.size,
            ),
        );

  const validation =
    result.status === "infeasible"
      ? []
      : [
          ...validateTimetable(input, result.lessons, {
            locked: result.lessons.filter((lesson) => isLocked(input, lesson)),
            labels: data.labels,
          }),
          ...missingLocked.map((locked) => ({
            code: "locked-moved" as const,
            message: `A locked lesson at ${data.labels.slot(locked.slotId)} was not kept.`,
          })),
        ];

  if (validation.length > 0 && result.status !== "infeasible") {
    result = {
      ...result,
      status: "infeasible",
      diagnostics: [...result.diagnostics, ...validation.map((issue) => issue.message)],
    };
  }

  const db = timetableDb();
  const term = body.term?.trim() || "current";
  const solverStatus =
    validation.length > 0 && result.status === "infeasible" ? "invalid" : result.status;

  const { data: version, error: versionError } = await db
    .from("timetable_version")
    .insert({
      term,
      academic_year: body.academicYear ?? null,
      term_number: body.termNumber ?? null,
      label: body.label?.trim() || null,
      status: "draft",
      score: result.objective,
      solver_status: solverStatus,
      diagnostics: result.diagnostics,
      input_snapshot: input,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    return NextResponse.json(
      { error: `Could not save the draft version: ${versionError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  const versionId = String(version.id);

  if (result.lessons.length > 0) {
    const lockedKeys = new Set(
      (input.locked ?? []).map((lesson) => `${lesson.assignmentId}|${lesson.slotId}|${lesson.size}`),
    );
    const rows = result.lessons.map((lesson) => ({
      version_id: versionId,
      class_id: lesson.classId,
      subject_id: lesson.subjectId,
      teacher_id: lesson.teacherId,
      assignment_id: lesson.assignmentId ?? null,
      slot_id: lesson.slotId,
      size: lesson.size,
      locked: lockedKeys.has(`${lesson.assignmentId}|${lesson.slotId}|${lesson.size}`),
    }));
    const { error: lessonsError } = await db.from("timetable_lesson").insert(rows);
    if (lessonsError) {
      await db.from("timetable_version").delete().eq("id", versionId);
      return NextResponse.json(
        { error: `Could not save the generated lessons: ${lessonsError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    versionId,
    status: result.status,
    objective: result.objective,
    diagnostics: result.diagnostics,
    validation,
  });
}

function isLocked(input: SolverInput, lesson: SolverOutput["lessons"][number]): boolean {
  return (input.locked ?? []).some(
    (locked) =>
      locked.assignmentId === lesson.assignmentId &&
      locked.slotId === lesson.slotId &&
      locked.size === lesson.size,
  );
}

function normalizeResult(result: SolverOutput, input: SolverInput): SolverOutput {
  const assignmentIdByTriple = new Map(
    input.assignments.map((assignment) => [
      `${assignment.classId}|${assignment.subjectId}|${assignment.teacherId}`,
      assignment.id,
    ]),
  );

  return {
    ...result,
    lessons: result.lessons.map((lesson) => {
      if (lesson.assignmentId) return lesson;
      const assignmentId = assignmentIdByTriple.get(
        `${lesson.classId}|${lesson.subjectId}|${lesson.teacherId}`,
      );
      return assignmentId ? { ...lesson, assignmentId } : lesson;
    }),
  };
}
