import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { sanitizeRequirementList } from "@/lib/report-requirements";
import {
  authenticate,
  isAcademicYear,
  isUuid,
  requireStreamTeacher,
  streamTeacherAdmin,
  type StaffRole,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

const ADMIN_WRITE_ROLES: StaffRole[] = ["Headmaster", "Academic"];

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

interface ExistingSettingsRow {
  stream_id: string;
  settings: unknown;
}

/**
 * Saves the shared "Mahitaji ya Mwanafunzi" list for a class/term.
 *
 * A stream teacher writes the list to their own stream. The Headmaster and
 * Academic Officer can write the list to every stream of the selected class so
 * it appears on all student reports. Existing settings (behaviour ticks) are
 * merged per stream so they are never overwritten by a requirements-only save.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: {
    classId?: unknown;
    streamId?: unknown;
    year?: unknown;
    academicYearId?: unknown;
    term?: unknown;
    requirements?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const classId = body.classId;
    const rawStreamId = body.streamId;
    const year = body.year ?? body.academicYearId;
    const term = parseTerm(body.term);
    const requirements = sanitizeRequirementList(body.requirements);
    if (!isUuid(classId) || !isAcademicYear(year) || !term || requirements === null) {
      return NextResponse.json({ error: "Requirements are invalid." }, { status: 400 });
    }
    const requestedStreamId =
      rawStreamId === undefined || rawStreamId === null || rawStreamId === ""
        ? ""
        : isUuid(rawStreamId)
          ? rawStreamId
          : null;
    if (requestedStreamId === null) {
      return NextResponse.json({ error: "Requirements are invalid." }, { status: 400 });
    }

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;

    let streamIds: string[] = [];
    let teacherId = "";

    if (auth.role === "Teacher") {
      if (!requestedStreamId) {
        return NextResponse.json({ error: "Select a stream to save requirements." }, { status: 400 });
      }
      const access = await requireStreamTeacher(request, requestedStreamId, year);
      if (!access.ok) return access.response;
      if (access.assignment.class_id !== classId) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
      streamIds = [requestedStreamId];
      teacherId = access.staff.id;
    } else if (ADMIN_WRITE_ROLES.includes(auth.role)) {
      if (!auth.staff) {
        return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
      }
      teacherId = auth.staff.id;
      const { data: streamRows, error: streamError } = await streamTeacherAdmin
        .from("streams")
        .select("id")
        .eq("class_id", classId);
      if (streamError) throw streamError;
      streamIds = (streamRows ?? []).map((row) => String((row as { id: unknown }).id));
      if (requestedStreamId) {
        if (!streamIds.includes(requestedStreamId)) {
          return NextResponse.json({ error: "Stream not found in this class." }, { status: 404 });
        }
        streamIds = [requestedStreamId];
      }
    } else {
      return NextResponse.json({ error: "You cannot edit student requirements." }, { status: 403 });
    }

    if (streamIds.length === 0) {
      return NextResponse.json({ ok: true, requirements });
    }

    const { data: existingRows, error: existingError } = await streamTeacherAdmin
      .from("stream_report_settings")
      .select("stream_id, settings")
      .eq("teacher_id", teacherId)
      .eq("academic_year_id", year)
      .eq("term", term)
      .in("stream_id", streamIds);
    if (existingError) throw existingError;

    const settingsByStream = new Map<string, Record<string, unknown>>();
    for (const row of (existingRows ?? []) as unknown as ExistingSettingsRow[]) {
      const raw = row.settings;
      settingsByStream.set(
        row.stream_id,
        raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {},
      );
    }

    const { error } = await streamTeacherAdmin
      .from("stream_report_settings")
      .upsert(
        streamIds.map((streamId) => ({
          teacher_id: teacherId,
          stream_id: streamId,
          academic_year_id: year,
          term,
          settings: { ...(settingsByStream.get(streamId) ?? {}), requirements },
        })),
        { onConflict: "teacher_id,stream_id,academic_year_id,term" },
      );
    if (error) throw error;

    return NextResponse.json({ ok: true, requirements });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not save requirements.") },
      { status: 500 },
    );
  }
}
