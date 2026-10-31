begin;

alter table public.profile_organisations
  add column verification_basis text not null default '' check (char_length(verification_basis) <= 1200);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  plan_code text not null default 'business' check (plan_code = 'business'),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  commercial_status text not null check (commercial_status in ('complimentary_founding', 'commercial_agreement')),
  seat_limit_type text not null check (seat_limit_type in ('capped', 'uncapped')),
  included_seats integer,
  seat_terms text not null check (char_length(btrim(seat_terms)) between 2 and 600),
  agreement_evidence_url text check (agreement_evidence_url is null or agreement_evidence_url ~ '^https://[^[:space:]]+$'),
  started_at timestamptz not null default now(),
  review_due_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((seat_limit_type = 'capped' and included_seats >= 1) or (seat_limit_type = 'uncapped' and included_seats is null)),
  check ((commercial_status = 'complimentary_founding' and agreement_evidence_url is null and review_due_at is not null)
    or (commercial_status = 'commercial_agreement' and agreement_evidence_url is not null and review_due_at is null)),
  check ((status = 'revoked') = (ended_at is not null))
);
create unique index company_memberships_one_current_idx
  on public.company_memberships (provider_id) where status in ('active', 'suspended');
create index company_memberships_provider_history_idx
  on public.company_memberships (provider_id, created_at desc);
create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

create table public.company_membership_audit (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references public.company_memberships (id) on delete set null,
  provider_id uuid not null references public.providers (id) on delete restrict,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'suspended', 'resumed', 'revoked', 'commercial_conversion')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_membership_audit_provider_idx
  on public.company_membership_audit (provider_id, created_at desc);

create table public.company_operator_audit (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  target_profile_id uuid references public.profiles (id) on delete restrict,
  action text not null check (action in ('company_created', 'company_updated', 'catalogue_status_changed', 'member_connected', 'affiliation_approved', 'affiliation_unverified')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_operator_audit_provider_idx
  on public.company_operator_audit (provider_id, created_at desc);

alter table public.company_publishing_entitlements
  add column agreement_evidence_url text check (agreement_evidence_url is null or agreement_evidence_url ~ '^https://[^[:space:]]+$');
alter table public.company_publishing_entitlement_audit
  add column agreement_evidence_url text check (agreement_evidence_url is null or agreement_evidence_url ~ '^https://[^[:space:]]+$');

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.company_publishing_entitlements'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%entitlement_type%' or pg_get_constraintdef(oid) like '%billing_reference%')
  loop
    execute format('alter table public.company_publishing_entitlements drop constraint %I', constraint_row.conname);
  end loop;
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.company_publishing_entitlement_audit'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%entitlement_type%' or pg_get_constraintdef(oid) like '%action%')
  loop
    execute format('alter table public.company_publishing_entitlement_audit drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

alter table public.company_publishing_entitlements
  add constraint company_publishing_entitlements_type_check
    check (entitlement_type in ('complimentary_founding_pilot', 'commercial_agreement', 'paid')),
  add constraint company_publishing_entitlements_terms_check check (
    (entitlement_type = 'complimentary_founding_pilot'
      and billing_reference is null and billing_verified_at is null and agreement_evidence_url is null)
    or (entitlement_type = 'commercial_agreement'
      and billing_reference is null and billing_verified_at is null and agreement_evidence_url is not null)
    or (entitlement_type = 'paid'
      and nullif(btrim(billing_reference), '') is not null and billing_verified_at is not null)
  );
alter table public.company_publishing_entitlement_audit
  add constraint company_publishing_entitlement_audit_action_check
    check (action in ('granted', 'revoked', 'expired', 'converted')),
  add constraint company_publishing_entitlement_audit_type_check
    check (entitlement_type in ('complimentary_founding_pilot', 'commercial_agreement', 'paid'));

alter table public.company_memberships enable row level security;
alter table public.company_membership_audit enable row level security;
alter table public.company_operator_audit enable row level security;
alter table public.company_memberships force row level security;
alter table public.company_membership_audit force row level security;
alter table public.company_operator_audit force row level security;
revoke all on public.company_memberships, public.company_membership_audit, public.company_operator_audit
  from public, anon, authenticated;
grant all on public.company_memberships, public.company_membership_audit, public.company_operator_audit
  to service_role;

create or replace function public.company_publishing_scope_is_active(
  target_profile_id uuid,
  target_provider_id uuid,
  target_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships m
    join public.profile_organisations po
      on po.profile_id = m.user_id and po.verification_status = 'approved'
    join public.organisations o on o.id = po.organisation_id and o.provider_id = target_provider_id
    join public.company_memberships cm
      on cm.provider_id = target_provider_id and cm.plan_code = 'business' and cm.status = 'active'
    join public.company_publishing_entitlements e
      on e.provider_id = target_provider_id and e.status = 'active'
    join public.company_publishing_assignments a
      on a.provider_id = target_provider_id
      and a.profile_id = target_profile_id
      and (a.provider_product_id is null or a.provider_product_id = target_product_id)
      and a.status = 'active'
    where m.user_id = target_profile_id and m.status = 'active'
      and (target_product_id is null or exists (
        select 1 from public.provider_products pp
        where pp.id = target_product_id and pp.provider_id = target_provider_id
      ))
  );
$$;

create function public.admin_search_companies(search_term text default '')
returns table (
  provider_id uuid,
  provider_slug text,
  provider_name text,
  organisation_id uuid,
  organisation_slug text,
  organisation_type text,
  catalogue_status text,
  membership_status text,
  commercial_status text
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
  if char_length(coalesce(search_term, '')) > 120 then
    raise exception 'Search text is too long.' using errcode = '22023';
  end if;
  return query
  select p.id, p.slug, p.name, o.id, o.slug, o.organisation_type, ps.status, cm.status, cm.commercial_status
  from public.providers p
  left join lateral (
    select candidate.id, candidate.slug, candidate.organisation_type
    from public.organisations candidate
    where candidate.provider_id = p.id
    order by candidate.created_at, candidate.id
    limit 1
  ) o on true
  left join public.provider_publication_status ps on ps.provider_id = p.id
  left join lateral (
    select current_membership.status, current_membership.commercial_status
    from public.company_memberships current_membership
    where current_membership.provider_id = p.id and current_membership.status in ('active', 'suspended')
    limit 1
  ) cm on true
  where search_term is null or btrim(search_term) = ''
     or position(lower(btrim(search_term)) in lower(p.name)) > 0
     or position(lower(btrim(search_term)) in lower(p.slug)) > 0
  order by p.name, p.id
  limit 100;
end;
$$;

create function public.admin_save_company(
  target_provider_id uuid,
  target_organisation_id uuid,
  target_provider_slug text,
  target_provider_name text,
  target_provider_type text,
  target_website_url text,
  target_provider_summary text,
  target_source_system text,
  target_source_record_id text,
  target_source_url text,
  target_organisation_slug text,
  target_organisation_type text,
  target_organisation_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  provider_id uuid := target_provider_id;
  organisation_id uuid := target_organisation_id;
  action_name text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_provider_type not in ('software_vendor', 'service_partner', 'organisation')
     or target_organisation_type not in ('vendor', 'advisor', 'research', 'other')
     or char_length(btrim(coalesce(target_provider_name, ''))) not between 2 and 160
     or char_length(btrim(coalesce(target_provider_slug, ''))) not between 2 and 160
     or target_provider_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(btrim(coalesce(target_source_system, ''))) not between 2 and 80
     or char_length(btrim(coalesce(target_source_record_id, ''))) not between 1 and 160
     or char_length(coalesce(target_provider_summary, '')) > 1600
     or char_length(btrim(coalesce(target_organisation_slug, ''))) not between 2 and 160
     or target_organisation_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(coalesce(target_organisation_summary, '')) > 1600
     or (target_website_url is not null and target_website_url !~ '^https://[^[:space:]]+$')
     or (target_source_url is not null and target_source_url !~ '^https://[^[:space:]]+$') then
    raise exception 'Check the company names, slugs, types, sources and HTTPS URLs.' using errcode = '22023';
  end if;

  if target_provider_id is null then
    if exists (
      select 1 from public.providers p
      where lower(p.slug) = lower(target_provider_slug) or lower(p.name) = lower(btrim(target_provider_name))
         or (p.source_system = target_source_system and p.source_record_id = target_source_record_id)
    ) then
      raise exception 'A matching provider already exists. Select it before creating another company.' using errcode = '23505';
    end if;
    insert into public.providers (slug, name, provider_type, website_url, summary, source_system, source_record_id, source_url)
    values (target_provider_slug, btrim(target_provider_name), target_provider_type, nullif(btrim(target_website_url), ''),
      btrim(target_provider_summary), btrim(target_source_system), btrim(target_source_record_id), nullif(btrim(target_source_url), ''))
    returning id into provider_id;
    insert into public.provider_publication_status (provider_id, status) values (provider_id, 'draft');
    action_name := 'company_created';
  else
    update public.providers p
    set slug = target_provider_slug, name = btrim(target_provider_name), provider_type = target_provider_type,
        website_url = nullif(btrim(target_website_url), ''), summary = btrim(target_provider_summary),
        source_system = btrim(target_source_system), source_record_id = btrim(target_source_record_id),
        source_url = nullif(btrim(target_source_url), '')
    where p.id = target_provider_id;
    if not found then raise exception 'Company not found.' using errcode = '22023'; end if;
    action_name := 'company_updated';
  end if;

  if organisation_id is not null and not exists (
    select 1 from public.organisations o where o.id = organisation_id and o.provider_id = provider_id
  ) then
    raise exception 'The selected organisation is not linked to this provider.' using errcode = '22023';
  end if;
  if organisation_id is null then
    select o.id into organisation_id from public.organisations o
    where o.provider_id = provider_id order by o.created_at, o.id limit 1;
  end if;
  if organisation_id is null then
    if exists (select 1 from public.organisations o where lower(o.slug) = lower(target_organisation_slug)) then
      raise exception 'An organisation with that URL name already exists.' using errcode = '23505';
    end if;
    insert into public.organisations (slug, name, organisation_type, summary, provider_id)
    values (target_organisation_slug, btrim(target_provider_name), target_organisation_type,
      btrim(target_organisation_summary), provider_id)
    returning id into organisation_id;
  else
    update public.organisations o
    set slug = target_organisation_slug, name = btrim(target_provider_name),
        organisation_type = target_organisation_type, summary = btrim(target_organisation_summary)
    where o.id = organisation_id;
  end if;

  insert into public.company_operator_audit (provider_id, actor_profile_id, action, details)
  values (provider_id, actor_id, action_name, jsonb_build_object(
    'provider_slug', target_provider_slug, 'organisation_id', organisation_id,
    'organisation_type', target_organisation_type, 'provider_type', target_provider_type
  ));
  return jsonb_build_object('provider_id', provider_id, 'organisation_id', organisation_id);
end;
$$;

create function public.admin_set_company_catalogue_status(
  target_provider_id uuid,
  target_status text,
  target_disclosure_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_status not in ('draft', 'published', 'retired')
     or char_length(coalesce(target_disclosure_note, '')) > 1200 then
    raise exception 'Choose a valid catalogue status and disclosure note.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.providers p where p.id = target_provider_id) then
    raise exception 'Company not found.' using errcode = '22023';
  end if;
  if target_status = 'published' and not exists (
    select 1 from public.providers p
    where p.id = target_provider_id and nullif(btrim(p.summary), '') is not null
      and coalesce(p.source_url, p.website_url) is not null
  ) then
    raise exception 'Add a sourced company summary before publishing the catalogue profile.' using errcode = '22023';
  end if;
  insert into public.provider_publication_status (provider_id, status, public_disclosure_note,
    published_at, published_by, retired_at, retired_by)
  values (target_provider_id, target_status, btrim(coalesce(target_disclosure_note, '')),
    case when target_status = 'published' then now() end,
    case when target_status = 'published' then actor_id end,
    case when target_status = 'retired' then now() end,
    case when target_status = 'retired' then actor_id end)
  on conflict (provider_id) where provider_id is not null do update
  set status = excluded.status, public_disclosure_note = excluded.public_disclosure_note,
      published_at = excluded.published_at, published_by = excluded.published_by,
      retired_at = excluded.retired_at, retired_by = excluded.retired_by;
  if target_status = 'published' then
    update public.providers set reviewed_at = now(), reviewed_by = actor_id::text where id = target_provider_id;
  end if;
  insert into public.company_operator_audit (provider_id, actor_profile_id, action, details)
  values (target_provider_id, actor_id, 'catalogue_status_changed', jsonb_build_object('status', target_status));
  return true;
end;
$$;

create function public.admin_search_company_member(exact_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  normalized_email text := lower(btrim(coalesce(exact_email, '')));
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if normalized_email !~ '^\S+@\S+\.\S+$' or char_length(normalized_email) > 254 then
    raise exception 'Enter one exact email address.' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'profile_id', p.id, 'display_name', p.display_name, 'email', u.email,
    'account_status', case when u.deleted_at is not null then 'deleted'
      when u.banned_until is not null and u.banned_until > now() then 'banned'
      when u.email_confirmed_at is not null then 'confirmed' else 'unconfirmed' end,
    'workspace_status', coalesce(m.status, 'none')
  ) into result
  from auth.users u join public.profiles p on p.id = u.id
  left join public.workspace_memberships m on m.user_id = p.id
  where lower(u.email) = normalized_email
  limit 1;
  return result;
end;
$$;

create function public.admin_connect_company_member(
  target_organisation_id uuid,
  exact_email text,
  target_role_title text,
  target_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_profile_id uuid;
  target_provider_id uuid;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(exact_email, ''))) > 254
     or char_length(coalesce(target_role_title, '')) > 160 then
    raise exception 'Check the exact email and role title.' using errcode = '22023';
  end if;
  select o.provider_id into target_provider_id
  from public.organisations o where o.id = target_organisation_id;
  if target_provider_id is null then raise exception 'Company organisation not found.' using errcode = '22023'; end if;
  select p.id into target_profile_id
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(exact_email))
    and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now())
    and u.deleted_at is null
  limit 1;
  if target_profile_id is null then
    raise exception 'No confirmed existing account found. Use the supported invite process; this action never creates accounts.' using errcode = '22023';
  end if;
  if target_is_primary then
    update public.profile_organisations set is_primary = false
    where profile_id = target_profile_id and is_primary and organisation_id <> target_organisation_id;
  end if;
  insert into public.profile_organisations
    (profile_id, organisation_id, role_title, is_primary, verification_status, verification_basis)
  values (target_profile_id, target_organisation_id, btrim(coalesce(target_role_title, '')),
    coalesce(target_is_primary, false), 'self_declared', '')
  on conflict (profile_id, organisation_id) do update
  set role_title = excluded.role_title,
      is_primary = case when coalesce(target_is_primary, false) then true else public.profile_organisations.is_primary end;
  insert into public.company_operator_audit (provider_id, actor_profile_id, target_profile_id, action, details)
  values (target_provider_id, actor_id, target_profile_id, 'member_connected', jsonb_build_object(
    'organisation_id', target_organisation_id, 'role_title', btrim(coalesce(target_role_title, ''))
  ));
  return target_profile_id;
end;
$$;

create function public.admin_set_company_affiliation(
  target_organisation_id uuid,
  target_profile_id uuid,
  target_action text,
  target_basis text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_provider_id uuid;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_action not in ('approve', 'unverify') then
    raise exception 'Choose approve or unverify.' using errcode = '22023';
  end if;
  if target_action = 'approve' and char_length(btrim(coalesce(target_basis, ''))) not between 8 and 1200 then
    raise exception 'Record the basis for affiliation approval.' using errcode = '22023';
  end if;
  select o.provider_id into target_provider_id from public.organisations o where o.id = target_organisation_id;
  if target_provider_id is null then raise exception 'Company organisation not found.' using errcode = '22023'; end if;
  if target_action = 'approve' then
    update public.profile_organisations
    set verification_status = 'approved', verified_at = now(), verified_by = actor_id,
        verification_basis = btrim(target_basis)
    where organisation_id = target_organisation_id and profile_id = target_profile_id;
  else
    update public.profile_organisations
    set verification_status = 'self_declared', verified_at = null, verified_by = null, verification_basis = ''
    where organisation_id = target_organisation_id and profile_id = target_profile_id;
  end if;
  if not found then raise exception 'Company affiliation not found.' using errcode = '22023'; end if;
  insert into public.company_operator_audit (provider_id, actor_profile_id, target_profile_id, action, details)
  values (target_provider_id, actor_id, target_profile_id,
    case target_action when 'approve' then 'affiliation_approved' else 'affiliation_unverified' end,
    jsonb_build_object('organisation_id', target_organisation_id,
      'verification_basis', case when target_action = 'approve' then btrim(target_basis) else null end));
  return true;
end;
$$;

create function public.admin_save_company_membership(
  target_provider_id uuid,
  target_status text,
  target_commercial_status text,
  target_seat_limit_type text,
  target_included_seats integer,
  target_seat_terms text,
  target_agreement_evidence_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership_row public.company_memberships%rowtype;
  previous_state jsonb;
  next_review timestamptz;
  audit_action text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_status not in ('active', 'suspended', 'revoked')
     or target_commercial_status not in ('complimentary_founding', 'commercial_agreement')
     or target_seat_limit_type not in ('capped', 'uncapped')
     or char_length(btrim(coalesce(target_seat_terms, ''))) not between 2 and 600
     or (target_seat_limit_type = 'capped' and coalesce(target_included_seats, 0) < 1)
     or (target_seat_limit_type = 'uncapped' and target_included_seats is not null)
     or (target_agreement_evidence_url is not null and target_agreement_evidence_url !~ '^https://[^[:space:]]+$')
     or (target_commercial_status = 'commercial_agreement' and target_agreement_evidence_url is null)
     or (target_commercial_status = 'complimentary_founding' and target_agreement_evidence_url is not null) then
    raise exception 'Check the Business membership, seat terms and agreement evidence.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.providers p where p.id = target_provider_id)
     or not exists (select 1 from public.organisations o where o.provider_id = target_provider_id) then
    raise exception 'A company provider and linked organisation are required.' using errcode = '22023';
  end if;
  select * into membership_row from public.company_memberships cm
  where cm.provider_id = target_provider_id and cm.status in ('active', 'suspended')
  for update;
  if not found then
    select * into membership_row from public.company_memberships cm
    where cm.provider_id = target_provider_id and cm.status = 'revoked'
    order by cm.updated_at desc limit 1 for update;
  end if;
  if membership_row.id is not null then
    previous_state := to_jsonb(membership_row) - 'created_by' - 'updated_at';
    if membership_row.commercial_status <> target_commercial_status then
      audit_action := 'commercial_conversion';
    elsif membership_row.status = 'active' and target_status = 'suspended' then
      audit_action := 'suspended';
    elsif membership_row.status in ('suspended', 'revoked') and target_status = 'active' then
      audit_action := 'resumed';
    elsif target_status = 'revoked' and membership_row.status <> 'revoked' then
      audit_action := 'revoked';
    else
      audit_action := 'updated';
    end if;
    next_review := case
      when target_commercial_status = 'commercial_agreement' then null
      when membership_row.commercial_status = 'complimentary_founding' and membership_row.review_due_at is not null then membership_row.review_due_at
      else now() + interval '90 days'
    end;
    update public.company_memberships
    set plan_code = 'business', status = target_status, commercial_status = target_commercial_status,
        seat_limit_type = target_seat_limit_type, included_seats = target_included_seats,
        seat_terms = btrim(target_seat_terms), agreement_evidence_url = target_agreement_evidence_url,
        review_due_at = next_review,
        ended_by = case when target_status = 'revoked' then actor_id else null end,
        ended_at = case when target_status = 'revoked' then coalesce(ended_at, now()) else null end
    where id = membership_row.id
    returning * into membership_row;
  else
    if target_status = 'revoked' then
      raise exception 'Create or activate a membership before revoking it.' using errcode = '22023';
    end if;
    next_review := case when target_commercial_status = 'complimentary_founding' then now() + interval '90 days' else null end;
    insert into public.company_memberships
      (provider_id, status, commercial_status, seat_limit_type, included_seats, seat_terms,
       agreement_evidence_url, review_due_at, created_by)
    values (target_provider_id, target_status, target_commercial_status, target_seat_limit_type,
      target_included_seats, btrim(target_seat_terms), target_agreement_evidence_url, next_review, actor_id)
    returning * into membership_row;
    audit_action := 'created';
  end if;
  insert into public.company_membership_audit (membership_id, provider_id, actor_profile_id, action, details)
  values (membership_row.id, target_provider_id, actor_id, audit_action,
    jsonb_build_object('before', previous_state,
      'after', to_jsonb(membership_row) - 'created_by' - 'updated_at'));
  return membership_row.id;
end;
$$;

create function public.admin_set_company_publishing_entitlement(
  target_provider_id uuid,
  target_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership_row public.company_memberships%rowtype;
  entitlement_row public.company_publishing_entitlements%rowtype;
  next_type text;
  audit_action text;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_action not in ('grant', 'revoke') then
    raise exception 'Choose grant or revoke.' using errcode = '22023';
  end if;
  if target_action = 'grant' then
    select * into membership_row from public.company_memberships cm
    where cm.provider_id = target_provider_id and cm.status = 'active' and cm.plan_code = 'business';
    if not found then raise exception 'An active Business membership is required.' using errcode = '42501'; end if;
    next_type := case membership_row.commercial_status
      when 'complimentary_founding' then 'complimentary_founding_pilot'
      else 'commercial_agreement' end;
    select * into entitlement_row from public.company_publishing_entitlements e
    where e.provider_id = target_provider_id and e.status = 'active' for update;
    if found then
      if entitlement_row.entitlement_type <> next_type then
        update public.company_publishing_entitlements
        set entitlement_type = next_type,
            agreement_evidence_url = membership_row.agreement_evidence_url,
            billing_reference = null, billing_verified_at = null,
            granted_by = actor_id, granted_at = now(),
            review_due_at = membership_row.review_due_at
        where id = entitlement_row.id returning * into entitlement_row;
        audit_action := 'converted';
      else
        return entitlement_row.id;
      end if;
    else
      insert into public.company_publishing_entitlements
        (provider_id, entitlement_type, status, granted_by, review_due_at, agreement_evidence_url)
      values (target_provider_id, next_type, 'active', actor_id, membership_row.review_due_at,
        membership_row.agreement_evidence_url)
      returning * into entitlement_row;
      audit_action := 'granted';
    end if;
    insert into public.company_publishing_entitlement_audit
      (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at, agreement_evidence_url)
    values (entitlement_row.id, target_provider_id, actor_id, audit_action, next_type,
      membership_row.review_due_at, membership_row.agreement_evidence_url);
    return entitlement_row.id;
  end if;
  update public.company_publishing_entitlements e
  set status = 'revoked', ended_by = actor_id, ended_at = now()
  where e.provider_id = target_provider_id and e.status = 'active'
  returning e.* into entitlement_row;
  if not found then raise exception 'No active company publishing entitlement was found.' using errcode = '22023'; end if;
  insert into public.company_publishing_entitlement_audit
    (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at, agreement_evidence_url)
  values (entitlement_row.id, target_provider_id, actor_id, 'revoked', entitlement_row.entitlement_type,
    entitlement_row.review_due_at, entitlement_row.agreement_evidence_url);
  return entitlement_row.id;
end;
$$;

create function public.admin_set_company_writer(
  target_provider_id uuid,
  target_product_id uuid,
  target_profile_id uuid,
  target_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_action = 'grant' and not exists (
    select 1 from public.company_memberships cm
    join public.company_publishing_entitlements e on e.provider_id = cm.provider_id and e.status = 'active'
    where cm.provider_id = target_provider_id and cm.plan_code = 'business' and cm.status = 'active'
  ) then
    raise exception 'An active Business membership and publishing entitlement are required.' using errcode = '42501';
  end if;
  return public.manage_company_publisher_assignment(
    target_provider_id, target_product_id, target_profile_id, target_action, auth.uid()
  );
end;
$$;

create function public.admin_company_overview(target_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'provider', to_jsonb(p),
    'organisation', (select to_jsonb(o) from public.organisations o where o.provider_id = p.id order by o.created_at, o.id limit 1),
    'catalogue', (select to_jsonb(ps) from public.provider_publication_status ps where ps.provider_id = p.id),
    'membership', (select to_jsonb(cm) from public.company_memberships cm where cm.provider_id = p.id order by cm.created_at desc limit 1),
    'publishing_entitlement', (select to_jsonb(e) from public.company_publishing_entitlements e where e.provider_id = p.id and e.status = 'active'),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', po.profile_id, 'email', u.email, 'display_name', pr.display_name,
        'role_title', po.role_title, 'is_primary', po.is_primary,
        'verification_status', po.verification_status, 'verification_basis', po.verification_basis,
        'verified_at', po.verified_at, 'verified_by', po.verified_by,
        'workspace_status', coalesce(m.status, 'none'),
        'assignments', coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id, 'provider_product_id', a.provider_product_id, 'status', a.status,
          'granted_at', a.granted_at, 'revoked_at', a.revoked_at
        ) order by a.granted_at desc) from public.company_publishing_assignments a
          where a.provider_id = p.id and a.profile_id = po.profile_id), '[]'::jsonb)
      ) order by pr.display_name, po.profile_id)
      from public.profile_organisations po
      join public.organisations o on o.id = po.organisation_id and o.provider_id = p.id
      join public.profiles pr on pr.id = po.profile_id
      join auth.users u on u.id = po.profile_id
      left join public.workspace_memberships m on m.user_id = po.profile_id
    ), '[]'::jsonb)
  ) into result
  from public.providers p where p.id = target_provider_id;
  if result is null then raise exception 'Company not found.' using errcode = '22023'; end if;
  return result;
end;
$$;

create function public.admin_company_audit(target_provider_id uuid)
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
  order by 1 desc
  limit 250;
end;
$$;

revoke all on function public.admin_search_companies(text) from public, anon;
revoke all on function public.admin_save_company(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_set_company_catalogue_status(uuid, text, text) from public, anon;
revoke all on function public.admin_search_company_member(text) from public, anon;
revoke all on function public.admin_connect_company_member(uuid, text, text, boolean) from public, anon;
revoke all on function public.admin_set_company_affiliation(uuid, uuid, text, text) from public, anon;
revoke all on function public.admin_save_company_membership(uuid, text, text, text, integer, text, text) from public, anon;
revoke all on function public.admin_set_company_publishing_entitlement(uuid, text) from public, anon;
revoke all on function public.admin_set_company_writer(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.admin_company_overview(uuid) from public, anon;
revoke all on function public.admin_company_audit(uuid) from public, anon;
grant execute on function public.admin_search_companies(text) to authenticated;
grant execute on function public.admin_save_company(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_company_catalogue_status(uuid, text, text) to authenticated;
grant execute on function public.admin_search_company_member(text) to authenticated;
grant execute on function public.admin_connect_company_member(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_set_company_affiliation(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_save_company_membership(uuid, text, text, text, integer, text, text) to authenticated;
grant execute on function public.admin_set_company_publishing_entitlement(uuid, text) to authenticated;
grant execute on function public.admin_set_company_writer(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.admin_company_overview(uuid) to authenticated;
grant execute on function public.admin_company_audit(uuid) to authenticated;

commit;