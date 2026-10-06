begin;

create table public.pilot_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('introduction_request', 'match_recalculation', 'connector_reassignment')),
  scope_id uuid,
  created_at timestamptz not null default now()
);

create table public.member_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  request_type text not null check (request_type in ('data_export', 'account_deletion')),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'fulfilled', 'rejected', 'cancelled')),
  member_note text not null default '' check (char_length(member_note) <= 2000),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('fulfilled', 'rejected', 'cancelled')) = (resolved_at is not null))
);

create table public.profile_introduction_blocks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles (id) on delete cascade,
  blocked_display_name text not null check (char_length(btrim(blocked_display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (profile_id, blocked_profile_id),
  check (profile_id <> blocked_profile_id)
);

create table public.introduction_reports (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references public.introductions (id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('inappropriate_contact', 'privacy_concern', 'misrepresentation', 'other')),
  details text not null check (char_length(btrim(details)) between 3 and 3000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create index pilot_rate_limit_events_profile_action_idx
  on public.pilot_rate_limit_events (profile_id, action, created_at desc);
create index pilot_rate_limit_events_scope_idx
  on public.pilot_rate_limit_events (profile_id, action, scope_id, created_at desc);
create unique index member_privacy_requests_one_open_idx
  on public.member_privacy_requests (profile_id, request_type)
  where status in ('pending', 'in_review');
create index member_privacy_requests_admin_idx
  on public.member_privacy_requests (status, requested_at desc);
create index profile_introduction_blocks_blocked_idx
  on public.profile_introduction_blocks (blocked_profile_id, profile_id);
create index introduction_reports_admin_idx
  on public.introduction_reports (status, created_at desc);
create index introduction_reports_reporter_idx
  on public.introduction_reports (reporter_profile_id, created_at desc);

create trigger member_privacy_requests_set_updated_at
before update on public.member_privacy_requests
for each row execute function public.set_updated_at();

create trigger introduction_reports_set_updated_at
before update on public.introduction_reports
for each row execute function public.set_updated_at();

commit;