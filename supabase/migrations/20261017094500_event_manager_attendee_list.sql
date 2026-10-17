begin;

create function public.get_managed_event_attendees(target_event_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  status public.event_attendee_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_event_manager(target_event_id) then
    raise exception 'Event manager access required.' using errcode = '42501';
  end if;

  return query
  select a.profile_id, p.display_name, a.status, a.created_at
  from public.event_attendees a
  join public.profiles p on p.id = a.profile_id
  where a.event_id = target_event_id
  order by a.created_at;
end;
$$;

revoke all on function public.get_managed_event_attendees(uuid) from public, anon;
grant execute on function public.get_managed_event_attendees(uuid) to authenticated;

commit;
