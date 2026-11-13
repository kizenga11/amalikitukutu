-- ============================================================
-- Academic year rollover (student promotion)
-- ------------------------------------------------------------
-- Adds the pieces needed to promote students to the next form
-- without losing the previous academic year:
--   • students.status / graduated_year  -> Form IV graduates
--   • student_subjects.academic_year    -> enrollment history
--   • teaching_assignments.academic_year -> teacher history
--   • promotion_history                 -> audit + idempotency
-- It also makes the compulsory-subject triggers year-aware.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Students: lifecycle status
-- ------------------------------------------------------------
alter table public.students
  add column if not exists status text not null default 'Active',
  add column if not exists graduated_year text;

alter table public.students drop constraint if exists students_status_check;
alter table public.students
  add constraint students_status_check check (status in ('Active', 'Graduated'));

create index if not exists students_status_idx on public.students(status);

-- ------------------------------------------------------------
-- 2. Student subject enrollment becomes year-scoped
--    Existing rows belong to the 2026 academic year.
-- ------------------------------------------------------------
alter table public.student_subjects
  add column if not exists academic_year text not null default '2026';

alter table public.student_subjects drop constraint if exists student_subjects_pkey;
alter table public.student_subjects
  add constraint student_subjects_pkey primary key (student_id, subject_id, academic_year);

create index if not exists student_subjects_year_idx
  on public.student_subjects(academic_year, student_id);

-- ------------------------------------------------------------
-- 3. Teaching assignments become year-scoped
-- ------------------------------------------------------------
alter table public.teaching_assignments
  add column if not exists academic_year text not null default '2026';

create unique index if not exists teaching_assignments_unique_idx
  on public.teaching_assignments(teacher_id, subject_id, class_id, stream_id, academic_year);

create index if not exists teaching_assignments_year_idx
  on public.teaching_assignments(academic_year, teacher_id);

-- ------------------------------------------------------------
-- 4. Stream teachers: one row per teacher/stream/year
-- ------------------------------------------------------------
create unique index if not exists stream_teachers_unique_idx
  on public.stream_teachers(teacher_id, stream_id, academic_year_id);

-- ------------------------------------------------------------
-- 5. Promotion audit trail (also blocks double promotion)
-- ------------------------------------------------------------
create table if not exists public.promotion_history (
  id uuid primary key default gen_random_uuid(),
  from_year text not null,
  to_year text not null,
  promoted integer not null default 0,
  graduated integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz not null default now(),
  unique (from_year, to_year)
);

alter table public.promotion_history enable row level security;

-- ------------------------------------------------------------
-- 6. Year-aware subject reconciliation
-- ------------------------------------------------------------
create or replace function public.current_academic_year()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.academic_settings
      where key = 'active_year' and value ~ '^[0-9]{4}$'),
    to_char(now(), 'YYYY')
  );
$$;

create or replace function public.reconcile_student_compulsory_subjects(
  p_student_id uuid,
  p_year text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  student_stream_id uuid;
  v_year text := coalesce(p_year, public.current_academic_year());
begin
  select stream_id
    into student_stream_id
    from public.students
   where id = p_student_id;

  if student_stream_id is null then
    return;
  end if;

  -- Remove compulsory subjects that no longer belong to the stream,
  -- but only for the academic year being reconciled.
  delete from public.student_subjects ss
   using public.subjects sub
   where ss.student_id = p_student_id
     and ss.academic_year = v_year
     and ss.subject_id = sub.id
     and sub.subject_type = 'Compulsory'
     and not exists (
       select 1
         from public.streams st
        where st.id = student_stream_id
          and (sub.stream = st.name or sub.stream = 'Both')
     );

  -- Add all compulsory subjects for the current stream.
  insert into public.student_subjects (student_id, subject_id, academic_year)
  select p_student_id, sub.id, v_year
    from public.streams st
    join public.subjects sub
      on sub.subject_type = 'Compulsory'
     and (sub.stream = st.name or sub.stream = 'Both')
   where st.id = student_stream_id
  on conflict (student_id, subject_id, academic_year) do nothing;
end;
$$;

create or replace function public.trg_reconcile_student_compulsory_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_stream_name text;
  new_stream_name text;
begin
  -- Compulsory subjects depend on the stream *name*, not the class.
  -- Promotion changes the class while keeping General/Vocational, so
  -- skip the work when the stream name did not actually change.
  if tg_op = 'UPDATE' and old.stream_id is not null and new.stream_id is not null then
    select name into old_stream_name from public.streams where id = old.stream_id;
    select name into new_stream_name from public.streams where id = new.stream_id;
    if old_stream_name is not distinct from new_stream_name then
      return new;
    end if;
  end if;

  perform public.reconcile_student_compulsory_subjects(new.id);
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_compulsory on public.students;
drop trigger if exists trg_reconcile_student_compulsory on public.students;
create trigger trg_reconcile_student_compulsory
after insert or update of stream_id on public.students
for each row
execute function public.trg_reconcile_student_compulsory_subjects();

create or replace function public.trg_restore_student_compulsory_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_student_compulsory_subjects(old.student_id, old.academic_year);
  return old;
end;
$$;

drop trigger if exists trg_restore_student_compulsory on public.student_subjects;
create trigger trg_restore_student_compulsory
after delete on public.student_subjects
for each row
execute function public.trg_restore_student_compulsory_subjects();

create or replace function public.trg_reconcile_subject_compulsory_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := public.current_academic_year();
begin
  if new.subject_type = 'Compulsory' then
    insert into public.student_subjects (student_id, subject_id, academic_year)
    select s.id, new.id, v_year
      from public.students s
      join public.streams st on st.id = s.stream_id
     where new.stream = 'Both' or new.stream = st.name
    on conflict (student_id, subject_id, academic_year) do nothing;
  elsif old.subject_type = 'Compulsory' then
    delete from public.student_subjects
     where subject_id = new.id
       and academic_year = v_year;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reconcile_subject_compulsory on public.subjects;
create trigger trg_reconcile_subject_compulsory
after insert or update of subject_type, stream on public.subjects
for each row
execute function public.trg_reconcile_subject_compulsory_students();
