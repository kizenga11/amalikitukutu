-- ============================================================
-- Performance indexes
-- Additive + idempotent. No data or logic changes: these only
-- speed up the filters/orders the portal already performs.
-- ============================================================

-- students: filtered by class/stream, listed by name
create index if not exists students_class_idx  on public.students (class_id);
create index if not exists students_stream_idx on public.students (stream_id);
create index if not exists students_name_idx   on public.students (last_name, first_name);

-- staff: teaching roster filtered by role, listed by name
create index if not exists staff_role_idx on public.staff (role);
create index if not exists staff_name_idx on public.staff (last_name, first_name);

-- student_subjects: student's subject list (student + subject lookup)
create index if not exists student_subjects_student_subject_idx
  on public.student_subjects (student_id, subject_id);

-- exam_marks: the hot marks query filters by exam and class together
create index if not exists exam_marks_exam_class_idx
  on public.exam_marks (exam_id, class_id);

-- exams: listed newest-first
create index if not exists exams_created_at_idx on public.exams (created_at desc);

-- performance: aggregated by academic year + term
create index if not exists performance_year_term_idx
  on public.performance (academic_year, term);
