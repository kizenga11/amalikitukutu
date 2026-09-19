-- ============================================================
-- Exam Management
-- Exams + junction tables for the classes and subjects that
-- participate in each exam.
-- ============================================================

create table if not exists public.exams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  has_practical boolean not null default false,
  status        text not null default 'draft' check (status in ('draft', 'active', 'processing', 'published')),
  created_at    timestamptz not null default now()
);

create table if not exists public.exam_classes (
  id       uuid primary key default gen_random_uuid(),
  exam_id  uuid not null references public.exams(id) on delete cascade,
  class_id uuid not null references public.school_classes(id) on delete cascade,
  unique (exam_id, class_id)
);

create table if not exists public.exam_subjects (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique (exam_id, subject_id)
);

create index if not exists exam_classes_exam_idx   on public.exam_classes(exam_id);
create index if not exists exam_subjects_exam_idx  on public.exam_subjects(exam_id);

alter table public.exams         enable row level security;
alter table public.exam_classes  enable row level security;
alter table public.exam_subjects enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['exams', 'exam_classes', 'exam_subjects']
  loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
  end loop;
end $$;