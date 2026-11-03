-- Use class-scoped registration numbers and order existing students with
-- girls first, then boys, alphabetically within each gender.
drop index if exists public.students_registration_no_key;

with numbered_students as (
  select
    id,
    row_number() over (
      partition by class_id
      order by
        case when gender = 'Female' then 0 else 1 end,
        upper(concat_ws(' ', first_name, middle_name, last_name)),
        id
    ) as serial
  from public.students
)
update public.students as student
set registration_no = 'S7811/' || lpad(
  numbered_students.serial::text,
  greatest(4, length(numbered_students.serial::text)),
  '0'
)
from numbered_students
where student.id = numbered_students.id;

create unique index if not exists students_class_registration_no_key
  on public.students ((coalesce(class_id::text, 'unassigned')), registration_no)
  where registration_no is not null;

create or replace function public.renumber_student_registrations(p_class_id uuid)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_class_id::text, 'unassigned'), 0)
  );

  update public.students
  set registration_no = 'TMP/' || id::text
  where class_id is not distinct from p_class_id;

  with numbered_students as (
    select
      id,
      row_number() over (
        order by
          case when gender = 'Female' then 0 else 1 end,
          upper(concat_ws(' ', first_name, middle_name, last_name)),
          id
      ) as serial
    from public.students
    where class_id is not distinct from p_class_id
  )
  update public.students as student
  set registration_no = 'S7811/' || lpad(
    numbered_students.serial::text,
    greatest(4, length(numbered_students.serial::text)),
    '0'
  )
  from numbered_students
  where student.id = numbered_students.id;
end;
$$;

create or replace function public.maintain_student_registration_numbers()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.class_id is not distinct from new.class_id
       and old.first_name is not distinct from new.first_name
       and old.middle_name is not distinct from new.middle_name
       and old.last_name is not distinct from new.last_name
       and old.gender is not distinct from new.gender then
      return new;
    end if;

    if old.class_id is distinct from new.class_id then
      perform public.renumber_student_registrations(old.class_id);
    end if;
    perform public.renumber_student_registrations(new.class_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.renumber_student_registrations(old.class_id);
    return old;
  end if;

  perform public.renumber_student_registrations(new.class_id);
  return new;
end;
$$;

drop trigger if exists maintain_student_registration_numbers on public.students;
create trigger maintain_student_registration_numbers
after insert or update or delete on public.students
for each row execute function public.maintain_student_registration_numbers();
