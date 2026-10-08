begin;

create table public.audience_contacts (
  id uuid primary key default gen_random_uuid(),
  email_address text not null check (email_address = lower(btrim(email_address)) and char_length(email_address) <= 254),
  first_name text check (first_name is null or char_length(first_name) <= 120),
  reader_segment text check (reader_segment is null or reader_segment in ('retail-commercial', 'retail-digital', 'si-agency', 'vendor', 'investor')),
  kit_subscriber_id bigint,
  newsletter_sync_status text not null default 'not_requested'
    check (newsletter_sync_status in ('not_requested', 'pending', 'synced', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email_address)
);

create table public.audience_contact_topics (
  contact_id uuid not null references public.audience_contacts (id) on delete cascade,
  consent_scope text not null check (consent_scope in ('newsletter', 'commonwork_interest')),
  topic_key text not null check (topic_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  primary key (contact_id, consent_scope, topic_key)
);

create table public.audience_contact_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.audience_contacts (id) on delete cascade,
  consent_scope text not null check (consent_scope in (
    'newsletter', 'commonwork_interest', 'event_invites', 'network_interest', 'competence_alerts'
  )),
  action text not null check (action in ('granted', 'withdrawn')),
  wording_version text not null check (char_length(btrim(wording_version)) between 1 and 64),
  source_page text not null check (char_length(source_page) between 1 and 300),
  source_channel text not null check (char_length(source_channel) between 1 and 80),
  recorded_at timestamptz not null default now()
);

create table public.commonwork_interest_signups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.audience_contacts (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'reviewed', 'invited', 'joined', 'archived')),
  interest_type text not null default 'provider_intelligence'
    check (interest_type in ('provider_intelligence', 'expert_discovery', 'network', 'events', 'general')),
  wants_event_invites boolean not null default false,
  wants_network_interest boolean not null default false,
  wants_commonwork_access boolean not null default false,
  wants_competence_alerts boolean not null default false,
  source_channel text not null check (char_length(source_channel) between 1 and 80),
  source_page text not null check (char_length(source_page) between 1 and 300),
  campaign_key text check (campaign_key is null or char_length(campaign_key) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (wants_event_invites or wants_network_interest or wants_commonwork_access or wants_competence_alerts)
);

create table public.commonwork_cta_events (
  id uuid primary key default gen_random_uuid(),
  source_site text not null check (source_site = 'commerce-partners'),
  source_page text not null check (char_length(source_page) between 1 and 300),
  source_type text not null check (source_type in ('homepage', 'catalogue-index', 'category-page', 'product-profile', 'partner-profile', 'newsletter')),
  target_route text not null check (target_route = '/intelligence' or target_route ~ '^/intelligence/(category|provider|product)/[a-z0-9-]+$'),
  cta_label text not null check (char_length(btrim(cta_label)) between 2 and 160),
  audience_state text not null default 'anonymous' check (audience_state = 'anonymous'),
  created_at timestamptz not null default now()
);

create table public.acquisition_rate_limits (
  bucket_hash text not null check (bucket_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('signup', 'cta')),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (bucket_hash, action, window_started_at)
);

create index audience_contacts_created_idx on public.audience_contacts (created_at desc);
create index audience_consents_contact_scope_idx on public.audience_contact_consents (contact_id, consent_scope, recorded_at desc);
create index commonwork_interest_status_idx on public.commonwork_interest_signups (status, created_at desc);
create index commonwork_cta_events_created_idx on public.commonwork_cta_events (created_at desc, source_type);
create index acquisition_rate_limits_expiry_idx on public.acquisition_rate_limits (expires_at);

create trigger audience_contacts_set_updated_at
before update on public.audience_contacts
for each row execute function public.set_updated_at();

create trigger commonwork_interest_signups_set_updated_at
before update on public.commonwork_interest_signups
for each row execute function public.set_updated_at();

alter table public.audience_contacts enable row level security;
alter table public.audience_contact_topics enable row level security;
alter table public.audience_contact_consents enable row level security;
alter table public.commonwork_interest_signups enable row level security;
alter table public.commonwork_cta_events enable row level security;
alter table public.acquisition_rate_limits enable row level security;

alter table public.audience_contacts force row level security;
alter table public.audience_contact_topics force row level security;
alter table public.audience_contact_consents force row level security;
alter table public.commonwork_interest_signups force row level security;
alter table public.commonwork_cta_events force row level security;
alter table public.acquisition_rate_limits force row level security;

revoke all on public.audience_contacts, public.audience_contact_topics,
  public.audience_contact_consents, public.commonwork_interest_signups,
  public.commonwork_cta_events, public.acquisition_rate_limits
  from public, anon, authenticated;
grant all on public.audience_contacts, public.audience_contact_topics,
  public.audience_contact_consents, public.commonwork_interest_signups,
  public.commonwork_cta_events, public.acquisition_rate_limits to service_role;

create function public.record_audience_signup(
  target_email text,
  target_first_name text,
  target_reader_segment text,
  target_newsletter boolean,
  target_commonwork_interest boolean,
  target_event_invites boolean,
  target_network_interest boolean,
  target_competence_alerts boolean,
  target_interest_type text,
  target_newsletter_topics text[],
  target_commonwork_topics text[],
  target_source_channel text,
  target_source_page text,
  target_campaign_key text,
  target_utm_source text,
  target_utm_medium text,
  target_utm_campaign text,
  target_wording_version text
)
returns table (contact_id uuid, interest_signup_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  saved_contact_id uuid;
  saved_interest_id uuid;
  scope_topic text;
  topic text;
begin
  normalized_email := lower(btrim(target_email));
  if normalized_email is null or char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email address.' using errcode = '22023';
  end if;
  if target_reader_segment is not null
    and target_reader_segment not in ('retail-commercial', 'retail-digital', 'si-agency', 'vendor', 'investor') then
    raise exception 'Invalid reader segment.' using errcode = '22023';
  end if;
  if not coalesce(target_newsletter, false)
    and not coalesce(target_commonwork_interest, false)
    and not coalesce(target_event_invites, false)
    and not coalesce(target_network_interest, false)
    and not coalesce(target_competence_alerts, false) then
    raise exception 'At least one explicit consent is required.' using errcode = '22023';
  end if;
  if target_interest_type not in ('provider_intelligence', 'expert_discovery', 'network', 'events', 'general') then
    raise exception 'Invalid interest type.' using errcode = '22023';
  end if;

  insert into public.audience_contacts (email_address, first_name, reader_segment, newsletter_sync_status)
  values (
    normalized_email,
    nullif(btrim(coalesce(target_first_name, '')), ''),
    case when coalesce(target_newsletter, false) then target_reader_segment else null end,
    case when coalesce(target_newsletter, false) then 'pending' else 'not_requested' end
  )
  on conflict (email_address) do update
    set first_name = coalesce(excluded.first_name, audience_contacts.first_name),
        reader_segment = coalesce(excluded.reader_segment, audience_contacts.reader_segment),
        newsletter_sync_status = case
          when coalesce(target_newsletter, false) then 'pending'
          else audience_contacts.newsletter_sync_status
        end
  returning id into saved_contact_id;

  if coalesce(target_newsletter, false) then
    insert into public.audience_contact_consents (
      contact_id, consent_scope, action, wording_version, source_page, source_channel
    ) values (
      saved_contact_id, 'newsletter', 'granted', target_wording_version, target_source_page, target_source_channel
    );
    delete from public.audience_contact_topics
    where audience_contact_topics.contact_id = saved_contact_id
      and audience_contact_topics.consent_scope = 'newsletter';
    foreach topic in array coalesce(target_newsletter_topics, '{}') loop
      insert into public.audience_contact_topics (contact_id, consent_scope, topic_key)
      values (saved_contact_id, 'newsletter', topic)
      on conflict do nothing;
    end loop;
  end if;

  if coalesce(target_commonwork_interest, false) then
    insert into public.audience_contact_consents (
      contact_id, consent_scope, action, wording_version, source_page, source_channel
    ) values (
      saved_contact_id, 'commonwork_interest', 'granted', target_wording_version, target_source_page, target_source_channel
    );
    delete from public.audience_contact_topics
    where audience_contact_topics.contact_id = saved_contact_id
      and audience_contact_topics.consent_scope = 'commonwork_interest';
    foreach topic in array coalesce(target_commonwork_topics, '{}') loop
      insert into public.audience_contact_topics (contact_id, consent_scope, topic_key)
      values (saved_contact_id, 'commonwork_interest', topic)
      on conflict do nothing;
    end loop;
  end if;

  if coalesce(target_event_invites, false) then
    insert into public.audience_contact_consents (
      contact_id, consent_scope, action, wording_version, source_page, source_channel
    ) values (
      saved_contact_id, 'event_invites', 'granted', target_wording_version, target_source_page, target_source_channel
    );
  end if;
  if coalesce(target_network_interest, false) then
    insert into public.audience_contact_consents (
      contact_id, consent_scope, action, wording_version, source_page, source_channel
    ) values (
      saved_contact_id, 'network_interest', 'granted', target_wording_version, target_source_page, target_source_channel
    );
  end if;
  if coalesce(target_competence_alerts, false) then
    insert into public.audience_contact_consents (
      contact_id, consent_scope, action, wording_version, source_page, source_channel
    ) values (
      saved_contact_id, 'competence_alerts', 'granted', target_wording_version, target_source_page, target_source_channel
    );
  end if;

  if coalesce(target_commonwork_interest, false)
    or coalesce(target_event_invites, false)
    or coalesce(target_network_interest, false)
    or coalesce(target_competence_alerts, false) then
    insert into public.commonwork_interest_signups (
      contact_id, interest_type, wants_event_invites, wants_commonwork_access,
      wants_network_interest, wants_competence_alerts, source_channel, source_page, campaign_key,
      utm_source, utm_medium, utm_campaign
    ) values (
      saved_contact_id, target_interest_type, coalesce(target_event_invites, false),
      coalesce(target_commonwork_interest, false), coalesce(target_network_interest, false),
      coalesce(target_competence_alerts, false),
      target_source_channel, target_source_page, nullif(btrim(coalesce(target_campaign_key, '')), ''),
      nullif(btrim(coalesce(target_utm_source, '')), ''), nullif(btrim(coalesce(target_utm_medium, '')), ''),
      nullif(btrim(coalesce(target_utm_campaign, '')), '')
    ) returning id into saved_interest_id;
  end if;

  return query select saved_contact_id, saved_interest_id;
end;
$$;

create function public.consume_acquisition_rate_limit(
  target_bucket_hash text,
  target_action text,
  target_limit integer,
  target_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz;
  inserted_count integer;
begin
  if target_bucket_hash !~ '^[a-f0-9]{64}$'
    or target_action not in ('signup', 'cta')
    or target_limit not between 1 and 100
    or target_window_seconds not between 10 and 86400 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;
  window_start := to_timestamp(floor(extract(epoch from now()) / target_window_seconds) * target_window_seconds);
  delete from public.acquisition_rate_limits where expires_at < now();
  insert into public.acquisition_rate_limits (bucket_hash, action, window_started_at, request_count, expires_at)
  values (target_bucket_hash, target_action, window_start, 1, window_start + make_interval(secs => target_window_seconds))
  on conflict (bucket_hash, action, window_started_at) do update
    set request_count = acquisition_rate_limits.request_count + 1
    where acquisition_rate_limits.request_count < target_limit
  returning request_count into inserted_count;
  return inserted_count is not null;
end;
$$;

revoke all on function public.record_audience_signup(text, text, text, boolean, boolean, boolean, boolean, boolean, text, text[], text[], text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.consume_acquisition_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_audience_signup(text, text, text, boolean, boolean, boolean, boolean, boolean, text, text[], text[], text, text, text, text, text, text, text) to service_role;
grant execute on function public.consume_acquisition_rate_limit(text, text, integer, integer) to service_role;

commit;