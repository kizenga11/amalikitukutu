-- Ensure every student with a stream has all compulsory subjects for that stream.
-- This is intentionally set-based so it also repairs data created before the
-- student assignment trigger was installed or while a bulk import was running.

insert into public.student_subjects (student_id, subject_id)
select s.id, sub.id
  from public.students s
  join public.streams st on st.id = s.stream_id
  join public.subjects sub
    on sub.subject_type = 'Compulsory'
   and (sub.stream = st.name or sub.stream = 'Both')
on conflict (student_id, subject_id) do nothing;

create or replace function public.reconcile_student_compulsory_subjects(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.student_subjects ss
   using public.subjects sub
   where ss.student_id = p_student_id
     and ss.subject_id = sub.id
     and sub.subject_type = 'Compulsory'
     and not exists (
       select 1
         from public.students s
         join public.streams st on st.id = s.stream_id
        where s.id = p_student_id
          and (sub.stream = st.name or sub.stream = 'Both')
     );

  insert into public.student_subjects (student_id, subject_id)
  select s.id, sub.id
    from public.students s
    join public.streams st on st.id = s.stream_id
    join public.subjects sub
      on sub.subject_type = 'Compulsory'
     and (sub.stream = st.name or sub.stream = 'Both')
   where s.id = p_student_id
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
