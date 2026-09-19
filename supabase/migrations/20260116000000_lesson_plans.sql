-- ============================================================
-- Lesson Plan Generator
-- Tables: schools, forms, teacher_subjects, main_competences,
--         specific_competences, learning_activities,
--         generated_lesson_plans
--
-- Mapping to the existing schema:
--   * "users" is already represented by public.staff
--     (teachers sign in via Supabase Auth linked to staff.auth_user_id).
--   * "subjects" already exists.
--   * Forms mirror school_classes.form_level (Form One..Four).
-- ============================================================

-- 1. schools ---------------------------------------------------
create table if not exists public.schools (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  district  text,
  po_box    text,
  logo_url  text,
  created_at timestamptz not null default now()
);

-- 2. forms ------------------------------------------------------
create table if not exists public.forms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  form_level int not null check (form_level between 1 and 4),
  created_at timestamptz not null default now()
);

-- 3. teacher_subjects (many-to-many teacher <-> subject <-> form)
create table if not exists public.teacher_subjects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.staff(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  form_id    uuid not null references public.forms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, subject_id, form_id)
);

create index if not exists teacher_subjects_user_idx    on public.teacher_subjects(user_id);
create index if not exists teacher_subjects_subject_idx on public.teacher_subjects(subject_id);
create index if not exists teacher_subjects_form_idx    on public.teacher_subjects(form_id);

-- 4. main_competences -------------------------------------------
create table if not exists public.main_competences (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  form_id    uuid not null references public.forms(id) on delete cascade,
  code       text not null,
  title      text not null,
  created_at timestamptz not null default now(),
  unique (subject_id, form_id, code)
);

create index if not exists main_competences_subject_form_idx on public.main_competences(subject_id, form_id);

-- 5. specific_competences ----------------------------------------
create table if not exists public.specific_competences (
  id                 uuid primary key default gen_random_uuid(),
  main_competence_id uuid not null references public.main_competences(id) on delete cascade,
  code               text not null,
  title              text not null,
  created_at         timestamptz not null default now(),
  unique (main_competence_id, code)
);

create index if not exists specific_competences_main_idx on public.specific_competences(main_competence_id);

-- 6. learning_activities ------------------------------------------
create table if not exists public.learning_activities (
  id                    uuid primary key default gen_random_uuid(),
  specific_competence_id uuid not null references public.specific_competences(id) on delete cascade,
  code                  text not null,
  activity_description  text not null,
  suggested_methods     text,
  assessment_criteria   text,
  resources             text,
  periods_allocated     int,
  created_at            timestamptz not null default now(),
  unique (specific_competence_id, code)
);

create index if not exists learning_activities_specific_idx on public.learning_activities(specific_competence_id);

-- 7. generated_lesson_plans -----------------------------------------
create table if not exists public.generated_lesson_plans (
  id                      uuid primary key default gen_random_uuid(),
  teacher_id              uuid not null references public.staff(id) on delete cascade,
  subject_id              uuid not null references public.subjects(id) on delete cascade,
  form_id                 uuid not null references public.forms(id) on delete cascade,
  specific_competence_id  uuid references public.specific_competences(id) on delete set null,
  learning_activity_ids   jsonb not null default '[]'::jsonb,
  date                    date,
  number_of_periods       int  not null default 1 check (number_of_periods > 0),
  time_minutes            int  not null default 40 check (time_minutes > 0),
  registered_boys         int  not null default 0,
  registered_girls        int  not null default 0,
  present_boys            int  not null default 0,
  present_girls           int  not null default 0,
  content                 jsonb,
  status                  text not null default 'draft' check (status in ('draft', 'final')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists generated_plans_teacher_idx on public.generated_lesson_plans(teacher_id);
create index if not exists generated_plans_subject_idx on public.generated_lesson_plans(subject_id);
create index if not exists generated_plans_form_idx    on public.generated_lesson_plans(form_id);
create index if not exists generated_plans_status_idx  on public.generated_lesson_plans(status);

-- Auto-update updated_at ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists generated_lesson_plans_touch on public.generated_lesson_plans;
create trigger generated_lesson_plans_touch
  before update on public.generated_lesson_plans
  for each row execute function public.set_updated_at();

-- RLS: allow any signed-in portal user to read/write (permits the
-- permissive model used across this project; ownership filtering is
-- enforced in the application layer).
alter table public.schools               enable row level security;
alter table public.forms                 enable row level security;
alter table public.teacher_subjects      enable row level security;
alter table public.main_competences      enable row level security;
alter table public.specific_competences  enable row level security;
alter table public.learning_activities   enable row level security;
alter table public.generated_lesson_plans enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'schools', 'forms', 'teacher_subjects', 'main_competences',
    'specific_competences', 'learning_activities', 'generated_lesson_plans'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
  end loop;
end $$;