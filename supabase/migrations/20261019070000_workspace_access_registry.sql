begin;

-- Foundation only. Route/Data API enforcement and attendee signup are separate gates.
create table public.workspace_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  source text not null default 'operator' check (source in ('legacy_before_attendee_rollout', 'operator')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'active') = (revoked_at is null))
);

-- Preserve the population that already had authenticated workspace access.
-- Do not infer a human approval or grant future signups membership.
insert into public.workspace_memberships (user_id, status, source)
select u.id, 'active', 'legacy_before_attendee_rollout' from auth.users u;

alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;
revoke all on public.workspace_memberships from public, anon, authenticated;
grant all on public.workspace_memberships to service_role;

create function public.can_access_member_workspace()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

revoke all on function public.can_access_member_workspace() from public, anon, authenticated;
grant execute on function public.can_access_member_workspace() to authenticated;

comment on table public.workspace_memberships is
  'Server/operator-controlled membership registry. Event attendance and user metadata never grant workspace membership. Initial legacy rows preserve pre-rollout access; new Auth users have no row by default. This registry alone does not enforce existing workspace permissions.';

commit;
