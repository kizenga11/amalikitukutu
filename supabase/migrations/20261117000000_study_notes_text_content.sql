-- Allow study notes to be stored as rich text/HTML content (pasted from Word)
-- in addition to PDF files, to reduce storage usage.

alter table public.notes
  add column if not exists content_html text;

-- Make file fields optional so a note can be either a PDF file or text content.
alter table public.notes
  alter column file_path drop not null,
  alter column file_name drop not null,
  alter column mime_type drop not null;

-- A note must have either an uploaded file or text content.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notes_file_or_content_chk'
  ) then
    alter table public.notes
      add constraint notes_file_or_content_chk
      check (
        file_path is not null
        or (content_html is not null and char_length(btrim(content_html)) > 0)
      );
  end if;
end $$;