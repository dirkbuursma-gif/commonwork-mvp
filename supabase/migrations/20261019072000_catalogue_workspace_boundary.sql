begin;

-- Partial enforcement: remaining member-data views/RPCs and routes are separate work.
-- A restrictive policy intersects the existing publication/ownership policies.
DO $catalogue_workspace_boundary$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'provider_categories', 'providers', 'provider_products',
    'provider_category_memberships', 'provider_links',
    'provider_publication_status', 'category_competency_links'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY workspace_membership_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.can_access_member_workspace())) WITH CHECK ((SELECT public.can_access_member_workspace()))',
      v_table
    );
  END LOOP;
END
$catalogue_workspace_boundary$;

commit;
