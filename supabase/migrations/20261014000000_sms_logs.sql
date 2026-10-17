-- ============================================================
-- SMS history / audit trail
-- One row per recipient per send campaign. A "campaign" is a
-- single send action (either exam results or a custom message).
--
-- Only the service role (server-side API routes) writes and
-- reads this table: RLS is enabled with no policies, so anon /
-- authenticated clients cannot touch it directly.
-- ============================================================

create table if not exists public.sms_logs (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null,
  created_at     timestamptz not null default now(),
  kind           text not null,
  exam_id        uuid references public.exams(id) on delete set null,
  exam_name      text,
  message        text not null default '',
  student_id     uuid,
  recipient_name text,
  phone          text,
  status         text not null,
  detail         text,
  message_id     text,
  sender_id      uuid,
  sender_name    text
);

create index if not exists sms_logs_campaign_idx on public.sms_logs(campaign_id);
create index if not exists sms_logs_created_idx  on public.sms_logs(created_at desc);
create index if not exists sms_logs_kind_idx     on public.sms_logs(kind);

alter table public.sms_logs enable row level security;
