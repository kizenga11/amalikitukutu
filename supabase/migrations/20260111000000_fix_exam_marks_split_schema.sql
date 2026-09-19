-- Fix the exam_marks schema used by the theory/practical marks form.
--
-- The original table made the legacy score column NOT NULL, but the current
-- application writes theory_score and practical_score instead. Keep score for
-- backwards compatibility, but allow new split-score rows to omit it.
alter table public.exam_marks
  alter column score drop not null;

-- Theory-only subjects accept 0-100. Practical subjects still use 0-50 for
-- each component; application validation determines which scale applies.
alter table public.exam_marks
  drop constraint if exists exam_marks_theory_check,
  drop constraint if exists exam_marks_practical_check;

alter table public.exam_marks
  add constraint exam_marks_theory_check
    check (theory_score is null or theory_score between 0 and 100),
  add constraint exam_marks_practical_check
    check (practical_score is null or practical_score between 0 and 50);

-- Enforce the subject-specific scale at the database boundary as well:
-- practical subjects use Theory 0-50 plus Practical 0-50, while theory-only
-- subjects use Theory 0-100 and do not accept a practical score.
create or replace function public.validate_exam_mark_scores()
returns trigger
language plpgsql
as $$
declare
  practical boolean;
begin
  select has_practical
    into practical
    from public.subjects
   where id = new.subject_id;

  if practical is null then
    raise exception 'Subject % does not exist', new.subject_id;
  end if;

  if practical then
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
      raise exception 'Theory-only subjects cannot have a practical score';
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
