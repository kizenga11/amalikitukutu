import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  isAcademicYear,
  isUuid,
  loadScopedExamMarks,
  loadScopedExams,
  requireStreamTeacher,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const streamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    const examId = request.nextUrl.searchParams.get("examId") ?? "";
    if (!isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a stream and an academic year." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const exams = await loadScopedExams(access.assignment.class_id, year);
    if (!examId) {
      return NextResponse.json({
        stream: {
          id: access.assignment.stream_id,
          name: access.assignment.stream_name,
          class_id: access.assignment.class_id,
          class_name: access.assignment.class_name,
        },
        exams,
        data: null,
      });
    }

    if (!isUuid(examId)) {
      return NextResponse.json({ error: "Select a valid exam." }, { status: 400 });
    }

    const data = await loadScopedExamMarks(access.assignment, examId);
    if (!data) {
      return NextResponse.json({ error: "That exam is not available for your stream." }, { status: 404 });
    }

    return NextResponse.json({
      stream: {
        id: access.assignment.stream_id,
        name: access.assignment.stream_name,
        class_id: access.assignment.class_id,
        class_name: access.assignment.class_name,
      },
      exams,
      data,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load stream results.") }, { status: 500 });
  }
}
