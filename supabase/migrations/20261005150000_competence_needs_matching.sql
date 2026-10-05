create table public.competence_needs (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 180),
  business_outcome text not null default '' check (char_length(business_outcome) <= 2000),
  problem_statement text not null default '' check (char_length(problem_statement) <= 3000),
  relevant_context text not null default '' check (char_length(relevant_context) <= 3000),
  what_requester_offers text not null default '' check (char_length(what_requester_offers) <= 2000),
  conversation_type text not null default 'peer_exchange'
    check (conversation_type in ('peer_exchange', 'advisory', 'project', 'partnership', 'opportunity')),
  visibility text not null default 'private_matches'
    check (visibility in ('private_matches', 'selected_network', 'selected_event', 'network')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'fulfilled', 'expired', 'archived')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create table public.need_competencies (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.competence_needs (id) on delete cascade,
  competency_id uuid not null references public.competencies (id) on delete restrict,
  importance text not null check (importance in ('essential', 'useful')),
  context text not null default '' check (char_length(context) <= 1000),
  created_at timestamptz not null default now(),
  unique (need_id, competency_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.competence_needs (id) on delete cascade,
  matched_profile_id uuid not null references public.profiles (id) on delete cascade,
  relevance_band text not null check (relevance_band in ('strong', 'good', 'possible')),
  score_internal integer not null check (score_internal between 0 and 100),
  status text not null default 'new' check (status in ('new', 'viewed', 'saved', 'dismissed', 'expired')),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (need_id, matched_profile_id)
);

create table public.match_reasons (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  reason_type text not null
    check (reason_type in ('essential_match', 'useful_match', 'evidence_strength', 'relevant_outcome', 'availability', 'competence_gap', 'unknown')),
  competency_id uuid references public.competencies (id) on delete set null,
  evidence_id uuid references public.competence_evidence (id) on delete set null,
  explanation text not null check (char_length(btrim(explanation)) between 2 and 1200),
  weight_internal integer not null default 0 check (weight_internal between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.match_feedback (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  feedback_type text not null check (feedback_type in ('useful', 'not_relevant', 'need_not_fit')),
  note text not null default '' check (char_length(note) <= 1200),
  created_at timestamptz not null default now(),
  unique (match_id, created_by)
);

create index competence_needs_owner_created_idx on public.competence_needs (owner_profile_id, created_at desc);
create index competence_needs_active_expiry_idx on public.competence_needs (status, expires_at);
create index need_competencies_need_importance_idx on public.need_competencies (need_id, importance);
create index need_competencies_competency_idx on public.need_competencies (competency_id);
create index matches_need_status_idx on public.matches (need_id, status, score_internal desc);
create index matches_profile_status_idx on public.matches (matched_profile_id, status);
create index match_reasons_match_idx on public.match_reasons (match_id);
create index match_feedback_creator_idx on public.match_feedback (created_by, created_at desc);

create trigger competence_needs_set_updated_at
before update on public.competence_needs
for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create function public.is_need_owner(target_need_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.competence_needs n
    where n.id = target_need_id and n.owner_profile_id = auth.uid()
  )
$$;

create function public.is_need_match_participant(target_need_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches m
    where m.need_id = target_need_id
      and (m.matched_profile_id = auth.uid() or public.is_need_owner(m.need_id))
  )
$$;

create function public.can_read_match(target_match_id uuid)
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
    where m.id = target_match_id
      and (n.owner_profile_id = auth.uid() or m.matched_profile_id = auth.uid())
  )
$$;

create function public.validate_need_activation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    if char_length(btrim(new.title)) < 3
      or char_length(btrim(new.business_outcome)) < 3
      or char_length(btrim(new.problem_statement)) < 3
      or new.expires_at is null
      or new.expires_at <= now()
      or not exists (
        select 1 from public.need_competencies nc
        where nc.need_id = new.id and nc.importance = 'essential'
      ) then
      raise exception 'An active need requires a title, outcome, problem statement, future expiry and at least one essential competence.';
    end if;

    if new.visibility in ('selected_network', 'selected_event') then
      raise exception 'Selected network and event visibility are unavailable until those access scopes are implemented.';
    end if;
  end if;

  return new;
end;
$$;

create trigger competence_needs_validate_activation
before insert or update on public.competence_needs
for each row execute function public.validate_need_activation();

create function public.matching_evidence_for_need(target_need_id uuid)
returns table (
  profile_id uuid,
  profile_competency_id uuid,
  competency_id uuid,
  evidence_id uuid,
  evidence_title text,
  context text,
  contribution text,
  outcome text
)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.profile_id, pc.id, pc.competency_id, ce.id, ce.title,
         ce.context, ce.contribution, ce.outcome
  from public.competence_needs n
  join public.need_competencies nc on nc.need_id = n.id
    join public.profile_competencies pc on pc.competency_id = nc.competency_id
      and pc.discoverable = true
      and pc.profile_id <> n.owner_profile_id
    join public.matches m on m.need_id = n.id and m.matched_profile_id = pc.profile_id
  join public.profiles p on p.id = pc.profile_id
    and p.profile_visibility = 'members'
    and p.onboarding_completed = true
  join public.contact_preferences cp on cp.profile_id = pc.profile_id
    and cp.availability_status <> 'unavailable'
  join public.competence_evidence ce on ce.profile_competency_id = pc.id
    and ce.visibility in ('matches_only', 'members')
  where n.id = target_need_id
    and n.owner_profile_id = auth.uid()
    and n.status = 'active'
    and (n.expires_at is null or n.expires_at > now())
    and (
      (n.conversation_type = 'peer_exchange' and cp.open_to_peer_exchange)
      or (n.conversation_type = 'advisory' and cp.open_to_advisory)
      or (n.conversation_type = 'project' and cp.open_to_projects)
      or (n.conversation_type = 'partnership' and cp.open_to_partnerships)
      or (n.conversation_type = 'opportunity' and cp.open_to_opportunities)
    )
$$;

revoke all on function public.is_need_owner(uuid) from public, anon;
revoke all on function public.is_need_match_participant(uuid) from public, anon;
revoke all on function public.can_read_match(uuid) from public, anon;
revoke all on function public.validate_need_activation() from public, anon, authenticated;
revoke all on function public.matching_evidence_for_need(uuid) from public, anon;
grant execute on function public.is_need_owner(uuid) to authenticated;
grant execute on function public.is_need_match_participant(uuid) to authenticated;
grant execute on function public.can_read_match(uuid) to authenticated;
grant execute on function public.matching_evidence_for_need(uuid) to authenticated;

create view public.discoverable_member_competencies
with (security_barrier = true, security_invoker = true)
as
  select p.id as profile_id, p.display_name, p.professional_summary,
         p.what_i_contribute, p.what_i_am_exploring,
         pc.id as profile_competency_id, pc.competency_id,
         pc.member_statement, pc.evidence_status,
         c.name as competency_name, c.slug as competency_slug,
         c.category as competency_category, c.description as competency_description
  from public.discoverable_profiles p
  join public.profile_competencies pc on pc.profile_id = p.id and pc.discoverable = true
  join public.competencies c on c.id = pc.competency_id and c.status = 'active';

create view public.member_match_reasons
with (security_barrier = true, security_invoker = true)
as
  select r.id, r.match_id, r.reason_type, r.competency_id, r.evidence_id,
         r.explanation, r.created_at
  from public.match_reasons r;

create view public.member_match_feedback
with (security_barrier = true, security_invoker = true)
as
  select f.id, f.match_id, f.feedback_type, f.note, f.created_at
  from public.match_feedback f
  where f.created_by = auth.uid();

create function public.generate_matches_for_need(target_need_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  need_row public.competence_needs%rowtype;
  member_row record;
  reason record;
  need_terms text[];
  member_context_text text;
  total_essential integer;
  matched_essential integer;
  matched_useful integer;
  matched_competencies integer;
  evidence_competencies integer;
  context_overlap integer;
  essential_points integer;
  evidence_points integer;
  context_points integer;
  availability_points integer;
  internal_score integer;
  relevance text;
  created_match_id uuid;
  generated_count integer := 0;
  run_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into need_row
  from public.competence_needs
  where id = target_need_id;

  if not found or need_row.owner_profile_id <> auth.uid() then
    raise exception 'Need not found or not owned by the current member.' using errcode = '42501';
  end if;

  if need_row.status <> 'active' then
    raise exception 'Only active needs can be matched.';
  end if;

  if need_row.expires_at is null or need_row.expires_at <= now() then
    update public.competence_needs set status = 'expired' where id = target_need_id;
    update public.matches set status = 'expired', updated_at = now() where need_id = target_need_id;
    return 0;
  end if;

  if need_row.visibility in ('selected_network', 'selected_event') then
    raise exception 'Selected network and event visibility are not available in this release.';
  end if;

  select count(*) into total_essential
  from public.need_competencies
  where need_id = target_need_id and importance = 'essential';

  if total_essential = 0 then
    raise exception 'At least one essential competence is required.';
  end if;

  select coalesce(array_agg(distinct term), array[]::text[])
  into need_terms
  from regexp_split_to_table(
    lower(concat_ws(' ', need_row.business_outcome, need_row.problem_statement, need_row.relevant_context)),
    '[^a-z0-9]+'
  ) as words(term)
  where char_length(term) > 3
    and term not in ('that', 'with', 'from', 'this', 'have', 'into', 'your', 'their', 'where', 'when', 'what', 'which', 'could', 'would', 'about', 'will', 'must', 'more', 'help', 'some', 'team', 'teams', 'business', 'commerce');

  delete from public.matches where need_id = target_need_id;

  for member_row in
    select distinct cp.profile_id, cp.availability_status, cp.conversation_capacity
    from public.discoverable_contact_preferences cp
    join public.discoverable_member_competencies dmc on dmc.profile_id = cp.profile_id
    where cp.profile_id <> need_row.owner_profile_id
      and cp.availability_status <> 'unavailable'
      and cp.conversation_capacity > 0
      and (
        (need_row.conversation_type = 'peer_exchange' and cp.open_to_peer_exchange)
        or (need_row.conversation_type = 'advisory' and cp.open_to_advisory)
        or (need_row.conversation_type = 'project' and cp.open_to_projects)
        or (need_row.conversation_type = 'partnership' and cp.open_to_partnerships)
        or (need_row.conversation_type = 'opportunity' and cp.open_to_opportunities)
      )
    order by cp.profile_id
  loop
    select
      count(*) filter (where nc.importance = 'essential'),
      count(*) filter (where nc.importance = 'essential' and dmc.profile_competency_id is not null),
      count(*) filter (where nc.importance = 'useful' and dmc.profile_competency_id is not null),
      count(distinct dmc.profile_competency_id),
      count(distinct dmc.profile_competency_id) filter (
        where dmc.profile_competency_id is not null
          and exists (
            select 1 from public.competence_evidence ce
            where ce.profile_competency_id = dmc.profile_competency_id
              and ce.visibility in ('matches_only', 'members')
          )
      )
    into total_essential, matched_essential, matched_useful, matched_competencies, evidence_competencies
    from public.need_competencies nc
    left join public.discoverable_member_competencies dmc
      on dmc.competency_id = nc.competency_id
      and dmc.profile_id = member_row.profile_id
    where nc.need_id = target_need_id;

    if matched_essential = 0 then
      continue;
    end if;

    select lower(concat_ws(' ',
      dp.professional_summary,
      dp.what_i_contribute,
      dp.what_i_am_exploring,
      string_agg(distinct dmc.member_statement, ' '),
      string_agg(distinct dmc.competency_name, ' '),
      string_agg(distinct ce.context, ' '),
      string_agg(distinct ce.contribution, ' '),
      string_agg(distinct ce.outcome, ' ')
    ))
    into member_context_text
    from public.discoverable_profiles dp
    left join public.discoverable_member_competencies dmc on dmc.profile_id = dp.id
    left join public.competence_evidence ce
      on ce.profile_competency_id = dmc.profile_competency_id
      and ce.visibility in ('matches_only', 'members')
    where dp.id = member_row.profile_id
    group by dp.professional_summary, dp.what_i_contribute, dp.what_i_am_exploring;

    if coalesce(cardinality(need_terms), 0) > 0 then
      select count(*) filter (where position(term in coalesce(member_context_text, '')) > 0)
      into context_overlap
      from unnest(need_terms) as tokens(term);
      context_points := round(15.0 * context_overlap / cardinality(need_terms));
    else
      context_overlap := 0;
      context_points := 0;
    end if;

    essential_points := round(50.0 * matched_essential / total_essential);
    evidence_points := case
      when matched_competencies = 0 then 0
      else round(25.0 * evidence_competencies / matched_competencies)
    end;
    availability_points := case member_row.availability_status
      when 'open' then 10
      when 'selective' then 7
      when 'introductions_only' then 4
      else 0
    end;
    internal_score := least(100, essential_points + evidence_points + context_points + availability_points);
    relevance := case
      when internal_score >= 75 then 'strong'
      when internal_score >= 50 then 'good'
      else 'possible'
    end;

    insert into public.matches (need_id, matched_profile_id, relevance_band, score_internal, status, calculated_at)
    values (target_need_id, member_row.profile_id, relevance, internal_score, 'new', run_time)
    returning id into created_match_id;
    generated_count := generated_count + 1;

    for reason in
      select nc.competency_id, c.name, dmc.member_statement
      from public.need_competencies nc
      join public.competencies c on c.id = nc.competency_id
      join public.discoverable_member_competencies dmc
        on dmc.competency_id = nc.competency_id
        and dmc.profile_id = member_row.profile_id
      where nc.need_id = target_need_id and nc.importance = 'essential'
    loop
      insert into public.match_reasons (match_id, reason_type, competency_id, explanation, weight_internal)
      values (created_match_id, 'essential_match', reason.competency_id,
        format('Matches essential competence: %s. %s', reason.name, reason.member_statement), 50);
    end loop;

    for reason in
      select nc.competency_id, c.name, dmc.member_statement
      from public.need_competencies nc
      join public.competencies c on c.id = nc.competency_id
      left join public.discoverable_member_competencies dmc
        on dmc.competency_id = nc.competency_id
        and dmc.profile_id = member_row.profile_id
      where nc.need_id = target_need_id
        and nc.importance = 'essential'
        and dmc.profile_competency_id is null
    loop
      insert into public.match_reasons (match_id, reason_type, competency_id, explanation, weight_internal)
      values (created_match_id, 'competence_gap', reason.competency_id,
        format('Essential competence not listed on this profile: %s.', reason.name), 0);
    end loop;

    for reason in
      select nc.competency_id, c.name, dmc.member_statement
      from public.need_competencies nc
      join public.competencies c on c.id = nc.competency_id
      join public.discoverable_member_competencies dmc
        on dmc.competency_id = nc.competency_id
        and dmc.profile_id = member_row.profile_id
      where nc.need_id = target_need_id and nc.importance = 'useful'
    loop
      insert into public.match_reasons (match_id, reason_type, competency_id, explanation, weight_internal)
      values (created_match_id, 'useful_match', reason.competency_id,
        format('Also matches useful competence: %s. %s', reason.name, reason.member_statement), 0);
    end loop;

    for reason in
      select ce.id as evidence_id, c.name, ce.title, ce.outcome
      from public.need_competencies nc
      join public.discoverable_member_competencies dmc
        on dmc.competency_id = nc.competency_id
        and dmc.profile_id = member_row.profile_id
      join public.competencies c on c.id = dmc.competency_id
      join public.competence_evidence ce
        on ce.profile_competency_id = dmc.profile_competency_id
        and ce.visibility in ('matches_only', 'members')
      where nc.need_id = target_need_id
    loop
      insert into public.match_reasons (match_id, reason_type, competency_id, evidence_id, explanation, weight_internal)
      values (created_match_id, 'evidence_strength', null, reason.evidence_id,
        format('Shareable evidence for %s: %s. Outcome: %s', reason.name, reason.title, reason.outcome), 25);
    end loop;

    if context_overlap > 0 then
      insert into public.match_reasons (match_id, reason_type, explanation, weight_internal)
      values (created_match_id, 'relevant_outcome',
        'Profile statements and shareable evidence overlap with the described business outcome and context.', 15);
    else
      insert into public.match_reasons (match_id, reason_type, explanation, weight_internal)
      values (created_match_id, 'unknown',
        'The need context does not confirm direct experience with the requested outcome; validate fit in discussion.', 0);
    end if;

    insert into public.match_reasons (match_id, reason_type, explanation, weight_internal)
    values (created_match_id, 'availability',
      format('Availability is listed as %s for this conversation type.', replace(member_row.availability_status, '_', ' ')), 10);
  end loop;

  return generated_count;
end;
$$;

revoke all on function public.generate_matches_for_need(uuid) from public, anon;
grant execute on function public.generate_matches_for_need(uuid) to authenticated;

alter table public.competence_needs enable row level security;
alter table public.need_competencies enable row level security;
alter table public.matches enable row level security;
alter table public.match_reasons enable row level security;
alter table public.match_feedback enable row level security;

alter table public.competence_needs force row level security;
alter table public.need_competencies force row level security;
alter table public.matches force row level security;
alter table public.match_reasons force row level security;
alter table public.match_feedback force row level security;

revoke all on public.competence_needs from anon, authenticated;
revoke all on public.need_competencies from anon, authenticated;
revoke all on public.matches from anon, authenticated;
revoke all on public.match_reasons from anon, authenticated;
revoke all on public.match_feedback from anon, authenticated;
revoke all on public.discoverable_member_competencies from anon, authenticated;
revoke all on public.member_match_reasons from anon, authenticated;
revoke all on public.member_match_feedback from anon, authenticated;

grant select (id, title, business_outcome, problem_statement, relevant_context,
  what_requester_offers, conversation_type, visibility, status, expires_at, created_at, updated_at)
  on public.competence_needs to authenticated;
grant insert (owner_profile_id, title, business_outcome, problem_statement, relevant_context,
  what_requester_offers, conversation_type, visibility, status, expires_at)
  on public.competence_needs to authenticated;
grant update (title, business_outcome, problem_statement, relevant_context, what_requester_offers,
  conversation_type, visibility, status, expires_at)
  on public.competence_needs to authenticated;
grant delete on public.competence_needs to authenticated;

grant select (id, need_id, competency_id, importance, context, created_at)
  on public.need_competencies to authenticated;
grant insert (need_id, competency_id, importance, context) on public.need_competencies to authenticated;
grant update (importance, context) on public.need_competencies to authenticated;
grant delete on public.need_competencies to authenticated;

grant select (id, need_id, matched_profile_id, relevance_band, status, calculated_at, created_at, updated_at)
  on public.matches to authenticated;
grant update (status) on public.matches to authenticated;

grant select (id, match_id, reason_type, competency_id, evidence_id, explanation, created_at)
  on public.match_reasons to authenticated;

grant select (id, match_id, feedback_type, note, created_at) on public.match_feedback to authenticated;
grant insert (match_id, created_by, feedback_type, note) on public.match_feedback to authenticated;
grant select on public.discoverable_member_competencies to authenticated;
grant select on public.member_match_reasons to authenticated;
grant select on public.member_match_feedback to authenticated;

create policy competence_needs_select_owner_network_or_matched
on public.competence_needs for select to authenticated
using (
  owner_profile_id = auth.uid()
  or (status = 'active' and (expires_at is null or expires_at > now()) and visibility = 'network')
  or public.is_need_match_participant(id)
);

create policy competence_needs_insert_owner_draft
on public.competence_needs for insert to authenticated
with check (owner_profile_id = auth.uid() and status = 'draft');

create policy competence_needs_update_owner
on public.competence_needs for update to authenticated
using (owner_profile_id = auth.uid())
with check (owner_profile_id = auth.uid());

create policy competence_needs_delete_owner
on public.competence_needs for delete to authenticated
using (owner_profile_id = auth.uid() and status in ('draft', 'paused', 'archived'));

create policy need_competencies_select_authorized_need
on public.need_competencies for select to authenticated
using (
  public.is_need_owner(need_id)
  or public.is_need_match_participant(need_id)
  or exists (
    select 1 from public.competence_needs n
    where n.id = need_id and n.status = 'active'
      and (n.expires_at is null or n.expires_at > now())
      and n.visibility = 'network'
  )
);

create policy need_competencies_insert_owner_draft_or_paused
on public.need_competencies for insert to authenticated
with check (
  public.is_need_owner(need_id)
  and exists (select 1 from public.competence_needs n where n.id = need_id and n.status in ('draft', 'paused'))
);

create policy need_competencies_update_owner_draft_or_paused
on public.need_competencies for update to authenticated
using (public.is_need_owner(need_id))
with check (
  public.is_need_owner(need_id)
  and exists (select 1 from public.competence_needs n where n.id = need_id and n.status in ('draft', 'paused'))
);

create policy need_competencies_delete_owner_draft_or_paused
on public.need_competencies for delete to authenticated
using (
  public.is_need_owner(need_id)
  and exists (select 1 from public.competence_needs n where n.id = need_id and n.status in ('draft', 'paused'))
);

create policy matches_select_participants
on public.matches for select to authenticated
using (matched_profile_id = auth.uid() or public.is_need_owner(need_id));

create policy matches_update_need_owner
on public.matches for update to authenticated
using (public.is_need_owner(need_id))
with check (
  public.is_need_owner(need_id)
  and status in ('new', 'viewed', 'saved', 'dismissed', 'expired')
);

create policy match_reasons_select_match_participants
on public.match_reasons for select to authenticated
using (public.can_read_match(match_id));

create policy match_feedback_select_creator
on public.match_feedback for select to authenticated
using (created_by = auth.uid());

create policy match_feedback_insert_participant
on public.match_feedback for insert to authenticated
with check (created_by = auth.uid() and public.can_read_match(match_id));

create policy match_feedback_delete_creator
on public.match_feedback for delete to authenticated
using (created_by = auth.uid());
