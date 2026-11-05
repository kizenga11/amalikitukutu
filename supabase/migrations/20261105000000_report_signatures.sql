-- ============================================================
-- Student report signatures
-- Academic Officer and Headmaster sign once per class/term;
-- a Stream Teacher signs once per stream/term. Stored server-side
-- only (service role) so signatures cannot be forged from the browser.
-- ============================================================

create table if not exists public.report_signatures (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.school_classes(id) on delete cascade,
  stream_id        uuid references public.streams(id) on delete cascade,
  academic_year_id text not null check (academic_year_id ~ '^[0-9]{4}$'),
  term             integer not null check (term in (1, 2)),
  signer_role      text not null check (signer_role in ('Academic', 'StreamTeacher', 'Headmaster')),
  staff_id         uuid not null references public.staff(id) on delete cascade,
  signer_name      text not null,
  signature_data   text not null check (
    signature_data like 'data:image/png;base64,%'
    and length(signature_data) between 100 and 600000
  ),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint report_signatures_scope_check check (
    (signer_role = 'StreamTeacher' and stream_id is not null)
    or (signer_role in ('Academic', 'Headmaster') and stream_id is null)
  )
);

create index if not exists report_signatures_class_idx
  on public.report_signatures(class_id, academic_year_id, term);

create index if not exists report_signatures_stream_idx
  on public.report_signatures(stream_id, academic_year_id, term);

create unique index if not exists report_signatures_class_role_unique
  on public.report_signatures(class_id, academic_year_id, term, signer_role)
  where stream_id is null;

create unique index if not exists report_signatures_stream_role_unique
  on public.report_signatures(stream_id, academic_year_id, term, signer_role)
  where stream_id is not null;

drop trigger if exists report_signatures_set_updated_at on public.report_signatures;
create trigger report_signatures_set_updated_at
before update on public.report_signatures
for each row execute function public.stream_teacher_set_updated_at();

alter table public.report_signatures enable row level security;
