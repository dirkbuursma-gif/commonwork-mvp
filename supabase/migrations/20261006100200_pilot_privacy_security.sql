begin;

alter table public.pilot_rate_limit_events enable row level security;
alter table public.member_privacy_requests enable row level security;
alter table public.profile_introduction_blocks enable row level security;
alter table public.introduction_reports enable row level security;
alter table public.pilot_rate_limit_events force row level security;
alter table public.member_privacy_requests force row level security;
alter table public.profile_introduction_blocks force row level security;
alter table public.introduction_reports force row level security;

revoke all on public.pilot_rate_limit_events from public, anon, authenticated;
revoke all on public.member_privacy_requests from public, anon, authenticated;
revoke all on public.profile_introduction_blocks from public, anon, authenticated;
revoke all on public.introduction_reports from public, anon, authenticated;
grant select (id, profile_id, request_type, status, member_note, requested_at, resolved_at, resolution_note, created_at, updated_at)
  on public.member_privacy_requests to authenticated;
grant select (profile_id, blocked_profile_id, blocked_display_name, created_at) on public.profile_introduction_blocks to authenticated;
grant select (id, introduction_id, reporter_profile_id, category, details, status, created_at)
  on public.introduction_reports to authenticated;

create policy member_privacy_requests_owner_select
on public.member_privacy_requests for select to authenticated
using (profile_id = auth.uid());

create policy profile_introduction_blocks_owner_select
on public.profile_introduction_blocks for select to authenticated
using (profile_id = auth.uid());

create policy introduction_reports_author_select
on public.introduction_reports for select to authenticated
using (reporter_profile_id = auth.uid());

create function public.consume_pilot_rate_limit(target_action text, target_scope_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  event_limit integer;
  event_window interval;
  event_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  case target_action
    when 'introduction_request' then event_limit := 5; event_window := interval '7 days';
    when 'match_recalculation' then event_limit := 10; event_window := interval '1 hour';
    when 'connector_reassignment' then
      if target_scope_id is null then raise exception 'An introduction scope is required.' using errcode = '22023'; end if;
      event_limit := 2; event_window := interval '100 years';
    else raise exception 'Unsupported rate-limit action.' using errcode = '22023';
  end case;

  perform pg_advisory_xact_lock(
    hashtext(actor_id::text),
    hashtext(target_action || case when target_action = 'connector_reassignment' then target_scope_id::text else '' end)
  );
  delete from public.pilot_rate_limit_events
  where profile_id = actor_id and action = target_action
    and created_at < now() - event_window;
  select count(*) into event_count
  from public.pilot_rate_limit_events e
  where e.profile_id = actor_id and e.action = target_action
    and (target_action <> 'connector_reassignment' or e.scope_id = target_scope_id)
    and e.created_at >= now() - event_window;
  if event_count >= event_limit then
    raise log 'commonwork_rate_limit_rejected action=% actor=% scope=%', target_action, actor_id, target_scope_id;
    raise exception 'Pilot action rate limit reached.' using errcode = 'P0001';
  end if;
  insert into public.pilot_rate_limit_events (profile_id, action, scope_id)
  values (actor_id, target_action, target_scope_id);
  return event_limit - event_count - 1;
end;
$$;

create function public.guard_active_need_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  if new.status <> 'active' then return new; end if;
  perform 1 from public.profiles where id = new.owner_profile_id for update;
  select count(*) into active_count
  from public.competence_needs n
  where n.owner_profile_id = new.owner_profile_id and n.status = 'active'
    and n.expires_at > now() and n.id <> new.id;
  if active_count >= 5 then
    raise log 'commonwork_rate_limit_rejected action=active_needs actor=% count=%', new.owner_profile_id, active_count;
    raise exception 'A member may have at most five active competence needs.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger competence_needs_guard_active_limit
before insert or update of status on public.competence_needs
for each row execute function public.guard_active_need_limit();

create function public.guard_introduction_request_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'draft' then return new; end if;
  if auth.uid() is null or new.requester_profile_id <> auth.uid() then
    raise exception 'The current member must request the introduction.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.profile_introduction_blocks b
    where (b.profile_id = new.requester_profile_id and b.blocked_profile_id = new.recipient_profile_id)
      or (b.profile_id = new.recipient_profile_id and b.blocked_profile_id = new.requester_profile_id)
  ) then
    raise exception 'This introduction is unavailable.' using errcode = '42501';
  end if;
  perform public.consume_pilot_rate_limit('introduction_request', null);
  return new;
end;
$$;

create trigger introductions_guard_request_policy
before insert on public.introductions
for each row execute function public.guard_introduction_request_policy();

create function public.block_member_from_introductions(target_profile_id uuid, should_block boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  blocked_name text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_profile_id is null or target_profile_id = actor_id then
    raise exception 'Choose another member.' using errcode = '22023';
  end if;
  if should_block then
    select p.display_name into blocked_name from public.profiles p where p.id = target_profile_id;
    if not found then raise exception 'Member not found.' using errcode = '22023'; end if;
    insert into public.profile_introduction_blocks (profile_id, blocked_profile_id, blocked_display_name)
    values (actor_id, target_profile_id, blocked_name)
    on conflict (profile_id, blocked_profile_id) do nothing;
    return true;
  end if;
  delete from public.profile_introduction_blocks
  where profile_id = actor_id and blocked_profile_id = target_profile_id;
  return found;
end;
$$;

create function public.request_member_privacy_action(target_request_type text, target_note text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  request_id uuid;
  clean_note text := btrim(coalesce(target_note, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if target_request_type not in ('data_export', 'account_deletion') or char_length(clean_note) > 2000 then
    raise exception 'Privacy request details are invalid.' using errcode = '22023';
  end if;
  select id into request_id from public.member_privacy_requests
  where profile_id = actor_id and request_type = target_request_type and status in ('pending', 'in_review')
  order by requested_at desc limit 1;
  if found then return request_id; end if;
  insert into public.member_privacy_requests (profile_id, request_type, member_note)
  values (actor_id, target_request_type, clean_note)
  returning id into request_id;
  return request_id;
end;
$$;

create function public.get_my_privacy_requests()
returns table (
  id uuid,
  request_type text,
  status text,
  member_note text,
  requested_at timestamptz,
  resolved_at timestamptz,
  resolution_note text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.request_type, r.status, r.member_note, r.requested_at, r.resolved_at, r.resolution_note
  from public.member_privacy_requests r
  where r.profile_id = auth.uid()
  order by r.requested_at desc
$$;

create function public.cancel_my_privacy_request(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_privacy_requests
  set status = 'cancelled', resolved_at = now()
  where id = target_request_id and profile_id = auth.uid() and status = 'pending';
  return found;
end;
$$;

create function public.deactivate_my_member_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  update public.profiles set profile_visibility = 'private' where id = actor_id;
  update public.profile_competencies set discoverable = false where profile_id = actor_id;
  update public.contact_preferences set availability_status = 'unavailable', conversation_capacity = 0 where profile_id = actor_id;
  return found;
end;
$$;

create function public.export_my_member_data()
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
    'blocked_members', coalesce((select jsonb_agg(b.blocked_profile_id) from public.profile_introduction_blocks b where b.profile_id = actor_id), '[]'::jsonb)
  );
end;
$$;

create function public.report_introduction(target_introduction_id uuid, target_category text, target_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  report_id uuid;
  clean_details text := btrim(coalesce(target_details, ''));
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if target_category not in ('inappropriate_contact', 'privacy_concern', 'misrepresentation', 'other')
    or char_length(clean_details) not between 3 and 3000 then
    raise exception 'Report details are invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.introduction_participants p
    where p.introduction_id = target_introduction_id and p.profile_id = actor_id
      and p.role in ('requester', 'recipient')
  ) then
    raise exception 'Introduction unavailable.' using errcode = '42501';
  end if;
  insert into public.introduction_reports (introduction_id, reporter_profile_id, category, details)
  values (target_introduction_id, actor_id, target_category, clean_details)
  returning id into report_id;
  return report_id;
end;
$$;

create function public.guard_introduction_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' and exists (
    select 1 from public.profile_introduction_blocks b
    where (b.profile_id = new.requester_profile_id and b.blocked_profile_id = new.recipient_profile_id)
      or (b.profile_id = new.recipient_profile_id and b.blocked_profile_id = new.requester_profile_id)
  ) then
    raise exception 'This introduction is unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger introductions_guard_blocked_members
before insert on public.introductions
for each row execute function public.guard_introduction_blocks();

alter function public.generate_matches_for_need(uuid) rename to generate_matches_for_need_unlimited;
revoke all on function public.generate_matches_for_need_unlimited(uuid) from public, anon, authenticated;

create function public.generate_matches_for_need(target_need_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  perform public.consume_pilot_rate_limit('match_recalculation', target_need_id);
  return public.generate_matches_for_need_unlimited(target_need_id);
end;
$$;

revoke all on function public.consume_pilot_rate_limit(text, uuid) from public, anon, authenticated;
revoke all on function public.guard_active_need_limit() from public, anon, authenticated;
revoke all on function public.guard_introduction_request_policy() from public, anon, authenticated;
revoke all on function public.block_member_from_introductions(uuid, boolean) from public, anon, authenticated;
revoke all on function public.request_member_privacy_action(text, text) from public, anon, authenticated;
revoke all on function public.get_my_privacy_requests() from public, anon, authenticated;
revoke all on function public.cancel_my_privacy_request(uuid) from public, anon, authenticated;
revoke all on function public.deactivate_my_member_profile() from public, anon, authenticated;
revoke all on function public.export_my_member_data() from public, anon, authenticated;
revoke all on function public.report_introduction(uuid, text, text) from public, anon, authenticated;
revoke all on function public.guard_introduction_blocks() from public, anon, authenticated;
revoke all on function public.generate_matches_for_need(uuid) from public, anon, authenticated;

grant execute on function public.block_member_from_introductions(uuid, boolean) to authenticated;
grant execute on function public.request_member_privacy_action(text, text) to authenticated;
grant execute on function public.get_my_privacy_requests() to authenticated;
grant execute on function public.cancel_my_privacy_request(uuid) to authenticated;
grant execute on function public.deactivate_my_member_profile() to authenticated;
grant execute on function public.export_my_member_data() to authenticated;
grant execute on function public.report_introduction(uuid, text, text) to authenticated;
grant execute on function public.generate_matches_for_need(uuid) to authenticated;

commit;