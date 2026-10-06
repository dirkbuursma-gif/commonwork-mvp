begin;

create table public.profile_contact_methods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  method_type text not null check (method_type in ('email', 'calendar_url')),
  value text not null check (char_length(btrim(value)) between 5 and 2048),
  label text not null default '' check (char_length(label) <= 120),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, profile_id),
  check (method_type <> 'email' or value ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (method_type <> 'calendar_url' or value ~ '^https://[^[:space:]]+$')
);

create table public.introductions (
  id uuid primary key default gen_random_uuid(),
  need_id uuid references public.competence_needs (id) on delete set null,
  match_id uuid references public.matches (id) on delete set null,
  requester_profile_id uuid not null references public.profiles (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  requester_display_name_snapshot text not null check (char_length(btrim(requester_display_name_snapshot)) between 1 and 120),
  recipient_display_name_snapshot text not null check (char_length(btrim(recipient_display_name_snapshot)) between 1 and 120),
  route text not null check (route in ('direct', 'suggested_introducer', 'trusted_connector')),
  status text not null default 'draft'
    check (status in (
      'draft', 'awaiting_recipient', 'awaiting_requester_context', 'awaiting_connector',
      'accepted', 'introduced', 'declined', 'expired', 'cancelled', 'completed'
    )),
  why_this_person text not null check (char_length(btrim(why_this_person)) between 3 and 1200),
  why_now text not null check (char_length(btrim(why_now)) between 3 and 1200),
  proposed_conversation text not null check (char_length(btrim(proposed_conversation)) between 3 and 1600),
  requester_offer text not null check (char_length(btrim(requester_offer)) between 3 and 1200),
  approved_context_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(approved_context_snapshot) = 'object'),
  clarification_round smallint not null default 0 check (clarification_round between 0 and 1),
  clarification_question text check (clarification_question is null or char_length(clarification_question) <= 1200),
  clarification_response text check (clarification_response is null or char_length(clarification_response) <= 1600),
  clarification_return_status text
    check (clarification_return_status is null or clarification_return_status in ('awaiting_recipient', 'awaiting_connector')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  introduced_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_profile_id <> recipient_profile_id),
  check ((status in ('introduced', 'completed')) = (introduced_at is not null)),
  check ((status = 'completed') = (completed_at is not null)),
  check (
    (clarification_round = 0 and clarification_return_status is null)
    or (clarification_round = 1 and clarification_return_status is not null)
  )
);

create table public.introduction_participants (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references public.introductions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('requester', 'recipient', 'introducer', 'connector')),
  consent_status text not null default 'pending' check (consent_status in ('pending', 'accepted', 'declined')),
  selected_contact_method_id uuid,
  contact_method_type text check (contact_method_type is null or contact_method_type in ('email', 'calendar_url')),
  contact_method_label text,
  contact_method_value text,
  contact_method_snapshot_at timestamptz,
  consented_at timestamptz,
  declined_at timestamptz,
  decline_reason text check (decline_reason is null or decline_reason in (
    'declined_not_relevant', 'declined_not_now', 'declined_no_capacity', 'conflict', 'other'
  )),
  declined_availability_status text
    check (declined_availability_status is null or declined_availability_status in ('open', 'selective', 'introductions_only', 'unavailable')),
  retry_after date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (introduction_id, profile_id),
  foreign key (selected_contact_method_id, profile_id)
    references public.profile_contact_methods (id, profile_id)
    on delete set null (selected_contact_method_id),
  check ((consent_status = 'accepted') = (consented_at is not null)),
  check ((consent_status = 'declined') = (declined_at is not null)),
  check (consent_status = 'declined' or decline_reason is null),
  check (decline_reason = 'declined_not_now' or retry_after is null),
  check (decline_reason = 'declined_no_capacity' or declined_availability_status is null),
  check (
    (contact_method_type is null and contact_method_label is null and contact_method_value is null and contact_method_snapshot_at is null)
    or (contact_method_type is not null and contact_method_label is not null and contact_method_value is not null and contact_method_snapshot_at is not null)
  )
);

create table public.connectors (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'revoked')),
  introduction_capacity integer not null default 0 check (introduction_capacity >= 0),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (approved_at is null))
);

create table public.connector_assignments (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references public.introductions (id) on delete cascade,
  assigned_profile_id uuid not null references public.profiles (id) on delete cascade,
  assignment_type text not null check (assignment_type in ('suggested_introducer', 'trusted_connector')),
  why_assigned text not null default '' check (char_length(why_assigned) <= 800),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'suggested_another_member', 'completed', 'cancelled')),
  knows_both boolean,
  confirmed_at timestamptz,
  suggested_profile_id uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (assignment_type = 'suggested_introducer' and (knows_both is null or knows_both = true))
    or (assignment_type = 'trusted_connector' and knows_both is null)
  ),
  check ((knows_both is true and confirmed_at is not null) or (knows_both is not true and confirmed_at is null)),
  check (suggested_profile_id is null or suggested_profile_id <> assigned_profile_id)
);

create table public.introduction_feedback (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references public.introductions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  conversation_occurred boolean not null,
  match_relevant boolean,
  competencies_relevant boolean,
  would_welcome_future_introductions boolean,
  private_feedback text not null default '' check (char_length(private_feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (introduction_id, profile_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  introduction_id uuid references public.introductions (id) on delete cascade,
  type text not null check (type in (
    'introduction_requested', 'context_requested', 'context_supplied', 'consent_received',
    'connector_action_required', 'introduction_completed', 'introduction_declined',
    'introduction_expired', 'feedback_requested'
  )),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  body text not null check (char_length(body) <= 800),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.introduction_audit (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references public.introductions (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(btrim(action)) between 2 and 80),
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);

create unique index profile_contact_methods_one_primary_idx
  on public.profile_contact_methods (profile_id) where is_primary;
create index profile_contact_methods_owner_idx on public.profile_contact_methods (profile_id, created_at desc);
create index introductions_requester_idx on public.introductions (requester_profile_id, updated_at desc);
create index introductions_recipient_idx on public.introductions (recipient_profile_id, updated_at desc);
create index introductions_expiry_idx on public.introductions (status, expires_at);
create unique index introductions_one_active_need_person_idx
  on public.introductions (need_id, recipient_profile_id)
  where need_id is not null and status in (
    'draft', 'awaiting_recipient', 'awaiting_requester_context', 'awaiting_connector', 'accepted', 'introduced'
  );
create index introduction_participants_profile_idx on public.introduction_participants (profile_id, introduction_id);
create unique index introduction_participants_requester_recipient_idx
  on public.introduction_participants (introduction_id, role)
  where role in ('requester', 'recipient');
create index connectors_status_capacity_idx on public.connectors (status, introduction_capacity);
create index connector_assignments_profile_status_idx on public.connector_assignments (assigned_profile_id, status);
create unique index connector_assignments_one_open_per_introduction_idx
  on public.connector_assignments (introduction_id)
  where status in ('pending', 'accepted');
create index introduction_feedback_profile_idx on public.introduction_feedback (profile_id, created_at desc);
create index notifications_profile_unread_idx on public.notifications (profile_id, created_at desc) where read_at is null;
create index introduction_audit_introduction_idx on public.introduction_audit (introduction_id, created_at);

create trigger profile_contact_methods_set_updated_at
before update on public.profile_contact_methods
for each row execute function public.set_updated_at();

create trigger introductions_set_updated_at
before update on public.introductions
for each row execute function public.set_updated_at();

create trigger introduction_participants_set_updated_at
before update on public.introduction_participants
for each row execute function public.set_updated_at();

create trigger connectors_set_updated_at
before update on public.connectors
for each row execute function public.set_updated_at();

create trigger connector_assignments_set_updated_at
before update on public.connector_assignments
for each row execute function public.set_updated_at();

create trigger introduction_feedback_set_updated_at
before update on public.introduction_feedback
for each row execute function public.set_updated_at();

commit;