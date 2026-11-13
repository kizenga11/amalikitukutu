-- Allow richer assignment question types (matching, structured/parts, calculation).
-- Keeps existing types for backward compatibility.

alter table if exists public.assignment_questions
  drop constraint if exists assignment_questions_question_type_check;

alter table if exists public.assignment_questions
  add constraint assignment_questions_question_type_check
  check (question_type in ('essay', 'short_answer', 'mcq', 'matching', 'structured', 'calculation'));

comment on column public.assignment_questions.options is
  'Type-specific config as JSON (MCQ choices/labels, matching pairs, structured parts, etc.).';
