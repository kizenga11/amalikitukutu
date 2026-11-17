-- Registration numbers are assigned once and then left alone.
--
-- Before: the AFTER trigger renumbered the whole class on every insert, on any
-- update of first/middle/last name, gender or class, and on delete. Because
-- numbers were positional (girls first, then boys, alphabetically), registering
-- one student shifted everyone after them. Students working from home kept
-- using the number they were given and landed in another student's account.
--
-- Now: a new student gets the next free number for the whole school
-- (70 -> 71), whatever their class, name or gender. Editing a student keeps
-- their number, and a deleted number is never handed to somebody else. The
-- "Reassign Reg Nos" button still renumbers, but only when a member of staff
-- clicks it and confirms.
--
-- Numbers are school-wide because they are the student's sign-in name and the
-- parent results lookup: the same S7811/0001 must never exist in two classes.

create or replace function public.next_student_registration_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_serial integer;
begin
  -- One lock for the whole school: two registrations happening together must
  -- not pick the same next number.
  perform pg_advisory_xact_lock(hashtextextended('student-registration', 0));

  select coalesce(
           max((regexp_match(registration_no, '^S7811/([0-9]+)$'))[1]::integer),
           0
         )
    into next_serial
    from public.students
   where registration_no ~ '^S7811/[0-9]+$';

  next_serial := next_serial + 1;

  return 'S7811/' || lpad(
    next_serial::text,
    greatest(4, length(next_serial::text)),
    '0'
  );
end;
$$;

create or replace function public.maintain_student_registration_numbers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.registration_no is null or btrim(new.registration_no) = '' then
      new.registration_no := public.next_student_registration_no();
    end if;
    return new;
  end if;

  -- UPDATE: keep the number the student already has. Fill a blank one, and
  -- avoid a clash only if a number was set by hand and is already taken.
  if new.registration_no is null or btrim(new.registration_no) = '' then
    new.registration_no := public.next_student_registration_no();
  elsif new.registration_no is distinct from old.registration_no and exists (
    select 1
      from public.students s
     where s.registration_no = new.registration_no
       and s.id <> new.id
  ) then
    new.registration_no := public.next_student_registration_no();
  end if;

  return new;
end;
$$;

-- The old trigger was AFTER INSERT/UPDATE/DELETE. A BEFORE trigger can fill in
-- the new student's number, and dropping the delete path stops the reshuffle
-- that moved every classmate when a student left.
drop trigger if exists maintain_student_registration_numbers on public.students;

create trigger maintain_student_registration_numbers
before insert or update on public.students
for each row
execute function public.maintain_student_registration_numbers();

-- A deliberate renumber over the whole school, ordered by form, then girls
-- first, then boys, alphabetically. Kept for repairs run from the SQL editor;
-- the portal no longer exposes it, because it changes every student's number.
create or replace function public.renumber_all_student_registrations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('student-registration', 0));

  -- Park every number first so the unique index never trips halfway through.
  update public.students
     set registration_no = 'TMP/' || id::text
   where registration_no is not null;

  with numbered_students as (
    select
      s.id,
      row_number() over (
        order by
          case
            when c.name = 'Form I' then 1
            when c.name = 'Form II' then 2
            when c.name = 'Form III' then 3
            when c.name = 'Form IV' then 4
            when c.name is null then 105
            else 50
          end,
          case when s.gender = 'Female' then 0 else 1 end,
          upper(concat_ws(' ', s.first_name, s.middle_name, s.last_name)),
          s.id
      ) as serial
    from public.students s
    left join public.school_classes c on c.id = s.class_id
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

-- The safe action behind the "Assign Reg Nos" button: give the next numbers to
-- students who have none yet (for example a record imported before the trigger
-- existed). Students who already have a number are never touched.
create or replace function public.assign_missing_student_registrations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('student-registration', 0));

  with missing as materialized (
    select id, row_number() over (order by created_at, id) as step
      from public.students
     where registration_no is null or btrim(registration_no) = ''
  ),
  base as materialized (
    select coalesce(
             max((regexp_match(registration_no, '^S7811/([0-9]+)$'))[1]::integer),
             0
           ) as serial
      from public.students
  )
  update public.students as student
     set registration_no = 'S7811/' || lpad(
           (base.serial + missing.step)::text,
           greatest(4, length((base.serial + missing.step)::text)),
           '0'
         )
    from missing, base
   where student.id = missing.id;

  get diagnostics assigned = row_count;
  return assigned;
end;
$$;

-- Older browser tabs still call the class-scoped RPC after saving a student.
-- Keep it existing but make it do nothing, so a stale tab can never reshuffle
-- the school while staff are registering new students.
create or replace function public.renumber_student_registrations(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  null;
end;
$$;

-- Numbers are a school-wide identifier, so enforce that in the database too.
create unique index if not exists students_registration_no_key
  on public.students (registration_no)
  where registration_no is not null;
