-- ============================================================
-- Exam Management — per-class subjects
-- Each class in an exam has its OWN subjects (no mixing).
-- Replaces the global exam_subjects table with a
-- (exam_id, class_id, subject_id) junction.
-- ============================================================

create table if not exists public.exam_class_subjects (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unique (exam_id, class_id, subject_id)
);

create index if not exists exam_class_subjects_exam_idx on public.exam_class_subjects(exam_id);

-- Migrate any previously saved global subjects to each exam class.
insert into public.exam_class_subjects (exam_id, class_id, subject_id)
select ec.exam_id, ec.class_id, es.subject_id
from public.exam_subjects es
join public.exam_classes ec on ec.exam_id = es.exam_id
on conflict (exam_id, class_id, subject_id) do nothing;

-- Drop the old global junction.
drop table if exists public.exam_subjects;

alter table public.exam_class_subjects enable row level security;

do $$
begin
  execute format('drop policy if exists %I on public.%I', 'authenticated_all_exam_class_subjects', 'exam_class_subjects');
  execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_all_exam_class_subjects', 'exam_class_subjects');
end $$;