begin;

-- No SELECT/DELETE grant on public.events is added to any client role.
-- The service-only operation can address only the runner's synthetic event.
CREATE FUNCTION public.manage_staging_authz_event(
  target_batch uuid, target_manager_id uuid, delete_fixture boolean DEFAULT false
) RETURNS TABLE (id uuid, manager_profile_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE fixture_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service-role fixture cleanup is required.' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM auth.users u
  WHERE u.id = target_manager_id
    AND u.raw_app_meta_data ->> 'commonwork_staging_authz_batch' = target_batch::text
    AND u.email = 'cw-authz-' || target_batch::text || '-manager@example.test'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Synthetic fixture ownership is required.' USING errcode = '42501';
  END IF;
  SELECT e.id INTO fixture_id FROM public.events e
  WHERE e.slug = 'staging-authz-' || target_batch::text
    AND e.manager_profile_id = target_manager_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF delete_fixture THEN
    DELETE FROM public.events e
    WHERE e.id = fixture_id AND e.manager_profile_id = target_manager_id;
  END IF;
  RETURN QUERY SELECT fixture_id, target_manager_id;
END;
$$;
REVOKE ALL ON FUNCTION public.manage_staging_authz_event(uuid, uuid, boolean)
FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_staging_authz_event(uuid, uuid, boolean) TO service_role;

commit;
