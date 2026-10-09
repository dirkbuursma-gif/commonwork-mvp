-- Public provider identity type. Existing providers default to software vendors.
alter table public.providers
  add column provider_type text not null default 'software_vendor'
  check (provider_type in ('software_vendor', 'service_partner', 'organisation'));
