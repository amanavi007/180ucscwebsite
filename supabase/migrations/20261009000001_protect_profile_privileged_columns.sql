-- profiles_update lets every user update their own row (needed for must_reset_password,
-- onboarding, alumni details). With no column restriction that also let a signed-in user set
-- their own `role` to president straight through the API. Lock the privileged columns to execs.
--
-- auth.uid() is null for the service role (admin client, migrations, edge jobs), which keeps
-- those paths working. apply_team_plan() runs as the calling exec, so it passes is_exec().

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_exec() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.email is distinct from old.email
     or new.archived_at is distinct from old.archived_at
     or new.departure_reason is distinct from old.departure_reason then
    raise exception 'Only exec can change role, email or archive status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();
