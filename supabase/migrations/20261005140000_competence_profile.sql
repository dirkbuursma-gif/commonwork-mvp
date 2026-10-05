create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  professional_summary text not null default '' check (char_length(professional_summary) <= 1200),
  what_i_contribute text not null default '' check (char_length(what_i_contribute) <= 2000),
  what_i_am_exploring text not null default '' check (char_length(what_i_am_exploring) <= 2000),
  profile_visibility text not null default 'private'
    check (profile_visibility in ('private', 'members')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null
    check (category in ('knowledge', 'practical_capability', 'way_of_working')),
  description text not null default '' check (char_length(description) <= 600),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);

create table public.profile_competencies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  competency_id uuid not null references public.competencies (id) on delete restrict,
  member_statement text not null default '' check (char_length(member_statement) <= 1200),
  evidence_status text not null default 'declared'
    check (evidence_status in ('declared', 'demonstrated')),
  discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, competency_id)
);

create table public.competence_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_competency_id uuid not null
    references public.profile_competencies (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  context text not null check (char_length(btrim(context)) between 2 and 2000),
  contribution text not null check (char_length(btrim(contribution)) between 2 and 2000),
  outcome text not null check (char_length(btrim(outcome)) between 2 and 2000),
  evidence_url text check (evidence_url is null or char_length(evidence_url) <= 2048),
  visibility text not null default 'matches_only'
    check (visibility in ('private', 'matches_only', 'members')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  open_to_peer_exchange boolean not null default false,
  open_to_advisory boolean not null default false,
  open_to_projects boolean not null default false,
  open_to_partnerships boolean not null default false,
  open_to_opportunities boolean not null default false,
  open_to_event_introductions boolean not null default false,
  commercial_approaches boolean not null default false,
  availability_status text not null default 'unavailable'
    check (availability_status in ('open', 'selective', 'introductions_only', 'unavailable')),
  conversation_capacity integer not null default 0 check (conversation_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competency_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null
    check (category in ('knowledge', 'practical_capability', 'way_of_working')),
  explanation text not null check (char_length(btrim(explanation)) between 2 and 600),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profile_competencies_profile_idx on public.profile_competencies (profile_id);
create index profile_competencies_competency_idx on public.profile_competencies (competency_id);
create index competence_evidence_profile_competency_idx on public.competence_evidence (profile_competency_id);
create index competency_suggestions_profile_idx on public.competency_suggestions (profile_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger profile_competencies_set_updated_at
before update on public.profile_competencies
for each row execute function public.set_updated_at();

create trigger competence_evidence_set_updated_at
before update on public.competence_evidence
for each row execute function public.set_updated_at();

create function public.sync_competence_evidence_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profile_competencies
    set evidence_status = 'demonstrated'
    where id = new.profile_competency_id
      and evidence_status = 'declared';
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not exists (
      select 1 from public.competence_evidence
      where profile_competency_id = old.profile_competency_id
    ) then
      update public.profile_competencies
      set evidence_status = 'declared'
      where id = old.profile_competency_id
        and evidence_status = 'demonstrated';
    end if;
    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.sync_competence_evidence_status() from public, anon, authenticated;

create trigger competence_evidence_sync_status
after insert or delete on public.competence_evidence
for each row execute function public.sync_competence_evidence_status();

create trigger contact_preferences_set_updated_at
before update on public.contact_preferences
for each row execute function public.set_updated_at();

create trigger competency_suggestions_set_updated_at
before update on public.competency_suggestions
for each row execute function public.set_updated_at();

create function public.refresh_profile_onboarding_completion(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_complete boolean;
begin
  select
    char_length(btrim(p.display_name)) > 0
    and char_length(btrim(p.professional_summary)) > 0
    and char_length(btrim(p.what_i_contribute)) > 0
    and exists (
      select 1 from public.profile_competencies pc
      where pc.profile_id = p.id
    )
    and exists (
      select 1
      from public.profile_competencies pc
      join public.competence_evidence ce on ce.profile_competency_id = pc.id
      where pc.profile_id = p.id
    )
    and exists (
      select 1 from public.contact_preferences cp
      where cp.profile_id = p.id
    )
  into is_complete
  from public.profiles p
  where p.id = target_profile_id;

  if not found then
    return;
  end if;

  update public.profiles
  set onboarding_completed = coalesce(is_complete, false)
  where id = target_profile_id
    and onboarding_completed is distinct from coalesce(is_complete, false);
end;
$$;

create function public.refresh_onboarding_from_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
begin
  if tg_table_name = 'profiles' then
    target_profile_id := coalesce(new.id, old.id);
  elsif tg_table_name in ('profile_competencies', 'contact_preferences') then
    target_profile_id := coalesce(new.profile_id, old.profile_id);
  elsif tg_table_name = 'competence_evidence' then
    if tg_op = 'DELETE' then
      select pc.profile_id into target_profile_id
      from public.profile_competencies pc
      where pc.id = old.profile_competency_id;
    else
      select pc.profile_id into target_profile_id
      from public.profile_competencies pc
      where pc.id = new.profile_competency_id;
    end if;
  end if;

  if target_profile_id is not null then
    perform public.refresh_profile_onboarding_completion(target_profile_id);
  end if;

  return null;
end;
$$;

create trigger profiles_refresh_onboarding
after insert or update on public.profiles
for each row execute function public.refresh_onboarding_from_change();

create trigger profile_competencies_refresh_onboarding
after insert or update or delete on public.profile_competencies
for each row execute function public.refresh_onboarding_from_change();

create trigger competence_evidence_refresh_onboarding
after insert or update or delete on public.competence_evidence
for each row execute function public.refresh_onboarding_from_change();

create trigger contact_preferences_refresh_onboarding
after insert or update or delete on public.contact_preferences
for each row execute function public.refresh_onboarding_from_change();

create function public.get_my_profile()
returns table (
  id uuid,
  display_name text,
  professional_summary text,
  what_i_contribute text,
  what_i_am_exploring text,
  profile_visibility text,
  onboarding_completed boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.professional_summary, p.what_i_contribute,
         p.what_i_am_exploring, p.profile_visibility, p.onboarding_completed,
         p.created_at, p.updated_at
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.refresh_profile_onboarding_completion(uuid) from public, anon, authenticated;
revoke all on function public.refresh_onboarding_from_change() from public, anon, authenticated;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create view public.discoverable_profiles
with (security_barrier = true)
as
  select p.id, p.display_name, p.professional_summary,
         p.what_i_contribute, p.what_i_am_exploring
  from public.profiles p
  where p.profile_visibility = 'members'
    and p.onboarding_completed = true;

comment on view public.discoverable_profiles is
  'Safe member-facing profile projection. Intentionally excludes onboarding state, preferences, email and private evidence.';

create view public.discoverable_contact_preferences
with (security_barrier = true)
as
  select cp.profile_id, cp.open_to_peer_exchange, cp.open_to_advisory,
         cp.open_to_projects, cp.open_to_partnerships, cp.open_to_opportunities,
         cp.open_to_event_introductions, cp.availability_status, cp.conversation_capacity
  from public.contact_preferences cp
  join public.profiles p on p.id = cp.profile_id
  where p.profile_visibility = 'members'
    and p.onboarding_completed = true;

comment on view public.discoverable_contact_preferences is
  'Safe member-facing opt-in contact projection. Excludes commercial_approaches and all private profile settings.';

alter table public.profiles enable row level security;
alter table public.competencies enable row level security;
alter table public.profile_competencies enable row level security;
alter table public.competence_evidence enable row level security;
alter table public.contact_preferences enable row level security;
alter table public.competency_suggestions enable row level security;

alter table public.profiles force row level security;
alter table public.competencies force row level security;
alter table public.profile_competencies force row level security;
alter table public.competence_evidence force row level security;
alter table public.contact_preferences force row level security;
alter table public.competency_suggestions force row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.competencies from anon, authenticated;
revoke all on public.profile_competencies from anon, authenticated;
revoke all on public.competence_evidence from anon, authenticated;
revoke all on public.contact_preferences from anon, authenticated;
revoke all on public.competency_suggestions from anon, authenticated;
revoke all on public.discoverable_profiles from anon, authenticated;
revoke all on public.discoverable_contact_preferences from anon, authenticated;

grant select (id) on public.profiles to authenticated;
grant insert (id, display_name, professional_summary, what_i_contribute, what_i_am_exploring, profile_visibility)
  on public.profiles to authenticated;
grant update (display_name, professional_summary, what_i_contribute, what_i_am_exploring, profile_visibility)
  on public.profiles to authenticated;
grant select on public.discoverable_profiles to authenticated;
grant select on public.discoverable_contact_preferences to authenticated;

grant select on public.competencies to authenticated;
grant select on public.profile_competencies to authenticated;
grant insert (profile_id, competency_id, member_statement, evidence_status, discoverable)
  on public.profile_competencies to authenticated;
grant update (member_statement, evidence_status, discoverable)
  on public.profile_competencies to authenticated;
grant delete on public.profile_competencies to authenticated;

grant select on public.competence_evidence to authenticated;
grant insert (profile_competency_id, title, context, contribution, outcome, evidence_url, visibility)
  on public.competence_evidence to authenticated;
grant update (title, context, contribution, outcome, evidence_url, visibility)
  on public.competence_evidence to authenticated;
grant delete on public.competence_evidence to authenticated;

grant select on public.contact_preferences to authenticated;
grant insert (profile_id, open_to_peer_exchange, open_to_advisory, open_to_projects,
  open_to_partnerships, open_to_opportunities, open_to_event_introductions,
  commercial_approaches, availability_status, conversation_capacity)
  on public.contact_preferences to authenticated;
grant update (open_to_peer_exchange, open_to_advisory, open_to_projects,
  open_to_partnerships, open_to_opportunities, open_to_event_introductions,
  commercial_approaches, availability_status, conversation_capacity)
  on public.contact_preferences to authenticated;

grant select (id, profile_id, name, category, explanation, status, created_at)
  on public.competency_suggestions to authenticated;
grant insert (profile_id, name, category, explanation)
  on public.competency_suggestions to authenticated;

create policy profiles_select_owner_or_discoverable_id
on public.profiles for select to authenticated
using (id = auth.uid() or (profile_visibility = 'members' and onboarding_completed));

create policy profiles_insert_owner_incomplete
on public.profiles for insert to authenticated
with check (id = auth.uid() and onboarding_completed = false);

create policy profiles_update_owner
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy competencies_read_active
on public.competencies for select to authenticated
using (status = 'active');

create policy profile_competencies_select_owner_or_discoverable
on public.profile_competencies for select to authenticated
using (
  profile_id = auth.uid()
  or (
    discoverable
    and exists (select 1 from public.discoverable_profiles dp where dp.id = profile_id)
  )
);

create policy profile_competencies_insert_owner
on public.profile_competencies for insert to authenticated
with check (profile_id = auth.uid());

create policy profile_competencies_update_owner
on public.profile_competencies for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy profile_competencies_delete_owner
on public.profile_competencies for delete to authenticated
using (profile_id = auth.uid());

create policy competence_evidence_select_owner_or_members
on public.competence_evidence for select to authenticated
using (
  exists (
    select 1 from public.profile_competencies pc
    where pc.id = profile_competency_id and pc.profile_id = auth.uid()
  )
  or (
    visibility = 'members'
    and exists (
      select 1
      from public.profile_competencies pc
      join public.discoverable_profiles dp on dp.id = pc.profile_id
      where pc.id = profile_competency_id and pc.discoverable
    )
  )
);

create policy competence_evidence_insert_owner
on public.competence_evidence for insert to authenticated
with check (
  exists (
    select 1 from public.profile_competencies pc
    where pc.id = profile_competency_id and pc.profile_id = auth.uid()
  )
);

create policy competence_evidence_update_owner
on public.competence_evidence for update to authenticated
using (
  exists (
    select 1 from public.profile_competencies pc
    where pc.id = profile_competency_id and pc.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profile_competencies pc
    where pc.id = profile_competency_id and pc.profile_id = auth.uid()
  )
);

create policy competence_evidence_delete_owner
on public.competence_evidence for delete to authenticated
using (
  exists (
    select 1 from public.profile_competencies pc
    where pc.id = profile_competency_id and pc.profile_id = auth.uid()
  )
);

create policy contact_preferences_owner_all
on public.contact_preferences for all to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy competency_suggestions_select_owner
on public.competency_suggestions for select to authenticated
using (profile_id = auth.uid());

create policy competency_suggestions_insert_owner_pending
on public.competency_suggestions for insert to authenticated
with check (profile_id = auth.uid() and status = 'pending');

grant usage on schema public to authenticated;
