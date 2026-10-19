begin;

-- Scoped to discovery, competence needs, matching and ecosystem data.
-- Introduction-specific RPCs and attendee signup remain separate work.
DO $tables$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'competencies', 'profile_competencies', 'competence_evidence', 'competency_suggestions',
    'competence_needs', 'need_competencies', 'matches', 'match_reasons', 'match_feedback',
    'organisations', 'profile_organisations', 'product_competency_links',
    'organisation_competency_links', 'organisation_product_links', 'profile_product_affiliations'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY workspace_membership_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.can_access_member_workspace())) WITH CHECK ((SELECT public.can_access_member_workspace()))', t
    );
  END LOOP;
END
$tables$;

-- Preserve own-profile access; do not expose other profile IDs to event-only accounts.
CREATE POLICY workspace_required_for_other_profile_ids
ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT public.can_access_member_workspace()));

-- Owner-executed views require their own caller-membership predicate.
CREATE OR REPLACE VIEW public.discoverable_profiles WITH (security_barrier = true) AS
SELECT p.id, p.display_name, p.professional_summary, p.what_i_contribute,
       p.what_i_am_exploring, p.base_country_code, p.markets_served
FROM public.profiles p
WHERE p.profile_visibility = 'members' AND p.onboarding_completed = true
  AND (SELECT public.can_access_member_workspace());

CREATE OR REPLACE VIEW public.discoverable_contact_preferences WITH (security_barrier = true) AS
SELECT cp.profile_id, cp.open_to_peer_exchange, cp.open_to_advisory, cp.open_to_projects,
       cp.open_to_partnerships, cp.open_to_opportunities, cp.open_to_event_introductions,
       cp.availability_status, cp.conversation_capacity
FROM public.contact_preferences cp JOIN public.profiles p ON p.id = cp.profile_id
WHERE p.profile_visibility = 'members' AND p.onboarding_completed = true
  AND (SELECT public.can_access_member_workspace());

CREATE OR REPLACE FUNCTION public.is_need_owner(target_need_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_access_member_workspace() AND EXISTS (
    SELECT 1 FROM public.competence_needs n
    WHERE n.id = target_need_id AND n.owner_profile_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_match(target_match_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.can_access_member_workspace() AND EXISTS (
    SELECT 1 FROM public.matches m JOIN public.competence_needs n ON n.id = m.need_id
    WHERE m.id = target_match_id AND n.owner_profile_id = auth.uid()
  )
$$;

CREATE FUNCTION public.require_member_workspace() RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF public.can_access_member_workspace() IS NOT TRUE THEN
    RAISE EXCEPTION 'Workspace membership is required.' USING errcode = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_member_workspace() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_member_workspace() TO authenticated;

-- Guard only these reviewed entry points. Preserve their signatures, ownership,
-- ACLs, volatility, configuration, and existing business/ownership checks.
-- Nest the original PL/pgSQL block; SQL set-returning bodies use RETURN QUERY.
DO $rpcs$
DECLARE
  signature text; original_body text; body text; ddl text; lang text; returns_set boolean;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.matching_evidence_for_need(uuid)',
    'public.generate_matches_for_need(uuid)',
    'public.get_need_product_suggestions(uuid)',
    'public.get_need_partner_suggestions(uuid)',
    'public.record_catalogue_view(text,text)'
  ] LOOP
    SELECT p.prosrc, pg_get_functiondef(p.oid), l.lanname, p.proretset
    INTO original_body, ddl, lang, returns_set
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure(signature);
    IF NOT FOUND OR lang NOT IN ('sql', 'plpgsql') THEN
      RAISE EXCEPTION 'Missing or unsupported workspace RPC: %', signature;
    END IF;
    body := E'BEGIN\n PERFORM public.require_member_workspace();\n';
    IF lang = 'sql' THEN
      IF NOT returns_set OR position('LANGUAGE sql' IN ddl) = 0 THEN
        RAISE EXCEPTION 'Unexpected SQL workspace RPC shape: %', signature;
      END IF;
      body := body || 'RETURN QUERY ' || rtrim(original_body, E' \t\r\n;') || E';\n';
    ELSE
      body := body || original_body;
    END IF;
    body := body || E'\nEND;\n';
    IF original_body = '' OR position(original_body IN ddl) = 0 THEN
      RAISE EXCEPTION 'Workspace RPC source could not be preserved: %', signature;
    END IF;
    ddl := replace(ddl, original_body, body);
    IF lang = 'sql' THEN ddl := replace(ddl, 'LANGUAGE sql', 'LANGUAGE plpgsql'); END IF;
    EXECUTE ddl;
  END LOOP;
END
$rpcs$;

-- get_my_profile(), own contact preferences, event access functions and
-- existing privacy/operator workflows are not redefined by this migration.
commit;
