-- Live interview workspace: one session per interview (picked questions, research prompt, case, shared notes),
-- plus one 40-point scorecard per interviewer. A submitted scorecard is also mirrored into recruit_reviews
-- (stage 'interview') so the decision view keeps working; see src/actions/interview-session.ts.

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.interview_bookings (id) on delete set null,
  applicant_id uuid unique references public.recruit_applicants (id) on delete cascade,
  behavioral_keys text[] not null default '{}',
  research_key text,
  case_key text,
  -- Shared notes, one text value per field key (a behavioral question, the research portion, the case summary...).
  notes jsonb not null default '{}'::jsonb,
  notes_updated_by uuid references public.profiles (id) on delete set null,
  notes_updated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_sessions_target check (booking_id is not null or applicant_id is not null)
);

alter table public.interview_sessions enable row level security;
create policy interview_sessions_all on public.interview_sessions
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger interview_sessions_set_updated_at
  before update on public.interview_sessions
  for each row execute procedure public.set_updated_at();

create table public.interview_session_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  -- Criterion key -> whole-number score. Keys and maximums live in src/lib/interview-guide.ts.
  scores jsonb not null default '{}'::jsonb,
  recommendation text check (recommendation in ('yes', 'maybe', 'no')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_session_scores_unique unique (session_id, reviewer_id)
);
create index interview_session_scores_reviewer_idx on public.interview_session_scores (reviewer_id);

alter table public.interview_session_scores enable row level security;
create policy interview_session_scores_all on public.interview_session_scores
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger interview_session_scores_set_updated_at
  before update on public.interview_session_scores
  for each row execute procedure public.set_updated_at();

-- Merge a few changed note fields in one statement, so two people typing in different fields don't overwrite each other.
create or replace function public.merge_interview_notes(p_session uuid, p_patch jsonb)
returns void
language plpgsql
as $$
begin
  if not public.is_exec() then
    raise exception 'Only exec can edit interview notes.';
  end if;
  update public.interview_sessions
    set notes = notes || p_patch,
        notes_updated_by = auth.uid(),
        notes_updated_at = now()
    where id = p_session;
end;
$$;

-- The interview rubric becomes one number out of 40 (the 11 line scores are kept on interview_session_scores).
update public.recruit_rubrics set scale_min = 0, scale_max = 40 where stage = 'interview';

update public.recruit_rubric_criteria set archived_at = now()
where archived_at is null
  and rubric_id = (select id from public.recruit_rubrics where stage = 'interview');

insert into public.recruit_rubric_criteria (rubric_id, name, description, weight, sort_order)
select id, 'Interview score (out of 40)',
  E'Behavioral 16 + Research 10 + Case 14. Filled in from the interview scorecard on the Interviews tab.', 1, 10
from public.recruit_rubrics where stage = 'interview';
