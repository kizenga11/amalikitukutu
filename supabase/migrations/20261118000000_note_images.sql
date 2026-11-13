-- ============================================================
-- Study notes: diagrams / images per subtopic
-- Teachers can attach one or more pictures to each subtopic and
-- give each picture a caption (e.g. "Mchoro 1.42: ...").
-- Students see the pictures when the subtopic note is published.
-- ============================================================

create table if not exists public.note_images (
  id           uuid primary key default gen_random_uuid(),
  subtopic_id  uuid not null references public.note_subtopics(id) on delete cascade,
  file_path    text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text not null default 'image/jpeg',
  caption      text,
  position     integer not null default 1 check (position >= 1),
  created_by   uuid not null references public.staff(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists note_images_subtopic_idx
  on public.note_images(subtopic_id);
create index if not exists note_images_created_by_idx
  on public.note_images(created_by);

drop trigger if exists trg_note_images_updated_at on public.note_images;
create trigger trg_note_images_updated_at
before update on public.note_images
for each row execute function public.set_updated_at_timestamp();

-- Private bucket for note diagrams. PDFs stay in the existing "notes" bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Server route handlers use the service role for all access.
alter table public.note_images enable row level security;
