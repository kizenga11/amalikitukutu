-- A teacher assignment may only use a stream that the subject offers.
-- Subjects marked Both are valid for either General or Vocational streams.

create or replace function public.validate_teaching_assignment_stream()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_stream text;
  actual_stream_name text;
begin
  select stream
    into subject_stream
    from public.subjects
   where id = new.subject_id;

  select name
    into actual_stream_name
    from public.streams
   where id = new.stream_id
     and class_id = new.class_id;

  if subject_stream is null or actual_stream_name is null then
    raise exception 'Teaching assignment references an invalid subject or class stream';
  end if;

  if subject_stream <> 'Both' and subject_stream <> actual_stream_name then
    raise exception 'Subject is not offered in the selected stream';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_teaching_assignment_stream on public.teaching_assignments;
create trigger validate_teaching_assignment_stream
before insert or update of subject_id, class_id, stream_id
on public.teaching_assignments
for each row
execute function public.validate_teaching_assignment_stream();
