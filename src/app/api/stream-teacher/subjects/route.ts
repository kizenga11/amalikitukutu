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

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  subject_type: string;
  has_practical: boolean;
  stream: string;
}

function displayName(row: { first_name?: string | null; last_name?: string | null; name?: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.name || "Teacher";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const streamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    if (!isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a stream and an academic year." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const streamName = access.assignment.stream_name;
    const [subjectsRes, assignmentsRes] = await Promise.all([
      streamTeacherAdmin
        .from("subjects")
        .select("id, code, name, subject_type, has_practical, stream")
        .in("stream", ["Both", streamName])
        .order("name"),
      streamTeacherAdmin
        .from("teaching_assignments")
        .select("subject_id, teacher:staff!teaching_assignments_teacher_id_fkey(id, first_name, last_name, name)")
        .eq("class_id", access.assignment.class_id)
        .eq("stream_id", streamId)
        .eq("academic_year", year),
    ]);

    if (subjectsRes.error) throw subjectsRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    const teachersBySubject = new Map<string, { id: string; name: string }[]>();
    for (const row of (assignmentsRes.data ?? []) as unknown as {
      subject_id: string;
      teacher:
        | { id: string; first_name: string | null; last_name: string | null; name: string | null }
        | { id: string; first_name: string | null; last_name: string | null; name: string | null }[]
        | null;
    }[]) {
      const teacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
      if (!teacher) continue;
      const list = teachersBySubject.get(row.subject_id) ?? [];
      list.push({ id: teacher.id, name: displayName(teacher) });
      teachersBySubject.set(row.subject_id, list);
    }

    const subjects = ((subjectsRes.data ?? []) as SubjectRow[]).map((row) => ({
      ...row,
      teachers: teachersBySubject.get(row.id) ?? [],
      canEdit: row.stream === streamName,
    }));

    return NextResponse.json({
      stream: {
        id: access.assignment.stream_id,
        name: access.assignment.stream_name,
        class_id: access.assignment.class_id,
        class_name: access.assignment.class_name,
      },
      subjects,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load stream subjects.") }, { status: 500 });
  }
}

function subjectStream(streamName: string): "General" | "Vocational" | "Both" {
  return streamName === "General" || streamName === "Vocational" ? streamName : "Both";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    streamId?: unknown;
    academicYearId?: unknown;
    code?: unknown;
    name?: unknown;
    subject_type?: unknown;
    has_practical?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const streamId = body.streamId;
    const year = body.academicYearId;
    if (!isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a stream and an academic year." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const stream = subjectStream(access.assignment.stream_name);
    if (stream === "Both") {
      return NextResponse.json({ error: "This stream cannot own its own subjects." }, { status: 400 });
    }

    const code = cleanText(body.code, 20).toUpperCase();
    const name = cleanText(body.name, 120);
    const subjectType = cleanText(body.subject_type, 20);
    if (!code || !name) {
      return NextResponse.json({ error: "Subject code and name are required." }, { status: 400 });
    }
    if (subjectType !== "Compulsory" && subjectType !== "Optional") {
      return NextResponse.json({ error: "Select a valid subject type." }, { status: 400 });
    }

    const { data, error } = await streamTeacherAdmin
      .from("subjects")
      .insert({
        code,
        name,
        subject_type: subjectType,
        has_practical: Boolean(body.has_practical),
        stream,
      })
      .select("id, code, name, subject_type, has_practical, stream")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, subject: { ...data, teachers: [], canEdit: true } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not add the subject.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: {
    id?: unknown;
    streamId?: unknown;
    academicYearId?: unknown;
    code?: unknown;
    name?: unknown;
    subject_type?: unknown;
    has_practical?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const id = body.id;
    const streamId = body.streamId;
    const year = body.academicYearId;
    if (!isUuid(id) || !isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a valid subject and stream." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const { data: subject, error: subjectError } = await streamTeacherAdmin
      .from("subjects")
      .select("id, stream")
      .eq("id", id)
      .maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject || subject.stream !== access.assignment.stream_name) {
      return NextResponse.json({ error: "You can only edit subjects owned by your stream." }, { status: 403 });
    }

    const code = cleanText(body.code, 20).toUpperCase();
    const name = cleanText(body.name, 120);
    const subjectType = cleanText(body.subject_type, 20);
    if (!code || !name) {
      return NextResponse.json({ error: "Subject code and name are required." }, { status: 400 });
    }
    if (subjectType !== "Compulsory" && subjectType !== "Optional") {
      return NextResponse.json({ error: "Select a valid subject type." }, { status: 400 });
    }

    const { data, error } = await streamTeacherAdmin
      .from("subjects")
      .update({
        code,
        name,
        subject_type: subjectType,
        has_practical: Boolean(body.has_practical),
      })
      .eq("id", id)
      .select("id, code, name, subject_type, has_practical, stream")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, subject: { ...data, teachers: [], canEdit: true } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update the subject.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const streamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    if (!isUuid(id) || !isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a valid subject and stream." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const { data: subject, error: subjectError } = await streamTeacherAdmin
      .from("subjects")
      .select("id, stream")
      .eq("id", id)
      .maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject || subject.stream !== access.assignment.stream_name) {
      return NextResponse.json({ error: "You can only delete subjects owned by your stream." }, { status: 403 });
    }

    const { error } = await streamTeacherAdmin.from("subjects").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete the subject.") }, { status: 500 });
  }
}
