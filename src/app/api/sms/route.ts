import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/errors";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  type ClassResults,
  type ClassStudentsInput,
  type CompetencyThreshold,
  type DivisionRange,
  type GradeBoundary,
  type StudentReportRow,
} from "@/lib/grading";
import { normalizePhone, sendSmsBatch, smsConfigured, type SmsDispatchItem } from "@/lib/sms";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE_SIZE = 1000;

type AuthorizeResult =
  | { ok: true; userId: string; senderName: string }
  | { error: NextResponse };

async function authorize(request: NextRequest): Promise<AuthorizeResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Not authorized. Please sign in again." }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return { error: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) };
  }

  const metaRole = user.user_metadata?.role as string | undefined;
  let allowed = metaRole === "Headmaster" || metaRole === "Academic";
  if (!allowed) {
    const { data: staff } = await admin
      .from("staff")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    allowed = staff?.role === "Headmaster" || staff?.role === "Academic";
  }
  if (!allowed) {
    return { error: NextResponse.json({ error: "You do not have access to send SMS." }, { status: 403 }) };
  }

  const metaName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
  return { ok: true, userId: user.id, senderName: metaName || user.email || "Administrator" };
}

interface SmsRequestBody {
  action?: "results" | "custom";
  preview?: boolean;
  examId?: string;
  studentIds?: string[];
  classId?: string;
  streamId?: string;
  message?: string;
}

interface RawRecipient {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender?: string | null;
  phone: string | null;
  registration_no: string | null;
  class_id: string | null;
  stream_id: string | null;
}

const DEFAULT_SCHOOL_NAME = "KITUKUTU TECHNICAL";

interface RawMark {
  student_id: string;
  subject_id: string;
  theory_score: number | null;
  practical_score: number | null;
  is_absent: boolean | null;
}

interface RawSubjectRel {
  class_id: string;
  subject_id: string;
  subject: { code: string; name: string; has_practical: boolean }[] | { code: string; name: string; has_practical: boolean } | null;
}

interface RawClassRel {
  class_id: string;
  class: { name: string }[] | { name: string } | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fullName(row: RawRecipient): string {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function loadRecipients(body: SmsRequestBody): Promise<RawRecipient[]> {
  const columns = "id, first_name, middle_name, last_name, phone, registration_no, class_id, stream_id";

  if (Array.isArray(body.studentIds) && body.studentIds.length > 0) {
    const rows: RawRecipient[] = [];
    for (const batch of chunk(body.studentIds, 100)) {
      const { data, error } = await admin.from("students").select(columns).in("id", batch);
      if (error) throw error;
      rows.push(...((data ?? []) as RawRecipient[]));
    }
    return rows;
  }

  let query = admin.from("students").select(columns);
  if (body.classId) query = query.eq("class_id", body.classId);
  if (body.streamId) query = query.eq("stream_id", body.streamId);
  const { data, error } = await query.order("last_name").order("first_name");
  if (error) throw error;
  return (data ?? []) as RawRecipient[];
}

async function loadClassNames(): Promise<Map<string, string>> {
  const { data, error } = await admin.from("school_classes").select("id, name");
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id as string, row.name as string]));
}

// Build a personalised result message per student for the given exam.
// Ranks are computed across ALL students who sat the exam (not just the
// recipients), so "nafasi" and "kati ya wanafunzi" stay correct even when only
// a subset of parents is messaged.
async function buildResultsMessages(examId: string): Promise<{ messages: Map<string, string>; total: number; examName: string }> {
  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("id, name, status")
    .eq("id", examId)
    .maybeSingle();
  if (examError) throw examError;
  if (!exam) throw new Error("Mtihani haupo.");
  if (exam.status === "draft") throw new Error("Matokeo ya mtihani huu bado hayajakamilika.");

  const classRels = await admin
    .from("exam_classes")
    .select("class_id, class:school_classes(name)")
    .eq("exam_id", examId);
  if (classRels.error) throw classRels.error;

  const classNames = new Map<string, string>();
  for (const row of (classRels.data ?? []) as unknown as RawClassRel[]) {
    const name = Array.isArray(row.class) ? row.class[0] : row.class;
    classNames.set(row.class_id, name?.name ?? "—");
  }
  const classIds = Array.from(classNames.keys());
  if (classIds.length === 0) return { messages: new Map(), total: 0 };

  const [subjectRels, settingsRes] = await Promise.all([
    admin
      .from("exam_class_subjects")
      .select("class_id, subject_id, subject:subjects(code, name, has_practical)")
      .eq("exam_id", examId)
      .in("class_id", classIds),
    admin
      .from("academic_settings")
      .select("key, value")
      .in("key", ["grade_boundaries", "division_ranges", "competency_thresholds", "school_name"]),
  ]);
  if (subjectRels.error) throw subjectRels.error;
  if (settingsRes.error) throw settingsRes.error;

  const subjectByClass = new Map<string, { id: string; code: string; name: string; has_practical: boolean }[]>();
  for (const row of (subjectRels.data ?? []) as unknown as RawSubjectRel[]) {
    const s = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const list = subjectByClass.get(row.class_id) ?? [];
    list.push({ id: row.subject_id, code: s?.code ?? "", name: s?.name ?? "Unknown", has_practical: s?.has_practical ?? false });
    subjectByClass.set(row.class_id, list);
  }

  const settingsMap = new Map<string, string>();
  for (const row of settingsRes.data ?? []) settingsMap.set(row.key as string, row.value as string);
  const gradeBoundaries = parseJson<GradeBoundary[]>(settingsMap.get("grade_boundaries"), DEFAULT_GRADE_BOUNDARIES);
  const divisionRanges = parseJson<DivisionRange[]>(settingsMap.get("division_ranges"), DEFAULT_DIVISION_RANGES);
  const competencyThresholds = parseJson<CompetencyThreshold[]>(settingsMap.get("competency_thresholds"), DEFAULT_COMPETENCY_THRESHOLDS);
  const schoolName = (settingsMap.get("school_name") ?? "").trim() || DEFAULT_SCHOOL_NAME;

  // Every student who sat the exam — the ranking population.
  const students: RawRecipient[] = [];
  for (const batch of chunk(classIds, 50)) {
    const { data, error } = await admin
      .from("students")
      .select("id, first_name, middle_name, last_name, gender, phone, registration_no, class_id, stream_id")
      .in("class_id", batch)
      .order("last_name");
    if (error) throw error;
    students.push(...((data ?? []) as RawRecipient[]));
  }
  const studentIds = students.map((row) => row.id);

  const [subjectLinks, markRows] = await Promise.all([
    (async () => {
      const links: { student_id: string; subject_id: string }[] = [];
      for (const batch of chunk(studentIds, 100)) {
        const { data, error } = await admin.from("student_subjects").select("student_id, subject_id").in("student_id", batch);
        if (error) throw error;
        links.push(...((data ?? []) as { student_id: string; subject_id: string }[]));
      }
      return links;
    })(),
    fetchAllRows<RawMark>((from, to) =>
      admin
        .from("exam_marks")
        .select("student_id, subject_id, theory_score, practical_score, is_absent")
        .eq("exam_id", examId)
        .in("class_id", classIds)
        .order("id")
        .range(from, to),
    ),
  ]);

  const studentSubjects = new Map<string, Set<string>>();
  for (const row of subjectLinks) {
    const set = studentSubjects.get(row.student_id) ?? new Set<string>();
    set.add(row.subject_id);
    studentSubjects.set(row.student_id, set);
  }

  const marks: Record<string, { theory: number | null; practical: number | null; is_absent: boolean }> = {};
  for (const row of markRows) {
    marks[`${row.student_id}|${row.subject_id}`] = {
      theory: row.theory_score !== null ? Number(row.theory_score) : null,
      practical: row.practical_score !== null ? Number(row.practical_score) : null,
      is_absent: row.is_absent ?? false,
    };
  }

  const classes: ClassResults[] = Array.from(classNames.entries()).map(([classId, className]) => {
    const classStudents: ClassStudentsInput[] = students
      .filter((row) => row.class_id === classId)
      .map((row) => ({
        student_id: row.id,
        first_name: row.first_name,
        middle_name: row.middle_name,
        last_name: row.last_name,
        gender: row.gender ?? "",
        stream_id: row.stream_id,
        stream_name: "",
        subjects: Array.from(studentSubjects.get(row.id) ?? []),
      }));
    return buildClassResults(
      { class_id: classId, class_name: className, subjects: subjectByClass.get(classId) ?? [], students: classStudents },
      marks,
      gradeBoundaries,
      divisionRanges,
    );
  });

  const report = buildSchoolReport(classes, { gradeBoundaries, divisionRanges, competencyThresholds });
  const total = report.students.length;

  const messages = new Map<string, string>();
  for (const row of report.students) {
    messages.set(row.student.student_id, buildResultMessage(row, exam.name as string, schoolName, total));
  }
  return { messages, total, examName: (exam.name as string) ?? "" };
}

function buildResultMessage(row: StudentReportRow, examName: string, schoolName: string, totalStudents: number): string {
  const name = [row.student.first_name, row.student.middle_name, row.student.last_name].filter(Boolean).join(" ");
  const avg = row.avg === null ? "—" : `${formatScore(row.avg)}%`;
  const rank = row.rank > 0 ? String(row.rank) : "—";
  const division = row.divisionCode;
  const points = row.student.total_points === null ? "—" : String(row.student.total_points);
  return `${schoolName}: Habari, Matokeo ya ${examName}: ${name} ameshika nafasi ya ${rank} kati ya wanafunzi ${totalStudents}, wastani wa ${avg}, DIV ${division}, Points ${points}, Asante`;
}

function renderCustomMessage(template: string, row: RawRecipient, className: string): string {
  return template
    .replace(/\{jina\}/gi, row.first_name)
    .replace(/\{jina_kamili\}/gi, fullName(row))
    .replace(/\{regno\}/gi, row.registration_no ?? "")
    .replace(/\{darasa\}/gi, className);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ok: true, configured: smsConfigured() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  let body: SmsRequestBody;
  try {
    body = (await request.json()) as SmsRequestBody;
  } catch {
    return NextResponse.json({ error: "Ombi si sahihi." }, { status: 400 });
  }

  const action = body.action === "custom" ? "custom" : "results";

  try {
    const recipients = await loadRecipients(body);
    if (recipients.length === 0) {
      if (body.preview) return NextResponse.json({ ok: true, examples: [] });
      return NextResponse.json({ ok: true, summary: { total: 0, sent: 0, failed: 0, skipped: 0 }, results: [], skipped: [] });
    }

    let messageById: Map<string, string>;
    let examName = "";
    if (action === "results") {
      if (!body.examId) {
        return NextResponse.json({ error: "Chagua mtihani kwanza." }, { status: 400 });
      }
      const built = await buildResultsMessages(body.examId);
      messageById = built.messages;
      examName = built.examName;
    } else {
      const template = (body.message ?? "").trim();
      if (!template) {
        return NextResponse.json({ error: "Andika ujumbe kwanza." }, { status: 400 });
      }
      if (template.length > 600) {
        return NextResponse.json({ error: "Ujumbe ni mrefu mno (kiwango cha juu ni herufi 600)." }, { status: 400 });
      }
      const classNames = await loadClassNames();
      messageById = new Map(
        recipients.map((row) => [row.id, renderCustomMessage(template, row, classNames.get(row.class_id ?? "") ?? "—")]),
      );
    }

    // Preview: return a couple of sample rendered messages without sending.
    if (body.preview) {
      const examples = recipients
        .map((row) => ({
          name: fullName(row),
          phone: normalizePhone(row.phone) ?? row.phone ?? "",
          message: messageById.get(row.id) ?? "",
        }))
        .filter((example) => example.message)
        .slice(0, 2);
      return NextResponse.json({ ok: true, examples });
    }

    if (!smsConfigured()) {
      return NextResponse.json(
        { error: "SMS gateway haijasanidiwa. Weka AFRICASTALKING_USERNAME na AFRICASTALKING_API_KEY kwenye .env.local." },
        { status: 503 },
      );
    }

    const nameById = new Map(recipients.map((row) => [row.id, fullName(row)]));
    const items: SmsDispatchItem[] = [];
    const skipped: { student_id: string; name: string; phone: string | null; reason: string }[] = [];

    for (const row of recipients) {
      const phone = normalizePhone(row.phone);
      if (!phone) {
        skipped.push({ student_id: row.id, name: fullName(row), phone: row.phone, reason: "no-phone" });
        continue;
      }
      const message = messageById.get(row.id);
      if (!message) {
        skipped.push({ student_id: row.id, name: fullName(row), phone, reason: "no-result" });
        continue;
      }
      items.push({ phone, message, ref: row.id });
    }

    const dispatched = await sendSmsBatch(items, { concurrency: 5 });
    const byRef = new Map(dispatched.map((d) => [d.ref ?? "", d]));

    const results = items.map((item) => {
      const d = byRef.get(item.ref ?? "");
      return {
        student_id: item.ref,
        name: nameById.get(item.ref ?? "") ?? "—",
        phone: item.phone,
        ok: d?.ok ?? false,
        status: d?.status ?? "Unknown",
        messageId: d?.messageId ?? null,
        error: d?.error ?? null,
      };
    });

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    // Best-effort audit trail: never fail the send because logging failed.
    const campaignId = crypto.randomUUID();
    try {
      const base = {
        campaign_id: campaignId,
        kind: action,
        exam_id: action === "results" ? (body.examId ?? null) : null,
        exam_name: examName || null,
        sender_id: auth.userId,
        sender_name: auth.senderName,
      };
      const logRows = [
        ...results.map((r) => ({
          ...base,
          message: messageById.get(r.student_id ?? "") ?? "",
          student_id: r.student_id,
          recipient_name: r.name,
          phone: r.phone,
          status: r.ok ? "sent" : "failed",
          detail: r.ok ? (r.status ?? null) : (r.error ?? r.status ?? null),
          message_id: r.messageId,
        })),
        ...skipped.map((s) => ({
          ...base,
          message: "",
          student_id: s.student_id,
          recipient_name: s.name,
          phone: s.phone,
          status: "skipped",
          detail: s.reason,
          message_id: null,
        })),
      ];
      for (const batch of chunk(logRows, 500)) {
        const { error } = await admin.from("sms_logs").insert(batch);
        if (error) throw error;
      }
    } catch {
      // ignore logging failure
    }

    return NextResponse.json({
      ok: true,
      campaignId,
      summary: { total: recipients.length, sent, failed, skipped: skipped.length },
      results,
      skipped,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Imeshindikana kutuma SMS.") }, { status: 500 });
  }
}
