begin;
-- Attendees obtain bytes only through freshly authorized application delivery.
-- Keep metadata RLS, other buckets and public.events grants unchanged.
update storage.buckets set public = false where id = 'event-materials';
drop policy if exists event_materials_objects_read on storage.objects;
drop policy if exists event_materials_objects_write on storage.objects;

create policy event_materials_manager_select
on storage.objects for select to authenticated
using (case when bucket_id = 'event-materials'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid) else false end);

create policy event_materials_manager_insert
on storage.objects for insert to authenticated
with check (case when bucket_id = 'event-materials'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid) else false end);

create policy event_materials_manager_update
on storage.objects for update to authenticated
using (case when bucket_id = 'event-materials'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid) else false end)
with check (case when bucket_id = 'event-materials'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid) else false end);

create policy event_materials_manager_delete
on storage.objects for delete to authenticated
using (case when bucket_id = 'event-materials'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid) else false end);

-- An unrelated permissive SELECT policy must not reopen this bucket to attendees.
-- This restrictive condition leaves every other bucket unchanged.
create policy event_materials_no_attendee_bypass
on storage.objects as restrictive for select to anon, authenticated
using (case
  when bucket_id <> 'event-materials' then true
  when auth.uid() is null then false
  when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_event_manager(split_part(name, '/', 1)::uuid)
  else false end);
commit;
