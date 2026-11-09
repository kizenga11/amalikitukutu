-- ============================================================
-- Timetable module
-- ------------------------------------------------------------
-- Additive only: no existing table, column or policy is changed.
--
-- IMPORTANT — what a "class" means here:
--   The rest of the portal keeps Form levels in `school_classes`
--   and Form + Stream rows in `streams`. A timetable class is a
--   Form + Stream (for example IA / IB), therefore every
--   `class_id` column below references `public.streams(id)`.
--
-- `timetable_subject_periods.assignment_id` references
-- `teaching_assignments` because the same subject may be taught
-- by several teachers in one class/stream.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Day timeline: an ordered list of slots per weekday
-- ------------------------------------------------------------
create table if not exists public.timetable_day_slot (
  id         uuid primary key default gen_random_uuid(),
  day        smallint not null check (day between 1 and 6),   -- 1 = Monday ... 6 = Saturday
  position   integer  not null default 0,                     -- order inside the day
  start_time time     not null,
  end_time   time     not null,
  kind       text     not null default 'lesson'
                      check (kind in ('lesson', 'break', 'special')),
  label      text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists timetable_day_slot_day_idx
  on public.timetable_day_slot (day, position);

-- Special slots may apply to a subset of classes. No rows means
-- "all classes". Break slots always apply to every class.
create table if not exists public.timetable_slot_scope (
  slot_id  uuid not null references public.timetable_day_slot(id) on delete cascade,
  class_id uuid not null references public.streams(id) on delete cascade,
  primary key (slot_id, class_id)
);

-- ------------------------------------------------------------
-- 2. Subject periods per class (Form + Stream)
-- ------------------------------------------------------------
create table if not exists public.timetable_subject_periods (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.streams(id) on delete cascade,
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  assignment_id    uuid not null references public.teaching_assignments(id) on delete cascade,
  periods          integer not null default 0 check (periods between 0 and 60),
  morning_priority smallint not null default 0 check (morning_priority between 0 and 3),
  updated_at       timestamptz not null default now(),
  unique (class_id, assignment_id)
);

create index if not exists timetable_subject_periods_class_idx
  on public.timetable_subject_periods (class_id);

-- ------------------------------------------------------------
-- 3. Teacher availability
-- ------------------------------------------------------------
create table if not exists public.timetable_teacher_unavailable (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.staff(id) on delete cascade,
  slot_id    uuid not null references public.timetable_day_slot(id) on delete cascade,
  unique (teacher_id, slot_id)
);

-- ------------------------------------------------------------
-- 4. Editable rules / weights (one row per key)
-- ------------------------------------------------------------
create table if not exists public.timetable_rules (
  key        text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. Versions (drafts and one published version per term)
-- ------------------------------------------------------------
create table if not exists public.timetable_version (
  id            uuid primary key default gen_random_uuid(),
  term          text not null,                 -- e.g. "2026:1"
  academic_year text,
  term_number   integer,
  label         text,
  status        text not null default 'draft'
                check (status in ('draft', 'published')),
  score         numeric,
  solver_status text,
  diagnostics   jsonb not null default '[]'::jsonb,
  input_snapshot jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

create index if not exists timetable_version_term_idx
  on public.timetable_version (term, created_at desc);

-- Only one published timetable per term.
create unique index if not exists timetable_version_one_published_idx
  on public.timetable_version (term)
  where status = 'published';

-- ------------------------------------------------------------
-- 6. Lessons of a version
--    A size-2 lesson occupies its anchor slot_id and the next
--    lesson slot of the same class on the same day.
-- ------------------------------------------------------------
create table if not exists public.timetable_lesson (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.timetable_version(id) on delete cascade,
  class_id      uuid not null references public.streams(id) on delete cascade,
  subject_id    uuid references public.subjects(id) on delete set null,
  teacher_id    uuid references public.staff(id) on delete set null,
  assignment_id uuid references public.teaching_assignments(id) on delete set null,
  slot_id       uuid not null references public.timetable_day_slot(id) on delete restrict,
  size          smallint not null default 1 check (size in (1, 2)),
  locked        boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (version_id, class_id, slot_id)
);

create index if not exists timetable_lesson_version_idx
  on public.timetable_lesson (version_id);
create index if not exists timetable_lesson_teacher_idx
  on public.timetable_lesson (version_id, teacher_id);

-- ------------------------------------------------------------
-- 7. RLS — same behaviour as every other portal table
-- ------------------------------------------------------------
alter table public.timetable_day_slot            enable row level security;
alter table public.timetable_slot_scope          enable row level security;
alter table public.timetable_subject_periods     enable row level security;
alter table public.timetable_teacher_unavailable enable row level security;
alter table public.timetable_rules               enable row level security;
alter table public.timetable_version             enable row level security;
alter table public.timetable_lesson              enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'timetable_day_slot', 'timetable_slot_scope', 'timetable_subject_periods',
    'timetable_teacher_unavailable', 'timetable_rules', 'timetable_version',
    'timetable_lesson'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'authenticated_all_' || t, t
    );
  end loop;
end $$;
