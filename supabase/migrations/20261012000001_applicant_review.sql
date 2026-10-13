-- Applicant review: imported application answers, blind reviewer assignment. See
-- docs/superpowers/specs/2026-10-12-applicant-review-design.md.

create table public.recruit_applicant_answers (
  applicant_id uuid primary key references public.recruit_applicants (id) on delete cascade,
  submitted_at timestamptz,
  graduation_term text,
  how_heard text,
  essay_why text,
  essay_teamwork text,
  essay_bring text,
  resume_url text,
  import_batch_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.recruit_applicant_answers enable row level security;
create policy recruit_applicant_answers_all on public.recruit_applicant_answers
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
create trigger recruit_applicant_answers_set_updated_at
  before update on public.recruit_applicant_answers
  for each row execute procedure public.set_updated_at();

create table public.recruit_review_assignments (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  stage text not null default 'resume' check (stage in ('resume', 'interview')),
  assigned_at timestamptz not null default now(),
  constraint recruit_review_assignments_unique unique (applicant_id, reviewer_id, stage)
);
create index recruit_review_assignments_reviewer_idx on public.recruit_review_assignments (reviewer_id);
alter table public.recruit_review_assignments enable row level security;
create policy recruit_review_assignments_all on public.recruit_review_assignments
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_review_exclusions (
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  primary key (applicant_id, reviewer_id)
);
alter table public.recruit_review_exclusions enable row level security;
create policy recruit_review_exclusions_all on public.recruit_review_exclusions
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create table public.recruit_review_reveals (
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  stage text not null default 'resume' check (stage in ('resume', 'interview')),
  revealed_by uuid references public.profiles (id) on delete set null,
  revealed_at timestamptz not null default now(),
  primary key (applicant_id, stage)
);
alter table public.recruit_review_reveals enable row level security;
create policy recruit_review_reveals_all on public.recruit_review_reveals
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

insert into public.org_settings (key, value) values
  ('recruit_reviewers_per_applicant', '2'),
  ('recruit_reviewer_pool', '')
on conflict (key) do nothing;

-- Replace the three starter resume criteria with the generic application rubric,
-- but only if nobody has edited them yet.
do $$
declare rid uuid;
begin
  select id into rid from public.recruit_rubrics where stage = 'resume';
  if rid is not null and (
    select array_agg(name order by name) from public.recruit_rubric_criteria
    where rubric_id = rid and archived_at is null
  ) = array['Leadership & impact', 'Relevant experience', 'Written communication'] then
    update public.recruit_rubric_criteria set archived_at = now()
      where rubric_id = rid and archived_at is null;
    insert into public.recruit_rubric_criteria (rubric_id, name, description, weight, sort_order) values
      (rid, 'Motivation and fit', '1 = generic or unclear reason for joining, 5 = specific, genuine motivation that fits what 180DC does', 1, 10),
      (rid, 'Teamwork and collaboration', '1 = vague or no real team example, 5 = clear example with a challenge handled well', 1, 20),
      (rid, 'Problem-solving and communication', '1 = hard to follow, no clear reasoning, 5 = clear, structured, thoughtful writing', 1, 30),
      (rid, 'Breadth of experience and perspective', '1 = little beyond the basics, 5 = distinctive experience or viewpoint that would strengthen a team', 1, 40),
      (rid, 'Resume and professionalism', '1 = incomplete or careless, 5 = polished, relevant and well organized', 1, 50);
  end if;
end $$;

create or replace function public.commit_application_import(p_quarter uuid, p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  batch uuid := gen_random_uuid();
  r jsonb;
  a jsonb;
  applicant uuid;
  clean_email text;
  created_n int := 0;
  updated_n int := 0;
  skipped_n int := 0;
begin
  if not public.is_exec() then
    raise exception 'Only exec can import applications.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    applicant := null;
    a := coalesce(r -> 'answers', '{}'::jsonb);
    clean_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');

    if r ->> 'kind' = 'update' then
      applicant := (r ->> 'applicantId')::uuid;
      if not exists (
        select 1 from public.recruit_applicants
        where id = applicant and quarter_id = p_quarter and archived_at is null
      ) then
        skipped_n := skipped_n + 1;
        continue;
      end if;
    elsif clean_email is not null then
      select id into applicant from public.recruit_applicants
        where quarter_id = p_quarter and email = clean_email and archived_at is null;
    end if;

    if applicant is null then
      insert into public.recruit_applicants (quarter_id, name, email, major, year, application_link, created_by_batch_id)
      values (
        p_quarter, btrim(r ->> 'name'), clean_email,
        nullif(btrim(coalesce(r ->> 'major', '')), ''),
        nullif(btrim(coalesce(r ->> 'year', '')), ''),
        nullif(btrim(coalesce(a ->> 'resumeUrl', '')), ''),
        batch
      ) returning id into applicant;
      created_n := created_n + 1;
    else
      update public.recruit_applicants set
        email = coalesce(email, clean_email),
        major = coalesce(major, nullif(btrim(coalesce(r ->> 'major', '')), '')),
        year = coalesce(year, nullif(btrim(coalesce(r ->> 'year', '')), '')),
        application_link = coalesce(application_link, nullif(btrim(coalesce(a ->> 'resumeUrl', '')), ''))
      where id = applicant;
      updated_n := updated_n + 1;
    end if;

    insert into public.recruit_applicant_answers
      (applicant_id, submitted_at, graduation_term, how_heard, essay_why, essay_teamwork, essay_bring, resume_url, import_batch_id)
    values (
      applicant,
      nullif(a ->> 'submittedAt', '')::timestamptz,
      nullif(a ->> 'graduationTerm', ''), nullif(a ->> 'howHeard', ''),
      nullif(a ->> 'essayWhy', ''), nullif(a ->> 'essayTeamwork', ''), nullif(a ->> 'essayBring', ''),
      nullif(a ->> 'resumeUrl', ''), batch
    )
    on conflict (applicant_id) do update set
      submitted_at = excluded.submitted_at,
      graduation_term = excluded.graduation_term,
      how_heard = excluded.how_heard,
      essay_why = excluded.essay_why,
      essay_teamwork = excluded.essay_teamwork,
      essay_bring = excluded.essay_bring,
      resume_url = excluded.resume_url,
      import_batch_id = excluded.import_batch_id;
  end loop;

  return jsonb_build_object('batchId', batch, 'created', created_n, 'updated', updated_n, 'skipped', skipped_n);
end;
$$;

-- Archives the applicants this import created (unless they already have submitted reviews or live points).
-- Updates made to applicants that already existed are kept.
create or replace function public.undo_application_import(p_batch uuid)
returns integer
language plpgsql
as $$
declare
  ids uuid[];
begin
  if not public.is_exec() then
    raise exception 'Only exec can undo an import.';
  end if;

  with gone as (
    update public.recruit_applicants a set archived_at = now()
    where a.created_by_batch_id = p_batch
      and a.archived_at is null
      and not exists (select 1 from public.recruit_points p where p.applicant_id = a.id and p.voided_at is null)
      and not exists (select 1 from public.recruit_reviews r where r.applicant_id = a.id and r.submitted_at is not null)
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into ids from gone;

  delete from public.recruit_review_assignments where applicant_id = any (ids);
  return coalesce(array_length(ids, 1), 0);
end;
$$;
