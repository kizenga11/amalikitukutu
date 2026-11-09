-- ============================================================
-- Timetable module — optional teacher daily load limit
-- ------------------------------------------------------------
-- Additive only. One optional row per teacher; when the row is
-- missing the teacher has no daily maximum. The solver contract
-- exposes these rows as `teacherLimits` (an extension to §9).
-- ============================================================

create table if not exists public.timetable_teacher_limit (
  teacher_id uuid primary key references public.staff(id) on delete cascade,
  max_per_day integer not null check (max_per_day between 1 and 16),
  updated_at timestamptz not null default now()
);

alter table public.timetable_teacher_limit enable row level security;

drop policy if exists authenticated_all_timetable_teacher_limit
  on public.timetable_teacher_limit;
create policy authenticated_all_timetable_teacher_limit
  on public.timetable_teacher_limit
  for all to authenticated
  using (true)
  with check (true);
