-- Recruitment points system, piece 1 (foundation). See docs/superpowers/specs/
-- 2026-10-07-recruitment-points-foundation-design.md.
--
-- Exec-only everywhere: every table has one RLS policy gated on is_exec() and
-- there is deliberately no anon policy. Applicants never see any of this.

create table public.recruit_applicants (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  email text,
  major text,
  year text,
  notes text not null default '',
  previous_applicant_id uuid references public.recruit_applicants (id) on delete set null,
  merged_into_id uuid references public.recruit_applicants (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_applicants_email_normalized check (email is null or email = lower(btrim(email)))
);

-- One live applicant per email per quarter. Archived (merged) rows keep their
-- email but don't count, so a merge can hand the email to the survivor.
create unique index recruit_applicants_email_idx
  on public.recruit_applicants (quarter_id, email)
  where email is not null and archived_at is null;
create index recruit_applicants_quarter_idx on public.recruit_applicants (quarter_id);

alter table public.recruit_applicants enable row level security;
create policy recruit_applicants_all on public.recruit_applicants
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_applicants_set_updated_at
  before update on public.recruit_applicants
  for each row execute procedure public.set_updated_at();

create table public.recruit_applicant_aliases (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  created_at timestamptz not null default now(),
  constraint recruit_applicant_aliases_unique unique (quarter_id, alias)
);
create index recruit_applicant_aliases_applicant_idx on public.recruit_applicant_aliases (applicant_id);

alter table public.recruit_applicant_aliases enable row level security;
create policy recruit_applicant_aliases_all on public.recruit_applicant_aliases
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Not quarter-scoped: the category setup carries over every cycle.
create table public.recruit_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  section text not null check (section in ('engagement', 'resume', 'interview')),
  default_points numeric not null default 1,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index recruit_categories_name_idx on public.recruit_categories (lower(btrim(name)));

alter table public.recruit_categories enable row level security;
create policy recruit_categories_all on public.recruit_categories
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.recruit_categories (name, section, default_points, sort_order) values
  ('Info Session', 'engagement', 1, 10),
  ('Coffee Chat Attended', 'engagement', 1, 20),
  ('Coffee Chat No-show', 'engagement', -1, 30),
  ('Coffee Chat Excused', 'engagement', 0, 40)
on conflict do nothing;

create table public.recruit_events (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  category_id uuid not null references public.recruit_categories (id),
  name text not null check (btrim(name) <> ''),
  date date not null,
  created_at timestamptz not null default now()
);
create index recruit_events_quarter_idx on public.recruit_events (quarter_id, date);

alter table public.recruit_events enable row level security;
create policy recruit_events_all on public.recruit_events
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Append-only ledger. Never hard-deleted: voiding is the only removal.
create table public.recruit_points (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id),
  category_id uuid not null references public.recruit_categories (id),
  event_id uuid references public.recruit_events (id),
  points numeric not null,
  reason text,
  source text not null default 'manual' check (source in ('manual', 'import', 'booking')),
  batch_id uuid,
  awarded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text
);
create index recruit_points_applicant_idx on public.recruit_points (applicant_id);
create index recruit_points_batch_idx on public.recruit_points (batch_id) where batch_id is not null;

alter table public.recruit_points enable row level security;
create policy recruit_points_all on public.recruit_points
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create or replace function public.recruit_points_check_category()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.recruit_categories where id = new.category_id and archived_at is not null) then
    raise exception 'That category is archived.';
  end if;
  return new;
end;
$$;

create trigger recruit_points_check_category
  before insert on public.recruit_points
  for each row execute procedure public.recruit_points_check_category();

-- "Not the same person" dismissals, stored as an ordered pair (a < b).
create table public.recruit_not_duplicates (
  applicant_a uuid not null references public.recruit_applicants (id) on delete cascade,
  applicant_b uuid not null references public.recruit_applicants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (applicant_a, applicant_b),
  constraint recruit_not_duplicates_ordered check (applicant_a < applicant_b)
);

alter table public.recruit_not_duplicates enable row level security;
create policy recruit_not_duplicates_all on public.recruit_not_duplicates
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_merge_log (
  id uuid primary key default gen_random_uuid(),
  survivor_id uuid not null references public.recruit_applicants (id) on delete cascade,
  absorbed_id uuid not null references public.recruit_applicants (id) on delete cascade,
  moved_point_ids uuid[] not null default '{}',
  moved_alias_ids uuid[] not null default '{}',
  added_alias_id uuid,
  survivor_before jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

alter table public.recruit_merge_log enable row level security;
create policy recruit_merge_log_all on public.recruit_merge_log
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Merge `p_absorbed` into `p_survivor` in one transaction. Returns the log id.
create or replace function public.merge_recruit_applicants(
  p_survivor uuid,
  p_absorbed uuid,
  p_absorbed_alias text default null,
  p_keep_email text default null
)
returns uuid
language plpgsql
as $$
declare
  s public.recruit_applicants;
  a public.recruit_applicants;
  new_email text;
  new_notes text;
  moved_points uuid[];
  moved_aliases uuid[];
  added_alias uuid;
  log_id uuid;
begin
  if not public.is_exec() then
    raise exception 'Only exec can merge applicants.';
  end if;
  if p_survivor = p_absorbed then
    raise exception 'Pick two different applicants.';
  end if;

  select * into s from public.recruit_applicants where id = p_survivor for update;
  select * into a from public.recruit_applicants where id = p_absorbed for update;
  if s.id is null or a.id is null then
    raise exception 'Applicant not found.';
  end if;
  if s.quarter_id <> a.quarter_id then
    raise exception 'Those applicants are in different quarters.';
  end if;
  if s.archived_at is not null or a.archived_at is not null then
    raise exception 'An archived applicant cannot be merged.';
  end if;

  if s.email is not null and a.email is not null and s.email <> a.email then
    if p_keep_email is null or p_keep_email not in (s.email, a.email) then
      raise exception 'Both applicants have different emails; choose which one to keep.';
    end if;
    new_email := p_keep_email;
  else
    new_email := coalesce(s.email, a.email);
  end if;

  new_notes := case
    when btrim(s.notes) = '' then a.notes
    when btrim(a.notes) = '' then s.notes
    else s.notes || E'\n\n' || a.notes
  end;

  insert into public.recruit_merge_log (survivor_id, absorbed_id, survivor_before)
  values (
    p_survivor, p_absorbed,
    jsonb_build_object('email', s.email, 'major', s.major, 'year', s.year, 'notes', s.notes)
  )
  returning id into log_id;

  -- Archive first so the absorbed row releases its email before the survivor takes it.
  update public.recruit_applicants
    set archived_at = now(), merged_into_id = p_survivor
    where id = p_absorbed;

  select coalesce(array_agg(id), '{}') into moved_points
    from public.recruit_points where applicant_id = p_absorbed;
  update public.recruit_points set applicant_id = p_survivor where applicant_id = p_absorbed;

  select coalesce(array_agg(id), '{}') into moved_aliases
    from public.recruit_applicant_aliases where applicant_id = p_absorbed;
  update public.recruit_applicant_aliases set applicant_id = p_survivor where applicant_id = p_absorbed;

  if p_absorbed_alias is not null and btrim(p_absorbed_alias) <> '' then
    insert into public.recruit_applicant_aliases (applicant_id, quarter_id, alias)
    values (p_survivor, s.quarter_id, p_absorbed_alias)
    on conflict (quarter_id, alias) do nothing
    returning id into added_alias;
  end if;

  update public.recruit_applicants
    set email = new_email,
        major = coalesce(s.major, a.major),
        year = coalesce(s.year, a.year),
        notes = new_notes
    where id = p_survivor;

  update public.recruit_merge_log
    set moved_point_ids = moved_points,
        moved_alias_ids = moved_aliases,
        added_alias_id = added_alias
    where id = log_id;

  return log_id;
end;
$$;

-- Reverse a merge: restore the survivor's old fields, un-archive the absorbed
-- record, and move back exactly the rows the merge moved.
create or replace function public.undo_merge_recruit_applicants(p_log_id uuid)
returns void
language plpgsql
as $$
declare
  l public.recruit_merge_log;
  s public.recruit_applicants;
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo a merge.';
  end if;

  select * into l from public.recruit_merge_log where id = p_log_id for update;
  if l.id is null then
    raise exception 'Merge not found.';
  end if;
  if l.undone_at is not null then
    raise exception 'That merge was already undone.';
  end if;

  select * into s from public.recruit_applicants where id = l.survivor_id for update;
  if s.archived_at is not null then
    raise exception 'The surviving applicant was merged into someone else; undo that merge first.';
  end if;

  update public.recruit_applicants
    set email = l.survivor_before ->> 'email',
        major = l.survivor_before ->> 'major',
        year = l.survivor_before ->> 'year',
        notes = coalesce(l.survivor_before ->> 'notes', '')
    where id = l.survivor_id;

  update public.recruit_applicants
    set archived_at = null, merged_into_id = null
    where id = l.absorbed_id;

  update public.recruit_points set applicant_id = l.absorbed_id where id = any (l.moved_point_ids);
  update public.recruit_applicant_aliases set applicant_id = l.absorbed_id where id = any (l.moved_alias_ids);

  if l.added_alias_id is not null then
    delete from public.recruit_applicant_aliases where id = l.added_alias_id;
  end if;

  update public.recruit_merge_log set undone_at = now() where id = p_log_id;
end;
$$;
