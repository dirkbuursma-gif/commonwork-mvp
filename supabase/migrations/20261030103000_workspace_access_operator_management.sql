begin;

create table public.workspace_membership_operator_audit (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid not null,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('granted', 'revoked')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index workspace_membership_operator_audit_target_idx
  on public.workspace_membership_operator_audit (target_profile_id, created_at desc);
alter table public.workspace_membership_operator_audit enable row level security;
alter table public.workspace_membership_operator_audit force row level security;
revoke all on public.workspace_membership_operator_audit from public, anon, authenticated;
grant all on public.workspace_membership_operator_audit to service_role;

create function public.admin_set_workspace_access(target_profile_id uuid, target_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_status text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_action not in ('grant', 'revoke') then
    raise exception 'Choose grant or revoke.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = target_profile_id and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'Workspace access requires an existing confirmed, non-banned account.' using errcode = '42501';
  end if;
  select m.status into current_status from public.workspace_memberships m where m.user_id = target_profile_id for update;
  if target_action = 'grant' then
    if current_status = 'active' then return current_status; end if;
    insert into public.workspace_memberships (user_id, status, source, granted_by, granted_at, revoked_at)
    values (target_profile_id, 'active', 'operator', actor_id, now(), null)
    on conflict (user_id) do update
      set status = 'active', source = 'operator', granted_by = actor_id, granted_at = now(), revoked_at = null;
  else
    if current_status is distinct from 'active' then
      raise exception 'No active workspace access was found.' using errcode = '22023';
    end if;
    update public.workspace_memberships
    set status = 'revoked', revoked_at = now()
    where user_id = target_profile_id;
  end if;
  insert into public.workspace_membership_operator_audit (target_profile_id, actor_profile_id, action, details)
  values (target_profile_id, actor_id, case target_action when 'grant' then 'granted' else 'revoked' end,
    jsonb_build_object('source', 'operator'));
  return case target_action when 'grant' then 'active' else 'revoked' end;
end;
$$;
revoke all on function public.admin_set_workspace_access(uuid, text) from public, anon;
grant execute on function public.admin_set_workspace_access(uuid, text) to authenticated;

create or replace function public.admin_company_audit(target_provider_id uuid)
returns table (
  event_at timestamptz,
  category text,
  action text,
  actor_profile_id uuid,
  target_profile_id uuid,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers p where p.id = target_provider_id) then
    raise exception 'Company not found.' using errcode = '22023';
  end if;
  return query
  select a.created_at, 'company', a.action, a.actor_profile_id, a.target_profile_id, a.details
  from public.company_operator_audit a where a.provider_id = target_provider_id
  union all
  select a.created_at, 'membership', a.action, a.actor_profile_id, null::uuid, a.details
  from public.company_membership_audit a where a.provider_id = target_provider_id
  union all
  select a.created_at, 'publishing_entitlement', a.action, a.actor_profile_id, null::uuid,
    jsonb_build_object('entitlement_id', a.entitlement_id, 'entitlement_type', a.entitlement_type,
      'review_due_at', a.review_due_at, 'agreement_evidence_url', a.agreement_evidence_url)
  from public.company_publishing_entitlement_audit a where a.provider_id = target_provider_id
  union all
  select a.created_at, 'writer_assignment', a.action, a.actor_profile_id, a.target_profile_id,
    jsonb_build_object('assignment_id', a.assignment_id, 'provider_product_id', a.provider_product_id)
  from public.company_publishing_assignment_audit a where a.provider_id = target_provider_id
  union all
  select a.created_at, 'publication_review', a.action, a.reviewer_profile_id, a.author_profile_id,
    jsonb_build_object('article_id', a.article_id, 'feedback', a.feedback)
  from public.company_publication_review_audit a where a.provider_id = target_provider_id
  union all
  select a.created_at, 'workspace_access', a.action, a.actor_profile_id, a.target_profile_id, a.details
  from public.workspace_membership_operator_audit a
  join public.profile_organisations po on po.profile_id = a.target_profile_id
  join public.organisations o on o.id = po.organisation_id and o.provider_id = target_provider_id
  order by 1 desc
  limit 250;
end;
$$;
grant execute on function public.admin_company_audit(uuid) to authenticated;

commit;