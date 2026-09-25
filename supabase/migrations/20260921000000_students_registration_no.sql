-- ============================================================
-- Students registration numbers — format S8384/XXXX/YYYY
-- XXXX is a random unique 4-digit code so parents can look up a
-- student's results by registration No instead of name.
-- ============================================================

alter table public.students
  add column if not exists registration_no text;

-- Backfill existing students (missing values) with a random unique
-- 4-digit code. Row-numbering a shuffled student list assigns each
-- student a distinct code (a random permutation of the first N codes).
with candidates as (
  select (n || '') as num from generate_series(0, 9999) as n
),
ordered as (
  select id,
         (row_number() over (order by random()) - 1) as code
  from public.students
  where registration_no is null
)
update public.students s
set registration_no =
      'S8384/' || lpad(o.code::text, 4, '0') || '/' || extract(year from now())::int
from ordered o
where s.id = o.id;

create unique index if not exists students_registration_no_key
  on public.students (registration_no);