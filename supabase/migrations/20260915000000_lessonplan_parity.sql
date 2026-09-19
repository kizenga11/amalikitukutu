-- ============================================================
-- Lesson Plan parity with the legacy PHP "lessonplan" app.
--
-- Adds:
--   * learning_activities.stage_content        (jsonb)
--       Exact per-stage text (introduction / development /
--       design / realisation) migrated from PHP so the TIE
--       style document renders the original content verbatim.
--   * generated_lesson_plans.class_stream, lesson_time,
--       remarks, reference   (metadata used by the TIE form)
--   * generated_sow_plans    (Scheme of Work table + data)
--   * PHP subjects           (COMP, CA, CP, HTM)
-- All additions are nullable / additive and deploy-safe.
-- ============================================================

-- 1. learning_activities.stage_content --------------------------
alter table public.learning_activities
  add column if not exists stage_content jsonb;

-- 2. generated_lesson_plans metadata columns --------------------
alter table public.generated_lesson_plans
  add column if not exists class_stream text;
alter table public.generated_lesson_plans
  add column if not exists lesson_time  text;
alter table public.generated_lesson_plans
  add column if not exists remarks      text;
alter table public.generated_lesson_plans
  add column if not exists reference    text;

-- 3. generated_sow_plans ------------------------------------------
create table if not exists public.generated_sow_plans (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null references public.staff(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  form_id         uuid references public.forms(id) on delete set null,
  form            text,
  class_stream    text,
  term            text,
  year            text,
  school_name     text,
  teacher_name    text,
  title           text,
  sow_data        jsonb not null default '[]'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'final')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists generated_sow_teacher_idx on public.generated_sow_plans(teacher_id);
create index if not exists generated_sow_subject_idx on public.generated_sow_plans(subject_id);
create index if not exists generated_sow_form_idx    on public.generated_sow_plans(form_id);

drop trigger if exists generated_sow_plans_touch on public.generated_sow_plans;
create trigger generated_sow_plans_touch
  before update on public.generated_sow_plans
  for each row execute function public.set_updated_at();

-- 4. PHP subjects ------------------------------------------------
-- COMP (Computer Science), CA (Computer Application),
-- CP (Computer Programming), HTM (Historia ya Tanzania na Maadili)
insert into public.subjects (code, name, subject_type, has_practical, stream) values
  ('COMP', 'Computer Science', 'Optional', false, 'Vocational'),
  ('CA',   'Computer Application', 'Optional', false, 'Vocational'),
  ('CP',   'Computer Programming', 'Optional', false, 'Vocational'),
  ('HTM',  'Historia ya Tanzania na Maadili', 'Optional', false, 'General')
on conflict (code) do nothing;

-- 5. RLS ----------------------------------------------------------
alter table public.generated_sow_plans enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['generated_sow_plans']
  loop
    execute format('drop policy if exists %I on public.%I', 'authenticated_all_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', 'authenticated_all_' || t, t);
  end loop;
end $$;