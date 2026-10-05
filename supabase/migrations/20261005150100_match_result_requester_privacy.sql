begin;

drop policy competence_needs_select_owner_network_or_matched on public.competence_needs;
create policy competence_needs_select_owner_or_network
on public.competence_needs for select to authenticated
using (
  owner_profile_id = auth.uid()
  or (status = 'active' and (expires_at is null or expires_at > now()) and visibility = 'network')
);

drop policy need_competencies_select_authorized_need on public.need_competencies;
create policy need_competencies_select_owner_or_network
on public.need_competencies for select to authenticated
using (
  public.is_need_owner(need_id)
  or exists (
    select 1 from public.competence_needs n
    where n.id = need_id and n.status = 'active'
      and (n.expires_at is null or n.expires_at > now())
      and n.visibility = 'network'
  )
);

drop policy matches_select_participants on public.matches;
create policy matches_select_need_owner
on public.matches for select to authenticated
using (public.is_need_owner(need_id));

create or replace function public.can_read_match(target_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    join public.competence_needs n on n.id = m.need_id
    where m.id = target_match_id and n.owner_profile_id = auth.uid()
  )
$$;

revoke execute on function public.is_need_match_participant(uuid) from authenticated;

commit;
