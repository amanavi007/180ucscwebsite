-- Lets PMs/exec reorder Resources pages instead of always sorting alphabetically.

alter table public.wiki_pages
  add column order_index integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by section, parent_id
      order by title asc
    ) - 1 as rn
  from public.wiki_pages
)
update public.wiki_pages
set order_index = ranked.rn
from ranked
where public.wiki_pages.id = ranked.id;

create index wiki_pages_order_idx on public.wiki_pages (section, parent_id, order_index);
