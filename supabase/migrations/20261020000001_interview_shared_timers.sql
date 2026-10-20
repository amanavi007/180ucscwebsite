-- The interview timers live on the session so every exec on the interview sees the same clocks.
-- Each clock is { elapsed: milliseconds counted before the current run, startedAt: epoch milliseconds or null when paused }.
alter table public.interview_sessions
  add column if not exists timers jsonb not null default '{}'::jsonb;

-- Start, pause, reset or switch a clock using the database's clock, so two laptops with different times still agree.
create or replace function public.apply_interview_timer(p_session uuid, p_op text, p_id text, p_ids text[])
returns jsonb
language plpgsql
as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  t jsonb;
  k text;
  c jsonb;
begin
  if not public.is_exec() then
    raise exception 'Only exec can run the interview timers.';
  end if;
  select timers into t from public.interview_sessions where id = p_session for update;
  if not found then
    raise exception 'That interview no longer exists.';
  end if;

  if p_op in ('pause', 'switch') then
    foreach k in array case when p_op = 'pause' then array[p_id] else coalesce(p_ids, '{}'::text[]) end loop
      c := t -> k;
      if c is not null and c ->> 'startedAt' is not null then
        t := jsonb_set(t, array[k], jsonb_build_object(
          'elapsed', (c ->> 'elapsed')::bigint + now_ms - (c ->> 'startedAt')::bigint,
          'startedAt', null::bigint));
      end if;
    end loop;
  end if;

  if p_op in ('start', 'switch') then
    c := t -> p_id;
    if c is null or c ->> 'startedAt' is null then
      t := jsonb_set(t, array[p_id], jsonb_build_object('elapsed', coalesce((c ->> 'elapsed')::bigint, 0), 'startedAt', now_ms));
    end if;
  elsif p_op = 'reset' then
    t := jsonb_set(t, array[p_id], jsonb_build_object('elapsed', 0, 'startedAt', null::bigint));
  end if;

  update public.interview_sessions set timers = t where id = p_session;
  return jsonb_build_object('timers', t, 'now', now_ms);
end;
$$;
