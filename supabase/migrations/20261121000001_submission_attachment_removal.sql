-- Allow a teacher to remove a student's submitted attachment (wrong/abusive
-- uploads filling storage). The file data is cleared to free space; the reason
-- is kept so the student can see why it was removed.

alter table public.assignment_submissions
  add column if not exists attachment_removed_at timestamptz,
  add column if not exists attachment_removed_reason text,
  add column if not exists attachment_removed_by uuid references public.staff(id) on delete set null;
