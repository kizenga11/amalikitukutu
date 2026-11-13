-- ============================================================
-- C++ IDE: run log + database-backed rate limiting
-- Additive only. No existing table, column, policy or function is
-- changed. Like the other student-portal tables, this table is used
-- exclusively by route handlers with the service role, so RLS is
-- enabled with no browser policies.
-- ============================================================

create table if not exists public.code_runs (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  question_id   uuid references public.assignment_questions(id) on delete set null,
  status        text not null,
  status_id     integer,
  time_seconds  numeric,
  memory_kb     integer,
  created_at    timestamptz not null default now()
);

-- Rolling one-minute rate limit (10 runs/minute/student) and run history.
create index if not exists code_runs_student_created_idx
  on public.code_runs(student_id, created_at desc);

create index if not exists code_runs_assignment_idx
  on public.code_runs(assignment_id, created_at desc);

alter table public.code_runs enable row level security;

comment on table public.code_runs is
  'Run log and rate-limit source for the C++ IDE. Access is server-side only.';
