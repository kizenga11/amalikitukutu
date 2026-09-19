-- ============================================================
-- Exam Marks — Theory / Practical split + Absent support
-- Adds theory_score, practical_score, and is_absent columns.
-- For theory-only subjects: theory_score holds 0-100, practical_score is NULL.
-- For practical subjects: theory_score 0-50, practical_score 0-50.
-- is_absent = true means the student was absent (no scores saved).
-- ============================================================

-- Add new columns
alter table public.exam_marks
  add column if not exists theory_score   numeric(5,2),
  add column if not exists practical_score numeric(5,2),
  add column if not exists is_absent      boolean not null default false;

-- Backfill existing data: move score → theory_score
update public.exam_marks
   set theory_score = score
 where theory_score is null;

-- Add check constraints for the 0-50 range on split scores
-- (only if missing - later migrations replace these with the final scales)
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'exam_marks_theory_check' and conrelid = 'public.exam_marks'::regclass
  ) then
    alter table public.exam_marks
      add constraint exam_marks_theory_check check (theory_score is null or theory_score between 0 and 50);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'exam_marks_practical_check' and conrelid = 'public.exam_marks'::regclass
  ) then
    alter table public.exam_marks
      add constraint exam_marks_practical_check check (practical_score is null or practical_score between 0 and 50);
  end if;
end $$;
