-- ============================================================
-- Stream Teacher report settings
-- Stores teacher-entered report options and behaviour ticks per
-- stream/term so they can be restored on a later visit.
-- ============================================================

create table if not exists public.stream_report_settings (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.staff(id) on delete cascade,
  stream_id        uuid not null references public.streams(id) on delete cascade,
  academic_year_id text not null check (academic_year_id ~ '^[0-9]{4}$'),
  term             integer not null check (term in (1, 2)),
  settings         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (teacher_id, stream_id, academic_year_id, term)
);

create index if not exists stream_report_settings_stream_idx
  on public.stream_report_settings(stream_id, academic_year_id, term);

drop trigger if exists stream_report_settings_set_updated_at on public.stream_report_settings;
create trigger stream_report_settings_set_updated_at
before update on public.stream_report_settings
for each row execute function public.stream_teacher_set_updated_at();

alter table public.stream_report_settings enable row level security;
