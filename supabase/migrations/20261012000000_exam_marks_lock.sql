-- ============================================================
-- Exam marks lock
--
-- Once an exam is published its marks must be frozen: no inserting,
-- updating or deleting marks until the Academic office explicitly re-opens
-- marks entry for that exam.
--
-- `exams.marks_open` (default false) is the re-open switch:
--   * status <> 'published'          -> marks are always editable.
--   * status  = 'published' AND
--     marks_open = true              -> marks editable (Academic re-opened).
--   * status  = 'published' AND
--     marks_open = false             -> marks LOCKED.
--
-- The lock is enforced at the database boundary so it cannot be bypassed by
-- a direct client write, in addition to the UI/API checks.
-- ============================================================

alter table public.exams
  add column if not exists marks_open boolean not null default false;

create or replace function public.enforce_exam_marks_lock()
returns trigger
language plpgsql
as $$
declare
  target_exam uuid;
  exam_status text;
  exam_open   boolean;
begin
  target_exam := case when tg_op = 'DELETE' then old.exam_id else new.exam_id end;

  select status, marks_open
    into exam_status, exam_open
    from public.exams
   where id = target_exam;

  if exam_status = 'published' and coalesce(exam_open, false) is not true then
    raise exception 'Marks entry is locked because this exam is published. Ask the Academic office to re-open marks entry.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_exam_marks_lock on public.exam_marks;
create trigger enforce_exam_marks_lock
before insert or update or delete
on public.exam_marks
for each row
execute function public.enforce_exam_marks_lock();
