-- Room hotspots: the clickable room boxes overlaid on the floor plan image
-- in Admin > Rooms (public/rooms/sne-upper-level.png), moved out of the
-- hardcoded ROOM_HOTSPOTS array in src/lib/rooms.ts and into the database
-- so exec can reposition/add/remove rooms from the UI instead of needing a
-- code change + redeploy whenever the meeting space changes. Positions are
-- percentages of the floor plan image's width/height (0-100), matching how
-- the array stored them. "left" collides with the SQL keyword used in
-- LEFT JOIN, so it's quoted everywhere below.
create table public.room_hotspots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  top numeric(6, 2) not null,
  "left" numeric(6, 2) not null,
  width numeric(6, 2) not null,
  height numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger room_hotspots_set_updated_at
  before update on public.room_hotspots
  for each row execute procedure public.set_updated_at();

alter table public.room_hotspots enable row level security;

-- Readable by anyone signed in -- every member needs to see the map to
-- book a room. Writable by exec only, same posture as quick_links/wiki_pages.
create policy room_hotspots_select on public.room_hotspots
  for select to authenticated using (true);

create policy room_hotspots_write on public.room_hotspots
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- Seed with the 8 hotspots that used to live in ROOM_HOTSPOTS so the map
-- doesn't come up empty on first deploy of this migration.
insert into public.room_hotspots (name, top, "left", width, height) values
  ('324', 61.5, 84.14, 9.06, 4.5),
  ('326', 66.0, 84.14, 9.06, 5.0),
  ('328', 72.0, 84.14, 9.06, 4.0),
  ('330', 76.0, 84.14, 9.06, 5.0),
  ('332', 81.5, 71.52, 12.62, 6.5),
  ('308', 58.0, 11.65, 6.47, 4.0),
  ('309', 57.5, 5.18, 6.47, 4.5),
  ('310', 50.75, 5.83, 8.74, 6.25);
