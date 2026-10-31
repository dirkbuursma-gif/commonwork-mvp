begin;

create function public.require_real_company_for_operator_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_provider_id uuid;
  target_organisation_id uuid;
  organisation_is_seed boolean;
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_table_name = 'profile_organisations' then
    target_organisation_id := new.organisation_id;
    select o.provider_id, o.is_seed_data into target_provider_id, organisation_is_seed
    from public.organisations o where o.id = target_organisation_id;
    if organisation_is_seed then
      raise exception 'Seed/demo records cannot be used for real company administration.' using errcode = '42501';
    end if;
    if target_provider_id is null then return new; end if;
  elsif tg_table_name = 'provider_publication_status' then
    target_provider_id := new.provider_id;
    if target_provider_id is null and new.provider_product_id is not null then
      select pp.provider_id into target_provider_id
      from public.provider_products pp where pp.id = new.provider_product_id;
    end if;
    if target_provider_id is null then return new; end if;
  else
    target_provider_id := new.provider_id;
  end if;
  if exists (
    select 1 from public.providers p
    where p.id = target_provider_id and p.is_seed_data = false
      and not exists (select 1 from public.organisations o where o.provider_id = p.id and o.is_seed_data = true)
  ) then
    return new;
  end if;
  raise exception 'Seed/demo records cannot be used for real company administration.' using errcode = '42501';
end;
$$;

create trigger provider_publication_status_require_real_company
before insert or update on public.provider_publication_status
for each row execute function public.require_real_company_for_operator_write();
create trigger company_memberships_require_real_company
before insert or update on public.company_memberships
for each row execute function public.require_real_company_for_operator_write();
create trigger company_publishing_entitlements_require_real_company
before insert or update on public.company_publishing_entitlements
for each row execute function public.require_real_company_for_operator_write();
create trigger company_publishing_assignments_require_real_company
before insert or update on public.company_publishing_assignments
for each row execute function public.require_real_company_for_operator_write();
create trigger profile_organisations_require_real_company
before insert or update on public.profile_organisations
for each row execute function public.require_real_company_for_operator_write();
revoke all on function public.require_real_company_for_operator_write() from public, anon, authenticated;

commit;