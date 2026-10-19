begin;

create type public.affiliation_verification_status as enum ('self_declared', 'approved', 'legacy_curated');

alter table public.profile_product_affiliations
  add column verification_status public.affiliation_verification_status not null default 'legacy_curated',
  add column verified_at timestamptz,
  add column verified_by uuid references public.profiles (id) on delete set null,
  add constraint profile_product_affiliations_verification_check check (
    (verification_status = 'self_declared' and verified_at is null and verified_by is null)
    or
    (verification_status = 'approved' and verified_at is not null and verified_by is not null)
    or
    (verification_status = 'legacy_curated' and verified_at is null and verified_by is null)
  );

-- Members can declare only their own affiliation. Approval remains a trusted
-- operator action through service_role and does not confer catalogue edit rights.
grant insert, update (role_title, consent_given, consented_at) on public.profile_product_affiliations to authenticated;

create policy profile_product_affiliations_self_declare
on public.profile_product_affiliations for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and verification_status = 'self_declared'
  and not is_seed_data
);

create policy profile_product_affiliations_self_update
on public.profile_product_affiliations for update to authenticated
using (
  profile_id = (select auth.uid())
  and verification_status = 'self_declared'
  and not is_seed_data
)
with check (
  profile_id = (select auth.uid())
  and verification_status = 'self_declared'
  and not is_seed_data
);

comment on column public.profile_product_affiliations.verification_status is
  'Provenance of the affiliation claim. Legacy curated preserves pre-migration operator-managed records; self-declared is member-supplied; approved is operator-verified. No status grants catalogue editing rights.';

commit;
