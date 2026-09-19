-- Student subject assignment rules
--
-- Compulsory subjects are derived from the student's current stream.
-- Optional subjects remain manual and are never inserted by these triggers.

create or replace function public.reconcile_student_compulsory_subjects(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  student_stream_id uuid;
begin
  select stream_id
    into student_stream_id
    from public.students
   where id = p_student_id;

  if student_stream_id is null then
    return;
  end if;

  -- Remove compulsory subjects that no longer belong to the student's stream.
  delete from public.student_subjects ss
   using public.subjects sub
   where ss.student_id = p_student_id
     and ss.subject_id = sub.id
     and sub.subject_type = 'Compulsory'
     and not exists (
       select 1
         from public.streams st
        where st.id = student_stream_id
          and (sub.stream = st.name or sub.stream = 'Both')
     );

  -- Add all compulsory subjects for the current stream.
  insert into public.student_subjects (student_id, subject_id)
  select p_student_id, sub.id
    from public.streams st
    join public.subjects sub
      on sub.subject_type = 'Compulsory'
     and (sub.stream = st.name or sub.stream = 'Both')
   where st.id = student_stream_id
  on conflict (student_id, subject_id) do nothing;
end;
$$;

create or replace function public.trg_reconcile_student_compulsory_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- Re-add compulsory subjects if an admin replaces a student's assignment list.
-- Optional subjects are untouched.
create or replace function public.trg_restore_student_compulsory_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_student_compulsory_subjects(old.student_id);
  return old;
end;
$$;

drop trigger if exists trg_restore_student_compulsory on public.student_subjects;
create trigger trg_restore_student_compulsory
after delete on public.student_subjects
for each row
execute function public.trg_restore_student_compulsory_subjects();

-- If an existing subject is changed to compulsory, assign it to all matching
-- students. Optional subjects remain manually assigned.
create or replace function public.trg_reconcile_subject_compulsory_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subject_type = 'Compulsory' then
    insert into public.student_subjects (student_id, subject_id)
    select s.id, new.id
      from public.students s
      join public.streams st on st.id = s.stream_id
     where new.stream = 'Both' or new.stream = st.name
    on conflict (student_id, subject_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reconcile_subject_compulsory on public.subjects;
create trigger trg_reconcile_subject_compulsory
after insert or update of subject_type, stream on public.subjects
for each row
execute function public.trg_reconcile_subject_compulsory_students();

-- Backfill and reconcile all existing students. This is idempotent.
do $$
declare
  student_row record;
begin
  for student_row in select id from public.students loop
    perform public.reconcile_student_compulsory_subjects(student_row.id);
  end loop;
end;
$$;
