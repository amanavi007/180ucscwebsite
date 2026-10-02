-- Optional client logo per draft team, so Team Builder cards can show a
-- logo instead of just the client name. Scoped to the draft (team_plan_teams)
-- rather than the persistent `clients` table: Team Builder has no linkage to
-- `clients` today and each new quarter's teams are typed fresh by hand, so a
-- draft-scoped field is what actually gets reused (duplicatePlan carries it
-- forward when branching a draft).
alter table public.team_plan_teams
  add column logo_url text;
