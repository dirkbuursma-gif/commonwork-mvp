begin;

-- Server-only metadata reads for the event-resource loader.
-- These are column grants across the tables, not event-row-scoped grants.
-- Visitor authorization remains in the application's exact-event, publication
-- and explicit public-resource opt-in checks. No client grants are changed.
grant select (id, slug, title, summary, location, starts_at, ends_at, is_published, manager_profile_id)
on public.events to service_role;

grant select (id, event_id, kind, title, storage_path)
on public.event_materials to service_role;

commit;
