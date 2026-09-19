-- ============================================================
-- Exam Management — marks entry
-- Stores one score per (exam, class, subject, student).
-- Stream is captured on the row so marks can be grouped by
-- class and by stream in the View Marks screen.
-- ============================================================

create table if not exists public.exam_marks (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.exams(id) on delete cascade,
  class_id   uuid not null references public.school_classes(id) on delete cascade,
  stream_id  uuid references public.streams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score      numeric(5,2) not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (exam_id, class_id, subject_id, student_id)
);

create index if not exists exam_marks_exam_idx   on public.exam_marks(exam_id);
create index if not exists exam_marks_class_idx  on public.exam_marks(class_id);
create index if not exists exam_marks_student_idx on public.exam_marks(student_id);

alter table public.exam_marks enable row level security;

drop policy if exists authenticated_all_exam_marks on public.exam_marks;
create policy authenticated_all_exam_marks on public.exam_marks
  for all to authenticated using (true) with check (true);