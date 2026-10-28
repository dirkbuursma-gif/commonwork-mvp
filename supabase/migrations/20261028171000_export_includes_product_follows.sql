begin;

-- Same function, same signature, grants and owner-only authorisation; the single
-- addition is the caller's own active product follows. Every pre-existing key is
-- reproduced unchanged.
create or replace function public.export_my_member_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'authentication_email', (select u.email from auth.users u where u.id = actor_id),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = actor_id),
    'competencies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pc.id, 'competency_id', pc.competency_id, 'member_statement', pc.member_statement,
        'evidence_status', pc.evidence_status, 'discoverable', pc.discoverable,
        'competency_name', c.name,
        'evidence', coalesce((select jsonb_agg(to_jsonb(e)) from public.competence_evidence e where e.profile_competency_id = pc.id), '[]'::jsonb)
      ))
      from public.profile_competencies pc join public.competencies c on c.id = pc.competency_id
      where pc.profile_id = actor_id
    ), '[]'::jsonb),
    'contact_preferences', (select to_jsonb(cp) from public.contact_preferences cp where cp.profile_id = actor_id),
    'contact_methods', coalesce((select jsonb_agg(to_jsonb(cm)) from public.profile_contact_methods cm where cm.profile_id = actor_id), '[]'::jsonb),
    'needs', coalesce((select jsonb_agg(jsonb_build_object(
      'need', to_jsonb(n),
      'competencies', coalesce((select jsonb_agg(to_jsonb(nc)) from public.need_competencies nc where nc.need_id = n.id), '[]'::jsonb)
    )) from public.competence_needs n where n.owner_profile_id = actor_id), '[]'::jsonb),
    'introductions', coalesce((select jsonb_agg(jsonb_build_object(
      'introduction', to_jsonb(i), 'my_participant_record', to_jsonb(p)
    )) from public.introduction_participants p join public.introductions i on i.id = p.introduction_id
      where p.profile_id = actor_id), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(f)) from public.introduction_feedback f where f.profile_id = actor_id), '[]'::jsonb),
    'privacy_requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.member_privacy_requests r where r.profile_id = actor_id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.profile_id = actor_id), '[]'::jsonb),
    'blocked_members', coalesce((select jsonb_agg(b.blocked_profile_id) from public.profile_introduction_blocks b where b.profile_id = actor_id), '[]'::jsonb),
    -- Own active follows only. Product and provider details appear only while both
    -- remain published; otherwise just the stable reference and followed_at.
    'product_follows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', pf.provider_product_id,
        'followed_at', pf.followed_at,
        'available', state.ok,
        'product_slug', case when state.ok then pp.slug end,
        'product_name', case when state.ok then pp.name end,
        'provider_name', case when state.ok then pr.name end
      ) order by pf.followed_at desc, pf.provider_product_id)
      from public.product_follows pf
      join public.provider_products pp on pp.id = pf.provider_product_id
      join public.providers pr on pr.id = pp.provider_id
      cross join lateral (select public.is_product_followable(pf.provider_product_id) as ok) state
      where pf.member_id = actor_id
    ), '[]'::jsonb)
  );
end;
$$;

commit;
