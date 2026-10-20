-- Interviews are scored jointly: one scorecard per interview, kept on the session. The earlier per-interviewer
-- table (interview_session_scores) is no longer written to.
alter table public.interview_sessions
  add column if not exists scores jsonb not null default '{}'::jsonb,
  add column if not exists recommendation text check (recommendation in ('yes', 'maybe', 'no')),
  add column if not exists scored_at timestamptz,
  add column if not exists scored_by uuid references public.profiles (id) on delete set null;

-- Change only the lines that were touched, so two people clicking different lines don't overwrite each other.
create or replace function public.merge_interview_scores(p_session uuid, p_set jsonb, p_clear text[])
returns void
language plpgsql
as $$
begin
  if not public.is_exec() then
    raise exception 'Only exec can score interviews.';
  end if;
  update public.interview_sessions
    set scores = (scores || p_set) - coalesce(p_clear, '{}'::text[])
    where id = p_session;
end;
$$;
