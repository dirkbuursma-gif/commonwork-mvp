insert into public.competencies (name, slug, category, description)
values
  (
    'Contact-centre automation impact evaluation',
    'contact-centre-automation-impact-evaluation',
    'practical_capability',
    'Evaluate service automation opportunities and service-quality, workload, FTE and capacity impacts, including assumptions, exceptions and human escalation.'
  ),
  (
    'Staffing-capacity planning',
    'staffing-capacity-planning',
    'practical_capability',
    'Forecast demand and plan staffing against workload, skills, service levels and operational constraints.'
  ),
  (
    'Event coordination',
    'event-coordination',
    'practical_capability',
    'Coordinate event logistics, speakers, suppliers, participants, schedules and intended outcomes.'
  )
on conflict (slug) do nothing;
