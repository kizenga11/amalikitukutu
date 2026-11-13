import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { sanitizeRequirementList } from "@/lib/report-requirements";
import {
  isAcademicYear,
  isUuid,
  requireStreamTeacher,
  streamTeacherAdmin,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

type Ratings = (number | null)[];

interface ReportSettings {
  schoolClosed: boolean;
  closingDate: string;
  openingDate: string;
  examId: string;
  behavior: Record<string, Ratings>;
  requirements: string[];
}

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

function parseDate(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function parseBehavior(value: unknown): Record<string, Ratings> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) return null;

  const behavior: Record<string, Ratings> = {};
  for (const [studentId, rawRatings] of entries) {
    if (!isUuid(studentId) || !Array.isArray(rawRatings)) return null;
    behavior[studentId] = Array.from({ length: 8 }, (_, index) => {
      const rating = rawRatings[index];
      return typeof rating === "number" && Number.isInteger(rating) && rating >= 0 && rating <= 3
        ? rating
        : null;
    });
  }
  return behavior;
}

function parseSettings(value: unknown): ReportSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const behavior = parseBehavior(raw.behavior);
  if (!behavior) return null;
  const requirements = sanitizeRequirementList(raw.requirements);
  if (!requirements) return null;

  return {
    schoolClosed: raw.schoolClosed === true,
    closingDate: parseDate(raw.closingDate),
    openingDate: parseDate(raw.openingDate),
    examId: isUuid(raw.examId) ? raw.examId : "",
    behavior,
    requirements,
  };
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

    const { data, error } = await streamTeacherAdmin
      .from("stream_report_settings")
      .select("settings, updated_at")
      .eq("teacher_id", access.staff.id)
      .eq("stream_id", streamId)
      .eq("academic_year_id", year)
      .eq("term", term)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      settings: data?.settings ? parseSettings(data.settings) ?? data.settings : null,
      updated_at: data?.updated_at ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load report settings.") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: {
    streamId?: unknown;
    academicYearId?: unknown;
    term?: unknown;
    settings?: unknown;
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
    const settings = parseSettings(body.settings);
    if (!isUuid(streamId) || !isAcademicYear(year) || !term || !settings) {
      return NextResponse.json({ error: "Report settings are invalid." }, { status: 400 });
    }

    const access = await requireStreamTeacher(request, streamId, year);
    if (!access.ok) return access.response;

    const studentIds = Object.keys(settings.behavior);
    if (studentIds.length > 0) {
      const { data: allowed, error: allowedError } = await streamTeacherAdmin
        .from("students")
        .select("id")
        .eq("class_id", access.assignment.class_id)
        .eq("stream_id", streamId)
        .in("id", studentIds);
      if (allowedError) throw allowedError;
      const allowedIds = new Set((allowed ?? []).map((row) => String((row as { id: unknown }).id)));
      for (const studentId of studentIds) {
        if (!allowedIds.has(studentId)) delete settings.behavior[studentId];
      }
    }

    const { data, error } = await streamTeacherAdmin
      .from("stream_report_settings")
      .upsert(
        {
          teacher_id: access.staff.id,
          stream_id: streamId,
          academic_year_id: year,
          term,
          settings,
        },
        { onConflict: "teacher_id,stream_id,academic_year_id,term" },
      )
      .select("settings, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      settings: data?.settings ?? settings,
      updated_at: data?.updated_at ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not save report settings.") }, { status: 500 });
  }
}
