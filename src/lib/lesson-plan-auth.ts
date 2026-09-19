import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export type PortalRole = "Headmaster" | "Academic" | "Teacher";

export async function getServerUser(): Promise<{
  user: User;
  role: PortalRole;
}> {
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
          // ignore cookie writes during auth checks
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const role = (user.user_metadata?.role as PortalRole) || "Teacher";
  return { user, role };
}

export async function requireRoles(roles: PortalRole[]): Promise<{ user: User; role: PortalRole }> {
  const ctx = await getServerUser();
  if (!roles.includes(ctx.role)) throw new Error("Forbidden");
  return ctx;
}

export function asRole(user: User): PortalRole {
  return (user.user_metadata?.role as PortalRole) || "Teacher";
}