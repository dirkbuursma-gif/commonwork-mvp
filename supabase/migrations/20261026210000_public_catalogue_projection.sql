begin;

-- Explicit public projection; member tables and their RLS remain unchanged.
create function public.read_public_catalogue()
returns jsonb
language sql stable security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(entry order by entry->>'name', entry->>'slug'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'slug', p.slug, 'name', p.name, 'summary', p.summary,
      'capabilities', p.capabilities_summary,
      'evidence_maturity', p.evidence_maturity,
      'boundaries', p.boundary_and_dependencies,
      'questions', p.buyer_validation_questions,
      'provider_name', v.name,
      'disclosure', ps.public_disclosure_note,
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name) order by c.name)
        from public.provider_category_memberships m
        join public.provider_categories c on c.id = m.category_id
        where m.provider_product_id = p.id and not c.is_seed_data
      ), '[]'::jsonb),
      'competencies', coalesce((
        select jsonb_agg(distinct jsonb_build_object(
          'slug', c.slug, 'name', c.name, 'description', c.description
        ))
        from public.provider_category_memberships m
        join public.provider_categories cat on cat.id = m.category_id and not cat.is_seed_data
        join public.category_competency_links l on l.category_id = m.category_id and not l.is_seed_data
        join public.competencies c on c.id = l.competency_id
        where m.provider_product_id = p.id
      ), '[]'::jsonb)
    ) as entry
    from public.provider_products p
    join public.providers v on v.id = p.provider_id
    join public.provider_publication_status ps on ps.provider_product_id = p.id and ps.status = 'published'
    join public.provider_publication_status vs on vs.provider_id = v.id and vs.status = 'published'
    where not p.is_seed_data and not v.is_seed_data
  ) published;
$function$;

revoke all on function public.read_public_catalogue() from public;
grant execute on function public.read_public_catalogue() to anon, authenticated, service_role;
comment on function public.read_public_catalogue() is 'Public published-only offering projection. No source identifiers, reviewer identities, profile data or affiliation data. Competencies are category-related, not product-verified.';

commit;
