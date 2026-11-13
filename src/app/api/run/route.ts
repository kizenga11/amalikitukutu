import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { isPracticalQuestion } from "@/lib/assignments-shared";
import { byteLength } from "@/lib/code-errors";
import { IDE_RUN_ENABLED } from "@/lib/ide-config";
import {
  Judge0ConfigError,
  Judge0UnavailableError,
  MAX_CODE_BYTES,
  MAX_STDIN_BYTES,
  runCppSubmission,
} from "@/lib/judge0";
import { isUuid } from "@/lib/stream-teacher-server";
import { requireStudent, studentAdmin } from "@/lib/student-auth";
import {
  loadAccessibleAssignment,
  loadQuestionRows,
  loadSubmission,
} from "@/lib/student-assignments-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_RUNS_PER_MINUTE = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Kill switch: the IDE is write-only until NEXT_PUBLIC_IDE_RUN=on.
    if (!IDE_RUN_ENABLED) {
      return NextResponse.json(
        { error: "Kuendesha code hakujawashwa. Andika code yako na uiwasilishe." },
        { status: 503 },
      );
    }

    const session = await requireStudent(request);
    if (!session.ok) return session.response;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Ombi si sahihi." }, { status: 400 });
    }

    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : "";
    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    const code = typeof body.code === "string" ? body.code : "";
    const stdin = typeof body.stdin === "string" ? body.stdin : "";

    if (!isUuid(assignmentId) || !isUuid(questionId)) {
      return NextResponse.json({ error: "Ombi si sahihi." }, { status: 400 });
    }
    if (!code.trim()) {
      return NextResponse.json({ error: "Andika code kwanza." }, { status: 400 });
    }
    if (byteLength(code) > MAX_CODE_BYTES) {
      return NextResponse.json(
        { error: "Code ni ndefu mno. Kiwango ni 64KB." },
        { status: 413 },
      );
    }
    if (byteLength(stdin) > MAX_STDIN_BYTES) {
      return NextResponse.json(
        { error: "Input (stdin) ni ndefu mno. Kiwango ni 64KB." },
        { status: 413 },
      );
    }

    const assignment = await loadAccessibleAssignment(assignmentId, session.student);
    if (!assignment) {
      return NextResponse.json({ error: "Kazi haipatikani." }, { status: 404 });
    }

    const questions = await loadQuestionRows(assignment.id);
    const question = questions.find((row) => row.id === questionId);
    if (!question) {
      return NextResponse.json({ error: "Swali haipatikani." }, { status: 404 });
    }
    if (!isPracticalQuestion({ questionType: question.question_type, options: question.options })) {
      return NextResponse.json(
        { error: "Swali hili si la practical. Tumia jibu la maandishi." },
        { status: 400 },
      );
    }

    const existing = await loadSubmission(assignment.id, session.student.id);
    if (existing && (existing.status === "submitted" || existing.status === "marked")) {
      return NextResponse.json(
        { error: "Kazi hii imeshawasilishwa. Hauwezi kuendesha code tena." },
        { status: 409 },
      );
    }

    const deadlinePassed = assignment.deadline
      ? Date.now() > new Date(assignment.deadline).getTime()
      : false;
    if (deadlinePassed && !assignment.allow_late_submission) {
      return NextResponse.json(
        { error: "Muda wa kazi hii umekwisha. Hauwezi kuendesha code." },
        { status: 403 },
      );
    }

    // Database-backed rate limit: works across serverless instances.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error: countError } = await studentAdmin
      .from("code_runs")
      .select("id", { count: "exact", head: true })
      .eq("student_id", session.student.id)
      .gte("created_at", since);
    if (countError) throw countError;

    const used = count ?? 0;
    if (used >= MAX_RUNS_PER_MINUTE) {
      return NextResponse.json(
        {
          error: "Umezidi kiwango cha kuendesha code. Subiri dakika moja kisha ujaribu tena.",
          remaining: 0,
        },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    let result;
    try {
      result = await runCppSubmission({ code, stdin });
    } catch (error) {
      if (error instanceof Judge0ConfigError) {
        // Visible in the server logs (Vercel → Logs) so the administrator can
        // see exactly which variable is missing without exposing it to students.
        console.error(`[api/run] Judge0 not configured: ${error.message}`);
        return NextResponse.json(
          {
            error:
              "Huduma ya kuendesha code haijasanidiwa. Mwalimu au msimamizi wa mfumo aarifiwe.",
          },
          { status: 503 },
        );
      }
      if (error instanceof Judge0UnavailableError) {
        return NextResponse.json(
          {
            error:
              "Huduma ya kuendesha code haipatikani kwa sasa. Jaribu tena baadaye; code yako haijapotea.",
          },
          { status: 503 },
        );
      }
      throw error;
    }

    // Run log: never store the code, only the outcome needed for the limit.
    // Supabase resolves with { error } instead of throwing, so check it
    // explicitly; a logging failure must never break the student's run.
    const { error: logError } = await studentAdmin.from("code_runs").insert({
      student_id: session.student.id,
      assignment_id: assignment.id,
      question_id: question.id,
      status: result.status,
      status_id: result.statusId,
      time_seconds: result.time,
      memory_kb: result.memory,
    });
    if (logError) {
      console.error("code_runs insert failed:", logError.message);
    }

    return NextResponse.json({
      status: result.status,
      statusLabel: result.statusLabel,
      stdout: result.stdout,
      compileOutput: result.compileOutput,
      stderr: result.stderr,
      time: result.time,
      memory: result.memory,
      remaining: Math.max(0, MAX_RUNS_PER_MINUTE - used - 1),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
