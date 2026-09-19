-- ============================================================
-- Students Registration — add fields for full CRUD
-- first_name, middle_name, last_name, gender, phone
-- ============================================================

alter table public.students
  add column if not exists middle_name text,
  add column if not exists phone        text;