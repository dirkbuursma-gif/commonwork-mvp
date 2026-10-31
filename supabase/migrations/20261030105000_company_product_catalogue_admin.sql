begin;

create function public.admin_set_company_product_catalogue_status(
  target_provider_id uuid,
  target_product_id uuid,
  target_status text,
  target_disclosure_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if public.can_edit_insights() is not true then
    raise exception 'Application administrator access is required.' using errcode = '42501';
  end if;
  if target_status not in ('draft', 'published', 'retired')
     or char_length(coalesce(target_disclosure_note, '')) > 1200 then
    raise exception 'Choose a valid product catalogue status and disclosure note.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.provider_products pp
    join public.providers p on p.id = pp.provider_id and p.id = target_provider_id
    where pp.id = target_product_id and p.is_seed_data = false
      and not exists (select 1 from public.organisations o where o.provider_id = p.id and o.is_seed_data = true)
  ) then
    raise exception 'Select an existing, non-seed product belonging to this provider.' using errcode = '42501';
  end if;
  if target_status = 'published' and not exists (
    select 1 from public.provider_products pp
    join public.providers p on p.id = pp.provider_id
    join public.provider_publication_status provider_status
      on provider_status.provider_id = p.id and provider_status.status = 'published'
    where pp.id = target_product_id
      and nullif(btrim(pp.summary), '') is not null
      and coalesce(pp.source_url, p.source_url, p.website_url) is not null
  ) then
    raise exception 'Add a sourced product summary and publish its provider profile before publishing this product.' using errcode = '22023';
  end if;
  insert into public.provider_publication_status (provider_product_id, status, public_disclosure_note,
    published_at, published_by, retired_at, retired_by)
  values (target_product_id, target_status, btrim(coalesce(target_disclosure_note, '')),
    case when target_status = 'published' then now() end,
    case when target_status = 'published' then actor_id end,
    case when target_status = 'retired' then now() end,
    case when target_status = 'retired' then actor_id end)
  on conflict (provider_product_id) where provider_product_id is not null do update
  set status = excluded.status, public_disclosure_note = excluded.public_disclosure_note,
      published_at = excluded.published_at, published_by = excluded.published_by,
      retired_at = excluded.retired_at, retired_by = excluded.retired_by;
  insert into public.company_operator_audit (provider_id, actor_profile_id, action, details)
  values (target_provider_id, actor_id, 'catalogue_status_changed', jsonb_build_object(
    'provider_product_id', target_product_id, 'status', target_status
  ));
  return true;
end;
$$;
revoke all on function public.admin_set_company_product_catalogue_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_set_company_product_catalogue_status(uuid, uuid, text, text) to authenticated;

commit;