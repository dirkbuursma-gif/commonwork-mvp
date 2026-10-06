begin;

alter table public.profile_contact_methods enable row level security;
alter table public.introductions enable row level security;
alter table public.introduction_participants enable row level security;
alter table public.connectors enable row level security;
alter table public.connector_assignments enable row level security;
alter table public.introduction_feedback enable row level security;
alter table public.notifications enable row level security;
alter table public.introduction_audit enable row level security;

alter table public.profile_contact_methods force row level security;
alter table public.introductions force row level security;
alter table public.introduction_participants force row level security;
alter table public.connectors force row level security;
alter table public.connector_assignments force row level security;
alter table public.introduction_feedback force row level security;
alter table public.notifications force row level security;
alter table public.introduction_audit force row level security;

revoke all on public.profile_contact_methods from public, anon, authenticated;
revoke all on public.introductions from public, anon, authenticated;
revoke all on public.introduction_participants from public, anon, authenticated;
revoke all on public.connectors from public, anon, authenticated;
revoke all on public.connector_assignments from public, anon, authenticated;
revoke all on public.introduction_feedback from public, anon, authenticated;
revoke all on public.notifications from public, anon, authenticated;
revoke all on public.introduction_audit from public, anon, authenticated;

grant select (id, profile_id, method_type, value, label, is_primary, created_at, updated_at)
  on public.profile_contact_methods to authenticated;
grant select (id, need_id, match_id, requester_profile_id, recipient_profile_id, route, status,
  why_this_person, why_now, proposed_conversation, requester_offer, approved_context_snapshot,
  clarification_round, clarification_question, clarification_response, expires_at, introduced_at,
  completed_at, created_at, updated_at)
  on public.introductions to authenticated;
grant select (id, introduction_id, profile_id, role, consent_status, consented_at, created_at, updated_at)
  on public.introduction_participants to authenticated;
grant select (id, introduction_id, assigned_profile_id, assignment_type, status, suggested_profile_id, created_at, updated_at)
  on public.connector_assignments to authenticated;
grant select (id, introduction_id, profile_id, conversation_occurred, match_relevant,
  competencies_relevant, would_welcome_future_introductions, private_feedback, created_at, updated_at)
  on public.introduction_feedback to authenticated;
grant select (id, profile_id, introduction_id, type, title, body, read_at, created_at)
  on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy profile_contact_methods_owner_select
on public.profile_contact_methods for select to authenticated
using (profile_id = auth.uid());

create policy introductions_participant_select
on public.introductions for select to authenticated
using (requester_profile_id = auth.uid() or recipient_profile_id = auth.uid());

create policy introduction_participants_owner_select
on public.introduction_participants for select to authenticated
using (profile_id = auth.uid() and role in ('requester', 'recipient'));

create policy connector_assignments_assignee_select
on public.connector_assignments for select to authenticated
using (
  assigned_profile_id = auth.uid()
  and status in ('pending', 'accepted', 'completed')
  and exists (
    select 1 from public.introductions i
    where i.id = connector_assignments.introduction_id
      and i.status in ('awaiting_connector', 'introduced', 'completed')
  )
);

create policy introduction_feedback_author_select
on public.introduction_feedback for select to authenticated
using (profile_id = auth.uid());

create policy notifications_recipient_select
on public.notifications for select to authenticated
using (profile_id = auth.uid());

create policy notifications_recipient_update_read_at
on public.notifications for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create view public.available_connectors
with (security_barrier = true)
as
  select c.profile_id, p.display_name, p.professional_summary, p.what_i_contribute
  from public.connectors c
  join public.discoverable_profiles p on p.id = c.profile_id
  where c.status = 'active' and c.introduction_capacity > 0;

revoke all on public.available_connectors from public, anon, authenticated;
grant select on public.available_connectors to authenticated;

create function public.guard_introduction_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('awaiting_recipient', 'cancelled', 'expired'))
    or (old.status = 'awaiting_recipient' and new.status in ('awaiting_requester_context', 'accepted', 'declined', 'expired', 'cancelled'))
    or (old.status = 'awaiting_requester_context' and new.status in ('awaiting_recipient', 'awaiting_connector', 'declined', 'expired', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('awaiting_connector', 'introduced', 'declined', 'expired', 'cancelled'))
    or (old.status = 'awaiting_connector' and new.status in ('awaiting_requester_context', 'introduced', 'declined', 'expired', 'cancelled'))
    or (old.status = 'introduced' and new.status = 'completed')
  ) then
    raise exception 'Invalid introduction state transition.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger introductions_guard_transition
before update of status on public.introductions
for each row execute function public.guard_introduction_transition();

create function public.guard_introduction_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and (
    (new.need_id is distinct from old.need_id and new.need_id is not null)
    or (new.match_id is distinct from old.match_id and new.match_id is not null)
    or new.requester_profile_id is distinct from old.requester_profile_id
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.requester_display_name_snapshot is distinct from old.requester_display_name_snapshot
    or new.recipient_display_name_snapshot is distinct from old.recipient_display_name_snapshot
    or new.route is distinct from old.route
    or new.why_this_person is distinct from old.why_this_person
    or new.why_now is distinct from old.why_now
    or new.proposed_conversation is distinct from old.proposed_conversation
    or new.requester_offer is distinct from old.requester_offer
    or new.approved_context_snapshot is distinct from old.approved_context_snapshot
  ) then
    raise exception 'Approved introduction context is immutable.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger introductions_guard_snapshot
before update on public.introductions
for each row execute function public.guard_introduction_snapshot();

create function public.save_profile_contact_method(
  target_method_id uuid,
  target_method_type text,
  target_value text,
  target_label text,
  make_primary boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  saved_method_id uuid;
  clean_value text := btrim(coalesce(target_value, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_method_type not in ('email', 'calendar_url') or char_length(clean_value) < 5 or char_length(clean_value) > 2048 then
    raise exception 'A valid contact method is required.' using errcode = '22023';
  end if;
  if target_method_type = 'email' and clean_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;
  if target_method_type = 'calendar_url' and clean_value !~ '^https://[^/@[:space:]]+(:[0-9]+)?([/?#][^[:space:]]*)?$' then
    raise exception 'A secure calendar URL is required.' using errcode = '22023';
  end if;

  if make_primary then
    update public.profile_contact_methods
    set is_primary = false
    where profile_id = actor_id and is_primary
      and (target_method_id is null or id <> target_method_id);
  end if;

  if target_method_id is null then
    insert into public.profile_contact_methods (profile_id, method_type, value, label, is_primary)
    values (actor_id, target_method_type, clean_value, left(btrim(coalesce(target_label, '')), 120), coalesce(make_primary, false))
    returning id into saved_method_id;
  else
    update public.profile_contact_methods
    set method_type = target_method_type,
        value = clean_value,
        label = left(btrim(coalesce(target_label, '')), 120),
        is_primary = coalesce(make_primary, false)
    where id = target_method_id and profile_id = actor_id
    returning id into saved_method_id;
    if saved_method_id is null then
      raise exception 'Contact method is unavailable.' using errcode = '42501';
    end if;
  end if;

  return saved_method_id;
end;
$$;

create function public.delete_profile_contact_method(target_method_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  delete from public.profile_contact_methods
  where id = target_method_id and profile_id = actor_id;
  return found;
end;
$$;

create function public.audit_introduction_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.introduction_audit (introduction_id, actor_profile_id, action, from_status, to_status)
    values (new.id, auth.uid(), 'state_transition', old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger introductions_audit_state_change
after update of status on public.introductions
for each row execute function public.audit_introduction_state_change();

create function public.audit_introduction_participant_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_text text;
  from_value text;
  to_value text;
begin
  if tg_op = 'INSERT' then
    action_text := 'participant_added';
    to_value := new.consent_status;
  elsif old.consent_status is distinct from new.consent_status then
    action_text := 'participant_consent';
    from_value := old.consent_status;
    to_value := new.consent_status;
  elsif old.contact_method_snapshot_at is null and new.contact_method_snapshot_at is not null then
    action_text := 'contact_method_selected';
  else
    return new;
  end if;
  insert into public.introduction_audit (introduction_id, actor_profile_id, action, from_status, to_status)
  values (new.introduction_id, auth.uid(), action_text, from_value, to_value);
  return new;
end;
$$;

create trigger introduction_participants_audit
after insert or update on public.introduction_participants
for each row execute function public.audit_introduction_participant_change();

create function public.audit_connector_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_text text;
  from_value text;
  to_value text;
begin
  if tg_op = 'INSERT' then
    action_text := 'intermediary_assigned';
    to_value := new.status;
  elsif old.status is distinct from new.status then
    action_text := 'intermediary_assignment_changed';
    from_value := old.status;
    to_value := new.status;
  else
    return new;
  end if;
  insert into public.introduction_audit (introduction_id, actor_profile_id, action, from_status, to_status)
  values (new.introduction_id, auth.uid(), action_text, from_value, to_value);
  return new;
end;
$$;

create trigger connector_assignments_audit
after insert or update on public.connector_assignments
for each row execute function public.audit_connector_assignment_change();

create function public.guard_introduction_participant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.introduction_id is distinct from old.introduction_id
      or new.profile_id is distinct from old.profile_id
      or new.role is distinct from old.role then
      raise exception 'Introduction participant identity is immutable.' using errcode = '23514';
    end if;
    if old.consent_status <> 'pending' and new.consent_status is distinct from old.consent_status then
      raise exception 'Participant consent is terminal.' using errcode = '23514';
    end if;
    if old.contact_method_snapshot_at is not null and (
      (new.selected_contact_method_id is distinct from old.selected_contact_method_id and new.selected_contact_method_id is not null)
      or new.contact_method_type is distinct from old.contact_method_type
      or new.contact_method_label is distinct from old.contact_method_label
      or new.contact_method_value is distinct from old.contact_method_value
      or new.contact_method_snapshot_at is distinct from old.contact_method_snapshot_at
    ) then
      raise exception 'Consented contact method is immutable.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger introduction_participants_guard
before update on public.introduction_participants
for each row execute function public.guard_introduction_participant();

create function public.guard_connector_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.introduction_id is distinct from old.introduction_id
      or new.assigned_profile_id is distinct from old.assigned_profile_id
      or new.assignment_type is distinct from old.assignment_type
      or new.created_by is distinct from old.created_by
      or new.why_assigned is distinct from old.why_assigned then
      raise exception 'Intermediary assignment identity is immutable.' using errcode = '23514';
    end if;
    if old.status <> 'pending' and new.status is distinct from old.status then
      raise exception 'Intermediary assignment is terminal.' using errcode = '23514';
    end if;
    if old.status = 'pending' and new.status not in ('pending', 'accepted', 'declined', 'suggested_another_member', 'completed', 'cancelled') then
      raise exception 'Invalid intermediary assignment transition.' using errcode = '23514';
    end if;
    if old.confirmed_at is not null and (new.knows_both is distinct from old.knows_both or new.confirmed_at is distinct from old.confirmed_at) then
      raise exception 'Mutual-familiarity confirmation is immutable.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger connector_assignments_guard
before update on public.connector_assignments
for each row execute function public.guard_connector_assignment();

create function public.request_introduction(
  target_match_id uuid,
  target_route text,
  target_suggested_introducer_id uuid,
  target_trusted_connector_id uuid,
  target_why_this_person text,
  target_why_now text,
  target_proposed_conversation text,
  target_requester_offer text,
  target_contact_method_id uuid,
  target_intermediary_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  match_row public.matches%rowtype;
  need_row public.competence_needs%rowtype;
  requester_profile public.profiles%rowtype;
  recipient_profile public.profiles%rowtype;
  contact_row public.profile_contact_methods%rowtype;
  connector_row public.connectors%rowtype;
  prior_decline record;
  existing_introduction_id uuid;
  new_introduction_id uuid;
  approved_snapshot jsonb;
  clean_why_person text := btrim(coalesce(target_why_this_person, ''));
  clean_why_now text := btrim(coalesce(target_why_now, ''));
  clean_conversation text := btrim(coalesce(target_proposed_conversation, ''));
  clean_offer text := btrim(coalesce(target_requester_offer, ''));
  clean_intermediary_note text := btrim(coalesce(target_intermediary_note, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_route is null or target_route not in ('direct', 'suggested_introducer', 'trusted_connector') then
    raise exception 'Select a supported introduction route.' using errcode = '22023';
  end if;
  if char_length(clean_why_person) not between 3 and 1200
    or char_length(clean_why_now) not between 3 and 1200
    or char_length(clean_conversation) not between 3 and 1600
    or char_length(clean_offer) not between 3 and 1200
    or char_length(clean_intermediary_note) > 800 then
    raise exception 'Complete the introduction context before sending.' using errcode = '22023';
  end if;
  select * into requester_profile from public.profiles where id = actor_id;
  if not found or char_length(btrim(requester_profile.display_name)) = 0 then
    raise exception 'Complete your member profile before requesting an introduction.' using errcode = '23514';
  end if;
  if (target_route = 'direct' and (target_suggested_introducer_id is not null or target_trusted_connector_id is not null))
    or (target_route = 'suggested_introducer' and (target_suggested_introducer_id is null or target_trusted_connector_id is not null))
    or (target_route = 'trusted_connector' and (target_trusted_connector_id is null or target_suggested_introducer_id is not null)) then
    raise exception 'The selected route and intermediary do not agree.' using errcode = '22023';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;
  if not found then
    raise exception 'This match is unavailable.' using errcode = '42501';
  end if;
  select * into need_row from public.competence_needs where id = match_row.need_id for update;
  if not found or need_row.owner_profile_id <> actor_id then
    raise exception 'This match is unavailable.' using errcode = '42501';
  end if;
  if match_row.status not in ('new', 'viewed', 'saved')
    or need_row.status <> 'active'
    or need_row.expires_at is null
    or need_row.expires_at <= now() then
    raise exception 'This match is no longer eligible for an introduction.' using errcode = '23514';
  end if;

  select id into existing_introduction_id
  from public.introductions
  where need_id = need_row.id and recipient_profile_id = match_row.matched_profile_id
    and status in ('draft', 'awaiting_recipient', 'awaiting_requester_context', 'awaiting_connector', 'accepted', 'introduced')
  for update;
  if existing_introduction_id is not null then
    if exists (
      select 1 from public.introductions i
      where i.id = existing_introduction_id and i.requester_profile_id = actor_id and i.match_id = target_match_id
    ) then
      return existing_introduction_id;
    end if;
    raise exception 'An active introduction request already exists for this need and person.' using errcode = '23505';
  end if;

  select p.consent_status, p.decline_reason, p.retry_after, p.declined_at,
    p.declined_availability_status, cp.availability_status
  into prior_decline
  from public.introductions i
  join public.introduction_participants p on p.introduction_id = i.id and p.profile_id = i.recipient_profile_id
  left join public.contact_preferences cp on cp.profile_id = p.profile_id
  where i.need_id = need_row.id and i.recipient_profile_id = match_row.matched_profile_id
    and i.status = 'declined' and p.decline_reason in ('declined_not_relevant', 'declined_not_now', 'declined_no_capacity')
  order by i.updated_at desc
  limit 1;
  if found and prior_decline.decline_reason = 'declined_not_relevant' then
    raise exception 'This person declined this need as not relevant; do not send another request.' using errcode = '23514';
  end if;
  if found and prior_decline.decline_reason = 'declined_not_now'
    and prior_decline.retry_after is not null and prior_decline.retry_after > current_date then
    raise exception 'Wait until the recipient’s suggested retry date before asking again.' using errcode = '23514';
  end if;
  if found and prior_decline.decline_reason = 'declined_no_capacity'
    and (prior_decline.availability_status is not distinct from prior_decline.declined_availability_status
      or prior_decline.availability_status = 'unavailable') then
    raise exception 'The recipient’s availability has not changed since they declined.' using errcode = '23514';
  end if;

  select * into contact_row
  from public.profile_contact_methods
  where id = target_contact_method_id and profile_id = actor_id
  for share;
  if not found then
    raise exception 'Choose a contact method you have explicitly added.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.discoverable_profiles p where p.id = match_row.matched_profile_id
  ) then
    raise exception 'This member is no longer available for an introduction.' using errcode = '23514';
  end if;
  select * into recipient_profile from public.profiles where id = match_row.matched_profile_id;
  if not exists (
    select 1 from public.contact_preferences cp
    where cp.profile_id = match_row.matched_profile_id
      and cp.availability_status <> 'unavailable'
      and cp.conversation_capacity > 0
      and case need_row.conversation_type
        when 'peer_exchange' then cp.open_to_peer_exchange
        when 'advisory' then cp.open_to_advisory
        when 'project' then cp.open_to_projects
        when 'partnership' then cp.open_to_partnerships
        when 'opportunity' then cp.open_to_opportunities
        else false
      end
  ) then
    raise exception 'This member is no longer available for this conversation type.' using errcode = '23514';
  end if;

  if target_route = 'suggested_introducer' then
    if target_suggested_introducer_id in (actor_id, match_row.matched_profile_id)
      or not exists (select 1 from public.discoverable_profiles p where p.id = target_suggested_introducer_id) then
      raise exception 'Choose another discoverable member as the suggested introducer.' using errcode = '23514';
    end if;
  elsif target_route = 'trusted_connector' then
    select * into connector_row
    from public.connectors
    where profile_id = target_trusted_connector_id and status = 'active' and introduction_capacity > 0
    for update;
    if not found or target_trusted_connector_id in (actor_id, match_row.matched_profile_id) then
      raise exception 'This Connector is not available for the introduction.' using errcode = '23514';
    end if;
    update public.connectors set introduction_capacity = introduction_capacity - 1
    where profile_id = target_trusted_connector_id;
  end if;

  select jsonb_build_object(
    'need_title', need_row.title,
    'business_problem_summary', left(concat_ws(E'\n\n', need_row.business_outcome, need_row.problem_statement), 1600),
    'proposed_conversation', clean_conversation,
    'requester_offer', clean_offer,
    'matching_competencies', coalesce((
      select jsonb_agg(jsonb_build_object('reason_type', r.reason_type, 'explanation', r.explanation))
      from public.match_reasons r where r.match_id = match_row.id and r.reason_type in ('essential_match', 'useful_match')
    ), '[]'::jsonb),
    'approved_evidence_summaries', coalesce((
      select jsonb_agg(jsonb_build_object('explanation', r.explanation))
      from public.match_reasons r where r.match_id = match_row.id and r.reason_type = 'evidence_strength'
    ), '[]'::jsonb),
    'known_competence_gaps', coalesce((
      select jsonb_agg(jsonb_build_object('reason_type', r.reason_type, 'explanation', r.explanation))
      from public.match_reasons r where r.match_id = match_row.id and r.reason_type in ('competence_gap', 'unknown')
    ), '[]'::jsonb),
    'introduction_rationale', jsonb_build_object('why_this_person', clean_why_person, 'why_now', clean_why_now)
  ) into approved_snapshot;

  insert into public.introductions (
    need_id, match_id, requester_profile_id, recipient_profile_id, requester_display_name_snapshot,
    recipient_display_name_snapshot, route, status,
    why_this_person, why_now, proposed_conversation, requester_offer,
    approved_context_snapshot, expires_at
  ) values (
    need_row.id, match_row.id, actor_id, match_row.matched_profile_id, requester_profile.display_name,
    recipient_profile.display_name, target_route, 'draft',
    clean_why_person, clean_why_now, clean_conversation, clean_offer,
    approved_snapshot, now() + interval '14 days'
  ) returning id into new_introduction_id;

  insert into public.introduction_participants (
    introduction_id, profile_id, role, consent_status, consented_at,
    selected_contact_method_id, contact_method_type, contact_method_label, contact_method_value, contact_method_snapshot_at
  ) values (
    new_introduction_id, actor_id, 'requester', 'accepted', now(),
    contact_row.id, contact_row.method_type, contact_row.label, contact_row.value, now()
  );
  insert into public.introduction_participants (introduction_id, profile_id, role)
  values (new_introduction_id, match_row.matched_profile_id, 'recipient');

  if target_route = 'suggested_introducer' then
    insert into public.introduction_participants (introduction_id, profile_id, role)
    values (new_introduction_id, target_suggested_introducer_id, 'introducer');
    insert into public.connector_assignments (
      introduction_id, assigned_profile_id, assignment_type, status, why_assigned, created_by
    ) values (
      new_introduction_id, target_suggested_introducer_id, 'suggested_introducer', 'pending', clean_intermediary_note, actor_id
    );
  elsif target_route = 'trusted_connector' then
    insert into public.introduction_participants (introduction_id, profile_id, role)
    values (new_introduction_id, target_trusted_connector_id, 'connector');
    insert into public.connector_assignments (
      introduction_id, assigned_profile_id, assignment_type, status, why_assigned, created_by
    ) values (
      new_introduction_id, target_trusted_connector_id, 'trusted_connector', 'pending', clean_intermediary_note, actor_id
    );
  end if;

  update public.introductions set status = 'awaiting_recipient' where id = new_introduction_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  values (match_row.matched_profile_id, new_introduction_id, 'introduction_requested',
    'Introduction request received', 'A member requested a contextual introduction. Sign in to review the details.');
  return new_introduction_id;
end;
$$;

create function public.expire_introduction_if_due(target_introduction_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  assignment_row record;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or not (
    exists (select 1 from public.introduction_participants p where p.introduction_id = target_introduction_id and p.profile_id = actor_id)
    or exists (select 1 from public.connector_assignments a where a.introduction_id = target_introduction_id and a.assigned_profile_id = actor_id)
  ) then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;

  if intro_row.status not in ('declined', 'expired', 'cancelled', 'introduced', 'completed')
    and (
      intro_row.expires_at <= now()
      or intro_row.need_id is null
      or not exists (select 1 from public.competence_needs n where n.id = intro_row.need_id and n.status = 'active' and n.expires_at > now())
      or intro_row.match_id is null
      or not exists (select 1 from public.matches m where m.id = intro_row.match_id and m.status not in ('dismissed', 'expired'))
    ) then
    update public.introductions set status = 'expired' where id = target_introduction_id;
    for assignment_row in
      update public.connector_assignments set status = 'cancelled'
      where introduction_id = target_introduction_id and status in ('pending', 'accepted')
      returning assigned_profile_id, assignment_type
    loop
      if assignment_row.assignment_type = 'trusted_connector' then
        update public.connectors set introduction_capacity = introduction_capacity + 1
        where profile_id = assignment_row.assigned_profile_id;
      end if;
    end loop;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    select p.profile_id, target_introduction_id, 'introduction_expired', 'Introduction request expired',
      'The introduction request expired without being completed.'
    from public.introduction_participants p
    where p.introduction_id = target_introduction_id and p.profile_id <> actor_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    select a.assigned_profile_id, target_introduction_id, 'introduction_expired', 'Introduction request expired',
      'The introduction request expired without being completed.'
    from public.connector_assignments a
    where a.introduction_id = target_introduction_id
      and a.assigned_profile_id <> actor_id and a.status in ('pending', 'accepted')
      and not exists (
        select 1 from public.introduction_participants p
        where p.introduction_id = target_introduction_id and p.profile_id = a.assigned_profile_id
      );
    return 'expired';
  end if;
  return intro_row.status;
end;
$$;

create function public.recipient_introduction_response(
  target_introduction_id uuid,
  target_action text,
  target_contact_method_id uuid default null,
  target_decline_reason text default null,
  target_retry_after date default null,
  target_context_question text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  contact_row public.profile_contact_methods%rowtype;
  assignment_row record;
  expiry_result text;
  question_text text := btrim(coalesce(target_context_question, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or intro_row.recipient_profile_id <> actor_id then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;

  expiry_result := public.expire_introduction_if_due(target_introduction_id);
  if expiry_result = 'expired' then return 'expired'; end if;
  if intro_row.status <> 'awaiting_recipient' then
    if target_action = 'accept' and intro_row.status in ('accepted', 'awaiting_connector', 'introduced', 'completed') then
      return intro_row.status;
    end if;
    if target_action in ('decline_not_relevant', 'decline_not_now', 'decline_no_capacity') and intro_row.status = 'declined' then
      return 'declined';
    end if;
    raise exception 'Introduction is not awaiting your response.' using errcode = '23514';
  end if;

  if target_action = 'ask_context' then
    if intro_row.clarification_round <> 0 or char_length(question_text) not between 3 and 1200 then
      raise exception 'Only one clear clarification request is allowed.' using errcode = '23514';
    end if;
    update public.introductions
    set status = 'awaiting_requester_context', clarification_round = 1,
        clarification_question = question_text, clarification_return_status = 'awaiting_recipient'
    where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.requester_profile_id, target_introduction_id, 'context_requested',
      'More context requested', 'The recipient asked one clarification question before deciding.');
    return 'awaiting_requester_context';
  end if;

  if target_action in ('decline_not_relevant', 'decline_not_now', 'decline_no_capacity') then
    if target_decline_reason is not null or (target_action <> 'decline_not_now' and target_retry_after is not null)
      or (target_retry_after is not null and target_retry_after <= current_date) then
      raise exception 'Decline details are invalid.' using errcode = '22023';
    end if;
    update public.introduction_participants
    set consent_status = 'declined', declined_at = now(),
        decline_reason = case target_action
          when 'decline_not_relevant' then 'declined_not_relevant'
          when 'decline_not_now' then 'declined_not_now'
          when 'decline_no_capacity' then 'declined_no_capacity'
        end,
        declined_availability_status = case when target_action = 'decline_no_capacity' then
          (select cp.availability_status from public.contact_preferences cp where cp.profile_id = actor_id)
          else null end,
        retry_after = case when target_action = 'decline_not_now' then target_retry_after else null end
    where introduction_id = target_introduction_id and profile_id = actor_id;
    for assignment_row in
      update public.connector_assignments set status = 'cancelled'
      where introduction_id = target_introduction_id and status in ('pending', 'accepted')
      returning assigned_profile_id, assignment_type
    loop
      if assignment_row.assignment_type = 'trusted_connector' then
        update public.connectors set introduction_capacity = introduction_capacity + 1
        where profile_id = assignment_row.assigned_profile_id;
      end if;
    end loop;
    update public.introductions set status = 'declined' where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.requester_profile_id, target_introduction_id, 'introduction_declined',
      'Introduction request declined', 'The recipient declined the introduction request.');
    return 'declined';
  end if;

  if target_action <> 'accept' then
    raise exception 'Choose accept, ask for context, or a private decline option.' using errcode = '22023';
  end if;

  select * into contact_row from public.profile_contact_methods
  where id = target_contact_method_id and profile_id = actor_id for share;
  if not found then
    raise exception 'Choose a contact method you have explicitly added before accepting.' using errcode = '23514';
  end if;

  update public.introduction_participants
  set consent_status = 'accepted', consented_at = now(),
      selected_contact_method_id = contact_row.id,
      contact_method_type = contact_row.method_type,
      contact_method_label = contact_row.label,
      contact_method_value = contact_row.value,
      contact_method_snapshot_at = now()
  where introduction_id = target_introduction_id and profile_id = actor_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  values (intro_row.requester_profile_id, target_introduction_id, 'consent_received',
    'Consent received', 'The recipient accepted the introduction.');

  if intro_row.route = 'direct' then
    update public.introductions set status = 'accepted' where id = target_introduction_id;
    update public.introductions set status = 'introduced', introduced_at = now() where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.requester_profile_id, target_introduction_id, 'introduction_completed',
      'Your introduction is ready', 'Both members have consented. Review the context and chosen contact methods.');
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values
      (intro_row.requester_profile_id, target_introduction_id, 'feedback_requested', 'Share private follow-up', 'After the conversation, tell Commonwork privately whether the introduction was useful.'),
      (intro_row.recipient_profile_id, target_introduction_id, 'feedback_requested', 'Share private follow-up', 'After the conversation, tell Commonwork privately whether the introduction was useful.');
  else
    update public.introductions set status = 'accepted' where id = target_introduction_id;
    update public.introductions set status = 'awaiting_connector' where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    select a.assigned_profile_id, target_introduction_id, 'connector_action_required',
      'Introduction action required', 'Both members have consented. Review the contextual request and choose your next action.'
    from public.connector_assignments a
    where a.introduction_id = target_introduction_id and a.status = 'pending';
  end if;

  return case when intro_row.route = 'direct' then 'introduced' else 'awaiting_connector' end;
end;
$$;

create function public.requester_introduction_context_response(
  target_introduction_id uuid,
  target_context_response text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  context_text text := btrim(coalesce(target_context_response, ''));
  new_status text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or intro_row.requester_profile_id <> actor_id then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  if public.expire_introduction_if_due(target_introduction_id) = 'expired' then return 'expired'; end if;
  if intro_row.status <> 'awaiting_requester_context' or intro_row.clarification_round <> 1
    or char_length(context_text) not between 3 and 1600
    or intro_row.clarification_response is not null then
    raise exception 'This introduction is not awaiting its single context response.' using errcode = '23514';
  end if;

  new_status := coalesce(intro_row.clarification_return_status, 'awaiting_recipient');
  update public.introductions
  set clarification_response = context_text, status = new_status
  where id = target_introduction_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  values (
    case when new_status = 'awaiting_connector'
      then (select assigned_profile_id from public.connector_assignments where introduction_id = target_introduction_id and status = 'pending' limit 1)
      else intro_row.recipient_profile_id end,
    target_introduction_id, 'context_supplied', 'More context supplied',
    'The requester answered the clarification. Review the request before proceeding.'
  );
  return new_status;
end;
$$;

create function public.connector_introduction_response(
  target_introduction_id uuid,
  target_action text,
  target_suggested_profile_id uuid default null,
  target_context_question text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  assignment_row public.connector_assignments%rowtype;
  suggested_profile public.profiles%rowtype;
  question_text text := btrim(coalesce(target_context_question, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  if public.expire_introduction_if_due(target_introduction_id) = 'expired' then return 'expired'; end if;
  select * into assignment_row
  from public.connector_assignments
  where introduction_id = target_introduction_id and assigned_profile_id = actor_id and status = 'pending'
  order by created_at desc limit 1 for update;
  if not found or intro_row.status <> 'awaiting_connector' then
    raise exception 'This introduction is not assigned to you for action.' using errcode = '42501';
  end if;

  if target_action = 'ask_context' then
    if intro_row.clarification_round <> 0 or char_length(question_text) not between 3 and 1200 then
      raise exception 'Only one clear clarification request is allowed.' using errcode = '23514';
    end if;
    update public.introductions
    set status = 'awaiting_requester_context', clarification_round = 1,
        clarification_question = question_text, clarification_return_status = 'awaiting_connector'
    where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.requester_profile_id, target_introduction_id, 'context_requested',
      'More context requested', 'The assigned introducer asked one clarification question.');
    return 'awaiting_requester_context';
  end if;

  if target_action = 'suggest_another_member' then
    if target_suggested_profile_id is null
      or target_suggested_profile_id in (actor_id, intro_row.requester_profile_id, intro_row.recipient_profile_id) then
      raise exception 'Choose another suitable member.' using errcode = '22023';
    end if;
    select * into suggested_profile from public.profiles p
    join public.discoverable_profiles dp on dp.id = p.id
    where p.id = target_suggested_profile_id;
    if not found then
      raise exception 'The suggested member is unavailable.' using errcode = '23514';
    end if;
    if assignment_row.assignment_type = 'trusted_connector' and not exists (
      select 1 from public.connectors c where c.profile_id = target_suggested_profile_id
        and c.status = 'active' and c.introduction_capacity > 0
    ) then
      raise exception 'Choose an available trusted Connector.' using errcode = '23514';
    end if;
    update public.connector_assignments
    set status = 'suggested_another_member', suggested_profile_id = target_suggested_profile_id
    where id = assignment_row.id;
    if assignment_row.assignment_type = 'trusted_connector' then
      update public.connectors set introduction_capacity = introduction_capacity + 1 where profile_id = actor_id;
    end if;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.requester_profile_id, target_introduction_id, 'connector_action_required',
      'A different introducer was suggested',
      format('%s may be able to facilitate. Review the suggestion before assigning it.', suggested_profile.display_name));
    return 'awaiting_requester_review';
  end if;

  if target_action in ('decline_facilitation', 'insufficient_relevance') then
    update public.connector_assignments set status = 'declined' where id = assignment_row.id;
    if assignment_row.assignment_type = 'trusted_connector' then
      update public.connectors set introduction_capacity = introduction_capacity + 1 where profile_id = actor_id;
    end if;
    update public.introductions set status = 'declined' where id = target_introduction_id;
    insert into public.introduction_audit (introduction_id, actor_profile_id, action, from_status, to_status)
    values (target_introduction_id, actor_id, target_action, intro_row.status, 'declined');
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    select p.profile_id, target_introduction_id, 'introduction_declined', 'Introduction could not proceed',
      'The requested introduction will not proceed.'
    from public.introduction_participants p
    where p.introduction_id = target_introduction_id and p.profile_id <> actor_id;
    return 'declined';
  end if;

  if target_action = 'confirm_mutual' and assignment_row.assignment_type = 'suggested_introducer' then
    update public.connector_assignments
    set status = 'completed', knows_both = true, confirmed_at = now()
    where id = assignment_row.id;
  elsif target_action = 'make_introduction' and assignment_row.assignment_type = 'trusted_connector' then
    update public.connector_assignments set status = 'completed' where id = assignment_row.id;
    update public.connectors set introduction_capacity = introduction_capacity + 1 where profile_id = actor_id;
  else
    raise exception 'This action is not available for the assigned route.' using errcode = '22023';
  end if;

  update public.introduction_participants
  set consent_status = 'accepted', consented_at = now()
  where introduction_id = target_introduction_id and profile_id = actor_id and consent_status = 'pending';
  update public.introductions set status = 'introduced', introduced_at = now() where id = target_introduction_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  select p.profile_id, target_introduction_id, 'introduction_completed', 'Your introduction is ready',
    'The contextual introduction is ready. Review the approved details and contact methods.'
  from public.introduction_participants p
  where p.introduction_id = target_introduction_id and p.profile_id <> actor_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  values
    (intro_row.requester_profile_id, target_introduction_id, 'feedback_requested', 'Share private follow-up', 'After the conversation, tell Commonwork privately whether the introduction was useful.'),
    (intro_row.recipient_profile_id, target_introduction_id, 'feedback_requested', 'Share private follow-up', 'After the conversation, tell Commonwork privately whether the introduction was useful.');
  return 'introduced';
end;
$$;

create function public.requester_review_intermediary_suggestion(
  target_introduction_id uuid,
  accept_suggestion boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  suggestion_row public.connector_assignments%rowtype;
  replacement_type text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or intro_row.requester_profile_id <> actor_id then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  if public.expire_introduction_if_due(target_introduction_id) = 'expired' then return 'expired'; end if;
  if intro_row.status <> 'awaiting_connector' then
    raise exception 'This introduction is not awaiting an intermediary decision.' using errcode = '23514';
  end if;
  select * into suggestion_row from public.connector_assignments
  where introduction_id = target_introduction_id and status = 'suggested_another_member'
  order by created_at desc limit 1 for update;
  if not found or suggestion_row.suggested_profile_id is null then
    raise exception 'No intermediary suggestion is awaiting review.' using errcode = '23514';
  end if;

  if not accept_suggestion then
    update public.introductions set status = 'cancelled' where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    values (intro_row.recipient_profile_id, target_introduction_id, 'introduction_declined',
      'Introduction request cancelled', 'The requester cancelled the introduction request.');
    return 'cancelled';
  end if;

  if intro_row.route = 'trusted_connector' then
    perform 1 from public.connectors
    where profile_id = suggestion_row.suggested_profile_id and status = 'active' and introduction_capacity > 0
    for update;
    if not found then
      raise exception 'The suggested Connector is no longer available.' using errcode = '23514';
    end if;
    update public.connectors set introduction_capacity = introduction_capacity - 1
    where profile_id = suggestion_row.suggested_profile_id;
    replacement_type := 'trusted_connector';
  else
    if not exists (
      select 1 from public.discoverable_profiles where id = suggestion_row.suggested_profile_id
    ) then
      raise exception 'The suggested member is no longer available.' using errcode = '23514';
    end if;
    replacement_type := 'suggested_introducer';
  end if;

  insert into public.introduction_participants (introduction_id, profile_id, role)
  values (
    target_introduction_id, suggestion_row.suggested_profile_id,
    case when replacement_type = 'trusted_connector' then 'connector' else 'introducer' end
  );
  insert into public.connector_assignments (
    introduction_id, assigned_profile_id, assignment_type, status, why_assigned, created_by
  ) values (
    target_introduction_id, suggestion_row.suggested_profile_id, replacement_type, 'pending',
    suggestion_row.why_assigned, actor_id
  );
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  values (suggestion_row.suggested_profile_id, target_introduction_id, 'connector_action_required',
    'Introduction action requested', 'A member asked you to help with a contextual introduction.');
  return 'awaiting_connector';
end;
$$;

create function public.cancel_introduction(target_introduction_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
  assignment_row record;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or intro_row.requester_profile_id <> actor_id then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  if public.expire_introduction_if_due(target_introduction_id) = 'expired' then return 'expired'; end if;
  if intro_row.status in ('cancelled', 'expired', 'declined') then return intro_row.status; end if;
  if intro_row.status in ('introduced', 'completed') then
    raise exception 'An introduced relationship cannot be cancelled.' using errcode = '23514';
  end if;

  for assignment_row in
    update public.connector_assignments set status = 'cancelled'
    where introduction_id = target_introduction_id and status in ('pending', 'accepted')
    returning assigned_profile_id, assignment_type
  loop
    if assignment_row.assignment_type = 'trusted_connector' then
      update public.connectors set introduction_capacity = introduction_capacity + 1
      where profile_id = assignment_row.assigned_profile_id;
    end if;
  end loop;
  update public.introductions set status = 'cancelled' where id = target_introduction_id;
  insert into public.notifications (profile_id, introduction_id, type, title, body)
  select p.profile_id, target_introduction_id, 'introduction_declined', 'Introduction request cancelled',
    'The requester cancelled the introduction request.'
  from public.introduction_participants p
  where p.introduction_id = target_introduction_id and p.profile_id <> actor_id;
  return 'cancelled';
end;
$$;

create function public.get_my_contact_methods()
returns table (
  id uuid,
  method_type text,
  value text,
  label text,
  is_primary boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.method_type, c.value, c.label, c.is_primary, c.created_at, c.updated_at
  from public.profile_contact_methods c
  where c.profile_id = auth.uid()
$$;

create function public.get_my_introduction_inbox()
returns table (
  introduction_id uuid,
  need_id uuid,
  match_id uuid,
  my_role text,
  requester_profile_id uuid,
  recipient_profile_id uuid,
  requester_display_name text,
  recipient_display_name text,
  route text,
  status text,
  why_this_person text,
  why_now text,
  proposed_conversation text,
  requester_offer text,
  approved_context_snapshot jsonb,
  clarification_round smallint,
  clarification_question text,
  clarification_response text,
  expires_at timestamptz,
  introduced_at timestamptz,
  completed_at timestamptz,
  my_consent_status text,
  my_decline_reason text,
  my_retry_after date,
  has_contact_method boolean,
  other_contact_method_type text,
  other_contact_method_label text,
  assignment_type text,
  assignment_status text,
  assigned_profile_id uuid,
  suggested_profile_id uuid,
  knows_both boolean,
  assignment_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  expiry_row record;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  for expiry_row in
    select i.id
    from public.introductions i
    where i.status in ('draft', 'awaiting_recipient', 'awaiting_requester_context', 'awaiting_connector', 'accepted')
      and (
        i.expires_at <= now()
        or i.need_id is null
        or not exists (select 1 from public.competence_needs n where n.id = i.need_id and n.status = 'active' and n.expires_at > now())
        or i.match_id is null
        or not exists (select 1 from public.matches m where m.id = i.match_id and m.status not in ('dismissed', 'expired'))
      )
      and (
        exists (select 1 from public.introduction_participants p where p.introduction_id = i.id and p.profile_id = actor_id)
        or exists (select 1 from public.connector_assignments a where a.introduction_id = i.id and a.assigned_profile_id = actor_id)
      )
    order by i.expires_at
    for update
  loop
    perform public.expire_introduction_if_due(expiry_row.id);
  end loop;

  return query
  select i.id, i.need_id, i.match_id, p.role,
    i.requester_profile_id, i.recipient_profile_id,
    i.requester_display_name_snapshot, i.recipient_display_name_snapshot,
    i.route, i.status, i.why_this_person, i.why_now, i.proposed_conversation,
    i.requester_offer, i.approved_context_snapshot, i.clarification_round,
    i.clarification_question, i.clarification_response, i.expires_at,
    i.introduced_at, i.completed_at, p.consent_status, p.decline_reason,
    p.retry_after,
    exists (select 1 from public.profile_contact_methods cm where cm.profile_id = actor_id),
    case when actor_id = i.requester_profile_id then recipient_contact.contact_method_type
      when actor_id = i.recipient_profile_id then requester_contact.contact_method_type else null end,
    case when actor_id = i.requester_profile_id then recipient_contact.contact_method_label
      when actor_id = i.recipient_profile_id then requester_contact.contact_method_label else null end,
    case when actor_id <> i.recipient_profile_id then a.assignment_type else null end,
    case when actor_id <> i.recipient_profile_id then a.status else null end,
    case when actor_id <> i.recipient_profile_id then a.assigned_profile_id else null end,
    case when actor_id = i.requester_profile_id then a.suggested_profile_id else null end,
    case when actor_id <> i.recipient_profile_id then a.knows_both else null end,
    case when actor_id <> i.recipient_profile_id then a.why_assigned else null end,
    i.created_at, i.updated_at
  from public.introductions i
  join public.introduction_participants p on p.introduction_id = i.id and p.profile_id = actor_id
  left join public.introduction_participants requester_contact
    on requester_contact.introduction_id = i.id and requester_contact.role = 'requester'
  left join public.introduction_participants recipient_contact
    on recipient_contact.introduction_id = i.id and recipient_contact.role = 'recipient'
  left join lateral (
    select ca.assignment_type, ca.status, ca.assigned_profile_id, ca.suggested_profile_id, ca.knows_both, ca.why_assigned
    from public.connector_assignments ca
    where ca.introduction_id = i.id
    order by ca.created_at desc
    limit 1
  ) a on true
  where p.role in ('requester', 'recipient')
    or exists (
      select 1 from public.connector_assignments assigned
      where assigned.introduction_id = i.id
        and assigned.assigned_profile_id = actor_id
        and assigned.status in ('pending', 'accepted', 'completed')
        and i.status in ('awaiting_connector', 'introduced', 'completed')
    )
  order by i.updated_at desc;
end;
$$;

create function public.release_introduction_contacts(target_introduction_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  method_type text,
  value text,
  label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id;
  if not found or intro_row.status not in ('introduced', 'completed') then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  if actor_id not in (intro_row.requester_profile_id, intro_row.recipient_profile_id) then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  return query
  select p.profile_id,
    case when p.profile_id = intro_row.requester_profile_id then intro_row.requester_display_name_snapshot
      else intro_row.recipient_display_name_snapshot end,
    p.contact_method_type, p.contact_method_value, p.contact_method_label
  from public.introduction_participants p
  where p.introduction_id = target_introduction_id
    and p.profile_id <> actor_id
    and p.role in ('requester', 'recipient')
    and p.consent_status = 'accepted'
    and p.contact_method_snapshot_at is not null;
end;
$$;

create function public.submit_introduction_feedback(
  target_introduction_id uuid,
  target_conversation_occurred boolean,
  target_match_relevant boolean,
  target_competencies_relevant boolean,
  target_welcome_future boolean,
  target_private_feedback text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  intro_row public.introductions%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into intro_row from public.introductions where id = target_introduction_id for update;
  if not found or intro_row.status not in ('introduced', 'completed')
    or actor_id not in (intro_row.requester_profile_id, intro_row.recipient_profile_id) then
    raise exception 'Feedback is available only to introduction participants after introduction.' using errcode = '42501';
  end if;
  if target_private_feedback is not null and char_length(target_private_feedback) > 2000 then
    raise exception 'Feedback is too long.' using errcode = '22023';
  end if;

  insert into public.introduction_feedback (
    introduction_id, profile_id, conversation_occurred, match_relevant,
    competencies_relevant, would_welcome_future_introductions, private_feedback
  ) values (
    target_introduction_id, actor_id, target_conversation_occurred, target_match_relevant,
    target_competencies_relevant, target_welcome_future, coalesce(target_private_feedback, '')
  ) on conflict (introduction_id, profile_id) do update
    set conversation_occurred = excluded.conversation_occurred,
        match_relevant = excluded.match_relevant,
        competencies_relevant = excluded.competencies_relevant,
        would_welcome_future_introductions = excluded.would_welcome_future_introductions,
        private_feedback = excluded.private_feedback;

  if intro_row.status = 'introduced' and exists (
    select 1 from public.introduction_feedback f
    where f.introduction_id = target_introduction_id
      and f.profile_id = intro_row.requester_profile_id and f.conversation_occurred
  ) and exists (
    select 1 from public.introduction_feedback f
    where f.introduction_id = target_introduction_id
      and f.profile_id = intro_row.recipient_profile_id and f.conversation_occurred
  ) then
    update public.introductions set status = 'completed', completed_at = now() where id = target_introduction_id;
    insert into public.notifications (profile_id, introduction_id, type, title, body)
    select p.profile_id, target_introduction_id, 'feedback_requested', 'Conversation follow-up complete',
      'Both members shared private follow-up feedback.'
    from public.introduction_participants p
    where p.introduction_id = target_introduction_id and p.profile_id <> actor_id
      and p.role in ('requester', 'recipient');
    return 'completed';
  end if;
  return intro_row.status;
end;
$$;

create function public.mark_introduction_notification_read(target_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  read_time timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification_id and profile_id = actor_id
  returning read_at into read_time;
  if read_time is null then
    raise exception 'Notification unavailable.' using errcode = '42501';
  end if;
  return read_time;
end;
$$;

revoke all on function public.guard_introduction_transition() from public, anon, authenticated;
revoke all on function public.guard_introduction_snapshot() from public, anon, authenticated;
revoke all on function public.audit_introduction_state_change() from public, anon, authenticated;
revoke all on function public.audit_introduction_participant_change() from public, anon, authenticated;
revoke all on function public.audit_connector_assignment_change() from public, anon, authenticated;
revoke all on function public.guard_introduction_participant() from public, anon, authenticated;
revoke all on function public.guard_connector_assignment() from public, anon, authenticated;
revoke all on function public.save_profile_contact_method(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.delete_profile_contact_method(uuid) from public, anon, authenticated;
revoke all on function public.request_introduction(uuid, text, uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_introduction_if_due(uuid) from public, anon, authenticated;
revoke all on function public.recipient_introduction_response(uuid, text, uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.requester_introduction_context_response(uuid, text) from public, anon, authenticated;
revoke all on function public.connector_introduction_response(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.requester_review_intermediary_suggestion(uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_introduction(uuid) from public, anon, authenticated;
revoke all on function public.get_my_contact_methods() from public, anon, authenticated;
revoke all on function public.get_my_introduction_inbox() from public, anon, authenticated;
revoke all on function public.release_introduction_contacts(uuid) from public, anon, authenticated;
revoke all on function public.submit_introduction_feedback(uuid, boolean, boolean, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.mark_introduction_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.save_profile_contact_method(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.delete_profile_contact_method(uuid) to authenticated;
grant execute on function public.request_introduction(uuid, text, uuid, uuid, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.expire_introduction_if_due(uuid) to authenticated;
grant execute on function public.recipient_introduction_response(uuid, text, uuid, text, date, text) to authenticated;
grant execute on function public.requester_introduction_context_response(uuid, text) to authenticated;
grant execute on function public.connector_introduction_response(uuid, text, uuid, text) to authenticated;
grant execute on function public.requester_review_intermediary_suggestion(uuid, boolean) to authenticated;
grant execute on function public.cancel_introduction(uuid) to authenticated;
grant execute on function public.get_my_contact_methods() to authenticated;
grant execute on function public.get_my_introduction_inbox() to authenticated;
grant execute on function public.release_introduction_contacts(uuid) to authenticated;
grant execute on function public.submit_introduction_feedback(uuid, boolean, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.mark_introduction_notification_read(uuid) to authenticated;

commit;