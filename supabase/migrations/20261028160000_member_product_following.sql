begin;

-- Private interest signal: one active relationship per member and product.
-- Stable references only; names and slugs are never stored. Unfollow deletes the
-- row, so counts can only ever reflect active follows, never follow history.
create table public.product_follows (
  member_id uuid not null references auth.users (id) on delete cascade,
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (member_id, provider_product_id)
);

create index product_follows_member_order_idx
  on public.product_follows (member_id, followed_at desc, provider_product_id);
create index product_follows_product_idx
  on public.product_follows (provider_product_id);

-- No client grants and no policies: members reach their own rows only through
-- the RPCs below, so a member can never read or write another member's follows.
alter table public.product_follows enable row level security;
revoke all on public.product_follows from public, anon, authenticated;
grant all on public.product_follows to service_role;

comment on table public.product_follows is
  'Private member interest in a published provider product. Interest only: not endorsement, use, competence, affiliation or an introduction.';

-- A product can be newly followed only while it and its provider are published.
create function public.is_product_followable(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_products pp
    join public.provider_publication_status product_status
      on product_status.provider_product_id = pp.id and product_status.status = 'published'
    join public.provider_publication_status provider_status
      on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
    where pp.id = target_product_id
  );
$$;

revoke all on function public.is_product_followable(uuid) from public, anon, authenticated;

create function public.follow_product(target_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  -- One generic message for unknown and unpublished products: nothing leaks.
  if target_product_id is null or not public.is_product_followable(target_product_id) then
    raise exception 'This product cannot be followed.' using errcode = '22023';
  end if;
  begin
    -- Primary key makes concurrent calls safe; an existing follow keeps followed_at.
    insert into public.product_follows (member_id, provider_product_id)
    values (actor_id, target_product_id)
    on conflict (member_id, provider_product_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'This product cannot be followed.' using errcode = '22023';
  end;
  return true;
end;
$$;

-- Unfollow is always allowed for the caller's own row, including for products
-- that were unpublished after they were followed. It reports the new state.
create function public.unfollow_product(target_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  delete from public.product_follows pf
  where pf.member_id = actor_id and pf.provider_product_id = target_product_id;
  return false;
end;
$$;

-- Resolves a followable product by slug for the follow control. Unpublished or
-- unknown slugs return no row.
create function public.get_product_follow_state(target_slug text)
returns table (product_id uuid, following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select pp.id,
         exists (
           select 1 from public.product_follows pf
           where pf.member_id = actor_id and pf.provider_product_id = pp.id
         )
  from public.provider_products pp
  where pp.slug = target_slug and public.is_product_followable(pp.id);
end;
$$;

-- Counts every active relationship, including ones whose product is now
-- unavailable, so the total always matches the private list.
create function public.get_my_followed_product_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  total integer;
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  select count(*)::integer into total
  from public.product_follows pf
  where pf.member_id = actor_id;
  return total;
end;
$$;

-- One bounded page of the caller's own follows. Names, slugs and providers are
-- returned only while the product and its provider are published; otherwise the
-- row is generic and carries just the id needed to unfollow.
create function public.list_my_followed_products(page_limit integer default 20, page_offset integer default 0)
returns table (product_id uuid, available boolean, product_slug text, product_name text, provider_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select pf.provider_product_id,
         state.ok,
         case when state.ok then pp.slug end,
         case when state.ok then pp.name end,
         case when state.ok then pr.name end
  from public.product_follows pf
  left join public.provider_products pp on pp.id = pf.provider_product_id
  left join public.providers pr on pr.id = pp.provider_id
  cross join lateral (select public.is_product_followable(pf.provider_product_id) as ok) state
  where pf.member_id = actor_id
  order by pf.followed_at desc, pf.provider_product_id
  limit greatest(1, least(coalesce(page_limit, 20), 50))
  offset greatest(0, coalesce(page_offset, 0));
end;
$$;

revoke all on function public.follow_product(uuid) from public, anon, authenticated;
revoke all on function public.unfollow_product(uuid) from public, anon, authenticated;
revoke all on function public.get_product_follow_state(text) from public, anon, authenticated;
revoke all on function public.get_my_followed_product_count() from public, anon, authenticated;
revoke all on function public.list_my_followed_products(integer, integer) from public, anon, authenticated;
grant execute on function public.follow_product(uuid) to authenticated;
grant execute on function public.unfollow_product(uuid) to authenticated;
grant execute on function public.get_product_follow_state(text) to authenticated;
grant execute on function public.get_my_followed_product_count() to authenticated;
grant execute on function public.list_my_followed_products(integer, integer) to authenticated;

commit;
