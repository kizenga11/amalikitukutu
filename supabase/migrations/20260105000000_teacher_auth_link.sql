-- ============================================================
-- Teacher Auth link
-- Store the Supabase Auth user id on the staff row so that
-- teachers registered in the portal can sign in.
-- ============================================================

alter table public.staff
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists staff_auth_user_idx on public.staff(auth_user_id);