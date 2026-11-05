import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  authenticate,
  isAcademicYear,
  isUuid,
  requireStreamTeacher,
  streamTeacherAdmin,
  type StaffRole,
} from "@/lib/stream-teacher-server";

export const dynamic = "force-dynamic";

type Ratings = (number | null)[];

interface SettingsRow {
  teacher_id?: string | null;
  stream_id: string;
  settings: { behavior?: unknown } | null;
  updated_at: string | null;
}

const ADMIN_READ_ROLES: StaffRole[] = ["Headmaster", "Academic", "District Officer"];
const RATING_COUNT = 8;

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

function sanitizeRatings(value: unknown): Ratings | null {
  if (!Array.isArray(value)) return null;
  return Array.from({ length: RATING_COUNT }, (_, index) => {
    const rating = value[index];
    return typeof rating === "number" && Number.isInteger(rating) && rating >= 0 && rating <= 3
      ? rating
      : null;
  });
}

function filledCount(ratings: Ratings): number {
  return ratings.filter((rating) => typeof rating === "number").length;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const classId = request.nextUrl.searchParams.get("classId") ?? "";
    const requestedStreamId = request.nextUrl.searchParams.get("streamId") ?? "";
    const year = request.nextUrl.searchParams.get("year") ?? "";
    const term = parseTerm(request.nextUrl.searchParams.get("term"));
    if (!isUuid(classId) || !isAcademicYear(year) || !term) {
      return NextResponse.json({ error: "Select a class, academic year and term." }, { status: 400 });
    }
    if (requestedStreamId && !isUuid(requestedStreamId)) {
      return NextResponse.json({ error: "Select a valid stream." }, { status: 400 });
    }

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;

    let streamIds: string[] = [];
    if (auth.role === "Teacher") {
      if (!requestedStreamId) {
        return NextResponse.json({ error: "Select a stream to load behaviour records." }, { status: 400 });
      }
      const access = await requireStreamTeacher(request, requestedStreamId, year);
      if (!access.ok) return access.response;
      if (access.assignment.class_id !== classId) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
      streamIds = [requestedStreamId];
    } else if (ADMIN_READ_ROLES.includes(auth.role)) {
      if (requestedStreamId) {
        const { data: streamRow, error: streamError } = await streamTeacherAdmin
          .from("streams")
          .select("id")
          .eq("id", requestedStreamId)
          .eq("class_id", classId)
          .maybeSingle();
        if (streamError) throw streamError;
        if (!streamRow) {
          return NextResponse.json({ error: "Stream not found in this class." }, { status: 404 });
        }
        streamIds = [requestedStreamId];
      } else {
        const { data: streamRows, error: streamError } = await streamTeacherAdmin
          .from("streams")
          .select("id")
          .eq("class_id", classId);
        if (streamError) throw streamError;
        streamIds = (streamRows ?? []).map((row) => String((row as { id: unknown }).id));
      }
    } else {
      return NextResponse.json({ error: "You cannot view behaviour records." }, { status: 403 });
    }

    if (streamIds.length === 0) {
      return NextResponse.json({ behavior: {} });
    }

    const { data, error } = await streamTeacherAdmin
      .from("stream_report_settings")
      .select("teacher_id, stream_id, settings, updated_at")
      .eq("academic_year_id", year)
      .eq("term", term)
      .in("stream_id", streamIds)
      .order("updated_at", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as unknown as SettingsRow[];
    if (rows.length === 0) {
      return NextResponse.json({ behavior: {} });
    }

    const behavior: Record<string, Ratings> = {};

    for (const row of rows) {
      const rawBehavior = row.settings?.behavior;
      if (!rawBehavior || typeof rawBehavior !== "object" || Array.isArray(rawBehavior)) continue;

      for (const [studentId, rawRatings] of Object.entries(rawBehavior as Record<string, unknown>)) {
        if (!isUuid(studentId)) continue;
        const ratings = sanitizeRatings(rawRatings);
        if (!ratings || filledCount(ratings) === 0) {
          delete behavior[studentId];
          continue;
        }
        behavior[studentId] = ratings;
      }
    }

    return NextResponse.json({ behavior });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load behaviour records.") },
      { status: 500 },
    );
  }
}