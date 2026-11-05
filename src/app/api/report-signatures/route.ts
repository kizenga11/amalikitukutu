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

const SIGNATURE_SELECT =
  "id, class_id, stream_id, academic_year_id, term, signer_role, staff_id, signer_name, signature_data, updated_at";
const MAX_SIGNATURE_LENGTH = 600000;
const ADMIN_READ_ROLES: StaffRole[] = ["Headmaster", "Academic", "District Officer"];

type SignerRole = "Academic" | "StreamTeacher" | "Headmaster";

interface SignatureScope {
  classId: string;
  streamId: string | null;
  year: string;
  term: 1 | 2;
}

function parseTerm(value: unknown): 1 | 2 | null {
  const term = Number(value);
  return term === 1 || term === 2 ? term : null;
}

function signatureScope(
  classId: unknown,
  streamId: unknown,
  year: unknown,
  term: unknown,
): SignatureScope | null {
  if (!isUuid(classId) || !isAcademicYear(year)) return null;
  const parsedTerm = parseTerm(term);
  if (!parsedTerm) return null;
  if (streamId !== undefined && streamId !== null && streamId !== "" && !isUuid(streamId)) return null;
  return {
    classId,
    streamId: typeof streamId === "string" && streamId ? streamId : null,
    year,
    term: parsedTerm,
  };
}

function signerRoleFor(role: StaffRole): SignerRole | null {
  if (role === "Teacher") return "StreamTeacher";
  if (role === "Academic") return "Academic";
  if (role === "Headmaster") return "Headmaster";
  return null;
}

function parseSignatureData(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < 100 || text.length > MAX_SIGNATURE_LENGTH) return null;
  if (!text.startsWith("data:image/png;base64,")) return null;
  const base64 = text.slice("data:image/png;base64,".length);
  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
  try {
    if (Buffer.from(base64, "base64").length < 32) return null;
  } catch {
    return null;
  }
  return text;
}

async function classExists(classId: string): Promise<boolean> {
  const { data, error } = await streamTeacherAdmin
    .from("school_classes")
    .select("id")
    .eq("id", classId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function streamBelongsToClass(streamId: string, classId: string): Promise<boolean> {
  const { data, error } = await streamTeacherAdmin
    .from("streams")
    .select("id")
    .eq("id", streamId)
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const scope = signatureScope(
      request.nextUrl.searchParams.get("classId"),
      request.nextUrl.searchParams.get("streamId"),
      request.nextUrl.searchParams.get("year"),
      request.nextUrl.searchParams.get("term"),
    );
    if (!scope) {
      return NextResponse.json({ error: "Select a class, academic year and term." }, { status: 400 });
    }

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;

    if (auth.role === "Teacher") {
      if (!scope.streamId) {
        return NextResponse.json({ error: "Select a stream to load report signatures." }, { status: 400 });
      }
      const access = await requireStreamTeacher(request, scope.streamId, scope.year);
      if (!access.ok) return access.response;
      if (access.assignment.class_id !== scope.classId) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
    } else if (!ADMIN_READ_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: "You cannot view these signatures." }, { status: 403 });
    }

    if (!(await classExists(scope.classId))) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }
    if (scope.streamId && !(await streamBelongsToClass(scope.streamId, scope.classId))) {
      return NextResponse.json({ error: "Stream not found in this class." }, { status: 404 });
    }

    const { data, error } = await streamTeacherAdmin
      .from("report_signatures")
      .select(SIGNATURE_SELECT)
      .eq("class_id", scope.classId)
      .eq("academic_year_id", scope.year)
      .eq("term", scope.term)
      .order("updated_at", { ascending: true });
    if (error) throw error;

    const signatures = ((data ?? []) as { stream_id: string | null }[]).filter(
      (row) =>
        auth.role !== "Teacher" || row.stream_id === null || row.stream_id === scope.streamId,
    );

    return NextResponse.json({ signatures });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load report signatures.") },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: {
    classId?: unknown;
    streamId?: unknown;
    academicYearId?: unknown;
    term?: unknown;
    signatureData?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const scope = signatureScope(body.classId, body.streamId, body.academicYearId, body.term);
    const signatureData = parseSignatureData(body.signatureData);
    if (!scope || !signatureData) {
      return NextResponse.json({ error: "The signature is invalid." }, { status: 400 });
    }

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }

    const signerRole = signerRoleFor(auth.role);
    if (!signerRole) {
      return NextResponse.json({ error: "You cannot sign student reports." }, { status: 403 });
    }

    let scopeStreamId: string | null = null;
    if (signerRole === "StreamTeacher") {
      if (!scope.streamId) {
        return NextResponse.json({ error: "Select a stream before signing." }, { status: 400 });
      }
      const access = await requireStreamTeacher(request, scope.streamId, scope.year);
      if (!access.ok) return access.response;
      if (access.assignment.class_id !== scope.classId) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
      scopeStreamId = scope.streamId;
    } else {
      if (!(await classExists(scope.classId))) {
        return NextResponse.json({ error: "Class not found." }, { status: 404 });
      }
    }

    const baseQuery = streamTeacherAdmin
      .from("report_signatures")
      .select("id")
      .eq("class_id", scope.classId)
      .eq("academic_year_id", scope.year)
      .eq("term", scope.term)
      .eq("signer_role", signerRole);
    const existingQuery = scopeStreamId
      ? baseQuery.eq("stream_id", scopeStreamId)
      : baseQuery.is("stream_id", null);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;

    const fields = {
      class_id: scope.classId,
      stream_id: scopeStreamId,
      academic_year_id: scope.year,
      term: scope.term,
      signer_role: signerRole,
      staff_id: auth.staff.id,
      signer_name: auth.staff.name || auth.staff.email || "Staff",
      signature_data: signatureData,
    };

    const saved = existing
      ? await streamTeacherAdmin
          .from("report_signatures")
          .update(fields)
          .eq("id", existing.id)
          .select(SIGNATURE_SELECT)
          .single()
      : await streamTeacherAdmin
          .from("report_signatures")
          .insert(fields)
          .select(SIGNATURE_SELECT)
          .single();

    if (saved.error) throw saved.error;
    return NextResponse.json({ ok: true, signature: saved.data });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not save the signature.") },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const scope = signatureScope(
      request.nextUrl.searchParams.get("classId"),
      request.nextUrl.searchParams.get("streamId"),
      request.nextUrl.searchParams.get("year"),
      request.nextUrl.searchParams.get("term"),
    );
    if (!scope) {
      return NextResponse.json({ error: "Select a class, academic year and term." }, { status: 400 });
    }

    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    if (!auth.staff) {
      return NextResponse.json({ error: "This account is not linked to a staff profile." }, { status: 403 });
    }

    const signerRole = signerRoleFor(auth.role);
    if (!signerRole) {
      return NextResponse.json({ error: "You cannot clear student report signatures." }, { status: 403 });
    }

    let scopeStreamId: string | null = null;
    if (signerRole === "StreamTeacher") {
      if (!scope.streamId) {
        return NextResponse.json({ error: "Select a stream before clearing a signature." }, { status: 400 });
      }
      const access = await requireStreamTeacher(request, scope.streamId, scope.year);
      if (!access.ok) return access.response;
      if (access.assignment.class_id !== scope.classId) {
        return NextResponse.json({ error: "You are not assigned to this class." }, { status: 403 });
      }
      scopeStreamId = scope.streamId;
    }

    const baseQuery = streamTeacherAdmin
      .from("report_signatures")
      .delete()
      .eq("class_id", scope.classId)
      .eq("academic_year_id", scope.year)
      .eq("term", scope.term)
      .eq("signer_role", signerRole);
    const { error } = scopeStreamId
      ? await baseQuery.eq("stream_id", scopeStreamId)
      : await baseQuery.is("stream_id", null);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not clear the signature.") },
      { status: 500 },
    );
  }
}
