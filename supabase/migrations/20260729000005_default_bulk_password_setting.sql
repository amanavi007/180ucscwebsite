-- Make the shared temp password for bulk-created/reset accounts configurable
-- from Admin > Settings instead of hardcoded, so exec can rotate it.

insert into public.org_settings (key, value)
values ('default_bulk_password', 'ucsc180dc$')
on conflict (key) do nothing;
