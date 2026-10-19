begin;

create type public.insight_article_status as enum ('draft', 'published');

create table public.insight_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  title text not null check (char_length(title) between 1 and 200),
  deck text not null default '' check (char_length(deck) <= 1000),
  summary text not null default '' check (char_length(summary) <= 1000),
  body text not null default '' check (char_length(body) <= 50000),
  desk text not null check (desk in ('Product Data', 'Standards & Regulation', 'Ecosystem')),
  format text not null check (format in ('Analysis', 'Brief', 'Vendor Watch')),
  status public.insight_article_status not null default 'draft',
  author_profile_id uuid not null references public.profiles (id) on delete restrict,
  linked_product_slug text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create index insight_articles_status_date_idx
  on public.insight_articles (status, published_at desc);

create function public.can_edit_insights()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = auth.uid() and a.status = 'active'
  );
$$;

alter table public.insight_articles enable row level security;
alter table public.insight_articles force row level security;

create policy insight_articles_published_read
on public.insight_articles for select to anon, authenticated
using (status = 'published' or public.can_edit_insights());

create policy insight_articles_editor_write
on public.insight_articles for all to authenticated
using (public.can_edit_insights())
with check (
  public.can_edit_insights()
  and author_profile_id = auth.uid()
);

grant select on public.insight_articles to anon, authenticated;
grant insert, update, delete on public.insight_articles to authenticated;
grant all on public.insight_articles to service_role;
revoke all on function public.can_edit_insights() from public, anon;
grant execute on function public.can_edit_insights() to authenticated;

comment on table public.insight_articles is
  'Small internal editorial workflow for Commonwork Insights. Retained Git-backed articles remain unchanged.';

commit;
