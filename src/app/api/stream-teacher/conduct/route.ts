import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  cleanText,
  isAcademicYear,
  isUuid,
  requireStreamTeacher,
  streamTeacherAdmin,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

interface StudentRow {
  id: string;
  registration_no: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
}

interface ConductRow {
  student_id: string;
  conduct: string | null;
  remarks: string | null;
  source: string;
  updated_at: string;
}

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const streamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    const term = parseTerm(request.nextUrl.searchParams.get("term"));
    if (!isUuid(streamId) || !isAcademicYear(year) || !term) {
      return NextResponse.json({ error: "Select a stream, academic year and term." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const { data: studentData, error: studentError } = await streamTeacherAdmin
      .from("students")
      .select("id, registration_no, first_name, middle_name, last_name, gender")
      .eq("class_id", access.assignment.class_id)
      .eq("stream_id", streamId)
      .order("last_name")
      .order("first_name");
    if (studentError) throw studentError;

    const students = (studentData ?? []) as StudentRow[];
    const ids = students.map((student) => student.id);
    const conductByStudent = new Map<string, ConductRow>();

    if (ids.length > 0) {
      const { data: conductData, error: conductError } = await streamTeacherAdmin
        .from("student_conduct")
        .select("student_id, conduct, remarks, source, updated_at")
        .eq("academic_year_id", year)
        .eq("term", term)
        .in("student_id", ids);
      if (conductError) throw conductError;
      for (const row of (conductData ?? []) as ConductRow[]) {
        conductByStudent.set(row.student_id, row);
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
      students: students.map((student) => {
        const record = conductByStudent.get(student.id);
        return {
          ...student,
          conduct: record?.conduct ?? "",
          remarks: record?.remarks ?? "",
          source: record?.source ?? "manual",
          updated_at: record?.updated_at ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load conduct records.") }, { status: 500 });
  }
}

interface ConductEntry {
  studentId?: unknown;
  conduct?: unknown;
  remarks?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    streamId?: unknown;
    academicYearId?: unknown;
    term?: unknown;
    entries?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const streamId = body.streamId;
    const year = body.academicYearId;
    const term = parseTerm(body.term);
    if (!isUuid(streamId) || !isAcademicYear(year) || !term) {
      return NextResponse.json({ error: "Select a stream, academic year and term." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const rawEntries = Array.isArray(body.entries) ? (body.entries as ConductEntry[]) : [];
    if (rawEntries.length === 0 || rawEntries.length > 500) {
      return NextResponse.json({ error: "Provide between 1 and 500 conduct entries." }, { status: 400 });
    }

    const entries = rawEntries.map((entry) => ({
      studentId: entry.studentId,
      conduct: cleanText(entry.conduct, 80),
      remarks: cleanText(entry.remarks, 1000),
    }));

    if (entries.some((entry) => !isUuid(entry.studentId))) {
      return NextResponse.json({ error: "One or more students are invalid." }, { status: 400 });
    }

    const studentIds = Array.from(new Set(entries.map((entry) => entry.studentId as string)));
    const { data: allowed, error: allowedError } = await streamTeacherAdmin
      .from("students")
      .select("id")
      .eq("class_id", access.assignment.class_id)
      .eq("stream_id", streamId)
      .in("id", studentIds);
    if (allowedError) throw allowedError;
    if ((allowed ?? []).length !== studentIds.length) {
      return NextResponse.json({ error: "One or more students are not in your stream." }, { status: 403 });
    }

    const rows = entries.map((entry) => ({
      student_id: entry.studentId as string,
      term,
      academic_year_id: year,
      conduct: entry.conduct || null,
      remarks: entry.remarks || null,
      source: "manual",
      filled_by: access.staff.id,
    }));

    const { error } = await streamTeacherAdmin
      .from("student_conduct")
      .upsert(rows, { onConflict: "student_id,term,academic_year_id" });
    if (error) throw error;

    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save conduct records.") }, { status: 500 });
  }
}
