-- Recruitment points piece 2: bulk import, ignore list, booking attendance links.
-- See docs/superpowers/specs/2026-10-07-recruitment-points-bulk-and-linking-design.md.

alter table public.recruit_applicants
  add column if not exists created_by_batch_id uuid;

-- System categories: the app finds these by key, so renaming is fine but archiving is not.
alter table public.recruit_categories
  add column if not exists system_key text;
create unique index if not exists recruit_categories_system_key_idx
  on public.recruit_categories (system_key) where system_key is not null;

update public.recruit_categories set system_key = 'info_session'
  where system_key is null and lower(btrim(name)) = 'info session'
  and not exists (select 1 from public.recruit_categories where system_key = 'info_session');
update public.recruit_categories set system_key = 'coffee_chat_attended'
  where system_key is null and lower(btrim(name)) = 'coffee chat attended'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_attended');
update public.recruit_categories set system_key = 'coffee_chat_no_show'
  where system_key is null and lower(btrim(name)) = 'coffee chat no-show'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_no_show');
update public.recruit_categories set system_key = 'coffee_chat_excused'
  where system_key is null and lower(btrim(name)) = 'coffee chat excused'
  and not exists (select 1 from public.recruit_categories where system_key = 'coffee_chat_excused');

-- If a seeded category was renamed or removed before this migration, recreate the missing key.
insert into public.recruit_categories (name, section, default_points, sort_order, system_key)
select v.name, 'engagement', v.points, v.sort_order, v.key
from (values
  ('Info Session', 1, 10, 'info_session'),
  ('Coffee Chat Attended', 1, 20, 'coffee_chat_attended'),
  ('Coffee Chat No-show', -1, 30, 'coffee_chat_no_show'),
  ('Coffee Chat Excused', 0, 40, 'coffee_chat_excused')
) as v(name, points, sort_order, key)
where not exists (select 1 from public.recruit_categories c where c.system_key = v.key)
  and not exists (select 1 from public.recruit_categories c where lower(btrim(c.name)) = lower(v.name));

create or replace function public.recruit_categories_protect_system()
returns trigger language plpgsql as $$
begin
  if new.system_key is not null and new.archived_at is not null then
    raise exception 'This category is used automatically and cannot be archived.';
  end if;
  return new;
end;
$$;

drop trigger if exists recruit_categories_protect_system on public.recruit_categories;
create trigger recruit_categories_protect_system
  before update on public.recruit_categories
  for each row execute procedure public.recruit_categories_protect_system();

create table public.recruit_ignored_names (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  constraint recruit_ignored_names_unique unique (quarter_id, name)
);

alter table public.recruit_ignored_names enable row level security;
create policy recruit_ignored_names_all on public.recruit_ignored_names
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_booking_links (
  id uuid primary key default gen_random_uuid(),
  booking_kind text not null check (booking_kind in ('coffee_chat', 'interview')),
  booking_id uuid not null,
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  status text not null check (status in ('attended', 'no_show', 'excused')),
  points_id uuid references public.recruit_points (id) on delete set null,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  constraint recruit_booking_links_unique unique (booking_kind, booking_id)
);
create index recruit_booking_links_applicant_idx on public.recruit_booking_links (applicant_id);

alter table public.recruit_booking_links enable row level security;
create policy recruit_booking_links_all on public.recruit_booking_links
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Commit a reviewed attendee list in one transaction.
create or replace function public.commit_recruit_import(
  p_quarter uuid,
  p_event uuid,
  p_category uuid,
  p_points numeric,
  p_rows jsonb
)
returns jsonb
language plpgsql
as $$
declare
  batch uuid := gen_random_uuid();
  r jsonb;
  applicant uuid;
  clean_email text;
  created_n int := 0;
  awarded_n int := 0;
  skipped_n int := 0;
begin
  if not public.is_exec() then
    raise exception 'Only exec can import points.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if r ->> 'kind' = 'ignore' then
      if nullif(btrim(r ->> 'alias'), '') is not null then
        insert into public.recruit_ignored_names (quarter_id, name)
        values (p_quarter, btrim(r ->> 'alias'))
        on conflict (quarter_id, name) do nothing;
      end if;
      continue;
    end if;

    applicant := null;
    if r ->> 'kind' = 'new' then
      clean_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
      if clean_email is not null then
        select id into applicant from public.recruit_applicants
          where quarter_id = p_quarter and email = clean_email and archived_at is null;
      end if;
      if applicant is null then
        insert into public.recruit_applicants (quarter_id, name, email, created_by_batch_id)
        values (p_quarter, btrim(r ->> 'name'), clean_email, batch)
        returning id into applicant;
        created_n := created_n + 1;
      end if;
    else
      applicant := (r ->> 'applicantId')::uuid;
      if not exists (
        select 1 from public.recruit_applicants
        where id = applicant and quarter_id = p_quarter and archived_at is null
      ) then
        skipped_n := skipped_n + 1;
        continue;
      end if;
    end if;

    if nullif(btrim(coalesce(r ->> 'alias', '')), '') is not null then
      insert into public.recruit_applicant_aliases (applicant_id, quarter_id, alias)
      values (applicant, p_quarter, btrim(r ->> 'alias'))
      on conflict (quarter_id, alias) do nothing;
    end if;

    if p_event is not null and exists (
      select 1 from public.recruit_points
      where applicant_id = applicant and event_id = p_event and voided_at is null
    ) then
      skipped_n := skipped_n + 1;
      continue;
    end if;

    insert into public.recruit_points (applicant_id, category_id, event_id, points, source, batch_id, awarded_by)
    values (applicant, p_category, p_event, p_points, 'import', batch, auth.uid());
    awarded_n := awarded_n + 1;
  end loop;

  return jsonb_build_object('batchId', batch, 'created', created_n, 'awarded', awarded_n, 'skipped', skipped_n);
end;
$$;

-- Undo an import: void its points and archive applicants it created that nobody has touched.
create or replace function public.undo_recruit_import(p_batch uuid)
returns integer
language plpgsql
as $$
declare
  voided_n integer;
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo an import.';
  end if;

  update public.recruit_points
    set voided_at = now(), voided_by = auth.uid(), void_reason = 'Import undone'
    where batch_id = p_batch and voided_at is null;
  get diagnostics voided_n = row_count;

  update public.recruit_applicants a
    set archived_at = now()
    where a.created_by_batch_id = p_batch
      and a.archived_at is null
      and a.notes = ''
      and a.major is null
      and a.year is null
      and not exists (
        select 1 from public.recruit_points p where p.applicant_id = a.id and p.voided_at is null
      );

  return voided_n;
end;
$$;

-- Mark (or re-mark) a booking's attendance. Coffee chats pass a category + points; interviews pass nulls.
create or replace function public.mark_recruit_booking(
  p_kind text,
  p_booking uuid,
  p_applicant uuid,
  p_status text,
  p_category uuid,
  p_points numeric,
  p_reason text
)
returns uuid
language plpgsql
as $$
declare
  existing public.recruit_booking_links;
  new_points uuid;
  link_id uuid;
begin
  if not public.is_exec() then
    raise exception 'Only exec can mark attendance.';
  end if;
  if p_kind not in ('coffee_chat', 'interview') then
    raise exception 'Unknown booking type.';
  end if;
  if p_status not in ('attended', 'no_show', 'excused') then
    raise exception 'Unknown attendance status.';
  end if;

  select * into existing from public.recruit_booking_links
    where booking_kind = p_kind and booking_id = p_booking for update;

  if existing.id is not null and existing.points_id is not null then
    update public.recruit_points
      set voided_at = now(), voided_by = auth.uid(), void_reason = 'Attendance changed'
      where id = existing.points_id and voided_at is null;
  end if;

  if p_category is not null then
    insert into public.recruit_points (applicant_id, category_id, points, reason, source, awarded_by)
    values (p_applicant, p_category, p_points, p_reason, 'booking', auth.uid())
    returning id into new_points;
  end if;

  if existing.id is null then
    insert into public.recruit_booking_links (booking_kind, booking_id, applicant_id, status, points_id, marked_by)
    values (p_kind, p_booking, p_applicant, p_status, new_points, auth.uid())
    returning id into link_id;
  else
    update public.recruit_booking_links
      set applicant_id = p_applicant, status = p_status, points_id = new_points,
          marked_by = auth.uid(), marked_at = now()
      where id = existing.id;
    link_id := existing.id;
  end if;

  return link_id;
end;
$$;

create or replace function public.clear_recruit_booking_mark(p_kind text, p_booking uuid)
returns void
language plpgsql
as $$
declare
  existing public.recruit_booking_links;
begin
  if not public.is_exec() then
    raise exception 'Only exec can clear attendance.';
  end if;

  select * into existing from public.recruit_booking_links
    where booking_kind = p_kind and booking_id = p_booking for update;
  if existing.id is null then
    return;
  end if;

  if existing.points_id is not null then
    update public.recruit_points
      set voided_at = now(), voided_by = auth.uid(), void_reason = 'Attendance mark cleared'
      where id = existing.points_id and voided_at is null;
  end if;
  delete from public.recruit_booking_links where id = existing.id;
end;
$$;

-- Merging duplicate applicants must also move their booking links, otherwise the
-- survivor loses its interview attendance (and the absorbed, archived record keeps it).
-- Replaces the piece 1 merge/undo functions; the log gains the ids of the links it moved.
alter table public.recruit_merge_log
  add column if not exists moved_link_ids uuid[] not null default '{}';

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
  moved_links uuid[];
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

  select coalesce(array_agg(id), '{}') into moved_links
    from public.recruit_booking_links where applicant_id = p_absorbed;
  update public.recruit_booking_links set applicant_id = p_survivor where applicant_id = p_absorbed;

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
        moved_link_ids = moved_links,
        added_alias_id = added_alias
    where id = log_id;

  return log_id;
end;
$$;

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

  -- Undo restores a snapshot of the survivor taken at merge time, so a newer merge
  -- into the same survivor has to be undone first or its data would be clobbered.
  if exists (
    select 1 from public.recruit_merge_log
    where survivor_id = l.survivor_id and undone_at is null and created_at > l.created_at
  ) then
    raise exception 'Undo the newer merge into this applicant first.';
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
  update public.recruit_booking_links set applicant_id = l.absorbed_id where id = any (l.moved_link_ids);

  if l.added_alias_id is not null then
    delete from public.recruit_applicant_aliases where id = l.added_alias_id;
  end if;

  update public.recruit_merge_log set undone_at = now() where id = p_log_id;
end;
$$;
