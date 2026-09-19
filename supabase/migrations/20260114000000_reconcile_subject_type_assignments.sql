-- Keep automatically-derived compulsory assignments aligned when a subject's
-- type changes. Optional subjects are never assigned by this trigger.

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
  elsif old.subject_type = 'Compulsory' then
    delete from public.student_subjects
     where subject_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reconcile_subject_compulsory on public.subjects;
create trigger trg_reconcile_subject_compulsory
after insert or update of subject_type, stream on public.subjects
for each row
execute function public.trg_reconcile_subject_compulsory_students();

-- Chemistry is currently optional. Remove rows that were created while it was
-- previously treated as compulsory; optional assignments can be re-added
-- explicitly by an administrator.
delete from public.student_subjects ss
using public.subjects sub
where ss.subject_id = sub.id
  and sub.code = 'CHEM'
  and sub.name = 'Chemistry'
  and sub.subject_type = 'Optional';
