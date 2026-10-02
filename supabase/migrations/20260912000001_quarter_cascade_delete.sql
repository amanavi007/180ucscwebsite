-- Deleting a quarter used to be blocked outright once any project pointed
-- at it (on delete restrict), even for exec cleaning up a mistaken or
-- long-obsolete quarter. Every other table hanging off a project already
-- cascades (memberships, tasks, attendance, room_bookings), so switching
-- this one FK to cascade makes "delete quarter" fully destroy that
-- quarter's projects and everything under them -- the app now gates this
-- with an extra confirmation step instead of the database refusing it.

alter table public.projects
  drop constraint projects_quarter_id_fkey,
  add constraint projects_quarter_id_fkey
    foreign key (quarter_id) references public.quarters (id) on delete cascade;
