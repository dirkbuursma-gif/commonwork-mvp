begin;

DO $tables$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['introductions', 'introduction_participants', 'connectors',
    'connector_assignments', 'introduction_feedback', 'introduction_audit'] LOOP
    EXECUTE format(
      'CREATE POLICY workspace_membership_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.can_access_member_workspace())) WITH CHECK ((SELECT public.can_access_member_workspace()))', t
    );
  END LOOP;
END
$tables$;

-- Retain recipient-only access to non-introduction notifications, including
-- privacy notices. Existing recipient policies still restrict every row.
CREATE POLICY workspace_required_for_introduction_notifications
ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
USING (introduction_id IS NULL OR (SELECT public.can_access_member_workspace()))
WITH CHECK (introduction_id IS NULL OR (SELECT public.can_access_member_workspace()));

-- Cover the business entry points used by the introduction handlers and inbox.
-- Resolve exactly one definition per name, preserving its ACL and signature.
DO $rpcs$
DECLARE
  name text; definitions integer; f record; body text; ddl text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'request_introduction', 'expire_introduction_if_due', 'recipient_introduction_response',
    'requester_introduction_context_response', 'connector_introduction_response',
    'requester_review_intermediary_suggestion', 'cancel_introduction',
    'release_introduction_contacts', 'submit_introduction_feedback', 'get_my_introduction_inbox'
  ] LOOP
    SELECT count(*) INTO definitions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = name AND p.prokind = 'f';
    IF definitions <> 1 THEN RAISE EXCEPTION 'Unexpected introduction RPC definitions: %', name; END IF;
    SELECT p.prosrc, p.proretset, p.prosecdef, l.lanname, pg_get_functiondef(p.oid) AS definition
    INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.proname = name AND p.prokind = 'f';
    IF NOT f.prosecdef OR f.lanname NOT IN ('sql', 'plpgsql') OR f.prosrc ~ '^\s*#' THEN
      RAISE EXCEPTION 'Unsupported introduction RPC shape: %', name;
    END IF;
    body := E'BEGIN\n PERFORM public.require_member_workspace();\n';
    IF f.lanname = 'sql' THEN
      IF NOT f.proretset OR position('LANGUAGE sql' IN f.definition) = 0 THEN
        RAISE EXCEPTION 'Unexpected SQL introduction RPC shape: %', name;
      END IF;
      body := body || 'RETURN QUERY ' || rtrim(f.prosrc, E' \t\r\n;') || E';\n';
    ELSE body := body || f.prosrc;
    END IF;
    body := body || E'\nEND;\n';
    IF f.prosrc = '' OR position(f.prosrc IN f.definition) = 0 THEN
      RAISE EXCEPTION 'Introduction RPC source could not be preserved: %', name;
    END IF;
    ddl := replace(f.definition, f.prosrc, body);
    IF f.lanname = 'sql' THEN ddl := replace(ddl, 'LANGUAGE sql', 'LANGUAGE plpgsql'); END IF;
    EXECUTE ddl;
  END LOOP;
END
$rpcs$;

-- Keep blocking/unblocking as a safety control after workspace revocation.
-- Without membership, allow new blocks only for historical co-participants;
-- otherwise this definer function could disclose an unrelated profile's name.
CREATE OR REPLACE FUNCTION public.block_member_from_introductions(target_profile_id uuid, should_block boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_id uuid := auth.uid(); blocked_name text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING errcode = '42501'; END IF;
  IF target_profile_id IS NULL OR target_profile_id = actor_id THEN
    RAISE EXCEPTION 'Choose another member.' USING errcode = '22023';
  END IF;
  IF should_block THEN
    IF public.can_access_member_workspace() IS NOT TRUE AND NOT EXISTS (
      SELECT 1 FROM public.introduction_participants mine
      JOIN public.introduction_participants theirs ON theirs.introduction_id = mine.introduction_id
      WHERE mine.profile_id = actor_id AND theirs.profile_id = target_profile_id
    ) THEN RAISE EXCEPTION 'This introduction contact is unavailable.' USING errcode = '42501'; END IF;
    SELECT p.display_name INTO blocked_name FROM public.profiles p WHERE p.id = target_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.' USING errcode = '22023'; END IF;
    INSERT INTO public.profile_introduction_blocks (profile_id, blocked_profile_id, blocked_display_name)
    VALUES (actor_id, target_profile_id, blocked_name)
    ON CONFLICT (profile_id, blocked_profile_id) DO NOTHING;
    RETURN true;
  END IF;
  DELETE FROM public.profile_introduction_blocks WHERE profile_id = actor_id AND blocked_profile_id = target_profile_id;
  RETURN found;
END;
$$;

-- Own contact-method controls, privacy requests/exports, reporting, read receipts
-- and service-role-only operator workflows are not given membership requirements.
-- Event authorization and Auth signup configuration are not changed.
commit;
