-- ============================================================
-- Amali School Portal — Initial Schema
-- Tables: school_classes, streams, subjects, students, staff,
--         performance, attendance  + RLS policies
--
-- RUN THIS ONCE in Supabase Dashboard > SQL Editor > Run
-- ============================================================

create table if not exists public.school_classes (
  id          uuid primary key default gen_random_uuid(),
  form_level  int  not null check (form_level between 1 and 4),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.streams (
  id        uuid primary key default gen_random_uuid(),
  class_id  uuid not null references public.school_classes(id) on delete cascade,
  name      text not null,
  unique (class_id, name)
);

create table if not exists public.subjects (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  subject_type  text not null check (subject_type in ('Compulsory', 'Optional')),
  has_practical boolean not null default false,
  stream        text not null check (stream in ('General', 'Vocational', 'Both')),
  created_at    timestamptz not null default now()
);

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  middle_name text,
  last_name   text not null,
  gender      text not null check (gender in ('Male', 'Female')),
  phone       text,
  class_id    uuid references public.school_classes(id) on delete set null,
  stream_id   uuid references public.streams(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null default 'Teacher',
  subject_id uuid references public.subjects(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.performance (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid references public.school_classes(id) on delete cascade,
  subject_id    uuid references public.subjects(id) on delete cascade,
  academic_year text not null,
  term          int  not null check (term in (1, 2)),
  mean_score    numeric(5,2) not null check (mean_score between 0 and 100),
  created_at    timestamptz not null default now(),
  unique (class_id, subject_id, academic_year, term)
);

create table if not exists public.attendance (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid references public.school_classes(id) on delete cascade,
  attendance_date date not null,
  present         int  not null,
  total           int  not null,
  unique (class_id, attendance_date)
);

create table if not exists public.academic_years (
  id         text primary key,
  label      text not null,
  term_count int  not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: only signed-in portal users may read/write this data.
-- The service role (used by seed scripts) bypasses RLS.
-- ============================================================
alter table public.school_classes enable row level security;
alter table public.streams        enable row level security;
alter table public.subjects       enable row level security;
alter table public.students       enable row level security;
alter table public.staff          enable row level security;
alter table public.performance    enable row level security;
alter table public.attendance     enable row level security;
alter table public.academic_years enable row level security;
alter table public.academic_settings enable row level security;

-- Columns added by later migrations (safe for fresh installs too)
alter table public.students add column if not exists middle_name text;
alter table public.students add column if not exists phone        text;

do $$
declare
  t text;
begin
  foreach t in array array[
    'school_classes', 'streams', 'subjects', 'students', 'staff', 'performance', 'attendance', 'academic_years', 'academic_settings'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
  end loop;
end $$;