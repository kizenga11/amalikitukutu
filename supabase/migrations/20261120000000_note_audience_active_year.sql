-- Fix duplicate students in the note audience.
--
-- student_subjects keeps one row per academic year, so joining it without a
-- year filter made the same student appear once for every year they have taken
-- the subject. The audience is now limited to the active academic year and
-- de-duplicated with DISTINCT.

create or replace function public.note_audience(p_note_id uuid)
returns table (
  student_id uuid,
  registration_no text,
  full_name text,
  has_viewed boolean,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer,
  download_count integer
)
language sql
security definer
set search_path = public
as $$
  with note_ctx as (
    select ta.subject_id, ta.class_id, ta.stream_id
    from public.notes n
    join public.note_subtopics ns on ns.id = n.subtopic_id
    join public.note_topics nt on nt.id = ns.topic_id
    join public.teaching_assignments ta on ta.id = nt.teaching_assignment_id
    where n.id = p_note_id
  ),
  active_year as (
    select coalesce(
      (select value from public.academic_settings
        where key = 'active_year' and value ~ '^[0-9]{4}$'),
      to_char(now(), 'YYYY')
    ) as year
  ),
  audience as (
    select distinct
           s.id,
           s.registration_no,
           trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) as full_name
    from public.students s
    join public.student_subjects ss on ss.student_id = s.id
    join note_ctx c on c.subject_id = ss.subject_id
                   and c.class_id = s.class_id
                   and c.stream_id = s.stream_id
    cross join active_year y
    where ss.academic_year = y.year
  )
  select a.id as student_id,
         a.registration_no,
         a.full_name,
         (v.id is not null) as has_viewed,
         v.first_viewed_at,
         v.last_viewed_at,
         coalesce(v.view_count, 0) as view_count,
         coalesce(v.download_count, 0) as download_count
  from audience a
  left join public.note_views v on v.note_id = p_note_id and v.student_id = a.id
  order by a.full_name;
$$;

revoke all on function public.note_audience(uuid) from public;
grant execute on function public.note_audience(uuid) to service_role;
