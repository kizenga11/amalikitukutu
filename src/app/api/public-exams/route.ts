import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  let result;
  try {
    result = await admin
      .from("exams")
      .select("id, name, start_date, end_date")
      .eq("status", "published")
      .order("start_date", { ascending: false })
      .abortSignal(controller.signal);
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ exams: [] }, { status: 200 });
  }
  clearTimeout(timeout);

  const { data, error } = result;

  if (error) {
    return NextResponse.json({ exams: [] }, { status: 200 });
  }

  return NextResponse.json({ exams: data ?? [] });
}
