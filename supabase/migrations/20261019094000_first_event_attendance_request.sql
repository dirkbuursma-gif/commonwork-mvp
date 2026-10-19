begin;

-- A request is not approval, workspace admission, professional onboarding or consent.
CREATE FUNCTION public.request_event_attendance(target_event_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id uuid := auth.uid();
  inserted_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM public.events e
  WHERE e.id = target_event_id AND e.is_published
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event is unavailable for requests.' USING errcode = '42501';
  END IF;

  -- Never overwrite an existing member's profile or preferences. All remaining
  -- profile fields use private/incomplete/empty defaults; no preferences are created.
  INSERT INTO public.profiles (id, display_name, profile_visibility)
  VALUES (actor_id, 'Event attendee', 'private')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.event_attendees (event_id, profile_id, status)
  VALUES (target_event_id, actor_id, 'requested')
  ON CONFLICT (event_id, profile_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN RETURN 'requested'; END IF;
  -- Repeated requests must never reset an approval or restore revoked access.
  RETURN 'already-requested';
END;
$$;
REVOKE ALL ON FUNCTION public.request_event_attendance(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_event_attendance(uuid) TO authenticated;

-- No Auth configuration, workspace grants, contact opt-ins or event decisions.
commit;
