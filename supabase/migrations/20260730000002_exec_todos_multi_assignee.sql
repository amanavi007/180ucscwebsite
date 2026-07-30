-- Allow a to-do to be assigned to more than one exec member.
alter table public.exec_todos drop column assigned_to;
alter table public.exec_todos add column assigned_to uuid[] not null default '{}';
