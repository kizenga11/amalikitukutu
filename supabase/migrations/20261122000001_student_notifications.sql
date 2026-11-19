-- Student notifications are derived from existing records (published
-- assignments, published notes, note_views). We only need to remember when an
-- assignment's publish status changed and when a submission was returned to the
-- student for rework.

alter table public.assignments
  add column if not exists status_changed_at timestamptz,
  add column if not exists previous_status text;

alter table public.assignment_submissions
  add column if not exists returned_for_rework_at timestamptz;

-- Existing rows get a baseline so they do not look "just changed" forever.
update public.assignments
set status_changed_at = coalesce(updated_at, created_at)
where status_changed_at is null;

create or replace function public.track_assignment_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.previous_status := old.status;
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assignment_status_change on public.assignments;
create trigger trg_assignment_status_change
before update on public.assignments
for each row execute function public.track_assignment_status_change();

create index if not exists assignments_status_changed_idx
  on public.assignments(status_changed_at desc);

create index if not exists assignment_submissions_rework_idx
  on public.assignment_submissions(returned_for_rework_at desc);
