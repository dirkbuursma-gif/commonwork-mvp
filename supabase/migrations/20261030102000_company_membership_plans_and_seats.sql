begin;

create table public.company_membership_plans (
  code text primary key check (code in ('community', 'professional', 'business')),
  name text not null,
  included_benefits text[] not null default '{}',
  assignable boolean not null default false,
  created_at timestamptz not null default now(),
  check (included_benefits <@ array['company_catalogue_profile', 'company_people_seats', 'company_insight_updates']::text[])
);
alter table public.company_membership_plans enable row level security;
alter table public.company_membership_plans force row level security;
revoke all on public.company_membership_plans from public, anon, authenticated;
grant all on public.company_membership_plans to service_role;

insert into public.company_membership_plans (code, name, included_benefits, assignable)
values
  ('community', 'Community', '{}', false),
  ('professional', 'Professional', '{}', false),
  ('business', 'Business', array['company_catalogue_profile', 'company_people_seats', 'company_insight_updates'], true);

alter table public.company_memberships
  drop constraint company_memberships_plan_code_check,
  add constraint company_memberships_plan_code_check check (plan_code in ('community', 'professional', 'business')),
  add constraint company_memberships_plan_code_fk foreign key (plan_code) references public.company_membership_plans (code),
  add column included_benefits text[] not null default array['company_catalogue_profile', 'company_people_seats', 'company_insight_updates'],
  add constraint company_memberships_benefits_check check (
    included_benefits <@ array['company_catalogue_profile', 'company_people_seats', 'company_insight_updates']::text[]
  );

create function public.enforce_company_membership_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_provider_id uuid;
  linked_people integer;
begin
  if new.status <> 'active' or new.seat_limit_type <> 'capped' then return new; end if;
  select count(distinct po.profile_id)::integer into linked_people
  from public.profile_organisations po
  join public.organisations o on o.id = po.organisation_id
  where o.provider_id = new.provider_id;
  if linked_people > new.included_seats then
    raise exception 'Included seats cannot be reduced below the number of people already connected.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger company_memberships_enforce_seats
before insert or update of status, seat_limit_type, included_seats on public.company_memberships
for each row execute function public.enforce_company_membership_seat_limit();
revoke all on function public.enforce_company_membership_seat_limit() from public, anon, authenticated;

create function public.enforce_company_people_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_provider_id uuid;
  membership_row public.company_memberships%rowtype;
  linked_people integer;
  already_connected boolean;
begin
  if tg_op = 'UPDATE' and old.profile_id = new.profile_id and old.organisation_id = new.organisation_id then
    return new;
  end if;
  select o.provider_id into company_provider_id from public.organisations o where o.id = new.organisation_id;
  if company_provider_id is null then return new; end if;
  select * into membership_row from public.company_memberships cm
  where cm.provider_id = company_provider_id and cm.status = 'active' and cm.plan_code = 'business';
  if not found or membership_row.seat_limit_type <> 'capped' then return new; end if;
  select exists (
    select 1 from public.profile_organisations po
    join public.organisations o on o.id = po.organisation_id and o.provider_id = company_provider_id
    where po.profile_id = new.profile_id
      and (tg_op <> 'UPDATE' or po.organisation_id <> old.organisation_id)
  ) into already_connected;
  if already_connected then return new; end if;
  select count(distinct po.profile_id)::integer into linked_people
  from public.profile_organisations po
  join public.organisations o on o.id = po.organisation_id and o.provider_id = company_provider_id
  where tg_op <> 'UPDATE' or po.profile_id <> old.profile_id or po.organisation_id <> old.organisation_id;
  if linked_people >= membership_row.included_seats then
    raise exception 'The active Business membership has no available people seats.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger profile_organisations_enforce_company_seats
before insert or update of profile_id, organisation_id on public.profile_organisations
for each row execute function public.enforce_company_people_seat_limit();
revoke all on function public.enforce_company_people_seat_limit() from public, anon, authenticated;

create function public.prevent_operator_edits_to_seed_companies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.is_seed_data then
    raise exception 'Seed company records are not real-company records and cannot be changed here.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger providers_prevent_operator_seed_edits
before update on public.providers
for each row execute function public.prevent_operator_edits_to_seed_companies();
create trigger organisations_prevent_operator_seed_edits
before update on public.organisations
for each row execute function public.prevent_operator_edits_to_seed_companies();
revoke all on function public.prevent_operator_edits_to_seed_companies() from public, anon, authenticated;

drop function public.admin_search_companies(text);
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
  commercial_status text,
  is_seed_data boolean
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
  select p.id, p.slug, p.name, o.id, o.slug, o.organisation_type, ps.status, cm.status, cm.commercial_status,
    p.is_seed_data or coalesce(o.is_seed_data, false)
  from public.providers p
  left join lateral (
    select candidate.id, candidate.slug, candidate.organisation_type, candidate.is_seed_data
    from public.organisations candidate where candidate.provider_id = p.id
    order by candidate.created_at, candidate.id limit 1
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
    null::text, null::text, null::text, o.is_seed_data
  from public.organisations o
  where o.provider_id is null
    and (coalesce(btrim(search_term), '') = ''
      or position(lower(btrim(search_term)) in lower(o.name)) > 0
      or position(lower(btrim(search_term)) in lower(o.slug)) > 0)
  order by 3, 1 nulls first
  limit 100;
end;
$$;
grant execute on function public.admin_search_companies(text) to authenticated;

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
  order by 1 desc
  limit 250;
end;
$$;

commit;