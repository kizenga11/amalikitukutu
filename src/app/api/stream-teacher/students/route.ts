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
  phone: string | null;
  class_id: string | null;
  stream_id: string | null;
  stream: { name: string } | { name: string }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapStudent(row: StudentRow) {
  const stream = firstRelation(row.stream);
  return {
    id: row.id,
    registration_no: row.registration_no,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    gender: row.gender,
    phone: row.phone,
    class_id: row.class_id,
    stream_id: row.stream_id,
    stream_name: stream?.name ?? "",
  };
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

    const { data, error } = await streamTeacherAdmin
      .from("students")
      .select("id, registration_no, first_name, middle_name, last_name, gender, phone, class_id, stream_id, stream:streams(name)")
      .eq("class_id", access.assignment.class_id)
      .eq("stream_id", streamId)
      .eq("status", "Active")
      .order("last_name")
      .order("first_name");
    if (error) throw error;

    return NextResponse.json({
      stream: {
        id: access.assignment.stream_id,
        name: access.assignment.stream_name,
        class_id: access.assignment.class_id,
        class_name: access.assignment.class_name,
      },
      students: ((data ?? []) as unknown as StudentRow[]).map(mapStudent),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load stream students.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  let body: {
    id?: unknown;
    streamId?: unknown;
    academicYearId?: unknown;
    registration_no?: unknown;
    first_name?: unknown;
    middle_name?: unknown;
    last_name?: unknown;
    gender?: unknown;
    phone?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const streamId = body.streamId;
    const year = body.academicYearId;
    const id = body.id;
    if (!isUuid(streamId) || !isAcademicYear(year) || !isUuid(id)) {
      return NextResponse.json({ error: "Select a valid student and stream." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const firstName = cleanText(body.first_name, 80);
    const middleName = cleanText(body.middle_name, 80);
    const lastName = cleanText(body.last_name, 80);
    const gender = cleanText(body.gender, 10);
    const phone = cleanText(body.phone, 30);
    const registrationNo = cleanText(body.registration_no, 40);

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "First name and last name are required." }, { status: 400 });
    }
    if (gender !== "Male" && gender !== "Female") {
      return NextResponse.json({ error: "Select a valid gender." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await streamTeacherAdmin
      .from("students")
      .select("id")
      .eq("id", id)
      .eq("class_id", access.assignment.class_id)
      .eq("stream_id", streamId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: "That student is not in your stream." }, { status: 403 });
    }

    const { data, error } = await streamTeacherAdmin
      .from("students")
      .update({
        registration_no: registrationNo || null,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        gender,
        phone: phone || null,
      })
      .eq("id", id)
      .eq("stream_id", streamId)
      .select("id, registration_no, first_name, middle_name, last_name, gender, phone, class_id, stream_id, stream:streams(name)")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, student: mapStudent(data as unknown as StudentRow) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update the student.") }, { status: 500 });
  }
}
