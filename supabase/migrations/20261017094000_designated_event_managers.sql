begin;

create table public.event_managers (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  appointed_by uuid references public.profiles (id) on delete set null,
  appointed_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'active') = (revoked_at is null))
);

alter table public.event_managers enable row level security;
alter table public.event_managers force row level security;
revoke all on public.event_managers from public, anon, authenticated;
grant all on public.event_managers to service_role;

create function public.can_manage_events()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.event_managers m
    where m.profile_id = auth.uid() and m.status = 'active'
  ) or exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = auth.uid() and a.status = 'active'
  );
$$;

drop policy events_manager_insert on public.events;
create policy events_designated_manager_insert
on public.events for insert to authenticated
with check (
  manager_profile_id = auth.uid()
  and public.can_manage_events()
);

revoke all on function public.can_manage_events() from public, anon;
grant execute on function public.can_manage_events() to authenticated;

comment on table public.event_managers is
  'Explicit event-management role. Authentication or attendee approval alone does not grant this role.';

commit;
