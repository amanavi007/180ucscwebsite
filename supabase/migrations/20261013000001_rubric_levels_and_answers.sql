-- Each criterion can say which application answer it is read from, so the reviewer screen can tick an answer once it is scored.
alter table public.recruit_rubric_criteria
  add column if not exists answer_key text
  check (answer_key is null or answer_key in ('why', 'teamwork', 'bring', 'resume'));

-- Rewrite the starter application rubric so every score from 1 to 5 has its own meaning, one line per score.
-- Only touches a criterion whose description is still the original starter text.
update public.recruit_rubric_criteria set
  description = E'1 = Generic reason that could apply to any club\n2 = Some interest, but little about 180DC or consulting\n3 = Clear reason, but not tied to what 180DC does\n4 = Specific reason that fits 180DC''s work\n5 = Specific, genuine, and clearly fits what 180DC does',
  answer_key = 'why'
where name = 'Motivation and fit' and archived_at is null
  and description = '1 = generic or unclear reason for joining, 5 = specific, genuine motivation that fits what 180DC does';

update public.recruit_rubric_criteria set
  description = E'1 = No real team example\n2 = Gives an example, but their own role is unclear\n3 = Real example, little on how they handled challenges\n4 = Clear example, challenge handled reasonably\n5 = Clear example, challenge handled well, shows what they learned',
  answer_key = 'teamwork'
where name = 'Teamwork and collaboration' and archived_at is null
  and description = '1 = vague or no real team example, 5 = clear example with a challenge handled well';

update public.recruit_rubric_criteria set
  description = E'1 = Hard to follow, no clear reasoning\n2 = Understandable, but reasoning is thin or scattered\n3 = Readable, reasoning is partly clear\n4 = Clear and well organized\n5 = Clear, structured, thoughtful throughout'
where name = 'Problem-solving and communication' and archived_at is null
  and description = '1 = hard to follow, no clear reasoning, 5 = clear, structured, thoughtful writing';

update public.recruit_rubric_criteria set
  description = E'1 = Little beyond the basics\n2 = Some experience, but fairly generic\n3 = Some relevant range\n4 = Experience or viewpoint that adds something\n5 = Distinctive experience that would strengthen a team',
  answer_key = 'bring'
where name = 'Breadth of experience and perspective' and archived_at is null
  and description = '1 = little beyond the basics, 5 = distinctive experience or viewpoint that would strengthen a team';

update public.recruit_rubric_criteria set
  description = E'1 = Incomplete or careless\n2 = Several gaps or errors\n3 = Solid, with a few gaps\n4 = Polished and mostly relevant\n5 = Polished, relevant, well organized',
  answer_key = 'resume'
where name = 'Resume and professionalism' and archived_at is null
  and description = '1 = incomplete or careless, 5 = polished, relevant and well organized';
