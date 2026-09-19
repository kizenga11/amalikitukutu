-- ============================================================
-- Auto-Assign Compulsory Subjects
-- 1. Backfills existing students: every student with a stream
--    gets their stream's Compulsory subjects automatically.
-- 2. Adds a trigger so compulsory subjects are assigned
--    automatically whenever a student is created or moved to
--    a different stream.
-- Optional subjects are NOT touched here — the admin assigns
-- them manually via the student's "Assign Subjects" screen.
-- ============================================================

-- -------- 1. Backfill for existing students --------
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).
insert into public.student_subjects (student_id, subject_id)
select
  s.id,
  sub.id
from public.students s
join public.streams st   on st.id = s.stream_id
join public.subjects sub on sub.subject_type = 'Compulsory'
                        and (sub.stream = st.name or sub.stream = 'Both')
on conflict (student_id, subject_id) do nothing;

-- -------- 2. Trigger for future students --------
create or replace function public.auto_assign_compulsory_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stream_id is null then
    return new;
  end if;

  insert into public.student_subjects (student_id, subject_id)
  select
    new.id,
    sub.id
  from public.streams st
  join public.subjects sub on sub.subject_type = 'Compulsory'
                          and (sub.stream = st.name or sub.stream = 'Both')
  where st.id = new.stream_id
  on conflict (student_id, subject_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auto_assign_compulsory on public.students;
create trigger trg_auto_assign_compulsory
  after insert or update of stream_id on public.students
  for each row
  execute function public.auto_assign_compulsory_subjects();