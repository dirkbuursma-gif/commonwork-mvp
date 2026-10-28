begin;

create type public.member_avatar_id as enum (
  'initials', 'compass', 'leaf', 'orbit', 'wave', 'spark', 'grid', 'sun'
);
revoke all on type public.member_avatar_id from public, anon, authenticated;
grant usage on type public.member_avatar_id to authenticated, service_role;

alter table public.profiles
  add column avatar_id public.member_avatar_id not null default 'initials',
  add column username text,
  add constraint profiles_username_canonical check (
    username is null or (
      username = pg_catalog.lower(pg_catalog.btrim(username))
      and pg_catalog.char_length(username) between 3 and 30
      and username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
  );

create unique index profiles_username_lower_idx
  on public.profiles (pg_catalog.lower(username)) where username is not null;

create table public.reserved_usernames (
  username text primary key check (
    username = pg_catalog.lower(username)
    and pg_catalog.char_length(username) between 3 and 30
    and username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  reason text not null
);

insert into public.reserved_usernames (username, reason) values
  ('admin', 'system route'), ('api', 'system route'), ('auth', 'system route'),
  ('sign-in', 'system route'), ('sign-out', 'system route'), ('today', 'workspace route'),
  ('profiles', 'system route'), ('introductions', 'workspace route'), ('events', 'workspace route'),
  ('find', 'workspace route'), ('catalogue', 'public route'), ('intelligence', 'system route'),
  ('about', 'public route'), ('insights', 'public route'), ('discover', 'public route'),
  ('account', 'system route'), ('onboarding', 'system route'), ('settings', 'system route'),
  ('privacy', 'system route'), ('notifications', 'system route'), ('product', 'catalogue route'),
  ('provider', 'catalogue route'), ('category', 'catalogue route'), ('profile', 'member route'),
  ('introduction', 'member route'), ('event', 'event route'),
  ('new', 'route segment'), ('edit', 'route segment'), ('following', 'future feature'),
  ('updates', 'future feature'), ('contact', 'navigation'), ('support', 'navigation'), ('help', 'navigation'),
  ('www', 'host name'), ('commonwork', 'brand'), ('administrator', 'role name'),
  ('moderator', 'role name'), ('system', 'system name');

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from public, anon, authenticated;
grant all on public.reserved_usernames to service_role;

create function public.guard_profile_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.username is not null then
      raise exception 'Usernames must be claimed through the identity RPC.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.username is distinct from old.username then
    if old.username is not null or new.username is null then
      raise exception 'A claimed username cannot be changed or cleared.' using errcode = '23514';
    end if;
    if pg_catalog.current_setting('app.member_identity_username_claim', true) is distinct from 'true'
      or auth.uid() is distinct from new.id
      or public.can_access_member_workspace() is not true then
      raise exception 'Username claims must use the member identity flow.' using errcode = '42501';
    end if;
    if new.username <> pg_catalog.lower(pg_catalog.btrim(new.username))
      or pg_catalog.char_length(new.username) not between 3 and 30
      or new.username !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Username format is invalid.' using errcode = '22023';
    end if;
    if exists (select 1 from public.reserved_usernames r where r.username = new.username) then
      raise exception 'Username is reserved.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_username() from public, anon, authenticated;
create trigger profiles_username_insert_guard
before insert on public.profiles
for each row execute function public.guard_profile_username();
create trigger profiles_username_update_guard
before update of username on public.profiles
for each row execute function public.guard_profile_username();

-- Preserve existing profile edits while preventing direct authenticated handle writes.
revoke insert (username), update (username) on public.profiles from public, anon, authenticated;
revoke update (display_name) on public.profiles from public, anon, authenticated;

create or replace function public.refresh_onboarding_from_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile_id uuid;
begin
  if tg_table_name = 'profiles'
    and pg_catalog.current_setting('app.member_identity_write', true) is distinct from 'true' then
    target_profile_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'profiles' then
    return null;
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

create function public.get_my_identity()
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_id public.member_avatar_id
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select p.id, p.display_name, p.username, p.avatar_id
  from public.profiles p
  where p.id = actor_id;
end;
$$;

create function public.save_my_identity(
  target_display_name text,
  target_avatar_id text,
  target_username text
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_id public.member_avatar_id
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_display_name text := pg_catalog.btrim(coalesce(target_display_name, ''));
  clean_username text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(target_username, ''))), '');
  selected_avatar public.member_avatar_id;
  current_username text;
begin
  if actor_id is null or public.can_access_member_workspace() is not true then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  if pg_catalog.char_length(clean_display_name) < 1 or pg_catalog.char_length(clean_display_name) > 120 then
    raise exception 'Display name must be between 1 and 120 characters.' using errcode = '22023';
  end if;
  if target_avatar_id is null or target_avatar_id not in ('initials', 'compass', 'leaf', 'orbit', 'wave', 'spark', 'grid', 'sun') then
    raise exception 'Choose a supported avatar.' using errcode = '22023';
  end if;
  selected_avatar := target_avatar_id::public.member_avatar_id;
  perform pg_catalog.set_config('app.member_identity_write', 'true', true);

  -- Serialize first claims by one account, including first profile creation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text, 0));
  insert into public.profiles (id, display_name, avatar_id, onboarding_completed)
  values (actor_id, clean_display_name, selected_avatar, false)
  on conflict (id) do nothing;

  select p.username into current_username
  from public.profiles p
  where p.id = actor_id
  for update;

  if clean_username is not null then
    if pg_catalog.char_length(clean_username) < 3 or pg_catalog.char_length(clean_username) > 30
      or clean_username !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Username format is invalid.' using errcode = '22023';
    end if;
    if exists (select 1 from public.reserved_usernames r where r.username = clean_username) then
      raise exception 'Username is reserved.' using errcode = '22023';
    end if;
    if current_username is not null and current_username <> clean_username then
      raise exception 'A claimed username cannot be changed.' using errcode = '23514';
    end if;
    if current_username is null then
      perform pg_catalog.set_config('app.member_identity_username_claim', 'true', true);
      begin
        update public.profiles p set username = clean_username
        where p.id = actor_id and p.username is null;
      exception when unique_violation then
        raise exception 'Username is unavailable.' using errcode = '23505';
      end;
      if not found then
        raise exception 'Username is unavailable.' using errcode = '23505';
      end if;
    end if;
  end if;

  update public.profiles p
  set display_name = clean_display_name,
      avatar_id = selected_avatar
  where p.id = actor_id;

  return query
  select p.id, p.display_name, p.username, p.avatar_id
  from public.profiles p
  where p.id = actor_id;
end;
$$;

revoke all on function public.get_my_identity() from public, anon, authenticated;
revoke all on function public.save_my_identity(text, text, text) from public, anon, authenticated;
grant execute on function public.get_my_identity() to authenticated;
grant execute on function public.save_my_identity(text, text, text) to authenticated;

create or replace view public.discoverable_profiles
with (security_barrier = true)
as
  select p.id, p.display_name, p.professional_summary,
         p.what_i_contribute, p.what_i_am_exploring,
         p.base_country_code, p.markets_served, p.username, p.avatar_id
  from public.profiles p
  where p.profile_visibility = 'members'
    and p.onboarding_completed = true
    and (select public.can_access_member_workspace());

create or replace view public.available_connectors
with (security_barrier = true)
as
  select c.profile_id, p.display_name, p.professional_summary, p.what_i_contribute,
         p.username, p.avatar_id
  from public.connectors c
  join public.discoverable_profiles p on p.id = c.profile_id
  where c.status = 'active' and c.introduction_capacity > 0;

comment on column public.profiles.username is
  'Optional, initial-only public handle. Stable identity remains profiles.id; handle is never inferred from authentication email.';
comment on column public.profiles.avatar_id is
  'Built-in avatar enum. No uploaded or remote images are stored.';

commit;
