import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('direct member data APIs reject event-only access and workspace revocation with populated fixtures', async () => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const key = randomUUID();
  const member = await createLocalMember('Local data boundary member');
  let peer: LocalMember | undefined;
  let attendee: LocalMember | undefined;
  let competencyId: string | undefined;
  let providerId: string | undefined;
  let eventId: string | undefined;
  const organisationIds: string[] = [];
  try {
    peer = await createLocalMember('Local data boundary peer');
    attendee = await createLocalMember('Local data boundary attendee', { workspaceAccess: false });
    const profiles = await admin.from('profiles').insert([
      { id: member.id, display_name: 'Local data member' },
      { id: attendee.id, display_name: 'Local data attendee' },
      { id: peer.id, display_name: 'Local data peer', professional_summary: 'Local boundary expertise', what_i_contribute: 'Local boundary contribution', profile_visibility: 'members' },
    ], { defaultToNull: false });
    expect(profiles.error).toBeNull();
    const skill = await admin.from('competencies').insert({ name: 'Local boundary competence', slug: `boundary-${key}`, category: 'knowledge' }).select('id').single();
    expect(skill.error).toBeNull();
    if (!skill.data) throw new Error('Competence fixture missing.');
    competencyId = skill.data.id;
    for (const person of [peer, attendee]) {
      const pc = await admin.from('profile_competencies').insert({ profile_id: person.id, competency_id: competencyId, discoverable: person.id === peer.id }).select('id').single();
      expect(pc.error).toBeNull();
      if (!pc.data) throw new Error('Profile competence missing.');
      const evidence = await admin.from('competence_evidence').insert({ profile_competency_id: pc.data.id, title: 'Local evidence', context: 'Local context', contribution: 'Local contribution', outcome: 'Local outcome', visibility: person.id === peer.id ? 'members' : 'private' });
      expect(evidence.error).toBeNull();
    }
    const prefs = await admin.from('contact_preferences').insert({ profile_id: peer.id, open_to_peer_exchange: true, availability_status: 'open', conversation_capacity: 2 });
    expect(prefs.error).toBeNull();
    await peer.provisionConnector();
    const suggestion = await admin.from('competency_suggestions').insert({ profile_id: attendee.id, name: 'Local suggestion', category: 'knowledge', explanation: 'Local explanation' });
    expect(suggestion.error).toBeNull();
    const provider = await admin.from('providers').insert({ slug: `boundary-${key}`, name: 'Local boundary provider', source_system: 'local-workspace-test', source_record_id: key }).select('id').single();
    expect(provider.error).toBeNull();
    if (!provider.data) throw new Error('Provider missing.');
    providerId = provider.data.id;
    const product = await admin.from('provider_products').insert({ provider_id: providerId, slug: `boundary-${key}`, name: 'Local boundary product', source_system: 'local-workspace-test', source_record_id: key }).select('id, slug').single();
    expect(product.error).toBeNull();
    if (!product.data) throw new Error('Product missing.');
    const published = await admin.from('provider_publication_status').insert([{ provider_id: providerId, status: 'published', published_at: new Date().toISOString() }, { provider_product_id: product.data.id, status: 'published', published_at: new Date().toISOString() }]);
    expect(published.error).toBeNull();
    const orgs = await admin.from('organisations').insert([{ slug: `partner-${key}`, name: 'Local partner', organisation_type: 'si_gtm' }, { slug: `vendor-${key}`, name: 'Local vendor', organisation_type: 'vendor', provider_id: providerId }]).select('id, organisation_type');
    expect(orgs.error).toBeNull();
    organisationIds.push(...(orgs.data ?? []).map((o: { id: string }) => o.id));
    const partner = orgs.data?.find((o: { organisation_type: string }) => o.organisation_type === 'si_gtm');
    const vendor = orgs.data?.find((o: { organisation_type: string }) => o.organisation_type === 'vendor');
    if (!partner || !vendor) throw new Error('Organisations missing.');
    for (const [table, row] of [
      ['profile_organisations', { profile_id: attendee.id, organisation_id: vendor.id }],
      ['product_competency_links', { provider_product_id: product.data.id, competency_id: competencyId }],
      ['organisation_competency_links', { organisation_id: partner.id, competency_id: competencyId }],
      ['organisation_product_links', { organisation_id: partner.id, provider_product_id: product.data.id }],
      ['profile_product_affiliations', { profile_id: attendee.id, provider_product_id: product.data.id }],
    ] as const) expect((await admin.from(table).insert(row)).error, table).toBeNull();
    async function makeNeed(owner: string): Promise<string> {
      const n = await admin.from('competence_needs').insert({ owner_profile_id: owner, title: 'Local boundary need', business_outcome: 'Local outcome', problem_statement: 'Local problem', expires_at: new Date(Date.now() + 86_400_000).toISOString() }).select('id').single();
      expect(n.error).toBeNull();
      if (!n.data) throw new Error('Need missing.');
      expect((await admin.from('need_competencies').insert({ need_id: n.data.id, competency_id: competencyId, importance: 'essential' })).error).toBeNull();
      expect((await admin.from('competence_needs').update({ status: 'active' }).eq('id', n.data.id)).error).toBeNull();
      return n.data.id as string;
    }
    const memberNeed = await makeNeed(member.id);
    const attendeeNeed = await makeNeed(attendee.id);
    const match = await admin.from('matches').insert({ need_id: attendeeNeed, matched_profile_id: peer.id, relevance_band: 'good', score_internal: 80 }).select('id').single();
    expect(match.error).toBeNull();
    if (!match.data) throw new Error('Match missing.');
    expect((await admin.from('match_reasons').insert({ match_id: match.data.id, reason_type: 'essential_match', competency_id: competencyId, explanation: 'Local competence match' })).error).toBeNull();
    expect((await admin.from('match_feedback').insert({ match_id: match.data.id, created_by: attendee.id, feedback_type: 'useful' })).error).toBeNull();
    const generated = await member.client.rpc('generate_matches_for_need', { target_need_id: memberNeed });
    expect(generated.error).toBeNull();
    expect(generated.data).toBeGreaterThan(0);
    const reads = ['matching_evidence_for_need', 'get_need_product_suggestions', 'get_need_partner_suggestions'];
    for (const name of reads) {
      const result = await member.client.rpc(name, { target_need_id: memberNeed });
      expect(result.error, name).toBeNull();
      expect(result.data?.length, name).toBeGreaterThan(0);
    }
    const recorded = await member.client.rpc('record_catalogue_view', { target_subject_type: 'provider_product', target_slug: product.data.slug });
    expect(recorded.error).toBeNull();
    expect((await admin.from('workspace_memberships').insert({ user_id: attendee.id, status: 'active', source: 'operator' })).error).toBeNull();
    const prior = await attendee.client.rpc('matching_evidence_for_need', { target_need_id: attendeeNeed });
    expect(prior.error).toBeNull();
    expect(prior.data?.length).toBeGreaterThan(0);
    const ownFeedback = await attendee.client.from('member_match_feedback').select('id, match_id, feedback_type').eq('match_id', match.data.id);
    expect(ownFeedback.error).toBeNull();
    expect(ownFeedback.data).toHaveLength(1);
    expect(ownFeedback.data?.[0]?.feedback_type).toBe('useful');
    const otherFeedback = await member.client.from('member_match_feedback').select('id').eq('match_id', match.data.id);
    expect(otherFeedback.error).toBeNull();
    expect(otherFeedback.data).toEqual([]);
    expect((await admin.from('workspace_memberships').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', attendee.id)).error).toBeNull();
    const deniedClient = attendee.client;
    const ownId = attendee.id;
    const productSlug = product.data.slug;
    async function assertDenied() {
      for (const [table, columns] of [
        ['competencies', 'id'], ['profile_competencies', 'id'], ['competence_evidence', 'id'], ['competency_suggestions', 'id'],
        ['competence_needs', 'id'], ['need_competencies', 'id'], ['matches', 'id'], ['match_reasons', 'id'], ['match_feedback', 'id'],
        ['organisations', 'id'], ['profile_organisations', 'profile_id'], ['product_competency_links', 'provider_product_id'],
        ['organisation_competency_links', 'organisation_id'], ['organisation_product_links', 'organisation_id'], ['profile_product_affiliations', 'profile_id'],
        ['discoverable_profiles', 'id'], ['discoverable_contact_preferences', 'profile_id'], ['discoverable_member_competencies', 'profile_id'],
        ['available_connectors', 'profile_id'], ['member_match_reasons', 'id'], ['member_match_feedback', 'id'],
      ]) {
        const result = await deniedClient.from(table).select(columns);
        expect(result.error, table).toBeNull();
        expect(result.data, table).toEqual([]);
      }
      for (const name of [...reads, 'generate_matches_for_need']) expect((await deniedClient.rpc(name, { target_need_id: attendeeNeed })).error?.code, name).toBe('42501');
      expect((await deniedClient.rpc('record_catalogue_view', { target_subject_type: 'provider_product', target_slug: productSlug })).error?.code).toBe('42501');
      expect((await deniedClient.rpc('is_need_owner', { target_need_id: attendeeNeed })).data).toBe(false);
      expect((await deniedClient.rpc('can_read_match', { target_match_id: match.data!.id })).data).toBe(false);
      const ids = await deniedClient.from('profiles').select('id').neq('id', ownId);
      expect(ids.error).toBeNull();
      expect(ids.data).toEqual([]);
      expect((await deniedClient.from('competence_needs').insert({ owner_profile_id: ownId, title: 'Denied local need' })).error?.code).toBe('42501');
    }
    await assertDenied();
    const event = await admin.from('events').insert({ slug: `boundary-${key}`, title: 'Local boundary event', manager_profile_id: member.id, is_published: true }).select('id').single();
    expect(event.error).toBeNull();
    if (!event.data) throw new Error('Event missing.');
    eventId = event.data.id;
    expect((await admin.from('event_attendees').insert({ event_id: eventId, profile_id: attendee.id, status: 'approved', decided_at: new Date().toISOString(), decided_by: member.id })).error).toBeNull();
    const access = await attendee.client.rpc('has_approved_event_access', { target_event_id: eventId });
    expect(access.error).toBeNull();
    expect(access.data).toBe(true);
    await assertDenied();
    const own = await attendee.client.rpc('get_my_profile');
    expect(own.error).toBeNull();
    expect(own.data?.[0]?.id).toBe(attendee.id);
    expect((await admin.from('workspace_memberships').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', member.id)).error).toBeNull();
    expect((await member.client.rpc('get_need_product_suggestions', { target_need_id: memberNeed })).error?.code).toBe('42501');
    expect((await member.client.from('discoverable_profiles').select('id')).data).toEqual([]);
  } finally {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    await member.remove();
    await attendee?.remove();
    await peer?.remove();
    if (organisationIds.length) await admin.from('organisations').delete().in('id', organisationIds);
    if (providerId) await admin.from('providers').delete().eq('id', providerId);
    if (competencyId) await admin.from('competencies').delete().eq('id', competencyId);
  }
});
