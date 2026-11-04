import { NextRequest, NextResponse } from "next/server";
import { currentYearId } from "@/lib/calendar";
import { errorMessage } from "@/lib/errors";
import {
  isAcademicYear,
  isUuid,
  loadAssignments,
  requireAdmin,
  streamTeacherAdmin,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

interface StreamRow {
  id: string;
  class_id: string;
  name: string;
  class: { name: string; form_level: number } | { name: string; form_level: number }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const year = request.nextUrl.searchParams.get("year")?.trim() || currentYearId;
    if (!isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a valid academic year." }, { status: 400 });
    }

    const [streamsRes, teachersRes, assignments] = await Promise.all([
      streamTeacherAdmin
        .from("streams")
        .select("id, class_id, name, class:school_classes(name, form_level)")
        .order("class_id"),
      streamTeacherAdmin
        .from("staff")
        .select("id, first_name, last_name, name, role")
        .eq("role", "Teacher")
        .order("last_name"),
      loadAssignments(undefined, year),
    ]);

    if (streamsRes.error) throw streamsRes.error;
    if (teachersRes.error) throw teachersRes.error;

    const streams = ((streamsRes.data ?? []) as unknown as StreamRow[])
      .map((row) => {
        const cls = firstRelation(row.class);
        return {
          id: row.id,
          class_id: row.class_id,
          name: row.name,
          class_name: cls?.name ?? "",
          form_level: cls?.form_level ?? 0,
        };
      })
      .sort((a, b) => a.form_level - b.form_level || a.name.localeCompare(b.name));

    const teachers = ((teachersRes.data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      name: string | null;
      role: string;
    }[]).map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.name || "Teacher",
    }));

    return NextResponse.json({ year, streams, teachers, assignments });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load stream teachers.") }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { streamId?: unknown; teacherId?: unknown; academicYearId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const streamId = body.streamId;
    const teacherId = body.teacherId;
    const year = body.academicYearId;

    if (!isUuid(streamId) || !isUuid(teacherId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a stream, a teacher and an academic year." }, { status: 400 });
    }

    const [streamRes, teacherRes] = await Promise.all([
      streamTeacherAdmin.from("streams").select("id, class_id, name").eq("id", streamId).maybeSingle(),
      streamTeacherAdmin.from("staff").select("id, role, first_name, last_name, name").eq("id", teacherId).maybeSingle(),
    ]);

    if (streamRes.error) throw streamRes.error;
    if (teacherRes.error) throw teacherRes.error;
    if (!streamRes.data) return NextResponse.json({ error: "The selected stream was not found." }, { status: 404 });
    if (!teacherRes.data) return NextResponse.json({ error: "The selected teacher was not found." }, { status: 404 });
    if (teacherRes.data.role !== "Teacher") {
      return NextResponse.json({ error: "Only a Teacher can be assigned as a stream teacher." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await streamTeacherAdmin
      .from("stream_teachers")
      .select("id")
      .eq("stream_id", streamId)
      .eq("academic_year_id", year)
      .eq("is_active", true)
      .maybeSingle();
    if (existingError) throw existingError;

    const payload = {
      teacher_id: teacherId,
      stream_id: streamId,
      academic_year_id: year,
      assigned_by: auth.staff?.id ?? null,
      assigned_at: new Date().toISOString(),
      is_active: true,
    };

    if (existing?.id) {
      const { error } = await streamTeacherAdmin
        .from("stream_teachers")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await streamTeacherAdmin.from("stream_teachers").insert(payload);
      if (error) throw error;
    }

    const assignments = await loadAssignments(undefined, year);
    return NextResponse.json({ ok: true, assignments });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save the stream teacher.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const streamId = request.nextUrl.searchParams.get("streamId");
    const year = request.nextUrl.searchParams.get("year")?.trim() || "";
    if (!isUuid(streamId) || !isAcademicYear(year)) {
      return NextResponse.json({ error: "Select a stream and an academic year." }, { status: 400 });
    }

    const { error } = await streamTeacherAdmin
      .from("stream_teachers")
      .update({ is_active: false })
      .eq("stream_id", streamId)
      .eq("academic_year_id", year)
      .eq("is_active", true);
    if (error) throw error;

    const assignments = await loadAssignments(undefined, year);
    return NextResponse.json({ ok: true, assignments });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not remove the stream teacher.") }, { status: 500 });
  }
}
