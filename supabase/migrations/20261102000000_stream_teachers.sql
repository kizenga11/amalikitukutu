-- ============================================================
-- Stream Teacher (Class Teacher per Stream)
-- Additive only: new tables, indexes and triggers.
-- Access is intentionally server-side (service role); no browser
-- policies are added so other streams cannot be queried directly.
-- ============================================================

create table if not exists public.stream_teachers (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.staff(id) on delete cascade,
  stream_id        uuid not null references public.streams(id) on delete cascade,
  academic_year_id text not null check (academic_year_id ~ '^[0-9]{4}$'),
  assigned_by      uuid references public.staff(id) on delete set null,
  assigned_at      timestamptz not null default now(),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists stream_teachers_teacher_idx
  on public.stream_teachers(teacher_id, is_active);

create index if not exists stream_teachers_stream_idx
  on public.stream_teachers(stream_id, is_active);

create unique index if not exists stream_teachers_one_active_per_stream
  on public.stream_teachers(stream_id, academic_year_id)
  where is_active;

create unique index if not exists stream_teachers_unique_active_assignment
  on public.stream_teachers(teacher_id, stream_id, academic_year_id)
  where is_active;

create table if not exists public.student_conduct (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  term             integer not null check (term in (1, 2)),
  academic_year_id text not null check (academic_year_id ~ '^[0-9]{4}$'),
  conduct          text,
  remarks          text,
  source           text not null default 'manual' check (source in ('manual', 'auto')),
  filled_by        uuid references public.staff(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, term, academic_year_id)
);

create index if not exists student_conduct_student_idx
  on public.student_conduct(student_id);

create index if not exists student_conduct_period_idx
  on public.student_conduct(academic_year_id, term);

create or replace function public.stream_teacher_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stream_teachers_set_updated_at on public.stream_teachers;
create trigger stream_teachers_set_updated_at
before update on public.stream_teachers
for each row execute function public.stream_teacher_set_updated_at();

drop trigger if exists student_conduct_set_updated_at on public.student_conduct;
create trigger student_conduct_set_updated_at
before update on public.student_conduct
for each row execute function public.stream_teacher_set_updated_at();

alter table public.stream_teachers enable row level security;
alter table public.student_conduct enable row level security;
