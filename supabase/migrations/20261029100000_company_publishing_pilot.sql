begin;

alter table public.organisations drop constraint if exists organisations_check1;
alter table public.organisations drop constraint if exists organisations_organisation_type_check;
alter table public.organisations
  add constraint organisations_organisation_type_check
  check (organisation_type in ('retailer', 'vendor', 'si_gtm', 'advisor', 'other', 'research')),
  add constraint organisations_provider_type_check
  check (provider_id is null or organisation_type in ('vendor', 'advisor', 'research', 'other'));

create unique index provider_products_provider_id_id_idx on public.provider_products (provider_id, id);

alter table public.profile_organisations
  add column verification_status public.affiliation_verification_status not null default 'legacy_curated',
  add column verified_at timestamptz,
  add column verified_by uuid references public.profiles (id) on delete set null,
  add constraint profile_organisations_verification_check check (
    (verification_status = 'self_declared' and verified_at is null and verified_by is null)
    or (verification_status = 'approved' and verified_at is not null and verified_by is not null)
    or (verification_status = 'legacy_curated' and verified_at is null and verified_by is null)
  );
alter table public.profile_organisations
  alter column verification_status set default 'self_declared';

create table public.provider_follows (
  member_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (member_id, provider_id)
);
create index provider_follows_member_order_idx on public.provider_follows (member_id, followed_at desc, provider_id);
create index provider_follows_provider_idx on public.provider_follows (provider_id);
alter table public.provider_follows enable row level security;
revoke all on public.provider_follows from public, anon, authenticated;
grant all on public.provider_follows to service_role;

create table public.company_publishing_entitlements (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('complimentary_founding_pilot', 'paid')),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  granted_by uuid not null references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  review_due_at timestamptz,
  billing_reference text,
  billing_verified_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  ended_at timestamptz,
  check ((status = 'active') = (ended_at is null)),
  check (
    (entitlement_type = 'complimentary_founding_pilot' and billing_reference is null and billing_verified_at is null)
    or (entitlement_type = 'paid' and nullif(btrim(billing_reference), '') is not null and billing_verified_at is not null)
  )
);
create unique index company_publishing_entitlements_one_active_idx
  on public.company_publishing_entitlements (provider_id) where status = 'active';

create table public.company_publishing_entitlement_audit (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid references public.company_publishing_entitlements (id) on delete set null,
  provider_id uuid not null references public.providers (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('granted', 'revoked', 'expired')),
  entitlement_type text not null check (entitlement_type in ('complimentary_founding_pilot', 'paid')),
  review_due_at timestamptz,
  created_at timestamptz not null default now()
);
create index company_publishing_entitlement_audit_provider_idx
  on public.company_publishing_entitlement_audit (provider_id, created_at desc);

create table public.company_publishing_assignments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  provider_product_id uuid,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  check ((status = 'active') = (revoked_at is null)),
  foreign key (provider_id, provider_product_id)
    references public.provider_products (provider_id, id) on delete cascade
);
create unique index company_publishing_assignments_company_scope_idx
  on public.company_publishing_assignments (provider_id, profile_id)
  where status = 'active' and provider_product_id is null;
create unique index company_publishing_assignments_product_scope_idx
  on public.company_publishing_assignments (provider_id, provider_product_id, profile_id)
  where status = 'active' and provider_product_id is not null;
create index company_publishing_assignments_profile_idx
  on public.company_publishing_assignments (profile_id, provider_id) where status = 'active';

create table public.company_publishing_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.company_publishing_assignments (id) on delete set null,
  provider_id uuid not null references public.providers (id) on delete cascade,
  provider_product_id uuid,
  target_profile_id uuid not null references public.profiles (id) on delete restrict,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('granted', 'revoked')),
  created_at timestamptz not null default now()
);
create index company_publishing_assignment_audit_target_idx
  on public.company_publishing_assignment_audit (target_profile_id, created_at desc);

alter table public.insight_articles
  add column content_type text not null default 'commonwork_insight'
    check (content_type in ('commonwork_insight', 'company_insight', 'company_update')),
  add column provider_id uuid references public.providers (id) on delete restrict,
  add column provider_product_id uuid,
  add column published_by uuid references public.profiles (id) on delete set null,
  add column updated_by uuid references public.profiles (id) on delete set null,
  add column public_author_name text,
  add column first_published_at timestamptz,
  add column withdrawn_at timestamptz,
  add constraint insight_articles_company_scope_check check (
    (content_type = 'commonwork_insight' and provider_id is null and provider_product_id is null)
    or (content_type in ('company_insight', 'company_update') and provider_id is not null)
  ),
  add constraint insight_articles_provider_product_fk foreign key (provider_id, provider_product_id)
    references public.provider_products (provider_id, id) on delete restrict;
create index insight_articles_company_publication_idx
  on public.insight_articles (provider_id, provider_product_id, status, published_at desc)
  where content_type <> 'commonwork_insight';

create table public.company_author_clearances (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  requested_article_id uuid not null references public.insight_articles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  check ((status = 'pending') = (reviewed_at is null))
);

alter table public.notifications
  add column insight_article_id uuid references public.insight_articles (id) on delete cascade,
  add column insight_article_slug text;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'introduction_requested', 'context_requested', 'context_supplied', 'consent_received',
    'connector_action_required', 'connector_replaced', 'introduction_completed',
    'conversation_completed', 'introduction_declined', 'introduction_expired',
    'feedback_requested', 'privacy_request_received', 'privacy_request_status_updated',
    'introduction_report_received', 'company_publication_published'
  ));
grant select (insight_article_id, insight_article_slug) on public.notifications to authenticated;
create unique index notifications_company_publication_once_idx
  on public.notifications (profile_id, insight_article_id)
  where insight_article_id is not null;

alter table public.company_publishing_entitlements enable row level security;
alter table public.company_publishing_entitlement_audit enable row level security;
alter table public.company_publishing_assignments enable row level security;
alter table public.company_publishing_assignment_audit enable row level security;
alter table public.company_author_clearances enable row level security;
alter table public.company_publishing_entitlements force row level security;
alter table public.company_publishing_entitlement_audit force row level security;
alter table public.company_publishing_assignments force row level security;
alter table public.company_publishing_assignment_audit force row level security;
alter table public.company_author_clearances force row level security;
revoke all on public.company_publishing_entitlements, public.company_publishing_entitlement_audit,
  public.company_publishing_assignments, public.company_publishing_assignment_audit,
  public.company_author_clearances from public, anon, authenticated;
grant all on public.company_publishing_entitlements, public.company_publishing_entitlement_audit,
  public.company_publishing_assignments, public.company_publishing_assignment_audit,
  public.company_author_clearances to service_role;

create function public.company_publishing_scope_is_active(
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

create function public.can_publish_company_content(target_provider_id uuid, target_product_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.company_publishing_scope_is_active((select auth.uid()), target_provider_id, target_product_id);
$$;

create function public.list_my_company_publishing_scopes()
returns table (
  provider_id uuid,
  provider_name text,
  provider_slug text,
  provider_product_id uuid,
  product_name text,
  product_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.slug, pp.id, pp.name, pp.slug
  from public.company_publishing_assignments a
  join public.providers p on p.id = a.provider_id
  left join public.provider_products pp
    on pp.provider_id = a.provider_id
    and (a.provider_product_id is null or pp.id = a.provider_product_id)
  where a.profile_id = (select auth.uid()) and a.status = 'active'
    and public.company_publishing_scope_is_active(a.profile_id, a.provider_id, a.provider_product_id)
  union all
  select p.id, p.name, p.slug, null::uuid, null::text, null::text
  from public.company_publishing_assignments a
  join public.providers p on p.id = a.provider_id
  where a.profile_id = (select auth.uid()) and a.status = 'active'
    and a.provider_product_id is null
    and public.company_publishing_scope_is_active(a.profile_id, a.provider_id, null)
  order by 2, 5 nulls first;
$$;

create function public.manage_company_publishing_entitlement(
  target_provider_id uuid,
  target_action text,
  target_entitlement_type text,
  actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement_id uuid;
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if target_action not in ('grant', 'revoke', 'expire') then
    raise exception 'Choose grant, revoke or expire.' using errcode = '22023';
  end if;
  if target_entitlement_type <> 'complimentary_founding_pilot' then
    raise exception 'Paid entitlement grants require a separately verified billing pathway.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers p where p.id = target_provider_id) then
    raise exception 'Company not found.' using errcode = '22023';
  end if;

  if target_action = 'grant' then
    select e.id into entitlement_id from public.company_publishing_entitlements e
    where e.provider_id = target_provider_id and e.status = 'active';
    if entitlement_id is null then
      insert into public.company_publishing_entitlements (provider_id, entitlement_type, granted_by, review_due_at)
      values (target_provider_id, 'complimentary_founding_pilot', actor_profile_id, now() + interval '90 days')
      returning id into entitlement_id;
      insert into public.company_publishing_entitlement_audit
        (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at)
      values (entitlement_id, target_provider_id, actor_profile_id, 'granted', 'complimentary_founding_pilot', now() + interval '90 days');
    end if;
  else
    update public.company_publishing_entitlements e
    set status = case target_action when 'expire' then 'expired' else 'revoked' end,
      ended_by = actor_profile_id, ended_at = now()
    where e.provider_id = target_provider_id and e.status = 'active'
    returning e.id into entitlement_id;
    if entitlement_id is null then
      raise exception 'No active company publishing entitlement was found.' using errcode = '22023';
    end if;
    insert into public.company_publishing_entitlement_audit
      (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at)
        select e.id, e.provider_id, actor_profile_id,
           case target_action when 'expire' then 'expired' else 'revoked' end,
          e.entitlement_type, e.review_due_at
    from public.company_publishing_entitlements e where e.id = entitlement_id;
  end if;
  return entitlement_id;
end;
$$;

create function public.manage_company_publisher_assignment(
  target_provider_id uuid,
  target_product_id uuid,
  target_profile_id uuid,
  target_action text,
  actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_id uuid;
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if actor_profile_id = target_profile_id then
    raise exception 'Administrators cannot grant themselves company writer access.' using errcode = '42501';
  end if;
  if target_action not in ('grant', 'revoke') then
    raise exception 'Choose grant or revoke.' using errcode = '22023';
  end if;
  if target_action = 'grant' and not exists (
    select 1 from public.workspace_memberships m
    where m.user_id = target_profile_id and m.status = 'active'
  ) then
    raise exception 'The writer needs active workspace membership.' using errcode = '22023';
  end if;
  if target_action = 'grant' and not exists (
    select 1 from public.profile_organisations po
    join public.organisations o on o.id = po.organisation_id
    where po.profile_id = target_profile_id and po.verification_status = 'approved'
      and o.provider_id = target_provider_id
  ) then
    raise exception 'The writer needs a verified company affiliation.' using errcode = '42501';
  end if;
  if target_product_id is not null and not exists (
    select 1 from public.provider_products pp
    where pp.id = target_product_id and pp.provider_id = target_provider_id
  ) then
    raise exception 'The product does not belong to this company.' using errcode = '22023';
  end if;

  if target_action = 'grant' then
    select a.id into assignment_id from public.company_publishing_assignments a
    where a.provider_id = target_provider_id and a.profile_id = target_profile_id
      and a.provider_product_id is not distinct from target_product_id and a.status = 'active';
    if assignment_id is null then
      insert into public.company_publishing_assignments
        (provider_id, provider_product_id, profile_id, granted_by)
      values (target_provider_id, target_product_id, target_profile_id, actor_profile_id)
      returning id into assignment_id;
      insert into public.company_publishing_assignment_audit
        (assignment_id, provider_id, provider_product_id, target_profile_id, actor_profile_id, action)
      values (assignment_id, target_provider_id, target_product_id, target_profile_id, actor_profile_id, 'granted');
    end if;
  else
    update public.company_publishing_assignments a
    set status = 'revoked', revoked_by = actor_profile_id, revoked_at = now()
    where a.provider_id = target_provider_id and a.profile_id = target_profile_id
      and a.provider_product_id is not distinct from target_product_id and a.status = 'active'
    returning a.id into assignment_id;
    if assignment_id is null then
      raise exception 'No active company writer assignment was found.' using errcode = '22023';
    end if;
    insert into public.company_publishing_assignment_audit
      (assignment_id, provider_id, provider_product_id, target_profile_id, actor_profile_id, action)
    values (assignment_id, target_provider_id, target_product_id, target_profile_id, actor_profile_id, 'revoked');
  end if;
  return assignment_id;
end;
$$;


create function public.guard_company_article_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content_type = 'commonwork_insight' then
    if new.provider_id is not null or new.provider_product_id is not null then
      raise exception 'Commonwork editorial content cannot carry a company scope.' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.provider_id is null then
    raise exception 'Company content requires a represented company.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.author_profile_id <> (select auth.uid()) or new.status <> 'draft'
      or new.published_at is not null or new.first_published_at is not null then
      raise exception 'Company content must be created by its author as a draft.' using errcode = '42501';
    end if;
    new.public_author_name := (select p.display_name from public.profiles p where p.id = new.author_profile_id);
  else
    if new.author_profile_id <> old.author_profile_id or new.provider_id <> old.provider_id
      or new.provider_product_id is distinct from old.provider_product_id or new.content_type <> old.content_type then
      raise exception 'Company, scope and author attribution are immutable.' using errcode = '42501';
    end if;
    if new.author_profile_id <> (select auth.uid())
      and current_setting('commonwork.company_review_publish', true) is distinct from 'on' then
      raise exception 'Only the author can edit company content.' using errcode = '42501';
    end if;
    if current_setting('commonwork.company_review_publish', true) is distinct from 'on'
      and (new.first_published_at is distinct from old.first_published_at
        or new.published_by is distinct from old.published_by
        or new.public_author_name is distinct from old.public_author_name) then
      raise exception 'Publication attribution is controlled by the server.' using errcode = '42501';
    end if;
    if old.status = 'published' and new.status = 'published'
      and (new.title is distinct from old.title or new.deck is distinct from old.deck
        or new.summary is distinct from old.summary or new.body is distinct from old.body
        or new.desk is distinct from old.desk or new.format is distinct from old.format) then
      new.status := 'draft';
      new.published_at := null;
      new.withdrawn_at := now();
    end if;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if current_setting('commonwork.company_review_publish', true) is distinct from 'on'
      and not public.company_publishing_scope_is_active((select auth.uid()), new.provider_id, new.provider_product_id) then
      raise exception 'Active company publishing access is required.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.company_author_clearances c
      where c.profile_id = new.author_profile_id and c.status = 'approved'
    ) then
      raise exception 'The first company publication requires editorial approval.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.provider_publication_status ps
      where ps.provider_id = new.provider_id and ps.status = 'published'
    ) or (new.provider_product_id is not null and not exists (
      select 1 from public.provider_publication_status ps
      where ps.provider_product_id = new.provider_product_id and ps.status = 'published'
    )) then
      raise exception 'The represented company and product must be published first.' using errcode = '22023';
    end if;
    new.first_published_at := coalesce(old.first_published_at, now());
    new.published_at := coalesce(new.published_at, now());
    new.published_by := (select auth.uid());
    new.public_author_name := (select p.display_name from public.profiles p where p.id = new.author_profile_id);
    new.withdrawn_at := null;
  elsif new.status <> 'published' then
    new.published_at := null;
    if tg_op = 'UPDATE' and old.status = 'published' then
      new.withdrawn_at := coalesce(new.withdrawn_at, now());
    end if;
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger insight_articles_guard_company_write
before insert or update on public.insight_articles
for each row execute function public.guard_company_article_write();

create function public.save_company_content(
  target_article_id uuid,
  target_slug text,
  target_title text,
  target_deck text,
  target_summary text,
  target_body text,
  target_desk text,
  target_format text,
  target_content_type text,
  target_provider_id uuid,
  target_product_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  article_id uuid;
begin
  if (select auth.uid()) is null or target_content_type not in ('company_insight', 'company_update')
    or not public.can_publish_company_content(target_provider_id, target_product_id) then
    raise exception 'Active company publishing access is required.' using errcode = '42501';
  end if;
  if target_article_id is null then
    insert into public.insight_articles
      (slug, title, deck, summary, body, desk, format, author_profile_id, content_type, provider_id, provider_product_id)
    values
      (target_slug, target_title, coalesce(target_deck, ''), coalesce(target_summary, ''), coalesce(target_body, ''),
       target_desk, target_format, (select auth.uid()), target_content_type, target_provider_id, target_product_id)
    returning id into article_id;
  else
    update public.insight_articles a
    set slug = target_slug, title = target_title, deck = coalesce(target_deck, ''),
        summary = coalesce(target_summary, ''), body = coalesce(target_body, ''),
        desk = target_desk, format = target_format,
        status = 'draft', published_at = null, updated_at = now()
    where a.id = target_article_id and a.content_type <> 'commonwork_insight'
      and a.author_profile_id = (select auth.uid())
      and a.provider_id = target_provider_id and a.provider_product_id is not distinct from target_product_id;
    if not found then
      raise exception 'Company publication not found in the assigned scope.' using errcode = '42501';
    end if;
    article_id := target_article_id;
  end if;
  return article_id;
end;
$$;

create function public.publish_company_content(target_article_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.insight_articles%rowtype;
  clearance_status text;
begin
  select * into article from public.insight_articles a
  where a.id = target_article_id and a.content_type <> 'commonwork_insight' for update;
  if not found or not public.can_publish_company_content(article.provider_id, article.provider_product_id) then
    raise exception 'Company publication is outside your active scope.' using errcode = '42501';
  end if;
  if article.author_profile_id <> (select auth.uid()) then
    raise exception 'Only the author can withdraw this publication.' using errcode = '42501';
  end if;
  if article.status = 'published' then return 'already_published'; end if;

  select c.status into clearance_status from public.company_author_clearances c
  where c.profile_id = article.author_profile_id;
  if clearance_status is distinct from 'approved' then
    insert into public.company_author_clearances (profile_id, status, requested_article_id, requested_at, reviewed_by, reviewed_at)
    values (article.author_profile_id, 'pending', article.id, now(), null, null)
    on conflict (profile_id) do update
      set status = 'pending', requested_article_id = excluded.requested_article_id,
          requested_at = excluded.requested_at, reviewed_by = null, reviewed_at = null
      where public.company_author_clearances.status = 'rejected';
    return 'review_required';
  end if;

  update public.insight_articles a
  set status = 'published', published_at = now(), updated_at = now()
  where a.id = article.id;
  return 'published';
end;
$$;

create function public.withdraw_company_content(target_article_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.insight_articles%rowtype;
begin
  select * into article from public.insight_articles a
  where a.id = target_article_id and a.content_type <> 'commonwork_insight' for update;
  if not found or not public.can_publish_company_content(article.provider_id, article.provider_product_id) then
    raise exception 'Company publication is outside your active scope.' using errcode = '42501';
  end if;
  update public.insight_articles a
  set status = 'draft', published_at = null, withdrawn_at = case when a.status = 'published' then now() else a.withdrawn_at end,
      updated_at = now()
  where a.id = article.id;
  return true;
end;
$$;

create function public.list_pending_company_first_publications()
returns table (
  profile_id uuid,
  display_name text,
  article_id uuid,
  slug text,
  title text,
  provider_name text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_insights() then
    raise exception 'Commonwork editorial administrator access is required.' using errcode = '42501';
  end if;
  return query
  select c.profile_id, p.display_name, a.id, a.slug, a.title, pr.name, c.requested_at
  from public.company_author_clearances c
  join public.profiles p on p.id = c.profile_id
  join public.insight_articles a on a.id = c.requested_article_id
  join public.providers pr on pr.id = a.provider_id
  where c.status = 'pending'
  order by c.requested_at, a.id;
end;
$$;

create function public.review_company_first_publication(target_article_id uuid, target_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.insight_articles%rowtype;
begin
  if not public.can_edit_insights() then
    raise exception 'Commonwork editorial administrator access is required.' using errcode = '42501';
  end if;
  if target_action not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  select a.* into article from public.insight_articles a
  join public.company_author_clearances c on c.requested_article_id = a.id and c.status = 'pending'
  where a.id = target_article_id and a.status = 'draft' and a.content_type <> 'commonwork_insight'
  for update of a;
  if not found then
    raise exception 'No pending first publication was found.' using errcode = '22023';
  end if;
  if target_action = 'reject' then
    update public.company_author_clearances c
    set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where c.profile_id = article.author_profile_id;
    return true;
  end if;
  if not public.company_publishing_scope_is_active(article.author_profile_id, article.provider_id, article.provider_product_id) then
    raise exception 'The author no longer has active company publishing access.' using errcode = '42501';
  end if;
  update public.company_author_clearances c
  set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
  where c.profile_id = article.author_profile_id;
  perform set_config('commonwork.company_review_publish', 'on', true);
  update public.insight_articles a
  set status = 'published', published_at = now(), updated_at = now()
  where a.id = article.id;
  return true;
end;
$$;

create function public.follow_provider(target_provider_id uuid)
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
  if target_provider_id is null or not exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_id = target_provider_id and ps.status = 'published'
  ) then
    raise exception 'This company cannot be followed.' using errcode = '22023';
  end if;
  insert into public.provider_follows (member_id, provider_id)
  values (actor_id, target_provider_id) on conflict (member_id, provider_id) do nothing;
  return true;
end;
$$;

create function public.unfollow_provider(target_provider_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  delete from public.provider_follows f where f.member_id = (select auth.uid()) and f.provider_id = target_provider_id;
  return false;
end;
$$;

create function public.get_provider_follow_state(target_provider_slug text)
returns table (provider_id uuid, following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select p.id, exists (
    select 1 from public.provider_follows f
    where f.member_id = (select auth.uid()) and f.provider_id = p.id
  )
  from public.providers p
  join public.provider_publication_status ps on ps.provider_id = p.id and ps.status = 'published'
  where p.slug = target_provider_slug;
end;
$$;

create function public.get_my_followed_provider_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare total integer;
begin
  if (select auth.uid()) is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  select count(*)::integer into total from public.provider_follows f where f.member_id = (select auth.uid());
  return total;
end;
$$;

create function public.list_my_followed_providers(page_limit integer default 20, page_offset integer default 0)
returns table (provider_id uuid, available boolean, provider_slug text, provider_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select f.provider_id, (ps.status = 'published'), case when ps.status = 'published' then p.slug end,
         case when ps.status = 'published' then p.name end
  from public.provider_follows f
  left join public.providers p on p.id = f.provider_id
  left join public.provider_publication_status ps on ps.provider_id = f.provider_id
  where f.member_id = (select auth.uid())
  order by f.followed_at desc, f.provider_id
  limit greatest(1, least(coalesce(page_limit, 20), 50)) offset greatest(0, coalesce(page_offset, 0));
end;
$$;

create function public.guard_company_publication_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.content_type = 'commonwork_insight' or new.status <> 'published'
    or new.first_published_at is null or old.first_published_at is not null then
    return new;
  end if;

  insert into public.notifications (profile_id, insight_article_id, insight_article_slug, type, title, body)
  select recipients.profile_id, new.id, new.slug, 'company_publication_published',
         case when new.content_type = 'company_update' then 'Company update published' else 'New company insight published' end,
         case when new.provider_product_id is null then 'A company you follow published new content.'
              else 'A company or product you follow published new content.' end
  from (
    select f.member_id as profile_id
    from public.provider_follows f
    join public.workspace_memberships m on m.user_id = f.member_id and m.status = 'active'
    where f.provider_id = new.provider_id
    union
    select f.member_id
    from public.product_follows f
    join public.workspace_memberships m on m.user_id = f.member_id and m.status = 'active'
    where new.provider_product_id is not null and f.provider_product_id = new.provider_product_id
  ) recipients
  on conflict (profile_id, insight_article_id) where insight_article_id is not null do nothing;
  return new;
end;
$$;

create function public.company_article_publication_is_visible(target_provider_id uuid, target_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_id = target_provider_id and ps.status = 'published'
  ) and (target_product_id is null or exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_product_id = target_product_id and ps.status = 'published'
  ));
$$;

create function public.get_company_article_view(target_slug text)
returns table (
  slug text,
  title text,
  deck text,
  summary text,
  body text,
  desk text,
  format text,
  content_type text,
  public_author_name text,
  status public.insight_article_status,
  published_at timestamptz,
  provider_name text,
  provider_slug text,
  product_name text,
  product_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.title, a.deck, a.summary, a.body, a.desk, a.format, a.content_type,
         a.public_author_name, a.status, a.published_at, p.name, p.slug, pp.name, pp.slug
  from public.insight_articles a
  join public.providers p on p.id = a.provider_id
  left join public.provider_products pp on pp.id = a.provider_product_id
  where a.slug = target_slug and a.content_type <> 'commonwork_insight'
    and (
      (a.status = 'published' and public.company_article_publication_is_visible(a.provider_id, a.provider_product_id))
      or (a.status = 'draft' and a.author_profile_id = (select auth.uid())
        and public.can_publish_company_content(a.provider_id, a.provider_product_id))
      or (a.status = 'draft' and public.can_edit_insights())
    );
$$;

create function public.list_public_company_articles()
returns table (
  slug text,
  title text,
  summary text,
  content_type text,
  public_author_name text,
  published_at timestamptz,
  provider_name text,
  provider_slug text,
  product_name text,
  product_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.title, a.summary, a.content_type, a.public_author_name, a.published_at,
         p.name, p.slug, pp.name, pp.slug
  from public.insight_articles a
  join public.providers p on p.id = a.provider_id
  left join public.provider_products pp on pp.id = a.provider_product_id
  where a.content_type <> 'commonwork_insight' and a.status = 'published'
    and public.company_article_publication_is_visible(a.provider_id, a.provider_product_id)
  order by a.published_at desc, a.slug
  limit 100;
$$;

create function public.is_commonwork_insights_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = (select auth.uid()) and a.status = 'active'
  );
$$;

create trigger insight_articles_notify_first_company_publication
after update of status on public.insight_articles
for each row when (new.status = 'published' and new.content_type <> 'commonwork_insight')
execute function public.guard_company_publication_notifications();

drop policy if exists insight_articles_published_read on public.insight_articles;
create policy insight_articles_published_read
on public.insight_articles for select to anon, authenticated
using (
  (status = 'published' and (
    content_type = 'commonwork_insight'
    or public.company_article_publication_is_visible(provider_id, provider_product_id)
  ))
  or public.is_commonwork_insights_editor()
  or (
    status = 'draft' and content_type <> 'commonwork_insight'
    and author_profile_id = (select auth.uid())
    and public.can_publish_company_content(provider_id, provider_product_id)
  )
);

drop policy if exists insight_articles_editor_write on public.insight_articles;
create policy insight_articles_commonwork_editor_write
on public.insight_articles for all to authenticated
using (content_type = 'commonwork_insight' and public.can_edit_insights())
with check (content_type = 'commonwork_insight' and public.can_edit_insights() and author_profile_id = auth.uid());

create policy insight_articles_company_writer_insert
on public.insight_articles for insert to authenticated
with check (
  content_type in ('company_insight', 'company_update')
  and author_profile_id = auth.uid()
  and status = 'draft'
  and public.can_publish_company_content(provider_id, provider_product_id)
);

create policy insight_articles_company_writer_update
on public.insight_articles for update to authenticated
using (
  content_type in ('company_insight', 'company_update')
  and public.can_publish_company_content(provider_id, provider_product_id)
)
with check (
  content_type in ('company_insight', 'company_update')
  and public.can_publish_company_content(provider_id, provider_product_id)
);

create function public.list_my_company_publications()
returns table (
  id uuid,
  slug text,
  title text,
  deck text,
  summary text,
  body text,
  desk text,
  format text,
  status public.insight_article_status,
  content_type text,
  provider_id uuid,
  provider_product_id uuid,
  public_author_name text,
  published_at timestamptz,
  first_published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  is_author boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.deck, a.summary, a.body, a.desk, a.format, a.status,
         a.content_type, a.provider_id, a.provider_product_id, a.public_author_name,
         a.published_at, a.first_published_at, a.withdrawn_at, a.created_at, a.updated_at,
         a.author_profile_id = (select auth.uid())
  from public.insight_articles a
  where a.content_type <> 'commonwork_insight'
    and (a.status = 'published' or a.author_profile_id = (select auth.uid()))
    and public.company_publishing_scope_is_active((select auth.uid()), a.provider_id, a.provider_product_id)
  order by a.updated_at desc;
$$;

revoke select on public.insight_articles from anon, authenticated;
grant select (
  id, slug, title, deck, summary, body, desk, format, status, linked_product_slug,
  published_at, created_at, updated_at, content_type, provider_id, provider_product_id,
  public_author_name, first_published_at, withdrawn_at
) on public.insight_articles to anon, authenticated;

revoke all on function public.company_publishing_scope_is_active(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_publish_company_content(uuid, uuid) from public;
grant execute on function public.can_publish_company_content(uuid, uuid) to anon, authenticated;
revoke all on function public.list_my_company_publishing_scopes() from public, anon;
grant execute on function public.list_my_company_publishing_scopes() to authenticated;
revoke all on function public.manage_company_publishing_entitlement(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.manage_company_publishing_entitlement(uuid, text, text, uuid) to service_role;
revoke all on function public.manage_company_publisher_assignment(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.manage_company_publisher_assignment(uuid, uuid, uuid, text, uuid) to service_role;
revoke all on function public.guard_company_article_write() from public, anon, authenticated;
revoke all on function public.save_company_content(uuid, text, text, text, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.save_company_content(uuid, text, text, text, text, text, text, text, text, uuid, uuid) to authenticated;
revoke all on function public.publish_company_content(uuid) from public, anon;
grant execute on function public.publish_company_content(uuid) to authenticated;
revoke all on function public.withdraw_company_content(uuid) from public, anon;
grant execute on function public.withdraw_company_content(uuid) to authenticated;
revoke all on function public.list_pending_company_first_publications() from public, anon;
grant execute on function public.list_pending_company_first_publications() to authenticated;
revoke all on function public.list_my_company_publications() from public, anon;
grant execute on function public.list_my_company_publications() to authenticated;
revoke all on function public.review_company_first_publication(uuid, text) from public, anon;
grant execute on function public.review_company_first_publication(uuid, text) to authenticated;
revoke all on function public.follow_provider(uuid) from public, anon, authenticated;
revoke all on function public.unfollow_provider(uuid) from public, anon, authenticated;
revoke all on function public.get_provider_follow_state(text) from public, anon, authenticated;
revoke all on function public.get_my_followed_provider_count() from public, anon, authenticated;
revoke all on function public.list_my_followed_providers(integer, integer) from public, anon, authenticated;
grant execute on function public.follow_provider(uuid) to authenticated;
grant execute on function public.unfollow_provider(uuid) to authenticated;
grant execute on function public.get_provider_follow_state(text) to authenticated;
grant execute on function public.get_my_followed_provider_count() to authenticated;
grant execute on function public.list_my_followed_providers(integer, integer) to authenticated;
revoke all on function public.guard_company_publication_notifications() from public, anon, authenticated;
revoke all on function public.is_commonwork_insights_editor() from public;
grant execute on function public.is_commonwork_insights_editor() to anon, authenticated;
revoke all on function public.company_article_publication_is_visible(uuid, uuid) from public, anon, authenticated;
grant execute on function public.company_article_publication_is_visible(uuid, uuid) to anon, authenticated;
revoke all on function public.get_company_article_view(text) from public;
grant execute on function public.get_company_article_view(text) to anon, authenticated;
revoke all on function public.list_public_company_articles() from public;
grant execute on function public.list_public_company_articles() to anon, authenticated;

create or replace function public.export_my_member_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'authentication_email', (select u.email from auth.users u where u.id = actor_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = actor_id),
    'competencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id, 'competency_id', pc.competency_id, 'member_statement', pc.member_statement,
        'evidence_status', pc.evidence_status, 'discoverable', pc.discoverable,
        'competency_name', c.name,
        'evidence', coalesce((select jsonb_agg(to_jsonb(e)) from public.competence_evidence e where e.profile_competency_id = pc.id), '[]'::jsonb)
      ))
      from public.profile_competencies pc join public.competencies c on c.id = pc.competency_id
      where pc.profile_id = actor_id
    ), '[]'::jsonb),
    'contact_preferences', (select to_jsonb(cp) from public.contact_preferences cp where cp.profile_id = actor_id),
    'contact_methods', coalesce((select jsonb_agg(to_jsonb(cm)) from public.profile_contact_methods cm where cm.profile_id = actor_id), '[]'::jsonb),
    'needs', coalesce((select jsonb_agg(jsonb_build_object(
      'need', to_jsonb(n),
      'competencies', coalesce((select jsonb_agg(to_jsonb(nc)) from public.need_competencies nc where nc.need_id = n.id), '[]'::jsonb)
    )) from public.competence_needs n where n.owner_profile_id = actor_id), '[]'::jsonb),
    'introductions', coalesce((select jsonb_agg(jsonb_build_object(
      'introduction', to_jsonb(i), 'my_participant_record', to_jsonb(p)
    )) from public.introduction_participants p join public.introductions i on i.id = p.introduction_id
      where p.profile_id = actor_id), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(f)) from public.introduction_feedback f where f.profile_id = actor_id), '[]'::jsonb),
    'privacy_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.member_privacy_requests r where r.profile_id = actor_id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.profile_id = actor_id), '[]'::jsonb),
    'blocked_members', coalesce((select jsonb_agg(b.blocked_profile_id) from public.profile_introduction_blocks b where b.profile_id = actor_id), '[]'::jsonb),
    'provider_follows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id', pf.provider_id,
        'followed_at', pf.followed_at,
        'available', (ps.status = 'published'),
        'provider_slug', case when ps.status = 'published' then p.slug end,
        'provider_name', case when ps.status = 'published' then p.name end
      ) order by pf.followed_at desc, pf.provider_id)
      from public.provider_follows pf
      left join public.providers p on p.id = pf.provider_id
      left join public.provider_publication_status ps on ps.provider_id = pf.provider_id
      where pf.member_id = actor_id
    ), '[]'::jsonb),
    'product_follows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', pf.provider_product_id,
        'followed_at', pf.followed_at,
        'available', state.ok,
        'product_slug', case when state.ok then pp.slug end,
        'product_name', case when state.ok then pp.name end,
        'provider_name', case when state.ok then pr.name end
      ) order by pf.followed_at desc, pf.provider_product_id)
      from public.product_follows pf
      join public.provider_products pp on pp.id = pf.provider_product_id
      join public.providers pr on pr.id = pp.provider_id
      cross join lateral (select public.is_product_followable(pf.provider_product_id) as ok) state
      where pf.member_id = actor_id
    ), '[]'::jsonb)
  );
end;
$$;

commit;