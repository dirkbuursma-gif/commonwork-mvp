begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'introduction_requested', 'context_requested', 'context_supplied', 'consent_received',
    'connector_action_required', 'connector_replaced', 'introduction_completed',
    'conversation_completed', 'introduction_declined', 'introduction_expired',
    'feedback_requested', 'privacy_request_received', 'privacy_request_status_updated',
    'introduction_report_received'
  ));

alter table public.notifications
  add column privacy_request_id uuid references public.member_privacy_requests (id) on delete set null,
  add column report_id uuid references public.introduction_reports (id) on delete set null;

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 200),
  notification_id uuid references public.notifications (id) on delete set null,
  notification_type text not null check (notification_type in (
    'introduction_requested', 'connector_action_required', 'consent_received',
    'introduction_completed', 'introduction_declined', 'introduction_expired',
    'feedback_requested', 'connector_replaced', 'conversation_completed',
    'privacy_request_received', 'privacy_request_status_updated', 'introduction_report_received'
  )),
  email_purpose text not null check (email_purpose in (
    'recipient_consent_required', 'connector_action_required', 'requester_updated',
    'introduction_ready', 'introduction_declined', 'introduction_expired',
    'followup_requested', 'connector_replaced', 'conversation_completed',
    'privacy_request_received', 'privacy_request_status_updated', 'report_received'
  )),
  recipient_profile_id uuid references public.profiles (id) on delete set null,
  introduction_id uuid references public.introductions (id) on delete set null,
  privacy_request_id uuid references public.member_privacy_requests (id) on delete set null,
  report_id uuid references public.introduction_reports (id) on delete set null,
  provider text not null default 'resend' check (provider = 'resend'),
  provider_message_id text,
  template_version text not null default 'v1' check (char_length(template_version) between 1 and 32),
  status text not null default 'queued' check (status in (
    'queued', 'leased', 'sent', 'delivered', 'failed', 'suppressed'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  leased_at timestamptz,
  retry_after timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,48}$'),
  last_error_summary text not null default '' check (char_length(last_error_summary) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_deliveries_notification_once_idx
  on public.email_deliveries (notification_id) where notification_id is not null;
create unique index email_deliveries_provider_message_idx
  on public.email_deliveries (provider_message_id) where provider_message_id is not null;
create index email_deliveries_queue_idx
  on public.email_deliveries (status, retry_after, created_at)
  where status in ('queued', 'leased');
create index email_deliveries_recipient_created_idx
  on public.email_deliveries (recipient_profile_id, created_at desc);

create trigger email_deliveries_set_updated_at
before update on public.email_deliveries
for each row execute function public.set_updated_at();

create function public.suppress_pending_email_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.email_deliveries
  set status = 'suppressed', leased_at = null, retry_after = null,
      failure_code = 'recipient_profile_deleted', last_error_summary = ''
  where recipient_profile_id = old.id and status in ('queued', 'leased');
  return old;
end;
$$;

revoke all on function public.suppress_pending_email_on_profile_delete() from public, anon, authenticated;

create trigger profiles_suppress_pending_email_before_delete
before delete on public.profiles
for each row execute function public.suppress_pending_email_on_profile_delete();

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.email_deliveries (id) on delete set null,
  provider text not null default 'resend' check (provider = 'resend'),
  provider_event_id text,
  provider_message_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 80),
  occurred_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,48}$'),
  received_at timestamptz not null default now()
);

create unique index email_events_provider_event_idx
  on public.email_events (provider_event_id) where provider_event_id is not null;
create unique index email_events_message_type_fallback_idx
  on public.email_events (provider_message_id, event_type) where provider_event_id is null;
create index email_events_delivery_received_idx
  on public.email_events (delivery_id, received_at desc);

alter table public.email_deliveries enable row level security;
alter table public.email_events enable row level security;
alter table public.email_deliveries force row level security;
alter table public.email_events force row level security;
revoke all on public.email_deliveries from public, anon, authenticated;
revoke all on public.email_events from public, anon, authenticated;
grant all on public.email_deliveries to service_role;
grant all on public.email_events to service_role;

create function public.enqueue_email_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purpose text;
  linked_introduction_id uuid;
begin
  case new.type
    when 'introduction_requested' then purpose := 'recipient_consent_required';
    when 'connector_action_required' then
      if exists (
        select 1 from public.connector_assignments a
        where a.introduction_id = new.introduction_id
          and a.assigned_profile_id = new.profile_id
          and a.status = 'pending'
      ) then purpose := 'connector_action_required';
      else purpose := 'requester_updated'; end if;
    when 'consent_received' then purpose := 'requester_updated';
    when 'introduction_completed' then purpose := 'introduction_ready';
    when 'introduction_declined' then purpose := 'introduction_declined';
    when 'introduction_expired' then purpose := 'introduction_expired';
    when 'feedback_requested' then
      if exists (
        select 1 from public.introductions i
        where i.id = new.introduction_id and i.status = 'completed'
      ) then return new;
      else purpose := 'followup_requested'; end if;
    when 'connector_replaced' then purpose := 'connector_replaced';
    when 'conversation_completed' then purpose := 'conversation_completed';
    when 'privacy_request_received' then purpose := 'privacy_request_received';
    when 'privacy_request_status_updated' then purpose := 'privacy_request_status_updated';
    when 'introduction_report_received' then purpose := 'report_received';
    else return new;
  end case;

  if new.introduction_id is not null then
    linked_introduction_id := new.introduction_id;
  end if;

  insert into public.email_deliveries (
    idempotency_key, notification_id, notification_type, email_purpose,
    recipient_profile_id, introduction_id, privacy_request_id, report_id, template_version
  ) values (
    'notification:' || new.id::text, new.id, new.type, purpose,
    new.profile_id, linked_introduction_id, new.privacy_request_id, new.report_id, 'v1'
  ) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

revoke all on function public.enqueue_email_for_notification() from public, anon, authenticated;

create trigger notifications_enqueue_email
after insert on public.notifications
for each row execute function public.enqueue_email_for_notification();

create function public.notify_connector_replaced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_profile_id uuid;
begin
  select a.assigned_profile_id into previous_profile_id
  from public.connector_assignments a
  where a.introduction_id = new.introduction_id
    and a.status = 'suggested_another_member'
    and a.id <> new.id
    and a.assigned_profile_id <> new.assigned_profile_id
  order by a.created_at desc
  limit 1;

  if previous_profile_id is not null then
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (
      previous_profile_id,
      new.introduction_id,
      'connector_replaced',
      'Facilitation assignment updated',
      'The requester selected another facilitator for this introduction.'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_connector_replaced() from public, anon, authenticated;

create trigger connector_assignments_notify_replacement
after insert on public.connector_assignments
for each row execute function public.notify_connector_replaced();

create function public.notify_conversation_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values
      (new.requester_profile_id, new.id, 'conversation_completed', 'Conversation completed', 'Both members completed the private follow-up.'),
      (new.recipient_profile_id, new.id, 'conversation_completed', 'Conversation completed', 'Both members completed the private follow-up.')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_conversation_completed() from public, anon, authenticated;

create trigger introductions_notify_conversation_completed
after update of status on public.introductions
for each row execute function public.notify_conversation_completed();

create function public.notify_privacy_request_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (profile_id, privacy_request_id, type, title, body)
    values (new.profile_id, new.id, 'privacy_request_received', 'Privacy request received', 'Your privacy request has been recorded for review.');
  elsif new.status is distinct from old.status and new.status in ('in_review', 'fulfilled', 'rejected', 'cancelled') then
    insert into public.notifications (profile_id, privacy_request_id, type, title, body)
    values (new.profile_id, new.id, 'privacy_request_status_updated', 'Privacy request updated', 'Your privacy request status has changed. Sign in to review the update.');
  end if;
  return new;
end;
$$;

revoke all on function public.notify_privacy_request_changes() from public, anon, authenticated;

create trigger privacy_requests_notify_email
after insert or update of status on public.member_privacy_requests
for each row execute function public.notify_privacy_request_changes();

create function public.notify_introduction_report_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (profile_id, introduction_id, report_id, type, title, body)
  values (new.reporter_profile_id, new.introduction_id, new.id, 'introduction_report_received', 'Report received', 'Your private report has been recorded for review.');
  return new;
end;
$$;

revoke all on function public.notify_introduction_report_received() from public, anon, authenticated;

create trigger introduction_reports_notify_received
after insert on public.introduction_reports
for each row execute function public.notify_introduction_report_received();

create function public.claim_email_deliveries(target_batch_size integer default 20)
returns table (
  delivery_id uuid,
  idempotency_key text,
  notification_type text,
  email_purpose text,
  recipient_profile_id uuid,
  introduction_id uuid,
  privacy_request_id uuid,
  report_id uuid,
  attempt_count integer,
  template_version text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_batch_size not between 1 and 50 then
    raise exception 'Batch size must be between 1 and 50.' using errcode = '22023';
  end if;
  update public.email_deliveries
  set status = 'failed', failed_at = now(), last_error_at = now(), leased_at = null,
      failure_code = 'retry_limit_reached', last_error_summary = 'Delivery lease expired at the retry limit.'
  where public.email_deliveries.status = 'leased' and public.email_deliveries.attempt_count >= 5
    and public.email_deliveries.leased_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select d.id
    from public.email_deliveries d
    where (d.status = 'queued' and (d.retry_after is null or d.retry_after <= now()))
      or (d.status = 'leased' and d.attempt_count < 5 and d.leased_at < now() - interval '5 minutes')
    order by d.created_at
    for update skip locked
    limit target_batch_size
  ), claimed as (
    update public.email_deliveries d
    set status = 'leased', leased_at = now(), attempt_count = d.attempt_count + 1
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select c.id, c.idempotency_key, c.notification_type, c.email_purpose,
    c.recipient_profile_id, c.introduction_id, c.privacy_request_id, c.report_id,
    c.attempt_count, c.template_version
  from claimed c;
end;
$$;

create function public.complete_email_delivery(
  target_delivery_id uuid,
  target_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_provider_message_id is null or char_length(target_provider_message_id) not between 1 and 200 then
    raise exception 'Provider message ID is invalid.' using errcode = '22023';
  end if;
  update public.email_deliveries
  set status = 'sent', provider_message_id = target_provider_message_id, sent_at = now(),
      leased_at = null, retry_after = null, failure_code = null, last_error_summary = ''
  where id = target_delivery_id and status = 'leased';
  return found;
end;
$$;

create function public.suppress_email_delivery(
  target_delivery_id uuid,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_reason not in ('seed_email_mode', 'example_test_recipient') then
    raise exception 'Suppression reason is invalid.' using errcode = '22023';
  end if;
  update public.email_deliveries
  set status = 'suppressed', leased_at = null, retry_after = null,
      failure_code = target_reason, last_error_summary = ''
  where id = target_delivery_id and status in ('queued', 'leased');
  return found;
end;
$$;

create function public.fail_email_delivery(
  target_delivery_id uuid,
  target_failure_code text,
  target_error_summary text,
  target_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.email_deliveries%rowtype;
  next_status text;
  retry_time timestamptz;
begin
  if target_failure_code is null or target_failure_code !~ '^[a-z0-9_]{1,48}$'
    or char_length(coalesce(target_error_summary, '')) > 200 then
    raise exception 'Safe delivery failure details are invalid.' using errcode = '22023';
  end if;
  select * into delivery_row from public.email_deliveries where id = target_delivery_id for update;
  if not found or delivery_row.status <> 'leased' then return null; end if;

  if target_retryable and delivery_row.attempt_count < 5 then
    next_status := 'queued';
    retry_time := now() + make_interval(secs => least(3600, 30 * (2 ^ delivery_row.attempt_count)::integer));
  else
    next_status := 'failed';
  end if;
  update public.email_deliveries
  set status = next_status, retry_after = retry_time, leased_at = null,
      failed_at = case when next_status = 'failed' then now() else null end,
      last_error_at = now(), failure_code = target_failure_code,
      last_error_summary = coalesce(target_error_summary, '')
  where id = target_delivery_id;
  return next_status;
end;
$$;

create function public.record_resend_email_event(
  target_provider_event_id text,
  target_provider_message_id text,
  target_event_type text,
  target_occurred_at timestamptz,
  target_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
  event_delivery_id uuid;
  event_delivery_status text;
begin
  if target_provider_event_id is null or char_length(target_provider_event_id) not between 1 and 200
    or target_provider_message_id is null or char_length(target_provider_message_id) not between 1 and 200
    or target_event_type is null or char_length(target_event_type) not between 1 and 80
    or (target_failure_code is not null and target_failure_code !~ '^[a-z0-9_]{1,48}$') then
    raise exception 'Provider event details are invalid.' using errcode = '22023';
  end if;

  select d.id, d.status into event_delivery_id, event_delivery_status from public.email_deliveries d
  where d.provider_message_id = target_provider_message_id;
  if event_delivery_id is null or event_delivery_status = 'suppressed' then return false; end if;
  insert into public.email_events (
    delivery_id, provider_event_id, provider_message_id, event_type, occurred_at, failure_code
  ) values (
    event_delivery_id, target_provider_event_id, target_provider_message_id,
    target_event_type, target_occurred_at, target_failure_code
  ) on conflict do nothing
  returning id into event_id;
  if event_id is null then return false; end if;

  if event_delivery_id is not null then
    update public.email_deliveries
    set status = case target_event_type
          when 'email.delivered' then 'delivered'
          when 'email.bounced' then 'failed'
          when 'email.complained' then 'failed'
          when 'email.failed' then 'failed'
          else status
        end,
        delivered_at = case when target_event_type = 'email.delivered' then coalesce(target_occurred_at, now()) else delivered_at end,
        failed_at = case when target_event_type in ('email.bounced', 'email.complained', 'email.failed') then coalesce(target_occurred_at, now()) else failed_at end,
        failure_code = coalesce(target_failure_code, failure_code),
        leased_at = case when target_event_type in ('email.bounced', 'email.complained', 'email.failed') then null else leased_at end
    where id = event_delivery_id and status <> 'suppressed';
  end if;
  return true;
end;
$$;

revoke all on function public.claim_email_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_email_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.suppress_email_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_email_delivery(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.record_resend_email_event(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_email_deliveries(integer) to service_role;
grant execute on function public.complete_email_delivery(uuid, text) to service_role;
grant execute on function public.suppress_email_delivery(uuid, text) to service_role;
grant execute on function public.fail_email_delivery(uuid, text, text, boolean) to service_role;
grant execute on function public.record_resend_email_event(text, text, text, timestamptz, text) to service_role;

commit;