-- ============================================================
-- Atomic student promotion
-- ------------------------------------------------------------
-- Promotes every active student one form up, copies subject
-- enrollments / teacher assignments / stream teachers into the
-- new academic year and graduates Form IV — all in one
-- transaction. Re-running the same from/to pair is refused.
-- ============================================================

create or replace function public.promote_students(
  p_from_year text,
  p_to_year text,
  p_set_active boolean default true,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_promoted int := 0;
  v_graduated int := 0;
  v_enrollments int := 0;
  v_assignments int := 0;
  v_stream_teachers int := 0;
  v_unassigned int := 0;
  v_missing_streams int := 0;
  v_missing_teacher_streams int := 0;
  v_warnings jsonb := '[]'::jsonb;
begin
  if p_from_year !~ '^[0-9]{4}$' or p_to_year !~ '^[0-9]{4}$' then
    raise exception 'Academic years must be four-digit values';
  end if;
  if p_to_year::int <> p_from_year::int + 1 then
    raise exception 'The target year must be the year after %', p_from_year;
  end if;

  select id into v_existing
    from public.promotion_history
   where from_year = p_from_year and to_year = p_to_year;
  if v_existing is not null then
    raise exception 'Students were already promoted from % to %', p_from_year, p_to_year;
  end if;

  -- -------- 1. Copy subject enrollments into the new year --------
  insert into public.student_subjects (student_id, subject_id, academic_year)
  select ss.student_id, ss.subject_id, p_to_year
    from public.student_subjects ss
    join public.students s on s.id = ss.student_id
    join public.school_classes sc on sc.id = s.class_id
   where ss.academic_year = p_from_year
     and s.status = 'Active'
     and sc.form_level between 1 and 3
  on conflict (student_id, subject_id, academic_year) do nothing;
  get diagnostics v_enrollments = row_count;

  -- -------- 2. Copy teacher subject assignments --------
  insert into public.teaching_assignments
    (teacher_id, subject_id, class_id, stream_id, academic_year)
  select ta.teacher_id,
         ta.subject_id,
         tc.id,
         ts.id,
         p_to_year
    from public.teaching_assignments ta
    join public.school_classes sc on sc.id = ta.class_id
    join public.school_classes tc on tc.form_level = sc.form_level + 1
    join public.streams ss on ss.id = ta.stream_id
    join public.streams ts on ts.class_id = tc.id and lower(ts.name) = lower(ss.name)
   where ta.academic_year = p_from_year
     and sc.form_level between 1 and 3
  on conflict (teacher_id, subject_id, class_id, stream_id, academic_year) do nothing;
  get diagnostics v_assignments = row_count;

  -- -------- 3. Copy stream (mkondo) teachers --------
  insert into public.stream_teachers
    (teacher_id, stream_id, academic_year_id, assigned_by, is_active)
  select st.teacher_id,
         ts.id,
         p_to_year,
         st.assigned_by,
         true
    from public.stream_teachers st
    join public.streams ss on ss.id = st.stream_id
    join public.school_classes sc on sc.id = ss.class_id
    join public.school_classes tc on tc.form_level = sc.form_level + 1
    join public.streams ts on ts.class_id = tc.id and lower(ts.name) = lower(ss.name)
   where st.academic_year_id = p_from_year
     and st.is_active = true
     and sc.form_level between 1 and 3
  on conflict (teacher_id, stream_id, academic_year_id) do nothing;
  get diagnostics v_stream_teachers = row_count;

  -- -------- 4. Move Form I–III students one form up --------
  with mapping as (
    select s.id as student_id,
           tc.id as target_class_id,
           ts.id as target_stream_id
      from public.students s
      join public.school_classes sc on sc.id = s.class_id
      join public.school_classes tc on tc.form_level = sc.form_level + 1
      left join public.streams ss on ss.id = s.stream_id
      left join public.streams ts on ts.class_id = tc.id and lower(ts.name) = lower(ss.name)
     where s.status = 'Active'
       and sc.form_level between 1 and 3
  )
  update public.students s
     set class_id = m.target_class_id,
         stream_id = m.target_stream_id
    from mapping m
   where s.id = m.student_id;
  get diagnostics v_promoted = row_count;

  -- -------- 5. Graduate Form IV --------
  update public.students s
     set status = 'Graduated',
         graduated_year = p_from_year
    from public.school_classes sc
   where s.class_id = sc.id
     and s.status = 'Active'
     and sc.form_level = 4;
  get diagnostics v_graduated = row_count;

  -- -------- 6. Collect warnings --------
  select count(*) into v_unassigned
    from public.students
   where status = 'Active' and class_id is null;
  if v_unassigned > 0 then
    v_warnings := v_warnings || to_jsonb(
      format('%s active student(s) have no class and were left unchanged.', v_unassigned)
    );
  end if;

  select count(*) into v_missing_streams
    from public.students s
    join public.school_classes sc on sc.id = s.class_id
    join public.school_classes tc on tc.form_level = sc.form_level + 1
    left join public.streams ss on ss.id = s.stream_id
    left join public.streams ts on ts.class_id = tc.id and lower(ts.name) = lower(ss.name)
   where s.status = 'Active'
     and sc.form_level between 1 and 3
     and ss.id is not null
     and ts.id is null;
  if v_missing_streams > 0 then
    v_warnings := v_warnings || to_jsonb(
      format('%s student(s) have a stream that does not exist in the next form; assign their stream manually.', v_missing_streams)
    );
  end if;

  select count(*) into v_missing_teacher_streams
    from public.teaching_assignments ta
    join public.school_classes sc on sc.id = ta.class_id
    join public.school_classes tc on tc.form_level = sc.form_level + 1
    join public.streams ss on ss.id = ta.stream_id
    left join public.streams ts on ts.class_id = tc.id and lower(ts.name) = lower(ss.name)
   where ta.academic_year = p_from_year
     and sc.form_level between 1 and 3
     and ts.id is null;
  if v_missing_teacher_streams > 0 then
    v_warnings := v_warnings || to_jsonb(
      format('%s teacher assignment(s) were not copied because the matching stream is missing in the next form.', v_missing_teacher_streams)
    );
  end if;

  -- -------- 7. Record the promotion --------
  insert into public.promotion_history
    (from_year, to_year, promoted, graduated, details, performed_by)
  values (
    p_from_year,
    p_to_year,
    v_promoted,
    v_graduated,
    jsonb_build_object(
      'enrollments', v_enrollments,
      'teachingAssignments', v_assignments,
      'streamTeachers', v_stream_teachers,
      'warnings', v_warnings
    ),
    p_performed_by
  );

  -- -------- 8. Optionally switch the active year --------
  if p_set_active then
    insert into public.academic_settings (key, value)
    values ('active_year', p_to_year)
    on conflict (key) do update set value = excluded.value, updated_at = now();

    insert into public.academic_settings (key, value)
    values ('active_term', '1')
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;

  return jsonb_build_object(
    'fromYear', p_from_year,
    'toYear', p_to_year,
    'promoted', v_promoted,
    'graduated', v_graduated,
    'enrollments', v_enrollments,
    'teachingAssignments', v_assignments,
    'streamTeachers', v_stream_teachers,
    'warnings', v_warnings
  );
end;
$$;

revoke all on function public.promote_students(text, text, boolean, uuid) from public;
revoke all on function public.promote_students(text, text, boolean, uuid) from anon, authenticated;
grant execute on function public.promote_students(text, text, boolean, uuid) to service_role;
