import { createClient } from "@supabase/supabase-js";

// Tumia kwenye seva tu (server components / server actions). Usiwahi kuiingiza kwenye "use client".
export const lpDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
