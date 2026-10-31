begin;

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  email text not null check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and char_length(email) <= 254
  ),
  auth_user_id uuid references auth.users (id) on delete set null,
  status text not null check (status in ('pending', 'accepted', 'existing_account', 'failed')),
  delivery_status text not null check (delivery_status in ('not_sent', 'sending', 'sent', 'failed', 'unknown')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invite_sent_at timestamptz,
  accepted_at timestamptz,
  unique (provider_id, email),
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((delivery_status = 'sent') = (invite_sent_at is not null))
);
create index company_invitations_provider_created_idx
  on public.company_invitations (provider_id, created_at desc);
create trigger company_invitations_set_updated_at
before update on public.company_invitations
for each row execute function public.set_updated_at();
create trigger company_invitations_require_real_company
before insert or update on public.company_invitations
for each row execute function public.require_real_company_for_operator_write();

create table public.company_invitation_audit (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid references public.company_invitations (id) on delete set null,
  provider_id uuid not null references public.providers (id) on delete restrict,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_auth_user_id uuid references auth.users (id) on delete set null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'invitation_started', 'existing_account_reused', 'existing_unconfirmed_account',
    'request_reused', 'retry_started', 'email_sent', 'delivery_failed',
    'delivery_unknown', 'accepted'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_invitation_audit_provider_idx
  on public.company_invitation_audit (provider_id, created_at desc);

alter table public.company_invitations enable row level security;
alter table public.company_invitations force row level security;
alter table public.company_invitation_audit enable row level security;
alter table public.company_invitation_audit force row level security;
revoke all on public.company_invitations, public.company_invitation_audit from public, anon, authenticated;
grant all on public.company_invitations, public.company_invitation_audit to service_role;

create function public.admin_prepare_company_invitation(target_provider_id uuid, exact_email text)
returns table (
  invitation_id uuid,
  invitation_status text,
  delivery_status text,
  auth_user_id uuid,
  should_send boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(exact_email, '')));
  matched_user_id uuid;
  matched_user_confirmed boolean := false;
  invitation public.company_invitations%rowtype;
  created_new boolean := false;
  send_invitation boolean := false;
  audit_action text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if char_length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.providers p
    where p.id = target_provider_id and p.is_seed_data = false
      and not exists (select 1 from public.organisations o where o.provider_id = p.id and o.is_seed_data = true)
  ) then
    raise exception 'Select a real company before inviting a person.' using errcode = '42501';
  end if;

  select u.id, u.email_confirmed_at is not null
  into matched_user_id, matched_user_confirmed
  from auth.users u
  where lower(u.email) = normalized_email and u.deleted_at is null
  limit 1;

  if matched_user_confirmed then
    insert into public.profiles (id) values (matched_user_id)
    on conflict (id) do nothing;
  end if;

  insert into public.company_invitations (
    provider_id, email, auth_user_id, status, delivery_status, created_by
  ) values (
    target_provider_id,
    normalized_email,
    matched_user_id,
    case when matched_user_confirmed then 'existing_account' else 'pending' end,
    case when matched_user_id is null then 'sending' else 'not_sent' end,
    actor_id
  )
  on conflict (provider_id, email) do nothing
  returning * into invitation;
  created_new := found;

  if created_new then
    send_invitation := matched_user_id is null;
    audit_action := case
      when matched_user_confirmed then 'existing_account_reused'
      when matched_user_id is not null then 'existing_unconfirmed_account'
      else 'invitation_started'
    end;
  else
    select ci.* into invitation
    from public.company_invitations ci
    where ci.provider_id = target_provider_id and ci.email = normalized_email
    for update;

    if invitation.status = 'failed' and matched_user_id is null then
      update public.company_invitations ci
      set status = 'pending', delivery_status = 'sending'
      where ci.id = invitation.id
      returning ci.* into invitation;
      send_invitation := true;
      audit_action := 'retry_started';
    else
      if matched_user_id is not null and invitation.auth_user_id is null then
        update public.company_invitations ci
        set auth_user_id = matched_user_id,
            status = case
              when matched_user_confirmed and ci.status <> 'accepted' then 'existing_account'
              when not matched_user_confirmed and ci.status = 'failed' then 'pending'
              else ci.status
            end,
            delivery_status = case
              when ci.delivery_status in ('sending', 'failed') then 'unknown'
              else ci.delivery_status
            end
        where ci.id = invitation.id
        returning ci.* into invitation;
      end if;
      audit_action := 'request_reused';
    end if;
  end if;

  insert into public.company_invitation_audit (
    invitation_id, provider_id, actor_profile_id, target_profile_id, action
  ) values (
    invitation.id, target_provider_id, actor_id,
    case when matched_user_confirmed then matched_user_id else null end,
    audit_action
  );

  return query select invitation.id, invitation.status, invitation.delivery_status,
    invitation.auth_user_id, send_invitation;
end;
$$;

create function public.admin_finish_company_invitation(
  target_invitation_id uuid,
  target_delivery_status text,
  target_auth_user_id uuid default null
)
returns table (invitation_status text, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation public.company_invitations%rowtype;
  audit_action text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_delivery_status not in ('sent', 'failed', 'unknown') then
    raise exception 'Choose a valid invitation delivery result.' using errcode = '22023';
  end if;
  select ci.* into invitation
  from public.company_invitations ci
  where ci.id = target_invitation_id
  for update;
  if not found then
    raise exception 'Invitation not found.' using errcode = '22023';
  end if;

  update public.company_invitations ci
  set auth_user_id = coalesce(target_auth_user_id, ci.auth_user_id),
      status = case
        when ci.status = 'accepted' then 'accepted'
        when target_delivery_status = 'failed' then 'failed'
        else 'pending'
      end,
      delivery_status = target_delivery_status,
      invite_sent_at = case when target_delivery_status = 'sent' then now() else null end
  where ci.id = target_invitation_id
  returning ci.* into invitation;

  audit_action := case target_delivery_status
    when 'sent' then 'email_sent'
    when 'failed' then 'delivery_failed'
    else 'delivery_unknown'
  end;
  insert into public.company_invitation_audit (
    invitation_id, provider_id, actor_profile_id, target_profile_id, action,
    details
  ) values (
    invitation.id, invitation.provider_id, actor_id, null, audit_action,
    jsonb_build_object('delivery_status', target_delivery_status)
  );
  return query select invitation.status, invitation.delivery_status;
end;
$$;

create function public.mark_company_invitation_accepted(target_invitation_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_user_id uuid := auth.uid();
  accepted_email text;
  invitation record;
  accepted_count integer := 0;
begin
  if accepted_user_id is null then return false; end if;
  select lower(u.email) into accepted_email
  from auth.users u
  where u.id = accepted_user_id and u.email_confirmed_at is not null and u.deleted_at is null;
  if accepted_email is null then return false; end if;
  if not exists (
    select 1 from public.company_invitations ci
    where (target_invitation_id is null or ci.id = target_invitation_id)
      and ci.email = accepted_email and ci.status = 'pending'
      and (ci.auth_user_id is null or ci.auth_user_id = accepted_user_id)
  ) then
    return false;
  end if;

  insert into public.profiles (id) values (accepted_user_id)
  on conflict (id) do nothing;

  for invitation in
    update public.company_invitations ci
    set status = 'accepted', accepted_at = now(), auth_user_id = accepted_user_id,
        delivery_status = case when ci.delivery_status in ('sending', 'unknown') then 'sent' else ci.delivery_status end,
        invite_sent_at = case when ci.delivery_status in ('sending', 'unknown') then coalesce(ci.invite_sent_at, now()) else ci.invite_sent_at end
    where (target_invitation_id is null or ci.id = target_invitation_id)
      and ci.email = accepted_email
      and ci.status = 'pending'
      and (ci.auth_user_id is null or ci.auth_user_id = accepted_user_id)
    returning ci.id, ci.provider_id
  loop
    insert into public.company_invitation_audit (
      invitation_id, provider_id, actor_profile_id, actor_auth_user_id, target_profile_id, action, details
    ) values (
      invitation.id, invitation.provider_id, accepted_user_id, accepted_user_id, null, 'accepted',
      jsonb_build_object('auth_user_id', accepted_user_id)
    );
    accepted_count := accepted_count + 1;
  end loop;
  return accepted_count > 0;
end;
$$;

create function public.admin_list_company_invitations(target_provider_id uuid)
returns table (
  id uuid,
  email text,
  status text,
  delivery_status text,
  auth_user_id uuid,
  created_at timestamptz,
  invite_sent_at timestamptz,
  accepted_at timestamptz
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
  return query
  select ci.id, ci.email, ci.status, ci.delivery_status, ci.auth_user_id,
    ci.created_at, ci.invite_sent_at, ci.accepted_at
  from public.company_invitations ci
  where ci.provider_id = target_provider_id
  order by ci.created_at desc, ci.id;
end;
$$;

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
  union all
  select a.created_at, 'invitation', a.action, a.actor_profile_id, a.target_profile_id,
    case when a.actor_auth_user_id is not null
      then a.details || jsonb_build_object('auth_user_id', a.actor_auth_user_id)
      else a.details
    end
  from public.company_invitation_audit a where a.provider_id = target_provider_id
  order by 1 desc
  limit 250;
end;
$$;

revoke all on function public.admin_prepare_company_invitation(uuid, text) from public, anon;
revoke all on function public.admin_finish_company_invitation(uuid, text, uuid) from public, anon;
revoke all on function public.mark_company_invitation_accepted(uuid) from public, anon;
revoke all on function public.admin_list_company_invitations(uuid) from public, anon;
revoke all on function public.admin_company_audit(uuid) from public, anon;
grant execute on function public.admin_prepare_company_invitation(uuid, text) to authenticated;
grant execute on function public.admin_finish_company_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.mark_company_invitation_accepted(uuid) to authenticated;
grant execute on function public.admin_list_company_invitations(uuid) to authenticated;
grant execute on function public.admin_company_audit(uuid) to authenticated;

commit;