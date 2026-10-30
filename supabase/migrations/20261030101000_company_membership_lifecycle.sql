begin;

create or replace function public.admin_search_companies(search_term text default '')
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
  where coalesce(btrim(search_term), '') = ''
     or position(lower(btrim(search_term)) in lower(p.name)) > 0
     or position(lower(btrim(search_term)) in lower(p.slug)) > 0
  union all
  select null::uuid, null::text, o.name, o.id, o.slug, o.organisation_type,
    null::text, null::text, null::text
  from public.organisations o
  where o.provider_id is null
    and (coalesce(btrim(search_term), '') = ''
      or position(lower(btrim(search_term)) in lower(o.name)) > 0
      or position(lower(btrim(search_term)) in lower(o.slug)) > 0)
  order by 3, 1 nulls first
  limit 100;
end;
$$;

create or replace function public.admin_save_company(
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
  resolved_provider_id uuid := target_provider_id;
  organisation_id uuid := target_organisation_id;
  linked_provider_id uuid;
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
    if target_organisation_id is null and exists (
      select 1 from public.organisations o
      where o.provider_id is null and lower(o.name) = lower(btrim(target_provider_name))
    ) then
      raise exception 'A matching unlinked organisation exists. Select it before creating another company.' using errcode = '23505';
    end if;
    insert into public.providers (slug, name, provider_type, website_url, summary, source_system, source_record_id, source_url)
    values (target_provider_slug, btrim(target_provider_name), target_provider_type, nullif(btrim(target_website_url), ''),
      btrim(target_provider_summary), btrim(target_source_system), btrim(target_source_record_id), nullif(btrim(target_source_url), ''))
    returning id into resolved_provider_id;
    insert into public.provider_publication_status (provider_id, status) values (resolved_provider_id, 'draft');
    action_name := 'company_created';
  else
    if exists (
      select 1 from public.providers p
      where p.id <> target_provider_id
        and (lower(p.slug) = lower(target_provider_slug) or lower(p.name) = lower(btrim(target_provider_name))
          or (p.source_system = target_source_system and p.source_record_id = target_source_record_id))
    ) then
      raise exception 'Another provider already uses those company details.' using errcode = '23505';
    end if;
    update public.providers p
    set slug = target_provider_slug, name = btrim(target_provider_name), provider_type = target_provider_type,
        website_url = nullif(btrim(target_website_url), ''), summary = btrim(target_provider_summary),
        source_system = btrim(target_source_system), source_record_id = btrim(target_source_record_id),
        source_url = nullif(btrim(target_source_url), '')
    where p.id = target_provider_id;
    if not found then raise exception 'Company not found.' using errcode = '22023'; end if;
    action_name := 'company_updated';
  end if;

  if organisation_id is not null then
    select o.provider_id into linked_provider_id
    from public.organisations o where o.id = organisation_id for update;
    if not found then raise exception 'The selected organisation was not found.' using errcode = '22023'; end if;
    if linked_provider_id is not null and linked_provider_id <> resolved_provider_id then
      raise exception 'The selected organisation already belongs to another provider.' using errcode = '23505';
    end if;
    if exists (select 1 from public.organisations o where lower(o.slug) = lower(target_organisation_slug) and o.id <> organisation_id) then
      raise exception 'Another organisation already uses that URL name.' using errcode = '23505';
    end if;
    update public.organisations o
    set slug = target_organisation_slug, name = btrim(target_provider_name),
        organisation_type = target_organisation_type, summary = btrim(target_organisation_summary),
        provider_id = resolved_provider_id
    where o.id = organisation_id;
  else
    select o.id into organisation_id from public.organisations o
    where o.provider_id = resolved_provider_id order by o.created_at, o.id limit 1;
    if organisation_id is null then
      if exists (select 1 from public.organisations o where lower(o.slug) = lower(target_organisation_slug)) then
        raise exception 'An organisation with that URL name already exists.' using errcode = '23505';
      end if;
      insert into public.organisations (slug, name, organisation_type, summary, provider_id)
      values (target_organisation_slug, btrim(target_provider_name), target_organisation_type,
        btrim(target_organisation_summary), resolved_provider_id)
      returning id into organisation_id;
    end if;
  end if;

  insert into public.company_operator_audit (provider_id, actor_profile_id, action, details)
  values (resolved_provider_id, actor_id, action_name, jsonb_build_object(
    'provider_slug', target_provider_slug, 'organisation_id', organisation_id,
    'organisation_type', target_organisation_type, 'provider_type', target_provider_type
  ));
  return jsonb_build_object('provider_id', resolved_provider_id, 'organisation_id', organisation_id);
end;
$$;

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
      and ((cm.commercial_status = 'complimentary_founding' and e.entitlement_type = 'complimentary_founding_pilot')
        or (cm.commercial_status = 'commercial_agreement' and e.entitlement_type = 'commercial_agreement'))
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

create function public.sync_company_membership_publishing_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce((select auth.uid()), new.ended_by, new.created_by);
  entitlement_row public.company_publishing_entitlements%rowtype;
  expected_type text;
  action_name text;
begin
  if tg_op = 'UPDATE' and new.status = old.status
     and new.commercial_status = old.commercial_status
     and new.agreement_evidence_url is not distinct from old.agreement_evidence_url
     and new.review_due_at is not distinct from old.review_due_at then
    return new;
  end if;
  select * into entitlement_row from public.company_publishing_entitlements e
  where e.provider_id = new.provider_id and e.status = 'active' for update;
  if not found then return new; end if;

  if new.status <> 'active' then
    update public.company_publishing_entitlements e
    set status = 'revoked', ended_by = actor_id, ended_at = now()
    where e.id = entitlement_row.id returning e.* into entitlement_row;
    insert into public.company_publishing_entitlement_audit
      (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at, agreement_evidence_url)
    values (entitlement_row.id, new.provider_id, actor_id, 'revoked', entitlement_row.entitlement_type,
      entitlement_row.review_due_at, entitlement_row.agreement_evidence_url);
    return new;
  end if;

  expected_type := case new.commercial_status
    when 'complimentary_founding' then 'complimentary_founding_pilot'
    else 'commercial_agreement' end;
  if entitlement_row.entitlement_type <> expected_type
     or entitlement_row.agreement_evidence_url is distinct from new.agreement_evidence_url
     or entitlement_row.review_due_at is distinct from new.review_due_at then
    update public.company_publishing_entitlements e
    set entitlement_type = expected_type, agreement_evidence_url = new.agreement_evidence_url,
        billing_reference = null, billing_verified_at = null, review_due_at = new.review_due_at,
        granted_by = actor_id, granted_at = now()
    where e.id = entitlement_row.id returning e.* into entitlement_row;
    action_name := case when old.commercial_status is distinct from new.commercial_status then 'converted' else 'converted' end;
    insert into public.company_publishing_entitlement_audit
      (entitlement_id, provider_id, actor_profile_id, action, entitlement_type, review_due_at, agreement_evidence_url)
    values (entitlement_row.id, new.provider_id, actor_id, action_name, expected_type,
      new.review_due_at, new.agreement_evidence_url);
  end if;
  return new;
end;
$$;

create trigger company_memberships_sync_publishing_entitlement
after insert or update on public.company_memberships
for each row execute function public.sync_company_membership_publishing_entitlement();
revoke all on function public.sync_company_membership_publishing_entitlement() from public, anon, authenticated;

alter table public.company_author_clearances
  add column review_feedback text not null default '' check (char_length(review_feedback) <= 1200);

create table public.company_publication_review_audit (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.insight_articles (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  author_profile_id uuid not null references public.profiles (id) on delete restrict,
  reviewer_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('approved', 'returned')),
  feedback text not null default '' check (char_length(feedback) <= 1200),
  created_at timestamptz not null default now()
);
create index company_publication_review_audit_provider_idx
  on public.company_publication_review_audit (provider_id, created_at desc);
alter table public.company_publication_review_audit enable row level security;
alter table public.company_publication_review_audit force row level security;
revoke all on public.company_publication_review_audit from public, anon, authenticated;
grant all on public.company_publication_review_audit to service_role;

create or replace function public.publish_company_content(target_article_id uuid)
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
    insert into public.company_author_clearances
      (profile_id, status, requested_article_id, requested_at, reviewed_by, reviewed_at, review_feedback)
    values (article.author_profile_id, 'pending', article.id, now(), null, null, '')
    on conflict (profile_id) do update
      set status = 'pending', requested_article_id = excluded.requested_article_id,
          requested_at = excluded.requested_at, reviewed_by = null, reviewed_at = null, review_feedback = ''
      where public.company_author_clearances.status = 'rejected';
    return 'review_required';
  end if;
  update public.insight_articles a
  set status = 'published', published_at = now(), updated_at = now()
  where a.id = article.id;
  return 'published';
end;
$$;

drop function public.review_company_first_publication(uuid, text);
create function public.review_company_first_publication(
  target_article_id uuid,
  target_action text,
  target_feedback text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.insight_articles%rowtype;
  actor_id uuid := auth.uid();
begin
  if not public.can_edit_insights() then
    raise exception 'Commonwork editorial administrator access is required.' using errcode = '42501';
  end if;
  if target_action not in ('approve', 'reject')
     or char_length(coalesce(target_feedback, '')) > 1200
     or (target_action = 'reject' and char_length(btrim(coalesce(target_feedback, ''))) < 8) then
    raise exception 'Choose approve or return with feedback.' using errcode = '22023';
  end if;
  select a.* into article from public.insight_articles a
  join public.company_author_clearances c on c.requested_article_id = a.id and c.status = 'pending'
  where a.id = target_article_id and a.status = 'draft' and a.content_type <> 'commonwork_insight'
  for update of a;
  if not found then raise exception 'No pending first publication was found.' using errcode = '22023'; end if;
  update public.company_author_clearances c
  set status = case target_action when 'approve' then 'approved' else 'rejected' end,
      reviewed_by = actor_id, reviewed_at = now(), review_feedback = btrim(coalesce(target_feedback, ''))
  where c.profile_id = article.author_profile_id;
  insert into public.company_publication_review_audit
    (article_id, provider_id, author_profile_id, reviewer_profile_id, action, feedback)
  values (article.id, article.provider_id, article.author_profile_id, actor_id,
    case target_action when 'approve' then 'approved' else 'returned' end,
    btrim(coalesce(target_feedback, '')));
  if target_action = 'reject' then return true; end if;
  if not public.company_publishing_scope_is_active(article.author_profile_id, article.provider_id, article.provider_product_id) then
    raise exception 'The author no longer has active company publishing access.' using errcode = '42501';
  end if;
  perform set_config('commonwork.company_review_publish', 'on', true);
  update public.insight_articles a
  set status = 'published', published_at = now(), updated_at = now()
  where a.id = article.id;
  return true;
end;
$$;

create or replace function public.admin_company_overview(target_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
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
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'id', pp.id, 'slug', pp.slug, 'name', pp.name, 'status', ps.status
    ) order by pp.name) from public.provider_products pp
      left join public.provider_publication_status ps on ps.provider_product_id = pp.id
      where pp.provider_id = p.id), '[]'::jsonb),
    'active_people_count', (select count(*) from public.profile_organisations po
      join public.organisations o on o.id = po.organisation_id and o.provider_id = p.id
      join public.workspace_memberships m on m.user_id = po.profile_id and m.status = 'active'),
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
  select a.created_at, 'publication_review', a.reviewer_profile_id, a.author_profile_id,
    jsonb_build_object('article_id', a.article_id, 'action', a.action, 'feedback', a.feedback)
  from public.company_publication_review_audit a where a.provider_id = target_provider_id
  order by 1 desc
  limit 250;
end;
$$;

drop function public.list_my_company_publications();
create function public.list_my_company_publications()
returns table (
  id uuid, slug text, title text, deck text, summary text, body text, desk text, format text,
  status public.insight_article_status, content_type text, provider_id uuid, provider_product_id uuid,
  public_author_name text, published_at timestamptz, first_published_at timestamptz,
  withdrawn_at timestamptz, created_at timestamptz, updated_at timestamptz, is_author boolean,
  first_review_status text, first_review_feedback text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.deck, a.summary, a.body, a.desk, a.format, a.status,
         a.content_type, a.provider_id, a.provider_product_id, a.public_author_name,
         a.published_at, a.first_published_at, a.withdrawn_at, a.created_at, a.updated_at,
         a.author_profile_id = (select auth.uid()), c.status, c.review_feedback
  from public.insight_articles a
  left join public.company_author_clearances c on c.profile_id = a.author_profile_id
  where a.content_type <> 'commonwork_insight'
    and (a.status = 'published' or a.author_profile_id = (select auth.uid()))
    and public.company_publishing_scope_is_active((select auth.uid()), a.provider_id, a.provider_product_id)
  order by a.updated_at desc;
$$;

revoke all on function public.review_company_first_publication(uuid, text, text) from public, anon;
grant execute on function public.review_company_first_publication(uuid, text, text) to authenticated;
revoke all on function public.list_my_company_publications() from public, anon;
grant execute on function public.list_my_company_publications() to authenticated;

commit;