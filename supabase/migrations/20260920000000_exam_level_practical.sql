-- Exam-level theory/practical marks policy.
--
-- Which scale a mark uses is decided by the EXAM, not the subject alone:
--   * Exam with has_practical = true  -> practical subjects use Theory 0-50
--     plus Practical 0-50 (their sum is the full 0-100). Non-practical
--     subjects still use a single Theory 0-100.
--   * Exam with has_practical = false -> every subject uses a single
--     Theory 0-100 mark and practical_score must be NULL.
--
-- This lets legacy exams (a single 0-100 mark per subject, no practical
-- split) be imported exactly as recorded, while practical exams keep the
-- 50/50 theory/practical entry.

create or replace function public.validate_exam_mark_scores()
returns trigger
language plpgsql
as $$
declare
  practical       boolean;
  exam_practical  boolean;
begin
  select has_practical
    into practical
    from public.subjects
   where id = new.subject_id;

  if practical is null then
    raise exception 'Subject % does not exist', new.subject_id;
  end if;

  select has_practical
    into exam_practical
    from public.exams
   where id = new.exam_id;

  if exam_practical is null then
    raise exception 'Exam % does not exist', new.exam_id;
  end if;

  if practical and exam_practical then
    if new.theory_score is not null and (new.theory_score < 0 or new.theory_score > 50) then
      raise exception 'Theory score for a practical subject must be between 0 and 50';
    end if;
    if new.practical_score is not null and (new.practical_score < 0 or new.practical_score > 50) then
      raise exception 'Practical score must be between 0 and 50';
    end if;
  else
    if new.theory_score is not null and (new.theory_score < 0 or new.theory_score > 100) then
      raise exception 'Theory score must be between 0 and 100';
    end if;
    if new.practical_score is not null then
      raise exception 'This exam does not use practical marks';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_exam_mark_scores on public.exam_marks;
create trigger validate_exam_mark_scores
before insert or update of subject_id, theory_score, practical_score
on public.exam_marks
for each row
execute function public.validate_exam_mark_scores();