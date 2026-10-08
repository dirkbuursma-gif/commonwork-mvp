begin;

create table public.provider_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  what_it_is text not null check (char_length(btrim(what_it_is)) between 2 and 2000),
  what_it_is_not text not null check (char_length(btrim(what_it_is_not)) between 2 and 2000),
  sort_order integer not null default 0,
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null))
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  website_url text check (website_url is null or website_url ~ '^https://[^[:space:]]+$'),
  summary text not null default '' check (char_length(summary) <= 1600),
  source_system text not null check (char_length(btrim(source_system)) between 2 and 80),
  source_record_id text not null check (char_length(btrim(source_record_id)) between 1 and 160),
  source_url text check (source_url is null or source_url ~ '^https://[^[:space:]]+$'),
  imported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text check (reviewed_by is null or char_length(btrim(reviewed_by)) between 2 and 120),
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_record_id),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null))
);

create table public.provider_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 180),
  summary text not null default '' check (char_length(summary) <= 2400),
  operating_layer text not null default '' check (char_length(operating_layer) <= 120),
  contribution_role text not null default '' check (char_length(contribution_role) <= 120),
  evidence_maturity text not null default '' check (evidence_maturity in ('', 'Claimed', 'Documented', 'Demonstrated', 'Proven')),
  merchant_fit text[] not null default '{}',
  boundary_and_dependencies text not null default '' check (char_length(boundary_and_dependencies) <= 2400),
  buyer_validation_questions text[] not null default '{}',
  architecture text not null default '' check (char_length(architecture) <= 1600),
  deployment_model text not null default '' check (char_length(deployment_model) <= 1200),
  capabilities_summary text not null default '' check (char_length(capabilities_summary) <= 2400),
  source_system text not null check (char_length(btrim(source_system)) between 2 and 80),
  source_record_id text not null check (char_length(btrim(source_record_id)) between 1 and 160),
  source_url text check (source_url is null or source_url ~ '^https://[^[:space:]]+$'),
  imported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text check (reviewed_by is null or char_length(btrim(reviewed_by)) between 2 and 120),
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_record_id),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null))
);

create table public.provider_category_memberships (
  provider_product_id uuid not null references public.provider_products (id) on delete cascade,
  category_id uuid not null references public.provider_categories (id) on delete cascade,
  fit_summary text not null default '' check (char_length(fit_summary) <= 1600),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (provider_product_id, category_id)
);

create table public.provider_links (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers (id) on delete cascade,
  provider_product_id uuid references public.provider_products (id) on delete cascade,
  link_type text not null check (link_type in ('official', 'documentation', 'source', 'public_evidence')),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  url text not null check (url ~ '^https://[^[:space:]]+$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check ((provider_id is null) <> (provider_product_id is null))
);

create table public.provider_publication_status (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.providers (id) on delete cascade,
  provider_product_id uuid references public.provider_products (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  public_disclosure_note text not null default '' check (char_length(public_disclosure_note) <= 1200),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  retired_at timestamptz,
  retired_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((provider_id is null) <> (provider_product_id is null)),
  check (status <> 'published' or published_at is not null),
  check (status <> 'retired' or retired_at is not null)
);

create unique index provider_publication_status_provider_idx
  on public.provider_publication_status (provider_id) where provider_id is not null;
create unique index provider_publication_status_product_idx
  on public.provider_publication_status (provider_product_id) where provider_product_id is not null;
create index provider_products_provider_idx on public.provider_products (provider_id, name);
create index provider_category_memberships_category_idx on public.provider_category_memberships (category_id, sort_order);
create index provider_links_provider_idx on public.provider_links (provider_id) where provider_id is not null;
create index provider_links_product_idx on public.provider_links (provider_product_id) where provider_product_id is not null;

create table public.category_competency_links (
  category_id uuid not null references public.provider_categories (id) on delete cascade,
  competency_id uuid not null references public.competencies (id) on delete restrict,
  relationship_type text not null default 'related' check (relationship_type in ('related', 'expertise', 'common_need')),
  relevance_note text not null default '' check (char_length(relevance_note) <= 1000),
  sort_order integer not null default 0,
  is_seed_data boolean not null default false,
  seed_batch text,
  created_at timestamptz not null default now(),
  check ((is_seed_data and seed_batch is not null) or (not is_seed_data and seed_batch is null)),
  primary key (category_id, competency_id)
);

create index category_competency_links_competency_idx on public.category_competency_links (competency_id, category_id);

create trigger providers_set_updated_at
before update on public.providers
for each row execute function public.set_updated_at();

create trigger provider_products_set_updated_at
before update on public.provider_products
for each row execute function public.set_updated_at();

create trigger provider_publication_status_set_updated_at
before update on public.provider_publication_status
for each row execute function public.set_updated_at();

alter table public.provider_categories enable row level security;
alter table public.providers enable row level security;
alter table public.provider_products enable row level security;
alter table public.provider_category_memberships enable row level security;
alter table public.provider_links enable row level security;
alter table public.provider_publication_status enable row level security;
alter table public.category_competency_links enable row level security;

alter table public.provider_categories force row level security;
alter table public.providers force row level security;
alter table public.provider_products force row level security;
alter table public.provider_category_memberships force row level security;
alter table public.provider_links force row level security;
alter table public.provider_publication_status force row level security;
alter table public.category_competency_links force row level security;

revoke all on public.provider_categories, public.providers, public.provider_products,
  public.provider_category_memberships, public.provider_links,
  public.provider_publication_status, public.category_competency_links
  from public, anon, authenticated;

grant select on public.provider_categories, public.providers, public.provider_products,
  public.provider_category_memberships, public.provider_links,
  public.category_competency_links to authenticated;
grant select (provider_id, provider_product_id, status, public_disclosure_note, published_at, retired_at)
  on public.provider_publication_status to authenticated;
grant all on public.provider_categories, public.providers, public.provider_products,
  public.provider_category_memberships, public.provider_links,
  public.provider_publication_status, public.category_competency_links to service_role;

create policy provider_publication_status_member_read
on public.provider_publication_status for select to authenticated
using (status = 'published');

create policy provider_categories_member_read
on public.provider_categories for select to authenticated
using (exists (
  select 1
  from public.provider_category_memberships pcm
  join public.provider_products pp on pp.id = pcm.provider_product_id
  join public.provider_publication_status ps on ps.provider_product_id = pp.id and ps.status = 'published'
  join public.provider_publication_status provider_ps on provider_ps.provider_id = pp.provider_id and provider_ps.status = 'published'
  where pcm.category_id = provider_categories.id
));

create policy providers_member_read
on public.providers for select to authenticated
using (
  exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_id = providers.id and ps.status = 'published'
  )
);

create policy provider_products_member_read
on public.provider_products for select to authenticated
using (
  exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_product_id = provider_products.id and ps.status = 'published'
  )
  and exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_id = provider_products.provider_id and ps.status = 'published'
  )
);

create policy provider_category_memberships_member_read
on public.provider_category_memberships for select to authenticated
using (
  exists (
    select 1 from public.provider_publication_status product_status
    where product_status.provider_product_id = provider_category_memberships.provider_product_id
      and product_status.status = 'published'
  )
  and exists (
    select 1 from public.provider_products pp
    join public.provider_publication_status provider_status on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
    where pp.id = provider_category_memberships.provider_product_id
  )
);

create policy provider_links_member_read
on public.provider_links for select to authenticated
using (
  (provider_id is not null and exists (
    select 1 from public.provider_publication_status ps
    where ps.provider_id = provider_links.provider_id and ps.status = 'published'
  ))
  or (provider_product_id is not null and exists (
    select 1 from public.provider_products pp
    join public.provider_publication_status product_status on product_status.provider_product_id = pp.id and product_status.status = 'published'
    join public.provider_publication_status provider_status on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
    where pp.id = provider_links.provider_product_id
  ))
);

create policy category_competency_links_member_read
on public.category_competency_links for select to authenticated
using (exists (
  select 1
  from public.provider_category_memberships pcm
  join public.provider_products pp on pp.id = pcm.provider_product_id
  join public.provider_publication_status product_status on product_status.provider_product_id = pp.id and product_status.status = 'published'
  join public.provider_publication_status provider_status on provider_status.provider_id = pp.provider_id and provider_status.status = 'published'
  where pcm.category_id = category_competency_links.category_id
));

commit;