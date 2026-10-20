begin;

-- One reusable configuration record per event. Never store the plaintext code.
create table public.event_access_codes (
  event_id uuid primary key references public.events(id) on delete cascade,
  code_salt text not null check (code_salt ~ '^[A-Za-z0-9_-]{22}$'),
  code_hash text not null check (code_hash ~ '^[A-Za-z0-9_-]{43}$'),
  version uuid not null default gen_random_uuid(),
  enabled boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rotation/disable/re-enable invalidates all previously issued event passes.
create function public.rotate_event_access_code_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.code_hash, new.code_salt, new.enabled, new.expires_at)
     is distinct from (old.code_hash, old.code_salt, old.enabled, old.expires_at) then
    new.version := gen_random_uuid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger event_access_code_version before update on public.event_access_codes
for each row execute function public.rotate_event_access_code_version();

create table public.event_access_attempts (
  event_id uuid not null references public.events(id) on delete cascade,
  bucket_hash text not null check (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  primary key (event_id, bucket_hash, window_started_at)
);
create index event_access_attempt_expiry on public.event_access_attempts(expires_at);

create function public.consume_event_access_attempt(
  target_event_id uuid, target_bucket_hash text, target_limit integer, target_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare window_start timestamptz; consumed integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server-only event access.' using errcode = '42501';
  end if;
  if target_event_id is null or target_bucket_hash is null or target_bucket_hash !~ '^[a-f0-9]{64}$'
     or target_limit is null or target_limit not between 1 and 100
     or target_window_seconds is null or target_window_seconds not between 10 and 86400 then
    raise exception 'Invalid event access attempt.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events e join public.event_access_codes c on c.event_id = e.id
    where e.id = target_event_id and e.is_published and c.enabled and (c.expires_at is null or c.expires_at > now())) then
    return false;
  end if;
  window_start := to_timestamp(floor(extract(epoch from now()) / target_window_seconds) * target_window_seconds);
  insert into public.event_access_attempts(event_id, bucket_hash, window_started_at, request_count, expires_at)
  values (target_event_id, target_bucket_hash, window_start, 1, window_start + make_interval(secs => target_window_seconds))
  on conflict (event_id, bucket_hash, window_started_at) do update
    set request_count = event_access_attempts.request_count + 1
    where event_access_attempts.request_count < target_limit
  returning request_count into consumed;
  return consumed is not null;
end;
$$;

alter table public.event_access_codes enable row level security;
alter table public.event_access_codes force row level security;
alter table public.event_access_attempts enable row level security;
alter table public.event_access_attempts force row level security;
revoke all on public.event_access_codes, public.event_access_attempts from public, anon, authenticated;
grant all on public.event_access_codes, public.event_access_attempts to service_role;
revoke all on function public.rotate_event_access_code_version() from public, anon, authenticated;
revoke all on function public.consume_event_access_attempt(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_event_access_attempt(uuid, text, integer, integer) to service_role;

-- No codes/accounts are created. Existing attendee, workspace and Storage policies are unchanged.
commit;
