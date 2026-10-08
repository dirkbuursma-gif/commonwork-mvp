begin;

create table public.member_activity_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organisation_id uuid references public.organisations (id) on delete set null,
  event_name text not null check (event_name in (
    'commonwork_account_created',
    'commonwork_profile_completed',
    'commonwork_provider_viewed',
    'commonwork_product_viewed',
    'commonwork_need_created',
    'commonwork_introduction_requested',
    'commonwork_event_registered',
    'commonwork_membership_started'
  )),
  subject_type text check (subject_type is null or subject_type in ('profile', 'provider', 'provider_product', 'need', 'introduction')),
  subject_id uuid,
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 512),
  occurred_at timestamptz not null default now(),
  check ((subject_type is null) = (subject_id is null))
);

create index member_activity_events_profile_idx
  on public.member_activity_events (profile_id, occurred_at desc);
create index member_activity_events_name_idx
  on public.member_activity_events (event_name, occurred_at desc);
create unique index member_activity_events_once_idx
  on public.member_activity_events (profile_id, event_name, subject_id)
  where event_name in (
    'commonwork_account_created', 'commonwork_profile_completed',
    'commonwork_need_created', 'commonwork_introduction_requested'
  );

alter table public.member_activity_events enable row level security;
alter table public.member_activity_events force row level security;
revoke all on public.member_activity_events from public, anon, authenticated;
grant all on public.member_activity_events to service_role;

comment on table public.member_activity_events is
  'Internal-only intent signals. Records that an action happened, never its content. Properties hold enums and identifiers only. Deleted with the profile.';

create function public.record_member_activity(
  target_profile_id uuid,
  target_event_name text,
  target_subject_type text default null,
  target_subject_id uuid default null,
  target_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_organisation uuid;
begin
  select po.organisation_id into primary_organisation
  from public.profile_organisations po
  where po.profile_id = target_profile_id and po.is_primary
  limit 1;

  insert into public.member_activity_events (
    profile_id, organisation_id, event_name, subject_type, subject_id, properties
  ) values (
    target_profile_id, primary_organisation, target_event_name,
    target_subject_type, target_subject_id, coalesce(target_properties, '{}'::jsonb)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.record_member_activity(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_member_activity(uuid, text, text, uuid, jsonb) to service_role;

create function public.capture_profile_signals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_member_activity(new.id, 'commonwork_account_created', 'profile', new.id);
  elsif new.onboarding_completed and not old.onboarding_completed then
    perform public.record_member_activity(new.id, 'commonwork_profile_completed', 'profile', new.id);
  end if;
  return null;
end;
$$;

create trigger profiles_capture_signals
after insert or update of onboarding_completed on public.profiles
for each row execute function public.capture_profile_signals();

create function public.capture_need_signals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.record_member_activity(
      new.owner_profile_id, 'commonwork_need_created', 'need', new.id,
      jsonb_build_object('visibility', new.visibility, 'has_retailer_organisation', new.retailer_organisation_id is not null)
    );
  end if;
  return null;
end;
$$;

create trigger competence_needs_capture_signals
after insert or update of status on public.competence_needs
for each row execute function public.capture_need_signals();

create function public.capture_introduction_signals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'draft' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform public.record_member_activity(
      new.requester_profile_id, 'commonwork_introduction_requested', 'introduction', new.id,
      jsonb_build_object('route', new.route)
    );
  end if;
  return null;
end;
$$;

create trigger introductions_capture_signals
after insert or update of status on public.introductions
for each row execute function public.capture_introduction_signals();

create function public.record_catalogue_view(target_subject_type text, target_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  subject uuid;
  event_label text;
begin
  if actor_id is null or not exists (select 1 from public.profiles p where p.id = actor_id) then
    return;
  end if;

  if target_subject_type = 'provider' then
    event_label := 'commonwork_provider_viewed';
    select p.id into subject
    from public.providers p
    join public.provider_publication_status s on s.provider_id = p.id and s.status = 'published'
    where p.slug = target_slug;
  elsif target_subject_type = 'provider_product' then
    event_label := 'commonwork_product_viewed';
    select pp.id into subject
    from public.provider_products pp
    join public.provider_publication_status s on s.provider_product_id = pp.id and s.status = 'published'
    where pp.slug = target_slug;
  else
    return;
  end if;

  if subject is null then
    return;
  end if;

  if exists (
    select 1 from public.member_activity_events e
    where e.profile_id = actor_id and e.event_name = event_label and e.subject_id = subject
      and e.occurred_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  perform public.record_member_activity(actor_id, event_label, target_subject_type, subject);
end;
$$;

revoke all on function public.record_catalogue_view(text, text) from public, anon;
grant execute on function public.record_catalogue_view(text, text) to authenticated;

create view public.member_intent_scores as
with window_events as (
  select e.profile_id, e.event_name, e.subject_id
  from public.member_activity_events e
  where e.occurred_at > now() - interval '30 days'
),
agg as (
  select
    p.id as profile_id,
    p.display_name,
    (select o.id from public.profile_organisations po join public.organisations o on o.id = po.organisation_id
       where po.profile_id = p.id and po.is_primary limit 1) as organisation_id,
    (select o.organisation_type from public.profile_organisations po join public.organisations o on o.id = po.organisation_id
       where po.profile_id = p.id and po.is_primary limit 1) as organisation_type,
    exists (select 1 from public.profile_competencies pc where pc.profile_id = p.id) as has_competence,
    p.onboarding_completed,
    (select count(distinct w.subject_id) from window_events w
       where w.profile_id = p.id and w.event_name in ('commonwork_provider_viewed', 'commonwork_product_viewed')) as distinct_views,
    (select count(*) from window_events w where w.profile_id = p.id and w.event_name = 'commonwork_need_created') as needs_created,
    (select count(*) from window_events w where w.profile_id = p.id and w.event_name = 'commonwork_introduction_requested') as introductions_requested,
    (select max(e.occurred_at) from public.member_activity_events e where e.profile_id = p.id) as last_activity_at
  from public.profiles p
),
scored as (
  select a.*,
    (case a.organisation_type when 'retailer' then 20 when 'vendor' then 10 when 'si_gtm' then 10 else 0 end
      + case when a.has_competence then 10 else 0 end) as fit_score,
    (least(15, 5 * a.distinct_views) + case when a.onboarding_completed then 15 else 0 end) as value_score,
    least(40,
      case when a.needs_created > 0 then 20 else 0 end
      + case when a.introductions_requested > 0 then 15 else 0 end
      + case when a.needs_created + a.introductions_requested >= 2 then 10 else 0 end) as intent_score
  from agg a
)
select s.profile_id, s.display_name, s.organisation_id, s.organisation_type,
       s.fit_score, s.value_score, s.intent_score,
       s.fit_score + s.value_score + s.intent_score as total_score,
       case when s.fit_score + s.value_score + s.intent_score >= 70 then 'high'
            when s.fit_score + s.value_score + s.intent_score >= 40 then 'medium'
            else 'low' end as tier,
       s.distinct_views, s.needs_created, s.introductions_requested, s.last_activity_at
from scored s;

revoke all on public.member_intent_scores from public, anon, authenticated;
grant select on public.member_intent_scores to service_role;

create view public.organisation_intent_scores as
select s.organisation_id, o.name as organisation_name, o.organisation_type,
       count(*) as member_count,
       count(*) filter (where s.tier = 'high') as high_intent_members,
       max(s.total_score) as top_member_score,
       max(s.last_activity_at) as last_activity_at
from public.member_intent_scores s
join public.organisations o on o.id = s.organisation_id
group by s.organisation_id, o.name, o.organisation_type;

revoke all on public.organisation_intent_scores from public, anon, authenticated;
grant select on public.organisation_intent_scores to service_role;

commit;
