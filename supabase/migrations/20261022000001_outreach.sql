-- Automated client outreach: prospects, the emails sent to them, what happened,
-- the permanent do-not-contact list, and replies. All exec-only; the crons and
-- the Resend webhook use the service-role client.

create table public.outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  website text,
  niche text,
  size_stage text,
  summary text,
  why_fit text,
  -- Array of { text, source_url }: the only facts a draft may state about the company.
  facts jsonb not null default '[]'::jsonb,
  contact_name text,
  contact_role text,
  contact_email text not null,
  contact_domain text not null,
  status text not null default 'new' check (status in (
    'new', 'verified', 'drafted', 'queued', 'sent', 'follow_up_1', 'follow_up_2',
    'closing_note', 'no_response', 'replied', 'booked', 'unsubscribed', 'bounced',
    'invalid', 'needs_attention'
  )),
  status_reason text,
  step int not null default 0,
  next_action_at timestamptz,
  booking_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  last_sent_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_prospects_email_normalized check (contact_email = lower(btrim(contact_email)))
);

create unique index outreach_prospects_email_idx on public.outreach_prospects (contact_email);
create index outreach_prospects_status_idx on public.outreach_prospects (status, next_action_at);
create index outreach_prospects_domain_idx on public.outreach_prospects (contact_domain);

create trigger outreach_prospects_set_updated_at
  before update on public.outreach_prospects
  for each row execute procedure public.set_updated_at();

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects (id) on delete cascade,
  step int not null,
  subject text not null,
  body_text text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed', 'cancelled')),
  resend_id text unique,
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index outreach_messages_prospect_idx on public.outreach_messages (prospect_id);

create table public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.outreach_prospects (id) on delete cascade,
  message_id uuid references public.outreach_messages (id) on delete set null,
  kind text not null check (kind in ('delivered', 'bounced', 'complained', 'replied', 'unsubscribed', 'booked', 'brake')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index outreach_events_prospect_idx on public.outreach_events (prospect_id, created_at);
create index outreach_events_kind_idx on public.outreach_events (kind, created_at);

create table public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint outreach_suppressions_target check (email is not null or domain is not null),
  constraint outreach_suppressions_email_normalized check (email is null or email = lower(btrim(email)))
);

create unique index outreach_suppressions_email_idx on public.outreach_suppressions (email) where email is not null;
create unique index outreach_suppressions_domain_idx on public.outreach_suppressions (domain) where domain is not null;

create table public.outreach_replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.outreach_prospects (id) on delete set null,
  resend_email_id text not null unique,
  from_email text not null,
  subject text not null,
  snippet text not null,
  classification text not null,
  forwarded_at timestamptz,
  created_at timestamptz not null default now()
);

create index outreach_replies_prospect_idx on public.outreach_replies (prospect_id);

alter table public.outreach_prospects enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_events enable row level security;
alter table public.outreach_suppressions enable row level security;
alter table public.outreach_replies enable row level security;

create policy outreach_prospects_all on public.outreach_prospects
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy outreach_messages_all on public.outreach_messages
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy outreach_events_all on public.outreach_events
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy outreach_suppressions_all on public.outreach_suppressions
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create policy outreach_replies_all on public.outreach_replies
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('outreach_mode', 'off'),
  ('outreach_paused', 'false'),
  ('outreach_daily_cap_override', ''),
  ('outreach_started_on', ''),
  ('outreach_window_start_hour', '9'),
  ('outreach_window_end_hour', '16'),
  ('outreach_sender_name', '180 Degrees Consulting at UCSC'),
  ('outreach_postal_address', '1156 High St, Santa Cruz, CA 95064'),
  ('outreach_followup_days', '4,9,15')
on conflict (key) do nothing;
