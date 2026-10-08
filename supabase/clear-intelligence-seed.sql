-- LOCAL ONLY. Do not execute against staging or production.
begin;

delete from public.category_competency_links
where is_seed_data = true and seed_batch = 'commonwork-intelligence-v1';

delete from public.providers
where is_seed_data = true and seed_batch = 'commonwork-intelligence-v1';

delete from public.provider_categories
where is_seed_data = true and seed_batch = 'commonwork-intelligence-v1';

commit;