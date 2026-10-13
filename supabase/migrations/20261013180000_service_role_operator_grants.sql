begin;

-- The service_role needs direct table access for the operator acceptance
-- fixture. Grants are limited to the named tables and operations.
grant select on
  public.competencies,
  public.profiles,
  public.profile_competencies,
  public.competence_evidence,
  public.contact_preferences,
  public.profile_contact_methods
to service_role;

grant insert on
  public.profiles,
  public.profile_competencies,
  public.competence_evidence,
  public.contact_preferences,
  public.profile_contact_methods
to service_role;

commit;
