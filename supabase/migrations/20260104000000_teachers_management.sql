-- ============================================================
-- Teachers Management
-- Extend staff table with profile fields + create
-- teaching_assignments junction for subject/class/stream links
-- ============================================================

alter table public.staff
  add column if not exists first_name  text,
  add column if not exists middle_name text,
  add column if not exists last_name   text,
  add column if not exists gender      text check (gender in ('Male', 'Female')),
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists password    text;

create table if not exists public.teaching_assignments (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.staff(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  stream_id  uuid not null references public.streams(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ta_teacher_idx on public.teaching_assignments(teacher_id);
create index if not exists ta_subject_idx on public.teaching_assignments(subject_id);
create index if not exists ta_class_idx   on public.teaching_assignments(class_id);

alter table public.teaching_assignments enable row level security;

drop policy if exists authenticated_all_teaching_assignments on public.teaching_assignments;
create policy authenticated_all_teaching_assignments on public.teaching_assignments
  for all to authenticated using (true) with check (true);