begin;

-- Explicit, operator-granted authority to read ONE aggregate figure for ONE product.
-- It never implies product editing, publishing, follower identities, exports or contact
-- rights, and it is never derived from affiliation, membership or payment.
create table public.product_representatives (
  id uuid primary key default gen_random_uuid(),
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  check ((status = 'active') = (revoked_at is null))
);

-- One current assignment per member and product; revoked rows remain as history.
create unique index product_representatives_one_active_idx
  on public.product_representatives (provider_product_id, profile_id) where status = 'active';
create index product_representatives_profile_active_idx
  on public.product_representatives (profile_id) where status = 'active';

create table public.product_representative_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  action text not null check (action in ('granted', 'revoked')),
  created_at timestamptz not null default now()
);
create index product_representative_admin_audit_target_idx
  on public.product_representative_admin_audit (target_profile_id, created_at desc);

-- No client grants and no policies: members cannot read, create or edit assignments.
alter table public.product_representatives enable row level security;
alter table public.product_representative_admin_audit enable row level security;
alter table public.product_representatives force row level security;
alter table public.product_representative_admin_audit force row level security;
revoke all on public.product_representatives from public, anon, authenticated;
revoke all on public.product_representative_admin_audit from public, anon, authenticated;
grant all on public.product_representatives to service_role;
grant all on public.product_representative_admin_audit to service_role;

comment on table public.product_representatives is
  'Operator-granted, product-scoped permission to read the private follower aggregate only. Not derived from affiliation, membership or payment.';

-- Internal predicate: requires active workspace membership AND an active assignment
-- for exactly this product. Not exposed to any client role.
create function public.is_active_product_representative(target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.can_access_member_workspace(), false) and exists (
    select 1 from public.product_representatives r
    where r.provider_product_id = target_product_id
      and r.profile_id = (select auth.uid())
      and r.status = 'active'
  );
$$;

-- Operator-only grant/revoke, mirroring the Connector administration pattern.
create function public.manage_product_representative(
  target_product_id uuid,
  target_profile_id uuid,
  target_action text,
  actor_profile_id uuid
)
returns table (
  assignment_id uuid,
  assigned_product_id uuid,
  assigned_profile_id uuid,
  assignment_status text,
  assigned_by uuid,
  assigned_at timestamptz,
  ended_by uuid,
  ended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.product_representatives%rowtype;
  had_active boolean;
begin
  if actor_profile_id is null or target_profile_id is null or target_product_id is null then
    raise exception 'Administrator, product and member identities are required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if actor_profile_id = target_profile_id then
    raise exception 'Administrators cannot assign product representative access to themselves.' using errcode = '42501';
  end if;
  if target_action not in ('grant', 'revoke') then
    raise exception 'Choose grant or revoke.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.provider_products pp where pp.id = target_product_id) then
    raise exception 'Product not found.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_profile_id) then
    raise exception 'Member not found.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_product_id::text || ':' || target_profile_id::text, 0)
  );
  select * into assignment
  from public.product_representatives r
  where r.provider_product_id = target_product_id
    and r.profile_id = target_profile_id
    and r.status = 'active';
  had_active := found;

  if target_action = 'grant' then
    if not exists (
      select 1 from public.workspace_memberships m
      where m.user_id = target_profile_id and m.status = 'active'
    ) then
      raise exception 'The member needs active workspace membership.' using errcode = '22023';
    end if;
    if not had_active then
      insert into public.product_representatives (provider_product_id, profile_id, granted_by)
      values (target_product_id, target_profile_id, actor_profile_id)
      returning * into assignment;
      insert into public.product_representative_admin_audit (actor_profile_id, target_profile_id, provider_product_id, action)
      values (actor_profile_id, target_profile_id, target_product_id, 'granted');
    end if;
  else
    if not had_active then
      raise exception 'No active product representative assignment was found.' using errcode = '22023';
    end if;
    update public.product_representatives r
    set status = 'revoked', revoked_by = actor_profile_id, revoked_at = pg_catalog.now()
    where r.id = assignment.id
    returning * into assignment;
    insert into public.product_representative_admin_audit (actor_profile_id, target_profile_id, provider_product_id, action)
    values (actor_profile_id, target_profile_id, target_product_id, 'revoked');
  end if;

  return query select assignment.id, assignment.provider_product_id, assignment.profile_id, assignment.status,
    assignment.granted_by, assignment.granted_at, assignment.revoked_by, assignment.revoked_at;
end;
$$;

create function public.list_product_representatives(actor_profile_id uuid, target_product_id uuid default null)
returns table (
  assignment_id uuid,
  product_slug text,
  product_name text,
  assigned_profile_id uuid,
  member_display_name text,
  assignment_status text,
  assigned_at timestamptz,
  ended_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  return query
  select r.id, pp.slug, pp.name, r.profile_id, p.display_name, r.status, r.granted_at, r.revoked_at
  from public.product_representatives r
  join public.provider_products pp on pp.id = r.provider_product_id
  join public.profiles p on p.id = r.profile_id
  where target_product_id is null or r.provider_product_id = target_product_id
  order by pp.slug, r.granted_at desc, r.id;
end;
$$;

-- Caller-only status, so the product page can decide whether to ask for the figure.
create function public.is_product_representative(target_product_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return public.is_active_product_representative(target_product_id);
end;
$$;

-- The only follower figure anywhere. It returns an integer or raises: an
-- unauthorised caller is denied and never shown a misleading zero. It counts
-- active follows from members whose workspace membership is currently active.
create function public.get_product_follower_count(target_product_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  if (select auth.uid()) is null or public.is_active_product_representative(target_product_id) is not true then
    raise exception 'Product representative access is required.' using errcode = '42501';
  end if;
  select count(*)::integer into total
  from public.product_follows pf
  where pf.provider_product_id = target_product_id
    and exists (
      select 1 from public.workspace_memberships m
      where m.user_id = pf.member_id and m.status = 'active'
    );
  return total;
end;
$$;

revoke all on function public.is_active_product_representative(uuid) from public, anon, authenticated;
revoke all on function public.manage_product_representative(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.list_product_representatives(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_product_representative(uuid) from public, anon, authenticated;
revoke all on function public.get_product_follower_count(uuid) from public, anon, authenticated;
grant execute on function public.manage_product_representative(uuid, uuid, text, uuid) to service_role;
grant execute on function public.list_product_representatives(uuid, uuid) to service_role;
grant execute on function public.is_product_representative(uuid) to authenticated;
grant execute on function public.get_product_follower_count(uuid) to authenticated;

commit;
