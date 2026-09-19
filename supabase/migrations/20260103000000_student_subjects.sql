-- ============================================================
-- Students Subject Assignments
-- Junction table linking students to their assigned subjects.
-- Compulsory subjects of a student's stream are assigned
-- automatically; optional subjects are selected by the admin.
-- ============================================================

create table if not exists public.student_subjects (
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (student_id, subject_id)
);

create index if not exists student_subjects_student_idx  on public.student_subjects(student_id);
create index if not exists student_subjects_subject_idx  on public.student_subjects(subject_id);

alter table public.student_subjects enable row level security;

drop policy if exists authenticated_all_student_subjects on public.student_subjects;
create policy authenticated_all_student_subjects on public.student_subjects
  for all to authenticated using (true) with check (true);