-- Recruitment points piece 3: rubrics, reviewer scoring. See
-- docs/superpowers/specs/2026-10-07-recruitment-points-scoring-design.md.

alter table public.recruit_applicants
  add column if not exists application_link text;

create table public.recruit_rubrics (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique check (stage in ('resume', 'interview')),
  scale_min numeric not null default 1,
  scale_max numeric not null default 5,
  updated_at timestamptz not null default now(),
  constraint recruit_rubrics_scale_check check (scale_max > scale_min)
);

alter table public.recruit_rubrics enable row level security;
create policy recruit_rubrics_all on public.recruit_rubrics
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_rubrics_set_updated_at
  before update on public.recruit_rubrics
  for each row execute procedure public.set_updated_at();

create table public.recruit_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.recruit_rubrics (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  weight numeric not null default 1 check (weight >= 0),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index recruit_rubric_criteria_rubric_idx on public.recruit_rubric_criteria (rubric_id);

alter table public.recruit_rubric_criteria enable row level security;
create policy recruit_rubric_criteria_all on public.recruit_rubric_criteria
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_reviews (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  stage text not null check (stage in ('resume', 'interview')),
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  comment text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_reviews_unique unique (applicant_id, stage, reviewer_id)
);
create index recruit_reviews_applicant_idx on public.recruit_reviews (applicant_id);
create index recruit_reviews_reviewer_idx on public.recruit_reviews (reviewer_id);

alter table public.recruit_reviews enable row level security;
create policy recruit_reviews_all on public.recruit_reviews
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger recruit_reviews_set_updated_at
  before update on public.recruit_reviews
  for each row execute procedure public.set_updated_at();

create table public.recruit_review_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.recruit_reviews (id) on delete cascade,
  criterion_id uuid not null references public.recruit_rubric_criteria (id) on delete cascade,
  score numeric not null,
  constraint recruit_review_scores_unique unique (review_id, criterion_id)
);

alter table public.recruit_review_scores enable row level security;
create policy recruit_review_scores_all on public.recruit_review_scores
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- One rubric per stage, with starter criteria any exec can edit.
insert into public.recruit_rubrics (stage) values ('resume'), ('interview')
on conflict (stage) do nothing;

insert into public.recruit_rubric_criteria (rubric_id, name, description, weight, sort_order)
select r.id, c.name, c.description, 1, c.sort_order
from public.recruit_rubrics r
join (values
  ('resume', 'Relevant experience', '1 = nothing relevant, 5 = clearly strong, directly relevant experience', 10),
  ('resume', 'Leadership & impact', '1 = no evidence, 5 = led others and delivered measurable results', 20),
  ('resume', 'Written communication', '1 = unclear or careless, 5 = clear, concise and thoughtful', 30),
  ('interview', 'Problem solving', '1 = struggled to structure the problem, 5 = clear, creative, well-structured thinking', 10),
  ('interview', 'Communication', '1 = hard to follow, 5 = articulate, concise and engaging', 20),
  ('interview', 'Culture fit', '1 = unlikely to thrive in the team, 5 = great team member and motivated by our mission', 30)
) as c(stage, name, description, sort_order) on c.stage = r.stage
where not exists (select 1 from public.recruit_rubric_criteria x where x.rubric_id = r.id);

insert into public.org_settings (key, value) values
  ('recruit_normalize_min_n', '8'),
  ('recruit_disagreement_threshold', '1.5')
on conflict (key) do nothing;
