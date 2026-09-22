-- Allow a person to be tagged as both a PM candidate and an SC candidate for
-- the same quarter at once. Previously (quarter_id, user_id) was unique,
-- capping each person to a single candidate_role per quarter; switch to
-- (quarter_id, user_id, candidate_role) so one row per role can coexist.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.lead_candidates'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.lead_candidates'::regclass
        and attname in ('quarter_id', 'user_id')
    );
  if con_name is not null then
    execute format('alter table public.lead_candidates drop constraint %I', con_name);
  end if;
end $$;

alter table public.lead_candidates
  add constraint lead_candidates_quarter_id_user_id_role_key unique (quarter_id, user_id, candidate_role);
