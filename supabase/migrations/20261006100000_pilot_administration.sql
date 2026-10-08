begin;

create table public.commonwork_administrators (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  appointed_by uuid references public.profiles (id) on delete set null,
  appointed_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active') = (revoked_at is null))
);

create table public.connector_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('assigned', 'updated', 'revoked')),
  status_before text,
  status_after text not null check (status_after in ('active', 'revoked')),
  capacity_before integer,
  capacity_after integer not null check (capacity_after >= 0),
  created_at timestamptz not null default now()
);

alter table public.connectors
  add column assigned_by uuid references public.profiles (id) on delete set null,
  add column assigned_at timestamptz,
  add column revoked_at timestamptz;

create index connector_admin_audit_target_idx
  on public.connector_admin_audit (target_profile_id, created_at desc);
create index connector_admin_audit_actor_idx
  on public.connector_admin_audit (actor_profile_id, created_at desc);

create trigger commonwork_administrators_set_updated_at
before update on public.commonwork_administrators
for each row execute function public.set_updated_at();

alter table public.commonwork_administrators enable row level security;
alter table public.connector_admin_audit enable row level security;
alter table public.commonwork_administrators force row level security;
alter table public.connector_admin_audit force row level security;
revoke all on public.commonwork_administrators from public, anon, authenticated;
revoke all on public.connector_admin_audit from public, anon, authenticated;
grant all on public.commonwork_administrators to service_role;
grant all on public.connector_admin_audit to service_role;

create function public.manage_commonwork_connector(
  target_profile_id uuid,
  target_action text,
  target_introduction_capacity integer,
  actor_profile_id uuid
)
returns table (
  profile_id uuid,
  display_name text,
  status text,
  introduction_capacity integer,
  assigned_by uuid,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  connector_row public.connectors%rowtype;
  actor_is_admin boolean;
  action_name text;
  old_status text;
  old_capacity integer;
begin
  if actor_profile_id is null or target_profile_id is null then
    raise exception 'Administrator and member identities are required.' using errcode = '22023';
  end if;
  select exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) into actor_is_admin;
  if not actor_is_admin then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if target_action not in ('assign', 'revoke') then
    raise exception 'Choose assign or revoke.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_profile_id) then
    raise exception 'Member not found.' using errcode = '22023';
  end if;

  select * into connector_row
  from public.connectors c
  where c.profile_id = target_profile_id
  for update;
  if found then
    old_status := connector_row.status;
    old_capacity := connector_row.introduction_capacity;
  end if;

  if target_action = 'assign' then
    if target_introduction_capacity not between 1 and 100 then
      raise exception 'Introduction capacity must be between 1 and 100.' using errcode = '22023';
    end if;
    if not found then
      insert into public.connectors (
        profile_id, status, introduction_capacity, approved_at, assigned_by, assigned_at
      ) values (
        target_profile_id, 'active', target_introduction_capacity, now(), actor_profile_id, now()
      ) returning * into connector_row;
      action_name := 'assigned';
    else
      action_name := case when connector_row.status = 'active' then 'updated' else 'assigned' end;
      update public.connectors
      set status = 'active', introduction_capacity = target_introduction_capacity,
          approved_at = coalesce(approved_at, now()), assigned_by = actor_profile_id,
          assigned_at = now(), revoked_at = null
      where connectors.profile_id = target_profile_id
      returning * into connector_row;
    end if;
  else
    if not found then
      raise exception 'Connector record not found.' using errcode = '22023';
    end if;
    if connector_row.status = 'revoked' then
      return query
      select connector_row.profile_id, p.display_name, connector_row.status,
        connector_row.introduction_capacity, connector_row.assigned_by, connector_row.assigned_at
      from public.profiles p where p.id = connector_row.profile_id;
      return;
    end if;
    action_name := 'revoked';
    update public.connectors
    set status = 'revoked', introduction_capacity = 0, revoked_at = now()
    where connectors.profile_id = target_profile_id
    returning * into connector_row;
  end if;

  insert into public.connector_admin_audit (
    actor_profile_id, target_profile_id, action, status_before, status_after,
    capacity_before, capacity_after
  ) values (
    actor_profile_id, target_profile_id, action_name, old_status, connector_row.status,
    old_capacity, connector_row.introduction_capacity
  );

  return query
  select connector_row.profile_id, p.display_name, connector_row.status,
    connector_row.introduction_capacity, connector_row.assigned_by, connector_row.assigned_at
  from public.profiles p where p.id = connector_row.profile_id;
end;
$$;

create function public.list_commonwork_connectors(actor_profile_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  status text,
  introduction_capacity integer,
  assigned_by uuid,
  assigned_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  return query
  select c.profile_id, p.display_name, c.status, c.introduction_capacity,
    c.assigned_by, c.assigned_at, c.revoked_at
  from public.connectors c
  join public.profiles p on p.id = c.profile_id
  order by p.display_name;
end;
$$;

revoke all on function public.manage_commonwork_connector(uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.list_commonwork_connectors(uuid) from public, anon, authenticated;
grant execute on function public.manage_commonwork_connector(uuid, text, integer, uuid) to service_role;
grant execute on function public.list_commonwork_connectors(uuid) to service_role;

commit;