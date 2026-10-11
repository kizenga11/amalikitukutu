import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { lpDb } from "./db";

export const SCHOOL_NAME = "Kitukutu Technical Secondary School";

export type LpUser = {
  id: string;
  name: string;
  role: "management" | "teacher";
  // majina ya masomo aliyopangiwa mwalimu (lazima yafanane na "Somo" kwenye seed). null = masomo yote
  subjects: string[] | null;
};

export async function getLpUser(accessToken?: string): Promise<LpUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  let user: User | null = null;
  if (accessToken) {
    // Tumia JWT linalotumwa na dashboard (session iko kwenye localStorage, si cookies).
    const { data, error } = await lpDb().auth.getUser(accessToken);
    if (error || !data.user) return null;
    user = data.user;
  } else {
    const cookieStore = await cookies();
    type CookieSetItem = { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] };

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieSetItem[]) {
          try {
            for (const cookie of cookiesToSet) {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            }
          } catch {
            // Ignore cookie write errors during auth checks.
          }
        },
      },
    });

    const result = await supabase.auth.getUser();
    if (result.error || !result.data.user) return null;
    user = result.data.user;
  }
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role = meta.role as string;

  const fallbackName =
    (typeof meta.name === "string" && meta.name.trim()) ||
    (user.email ? user.email.split("@")[0] : "User");

  if (role === "Headmaster" || role === "Academic") {
    return { id: user.id, name: fallbackName, role: "management", subjects: null };
  }

  if (role !== "Teacher") return null;

  const db = lpDb();
  const { data: staff } = await db
    .from("staff")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .eq("role", "Teacher")
    .maybeSingle();
  if (!staff) return null;

  const { data: rows } = await db
    .from("teaching_assignments")
    .select("subject:subjects(name)")
    .eq("teacher_id", staff.id);

  type SubLink = { subject: { name: string } | { name: string }[] | null };
  const subjects = [
    ...new Set(
      ((rows ?? []) as SubLink[]).flatMap((row) => {
        const link = Array.isArray(row.subject) ? row.subject[0] : row.subject;
        return link?.name ? [link.name] : [];
      }),
    ),
  ];

  return {
    id: user.id,
    name: (typeof staff.name === "string" && staff.name.trim()) || fallbackName,
    role: "teacher",
    subjects,
  };
}