begin;

create table public.profile_product_affiliations (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  role_title text not null default '' check (char_length(role_title) <= 160),
  consent_given boolean not null default false,
  consented_at timestamptz,
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  primary key (profile_id, provider_product_id),
  check (consent_given = (consented_at is not null)),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null))
);

create index profile_product_affiliations_product_idx
  on public.profile_product_affiliations (provider_product_id);

-- A product affiliation is valid only when the member is also affiliated with an
-- organisation that represents the product's provider, so the claim is never ambiguous.
create function public.validate_profile_product_affiliation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.provider_products pp
    join public.organisations o on o.provider_id = pp.provider_id
    join public.profile_organisations po on po.organisation_id = o.id
    where pp.id = new.provider_product_id
      and po.profile_id = new.profile_id
  ) then
    raise exception 'The member must be affiliated with the organisation that represents this product''s provider.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profile_product_affiliations_validate
before insert or update of profile_id, provider_product_id on public.profile_product_affiliations
for each row execute function public.validate_profile_product_affiliation();

alter table public.profile_product_affiliations enable row level security;
alter table public.profile_product_affiliations force row level security;

-- Like other affiliation records, writes are curator-only so members cannot self-declare one.
revoke all on public.profile_product_affiliations from public, anon, authenticated;
grant select on public.profile_product_affiliations to authenticated;
grant all on public.profile_product_affiliations to service_role;

create policy profile_product_affiliations_own_or_consented_read
on public.profile_product_affiliations for select to authenticated
using (
  profile_id = (select auth.uid())
  or (
    consent_given
    and exists (select 1 from public.discoverable_profiles dp where dp.id = profile_product_affiliations.profile_id)
    and exists (
      select 1
      from public.provider_products pp
      join public.provider_publication_status product_status
        on product_status.provider_product_id = pp.id and product_status.status = 'published'
      join public.provider_publication_status provider_status
        on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
      where pp.id = profile_product_affiliations.provider_product_id
    )
  )
);

revoke all on function public.validate_profile_product_affiliation() from public, anon, authenticated;

comment on table public.profile_product_affiliations is
  'Curator-managed, consent-gated affiliation of a member with one provider product, for retailer-facing disclosure.';

commit;
