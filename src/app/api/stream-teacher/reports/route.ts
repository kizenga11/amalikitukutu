import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  isAcademicYear,
  isUuid,
  loadScopedExamMarks,
  loadScopedExams,
  requireStreamTeacher,
  streamTeacherAdmin,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

interface ConductRow {
  student_id: string;
  conduct: string | null;
  remarks: string | null;
  source: string;
  updated_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const streamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    const term = parseTerm(request.nextUrl.searchParams.get("term"));
    const examId = request.nextUrl.searchParams.get("examId") ?? "";
    if (!isUuid(streamId) || !isAcademicYear(year) || !term) {
      return NextResponse.json({ error: "Select a stream, academic year and term." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const exams = await loadScopedExams(access.assignment.class_id);
    const data = examId && isUuid(examId) ? await loadScopedExamMarks(access.assignment, examId) : null;

    const studentIds = data?.classRow.students.map((student) => student.student_id) ?? [];
    const conduct: Record<string, { conduct: string; remarks: string; source: string; updated_at: string | null }> = {};

    if (studentIds.length > 0) {
      const { data: conductData, error } = await streamTeacherAdmin
        .from("student_conduct")
        .select("student_id, conduct, remarks, source, updated_at")
        .eq("academic_year_id", year)
        .eq("term", term)
        .in("student_id", studentIds);
      if (error) throw error;
      for (const row of (conductData ?? []) as ConductRow[]) {
        conduct[row.student_id] = {
          conduct: row.conduct ?? "",
          remarks: row.remarks ?? "",
          source: row.source ?? "manual",
          updated_at: row.updated_at ?? null,
        };
      }
    }

    return NextResponse.json({
      term,
      stream: {
        id: access.assignment.stream_id,
        name: access.assignment.stream_name,
        class_id: access.assignment.class_id,
        class_name: access.assignment.class_name,
      },
      exams,
      data,
      conduct,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load stream reports.") }, { status: 500 });
  }
}
