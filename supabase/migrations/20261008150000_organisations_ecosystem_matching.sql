begin;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  organisation_type text not null
    check (organisation_type in ('retailer', 'vendor', 'si_gtm', 'advisor', 'other')),
  summary text not null default '' check (char_length(summary) <= 1600),
  provider_id uuid references public.providers (id) on delete set null,
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  check (provider_id is null or organisation_type = 'vendor')
);

create index organisations_provider_idx on public.organisations (provider_id) where provider_id is not null;

create table public.profile_organisations (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  role_title text not null default '' check (char_length(role_title) <= 160),
  is_primary boolean not null default true,
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  primary key (profile_id, organisation_id)
);

create unique index profile_organisations_one_primary_idx
  on public.profile_organisations (profile_id) where is_primary;
create index profile_organisations_org_idx on public.profile_organisations (organisation_id);

create table public.product_competency_links (
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  competency_id uuid not null references public.competencies (id) on delete restrict,
  relationship_type text not null default 'related' check (relationship_type in ('related', 'expertise', 'common_need')),
  relevance_note text not null default '' check (char_length(relevance_note) <= 1000),
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  primary key (provider_product_id, competency_id)
);

create table public.organisation_competency_links (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  competency_id uuid not null references public.competencies (id) on delete restrict,
  relevance_note text not null default '' check (char_length(relevance_note) <= 1000),
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  primary key (organisation_id, competency_id)
);

create table public.organisation_product_links (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  relationship_type text not null default 'implements' check (relationship_type in ('implements', 'certified_on', 'integrates')),
  evidence_note text not null default '' check (char_length(evidence_note) <= 1000),
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  primary key (organisation_id, provider_product_id)
);

alter table public.competence_needs
  add column retailer_organisation_id uuid references public.organisations (id) on delete set null,
  add column retailer_segment text not null default '' check (char_length(retailer_segment) <= 160),
  add column current_stack_note text not null default '' check (char_length(current_stack_note) <= 1500),
  add column project_context text not null default '' check (char_length(project_context) <= 1500);

create function public.validate_need_retailer_organisation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.retailer_organisation_id is not null and not exists (
    select 1
    from public.profile_organisations po
    join public.organisations o on o.id = po.organisation_id
    where po.profile_id = new.owner_profile_id
      and po.organisation_id = new.retailer_organisation_id
      and o.organisation_type = 'retailer'
  ) then
    raise exception 'The retailer organisation must be one the need owner belongs to.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger competence_needs_validate_retailer_organisation
before insert or update of retailer_organisation_id, owner_profile_id on public.competence_needs
for each row execute function public.validate_need_retailer_organisation();

alter table public.organisations enable row level security;
alter table public.profile_organisations enable row level security;
alter table public.product_competency_links enable row level security;
alter table public.organisation_competency_links enable row level security;
alter table public.organisation_product_links enable row level security;
alter table public.organisations force row level security;
alter table public.profile_organisations force row level security;
alter table public.product_competency_links force row level security;
alter table public.organisation_competency_links force row level security;
alter table public.organisation_product_links force row level security;

-- Organisation records and affiliations are curator-managed in the pilot so a member
-- cannot self-declare a vendor or partner affiliation.
revoke all on public.organisations, public.profile_organisations, public.product_competency_links,
  public.organisation_competency_links, public.organisation_product_links
  from public, anon, authenticated;
grant select on public.organisations, public.profile_organisations, public.product_competency_links,
  public.organisation_competency_links, public.organisation_product_links to authenticated;
grant all on public.organisations, public.profile_organisations, public.product_competency_links,
  public.organisation_competency_links, public.organisation_product_links to service_role;

create policy organisations_member_read
on public.organisations for select to authenticated
using (true);

create policy profile_organisations_own_or_discoverable_read
on public.profile_organisations for select to authenticated
using (
  profile_id = (select auth.uid())
  or exists (select 1 from public.discoverable_profiles dp where dp.id = profile_organisations.profile_id)
);

create policy product_competency_links_published_read
on public.product_competency_links for select to authenticated
using (exists (
  select 1
  from public.provider_products pp
  join public.provider_publication_status product_status
    on product_status.provider_product_id = pp.id and product_status.status = 'published'
  join public.provider_publication_status provider_status
    on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
  where pp.id = product_competency_links.provider_product_id
));

create policy organisation_competency_links_member_read
on public.organisation_competency_links for select to authenticated
using (true);

create policy organisation_product_links_published_read
on public.organisation_product_links for select to authenticated
using (exists (
  select 1
  from public.provider_products pp
  join public.provider_publication_status product_status
    on product_status.provider_product_id = pp.id and product_status.status = 'published'
  join public.provider_publication_status provider_status
    on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
  where pp.id = organisation_product_links.provider_product_id
));

grant select (retailer_organisation_id, retailer_segment, current_stack_note, project_context)
  on public.competence_needs to authenticated;
grant insert (retailer_organisation_id, retailer_segment, current_stack_note, project_context)
  on public.competence_needs to authenticated;
grant update (retailer_organisation_id, retailer_segment, current_stack_note, project_context)
  on public.competence_needs to authenticated;

create function public.get_need_product_suggestions(target_need_id uuid)
returns table (
  provider_product_id uuid,
  product_slug text,
  product_name text,
  provider_name text,
  evidence_maturity text,
  essential_matches integer,
  useful_matches integer,
  matched_competencies text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.slug, pp.name, p.name, pp.evidence_maturity,
         count(*) filter (where nc.importance = 'essential')::integer,
         count(*) filter (where nc.importance = 'useful')::integer,
         array_agg(c.name order by c.name)
  from public.competence_needs n
  join public.need_competencies nc on nc.need_id = n.id
  join public.competencies c on c.id = nc.competency_id
  join public.product_competency_links pcl on pcl.competency_id = nc.competency_id
  join public.provider_products pp on pp.id = pcl.provider_product_id
  join public.providers p on p.id = pp.provider_id
  join public.provider_publication_status product_status
    on product_status.provider_product_id = pp.id and product_status.status = 'published'
  join public.provider_publication_status provider_status
    on provider_status.provider_id = p.id and provider_status.status = 'published'
  where n.id = target_need_id
    and n.owner_profile_id = auth.uid()
  group by pp.id, pp.slug, pp.name, p.name, pp.evidence_maturity
  order by 6 desc, 7 desc, pp.name
  limit 12
$$;

create function public.get_need_partner_suggestions(target_need_id uuid)
returns table (
  organisation_id uuid,
  organisation_slug text,
  organisation_name text,
  summary text,
  essential_matches integer,
  useful_matches integer,
  matched_competencies text[],
  implements_products text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select n.id from public.competence_needs n
    where n.id = target_need_id and n.owner_profile_id = auth.uid()
  ),
  skills as (
    select o.id as organisation_id,
           count(*) filter (where nc.importance = 'essential')::integer as essential_matches,
           count(*) filter (where nc.importance = 'useful')::integer as useful_matches,
           array_agg(c.name order by c.name) as matched_competencies
    from owned
    join public.need_competencies nc on nc.need_id = owned.id
    join public.competencies c on c.id = nc.competency_id
    join public.organisation_competency_links ocl on ocl.competency_id = nc.competency_id
    join public.organisations o on o.id = ocl.organisation_id and o.organisation_type = 'si_gtm'
    group by o.id
  ),
  products as (
    select opl.organisation_id, array_agg(distinct pp.name order by pp.name) as names
    from owned
    join public.need_competencies nc on nc.need_id = owned.id
    join public.product_competency_links pcl on pcl.competency_id = nc.competency_id
    join public.organisation_product_links opl on opl.provider_product_id = pcl.provider_product_id
    join public.provider_products pp on pp.id = opl.provider_product_id
    join public.provider_publication_status product_status
      on product_status.provider_product_id = pp.id and product_status.status = 'published'
    join public.provider_publication_status provider_status
      on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
    group by opl.organisation_id
  )
  select o.id, o.slug, o.name, o.summary,
         coalesce(s.essential_matches, 0), coalesce(s.useful_matches, 0),
         coalesce(s.matched_competencies, '{}'::text[]),
         coalesce(pr.names, '{}'::text[])
  from public.organisations o
  left join skills s on s.organisation_id = o.id
  left join products pr on pr.organisation_id = o.id
  where o.organisation_type = 'si_gtm'
    and (s.organisation_id is not null or pr.organisation_id is not null)
  order by 5 desc, cardinality(coalesce(pr.names, '{}'::text[])) desc, 6 desc, o.name
  limit 8
$$;

revoke all on function public.validate_need_retailer_organisation() from public, anon, authenticated;
revoke all on function public.get_need_product_suggestions(uuid) from public, anon;
revoke all on function public.get_need_partner_suggestions(uuid) from public, anon;
grant execute on function public.get_need_product_suggestions(uuid) to authenticated;
grant execute on function public.get_need_partner_suggestions(uuid) to authenticated;

comment on table public.organisations is
  'Curator-managed organisation records (retailer, vendor, si_gtm, advisor). Vendors may link to a provider record.';
comment on table public.profile_organisations is
  'Curator-managed affiliation of a profile to an organisation. Shown to requesters so commercial interest is visible.';

commit;
