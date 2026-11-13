-- ============================================================
-- Study Notes (teacher-uploaded PDFs for students)
-- Adapted to project schema:
--   - staff (not teachers) via auth_user_id
--   - teaching_assignments (subject/class/stream/teacher) as note context
--   - students with class_id/stream_id + student_subjects (no enrollments)
--   - student portal uses custom cookie sessions (no student auth.uid),
--     so all access is enforced in server route handlers using service role.
-- RLS enabled with no permissive browser policies on app tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table if not exists public.note_topics (
  id            uuid primary key default gen_random_uuid(),
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  title         text not null check (char_length(trim(title)) > 0),
  subtopic_count integer not null check (subtopic_count >= 1 and subtopic_count <= 100),
  created_by    uuid not null references public.staff(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists note_topics_teaching_assignment_idx
  on public.note_topics(teaching_assignment_id);
create index if not exists note_topics_created_by_idx
  on public.note_topics(created_by);

create table if not exists public.note_subtopics (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.note_topics(id) on delete cascade,
  position    integer not null check (position >= 1),
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (topic_id, position)
);

create index if not exists note_subtopics_topic_idx
  on public.note_subtopics(topic_id);

create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  subtopic_id   uuid not null references public.note_subtopics(id) on delete cascade,
  title         text not null check (char_length(trim(title)) > 0),
  description   text,
  file_path     text not null,
  file_name     text not null,
  file_size     bigint,
  mime_type     text not null default 'application/pdf',
  is_published  boolean not null default false,
  published_at  timestamptz,
  created_by    uuid not null references public.staff(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (subtopic_id) -- one PDF per subtopic (replace on re-upload)
);

create index if not exists notes_subtopic_idx on public.notes(subtopic_id);
create index if not exists notes_published_idx on public.notes(is_published);
create index if not exists notes_created_by_idx on public.notes(created_by);

create table if not exists public.note_views (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.notes(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  action      text not null check (action in ('open', 'download')),
  first_viewed_at timestamptz not null default now(),
  last_viewed_at  timestamptz not null default now(),
  view_count  integer not null default 1,
  download_count integer not null default 0,
  unique (note_id, student_id)
);

create index if not exists note_views_note_idx on public.note_views(note_id);
create index if not exists note_views_student_idx on public.note_views(student_id);

-- ------------------------------------------------------------
-- 2. updated_at trigger helper (reusable)
-- ------------------------------------------------------------

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_note_topics_updated_at on public.note_topics;
create trigger trg_note_topics_updated_at
before update on public.note_topics
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_note_subtopics_updated_at on public.note_subtopics;
create trigger trg_note_subtopics_updated_at
before update on public.note_subtopics
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at_timestamp();

-- ------------------------------------------------------------
-- 3. Auto-create subtopics 1..N when a topic is inserted
-- ------------------------------------------------------------

create or replace function public.create_note_subtopics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
begin
  for i in 1..new.subtopic_count loop
    insert into public.note_subtopics (topic_id, position, title)
    values (new.id, i, 'Subtopic ' || i::text)
    on conflict (topic_id, position) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_create_note_subtopics on public.note_topics;
create trigger trg_create_note_subtopics
after insert on public.note_topics
for each row execute function public.create_note_subtopics();

-- ------------------------------------------------------------
-- 4. Record note view/download (called by server with service role)
-- ------------------------------------------------------------

create or replace function public.record_note_view(p_note_id uuid, p_student_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action not in ('open', 'download') then
    raise exception 'Invalid action';
  end if;

  insert into public.note_views (note_id, student_id, action, view_count, download_count)
  values (
    p_note_id,
    p_student_id,
    p_action,
    1,
    case when p_action = 'download' then 1 else 0 end
  )
  on conflict (note_id, student_id) do update
    set last_viewed_at = now(),
        action = excluded.action,
        view_count = public.note_views.view_count + 1,
        download_count = public.note_views.download_count + case when excluded.action = 'download' then 1 else 0 end;
end;
$$;

revoke all on function public.record_note_view(uuid, uuid, text) from public;
grant execute on function public.record_note_view(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- 5. Note audience/stats (who viewed, who hasn't) for a note
--    Audience = students in the note's class/stream taking the subject.
-- ------------------------------------------------------------

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
  audience as (
    select s.id, s.registration_no,
           trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) as full_name
    from public.students s
    join public.student_subjects ss on ss.student_id = s.id
    join note_ctx c on c.subject_id = ss.subject_id
                   and c.class_id = s.class_id
                   and c.stream_id = s.stream_id
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

-- ------------------------------------------------------------
-- 6. Storage bucket for note PDFs (private)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 2097152, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 7. RLS: enabled with no permissive browser policies.
--    Server route handlers use the service role for all access.
-- ------------------------------------------------------------

alter table public.note_topics enable row level security;
alter table public.note_subtopics enable row level security;
alter table public.notes enable row level security;
alter table public.note_views enable row level security;
