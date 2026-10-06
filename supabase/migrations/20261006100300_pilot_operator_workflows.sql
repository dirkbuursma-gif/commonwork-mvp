begin;

create table public.commonwork_pilot_audit (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('introduction_report', 'member_privacy_request')),
  record_id uuid not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('review', 'resolve', 'dismiss', 'reject')),
  status_before text not null,
  status_after text not null,
  operator_note text not null check (char_length(btrim(operator_note)) between 3 and 2000),
  created_at timestamptz not null default now()
);

create index commonwork_pilot_audit_record_idx
  on public.commonwork_pilot_audit (record_type, record_id, created_at desc);

alter table public.commonwork_pilot_audit enable row level security;
alter table public.commonwork_pilot_audit force row level security;
revoke all on public.commonwork_pilot_audit from public, anon, authenticated;
grant all on public.commonwork_pilot_audit to service_role;

create function public.list_commonwork_introduction_reports(actor_profile_id uuid)
returns table (
  id uuid,
  introduction_id uuid,
  category text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  return query
  select r.id, r.introduction_id, r.category, r.status, r.created_at, r.resolved_at
  from public.introduction_reports r
  order by r.created_at desc;
end;
$$;

create function public.get_commonwork_introduction_report(actor_profile_id uuid, target_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  report_data jsonb;
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'report', jsonb_build_object(
      'id', r.id, 'introduction_id', r.introduction_id, 'reporter_profile_id', r.reporter_profile_id,
      'category', r.category, 'details', r.details, 'status', r.status,
      'created_at', r.created_at, 'resolved_at', r.resolved_at, 'resolved_by', r.resolved_by
    ),
    'introduction', jsonb_build_object(
      'status', i.status,
      'requester_profile_id', i.requester_profile_id,
      'requester_display_name', i.requester_display_name_snapshot,
      'recipient_profile_id', i.recipient_profile_id,
      'recipient_display_name', i.recipient_display_name_snapshot
    ),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action, 'status_before', a.status_before, 'status_after', a.status_after,
        'operator_note', a.operator_note, 'actor_profile_id', a.actor_profile_id, 'created_at', a.created_at
      ) order by a.created_at)
      from public.commonwork_pilot_audit a
      where a.record_type = 'introduction_report' and a.record_id = r.id
    ), '[]'::jsonb)
  ) into report_data
  from public.introduction_reports r
  join public.introductions i on i.id = r.introduction_id
  where r.id = target_report_id;
  if report_data is null then raise exception 'Report not found.' using errcode = '22023'; end if;
  return report_data;
end;
$$;

create function public.manage_commonwork_introduction_report(
  actor_profile_id uuid,
  target_report_id uuid,
  target_action text,
  target_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  report_row public.introduction_reports%rowtype;
  next_status text;
  clean_note text := btrim(coalesce(target_note, ''));
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if target_action not in ('review', 'resolve', 'dismiss')
    or char_length(clean_note) not between 3 and 2000 then
    raise exception 'Report action details are invalid.' using errcode = '22023';
  end if;
  select * into report_row from public.introduction_reports where id = target_report_id for update;
  if not found then raise exception 'Report not found.' using errcode = '22023'; end if;
  if report_row.status not in ('pending', 'in_review') then
    raise exception 'Report is already closed.' using errcode = 'P0001';
  end if;
  if target_action = 'review' then next_status := 'in_review';
  elsif target_action = 'resolve' then next_status := 'resolved';
  else next_status := 'dismissed';
  end if;
  if report_row.status = next_status then
    raise exception 'Report already has that status.' using errcode = 'P0001';
  end if;

  update public.introduction_reports
  set status = next_status,
      resolved_at = case when next_status in ('resolved', 'dismissed') then now() else null end,
      resolved_by = case when next_status in ('resolved', 'dismissed') then actor_profile_id else null end
  where id = target_report_id;
  insert into public.commonwork_pilot_audit (
    record_type, record_id, actor_profile_id, action, status_before, status_after, operator_note
  ) values (
    'introduction_report', target_report_id, actor_profile_id, target_action,
    report_row.status, next_status, clean_note
  );
  return jsonb_build_object('id', target_report_id, 'status', next_status);
end;
$$;

create function public.list_commonwork_privacy_requests(actor_profile_id uuid)
returns table (
  id uuid,
  profile_id uuid,
  request_type text,
  status text,
  requested_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  return query
  select r.id, r.profile_id, r.request_type, r.status, r.requested_at, r.resolved_at
  from public.member_privacy_requests r
  order by r.requested_at desc;
end;
$$;

create function public.get_commonwork_privacy_request(actor_profile_id uuid, target_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_data jsonb;
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', r.id, 'profile_id', r.profile_id, 'request_type', r.request_type,
      'status', r.status, 'member_note', r.member_note, 'requested_at', r.requested_at,
      'resolved_at', r.resolved_at, 'resolved_by', r.resolved_by, 'resolution_note', r.resolution_note
    ),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action, 'status_before', a.status_before, 'status_after', a.status_after,
        'operator_note', a.operator_note, 'actor_profile_id', a.actor_profile_id, 'created_at', a.created_at
      ) order by a.created_at)
      from public.commonwork_pilot_audit a
      where a.record_type = 'member_privacy_request' and a.record_id = r.id
    ), '[]'::jsonb)
  ) into request_data
  from public.member_privacy_requests r
  where r.id = target_request_id;
  if request_data is null then raise exception 'Privacy request not found.' using errcode = '22023'; end if;
  return request_data;
end;
$$;

create function public.manage_commonwork_privacy_request(
  actor_profile_id uuid,
  target_request_id uuid,
  target_action text,
  target_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.member_privacy_requests%rowtype;
  next_status text;
  clean_note text := btrim(coalesce(target_note, ''));
begin
  if actor_profile_id is null or not exists (
    select 1 from public.commonwork_administrators a
    where a.profile_id = actor_profile_id and a.status = 'active'
  ) then
    raise exception 'Administrator permission is required.' using errcode = '42501';
  end if;
  if target_action not in ('review', 'resolve', 'reject')
    or char_length(clean_note) not between 3 and 2000 then
    raise exception 'Privacy request action details are invalid.' using errcode = '22023';
  end if;
  select * into request_row from public.member_privacy_requests where id = target_request_id for update;
  if not found then raise exception 'Privacy request not found.' using errcode = '22023'; end if;
  if request_row.status not in ('pending', 'in_review') then
    raise exception 'Privacy request is already closed.' using errcode = 'P0001';
  end if;
  if target_action = 'review' then next_status := 'in_review';
  elsif target_action = 'resolve' then next_status := 'fulfilled';
  else next_status := 'rejected';
  end if;
  if request_row.status = next_status then
    raise exception 'Privacy request already has that status.' using errcode = 'P0001';
  end if;

  update public.member_privacy_requests
  set status = next_status,
      resolved_at = case when next_status in ('fulfilled', 'rejected') then now() else null end,
      resolved_by = case when next_status in ('fulfilled', 'rejected') then actor_profile_id else null end,
      resolution_note = case when next_status in ('fulfilled', 'rejected') then clean_note else '' end
  where id = target_request_id;
  insert into public.commonwork_pilot_audit (
    record_type, record_id, actor_profile_id, action, status_before, status_after, operator_note
  ) values (
    'member_privacy_request', target_request_id, actor_profile_id, target_action,
    request_row.status, next_status, clean_note
  );
  return jsonb_build_object('id', target_request_id, 'status', next_status);
end;
$$;

revoke all on function public.list_commonwork_introduction_reports(uuid) from public, anon, authenticated;
revoke all on function public.get_commonwork_introduction_report(uuid, uuid) from public, anon, authenticated;
revoke all on function public.manage_commonwork_introduction_report(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_commonwork_privacy_requests(uuid) from public, anon, authenticated;
revoke all on function public.get_commonwork_privacy_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.manage_commonwork_privacy_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.list_commonwork_introduction_reports(uuid) to service_role;
grant execute on function public.get_commonwork_introduction_report(uuid, uuid) to service_role;
grant execute on function public.manage_commonwork_introduction_report(uuid, uuid, text, text) to service_role;
grant execute on function public.list_commonwork_privacy_requests(uuid) to service_role;
grant execute on function public.get_commonwork_privacy_request(uuid, uuid) to service_role;
grant execute on function public.manage_commonwork_privacy_request(uuid, uuid, text, text) to service_role;

commit;