import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/errors";

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

type AuthorizeResult = { ok: true } | { error: NextResponse };

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
    const { data: staff } = await admin.from("staff").select("role").eq("auth_user_id", user.id).maybeSingle();
    allowed = staff?.role === "Headmaster" || staff?.role === "Academic";
  }
  if (!allowed) {
    return { error: NextResponse.json({ error: "You do not have access to SMS history." }, { status: 403 }) };
  }
  return { ok: true };
}

interface SmsLogRow {
  id: string;
  campaign_id: string;
  created_at: string;
  kind: string;
  exam_id: string | null;
  exam_name: string | null;
  message: string;
  student_id: string | null;
  recipient_name: string | null;
  phone: string | null;
  status: string;
  detail: string | null;
  message_id: string | null;
  sender_id: string | null;
  sender_name: string | null;
}

const FETCH_CAP = 4000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const campaignLimit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 30;
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  try {
    const { data, error } = await admin
      .from("sms_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);
    if (error) throw error;

    let rows = (data ?? []) as unknown as SmsLogRow[];
    if (q) {
      rows = rows.filter((row) => {
        const hay = [row.recipient_name, row.phone, row.exam_name, row.message, row.sender_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const campaigns: Record<string, {
      id: string;
      created_at: string;
      kind: string;
      exam_id: string | null;
      exam_name: string | null;
      sender_name: string | null;
      sample_message: string;
      total: number;
      sent: number;
      failed: number;
      skipped: number;
      recipients: {
        student_id: string | null;
        name: string | null;
        phone: string | null;
        status: string;
        detail: string | null;
        message_id: string | null;
        message: string;
      }[];
    }> = {};

    const order: string[] = [];
    for (const row of rows) {
      let c = campaigns[row.campaign_id];
      if (!c) {
        if (order.length >= campaignLimit) continue;
        c = campaigns[row.campaign_id] = {
          id: row.campaign_id,
          created_at: row.created_at,
          kind: row.kind,
          exam_id: row.exam_id,
          exam_name: row.exam_name,
          sender_name: row.sender_name,
          sample_message: row.message || "",
          total: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          recipients: [],
        };
        order.push(row.campaign_id);
      }
      c.total += 1;
      if (row.status === "sent") c.sent += 1;
      else if (row.status === "failed") c.failed += 1;
      else c.skipped += 1;
      if (!c.sample_message && row.message) c.sample_message = row.message;
      if (c.recipients.length < 500) {
        c.recipients.push({
          student_id: row.student_id,
          name: row.recipient_name,
          phone: row.phone,
          status: row.status,
          detail: row.detail,
          message_id: row.message_id,
          message: row.message,
        });
      }
    }

    return NextResponse.json({ ok: true, campaigns: order.map((id) => campaigns[id]) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Imeshindikana kupata historia ya SMS.") }, { status: 500 });
  }
}
