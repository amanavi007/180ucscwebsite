-- Public Team page profiles. Name/role/section come from `profiles` at render
-- time; this table holds only what members supply themselves. Member edits
-- land in the pending_* columns and go live only when an exec approves.
-- No write policies for `authenticated`: every write goes through a server
-- action using the service-role client after an explicit caller check.

create table public.team_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text check (bio is null or char_length(bio) <= 120),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/.+'),
  major text check (major is null or char_length(major) <= 80),
  photo_path text,
  listed boolean not null default false,
  pending_bio text check (pending_bio is null or char_length(pending_bio) <= 120),
  pending_linkedin_url text check (pending_linkedin_url is null or pending_linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/.+'),
  pending_major text check (pending_major is null or char_length(pending_major) <= 80),
  pending_photo_path text,
  pending_submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (pending_submitted_at is null or pending_photo_path is not null)
);

alter table public.team_profiles enable row level security;

create policy team_profiles_select on public.team_profiles
  for select to authenticated
  using (profile_id = auth.uid() or public.is_exec());

create trigger team_profiles_set_updated_at
  before update on public.team_profiles
  for each row execute function public.set_updated_at();

-- Public bucket: JPEG only, 1 MB. Members may upload only under their own
-- folder; execs may upload for anyone (editing on a member's behalf).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy team_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_exec())
  );
