-- Fix student registration: 42725 "function public.reconcile_student_compulsory_subjects(uuid) is not unique".
--
-- 20261113000000_academic_year_rollover.sql added a *year* argument with a
-- default (p_year text default null). Because "create or replace function"
-- only replaces an identical signature, the original one-argument version from
-- 20260112000000 / 20260113000000 stayed in place. From then on every call with
-- just the student id matched two candidates, so Postgres raised 42725 and the
-- students insert/update triggers could not run — saving or importing a student
-- failed with that message.
--
-- Dropping the old one-argument overload leaves the year-aware version, which
-- still accepts a single argument through its default. Calls that pass a year
-- (trg_restore_student_compulsory_subjects) keep working unchanged.

drop function if exists public.reconcile_student_compulsory_subjects(uuid);
