begin;

-- Events, attendee authorisation and protected attendee materials.
-- Access rules:
--   * Public event information is readable by anyone when the event is published.
--   * Attendee materials are readable only by an approved attendee or the event manager.
--   * Holding an account, or knowing an event slug or share code, never grants material access.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 2000),
  location text not null default '' check (char_length(location) <= 200),
  starts_at timestamptz,
  ends_at timestamptz,
  is_published boolean not null default false,
  manager_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index events_manager_idx on public.events (manager_profile_id);

create type public.event_attendee_status as enum ('requested', 'approved', 'revoked');

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.event_attendee_status not null default 'requested',
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id),
  check ((status = 'requested') = (decided_at is null))
);

create index event_attendees_profile_idx on public.event_attendees (profile_id, status);

create type public.event_material_kind as enum ('presentation', 'guide', 'replay');

create table public.event_materials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind public.event_material_kind not null,
  title text not null check (char_length(title) between 1 and 160),
  -- Object path inside the private 'event-materials' bucket; first folder is the event id.
  storage_path text not null unique check (char_length(storage_path) <= 400),
  created_at timestamptz not null default now()
);

create index event_materials_event_idx on public.event_materials (event_id, kind);

-- Authorisation predicates ---------------------------------------------------

create function public.is_event_manager(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.manager_profile_id = auth.uid()
  );
$$;

create function public.has_approved_event_access(target_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.manager_profile_id = auth.uid()
  ) or exists (
    select 1 from public.event_attendees a
    where a.event_id = target_event_id
      and a.profile_id = auth.uid()
      and a.status = 'approved'
  );
$$;

-- Row level security ---------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_materials enable row level security;

-- Published events are public information; unpublished events are manager-only.
create policy events_public_select
on public.events for select to anon, authenticated
using (is_published or manager_profile_id = auth.uid());

create policy events_manager_insert
on public.events for insert to authenticated
with check (manager_profile_id = auth.uid());

create policy events_manager_update
on public.events for update to authenticated
using (manager_profile_id = auth.uid())
with check (manager_profile_id = auth.uid());

-- A member may see and request their own attendance; the manager sees all rows.
create policy event_attendees_self_select
on public.event_attendees for select to authenticated
using (profile_id = auth.uid() or public.is_event_manager(event_id));

create policy event_attendees_self_request
on public.event_attendees for insert to authenticated
with check (
  profile_id = auth.uid()
  and status = 'requested'
  and decided_at is null
  and exists (select 1 from public.events e where e.id = event_id and e.is_published)
);

-- Only the manager decides attendance. Members cannot approve themselves.
create policy event_attendees_manager_decide
on public.event_attendees for update to authenticated
using (public.is_event_manager(event_id))
with check (public.is_event_manager(event_id));

create policy event_attendees_manager_delete
on public.event_attendees for delete to authenticated
using (public.is_event_manager(event_id));

-- Material metadata is visible only to approved attendees and the manager.
create policy event_materials_approved_select
on public.event_materials for select to authenticated
using (public.has_approved_event_access(event_id));

create policy event_materials_manager_write
on public.event_materials for all to authenticated
using (public.is_event_manager(event_id))
with check (public.is_event_manager(event_id));

-- Protected storage ----------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('event-materials', 'event-materials', false)
on conflict (id) do nothing;

-- The underlying objects are protected, not merely the pages that link to them.
create policy event_materials_objects_read
on storage.objects for select to authenticated
using (
  bucket_id = 'event-materials'
  and public.has_approved_event_access(((storage.foldername(name))[1])::uuid)
);

create policy event_materials_objects_write
on storage.objects for all to authenticated
using (
  bucket_id = 'event-materials'
  and public.is_event_manager(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'event-materials'
  and public.is_event_manager(((storage.foldername(name))[1])::uuid)
);

revoke all on function public.is_event_manager(uuid) from public, anon;
revoke all on function public.has_approved_event_access(uuid) from public, anon;
grant execute on function public.is_event_manager(uuid) to authenticated;
grant execute on function public.has_approved_event_access(uuid) to authenticated;

grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;
grant select, insert, update, delete on public.event_materials to authenticated;

commit;
