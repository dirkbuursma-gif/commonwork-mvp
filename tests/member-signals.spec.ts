import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

async function prepareProfile(member: LocalMember, name: string, competencySlug: string) {
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: name,
    professional_summary: `${name} works on practical commerce problems.`,
    what_i_contribute: `${name} contributes clear, evidence-led thinking.`,
    what_i_am_exploring: 'Useful professional conversations.',
    profile_visibility: 'members',
  });
  expect(error).toBeNull();
  const { data: competency } = await member.client.from('competencies').select('id').eq('slug', competencySlug).single();
  const { data: profileCompetency, error: competencyError } = await member.client.from('profile_competencies').insert({
    profile_id: member.id,
    competency_id: competency!.id,
    member_statement: `${name} applies this competence in practice.`,
    discoverable: true,
  }).select('id').single();
  expect(competencyError).toBeNull();
  await member.client.from('competence_evidence').insert({
    profile_competency_id: profileCompetency!.id,
    title: 'Practical example',
    context: 'A realistic commerce situation.',
    contribution: 'I structured the decision.',
    outcome: 'The team could act with confidence.',
    visibility: 'matches_only',
  }).then(({ error: evidenceError }) => expect(evidenceError).toBeNull());
  await member.client.from('contact_preferences').insert({
    profile_id: member.id,
    open_to_peer_exchange: true,
    availability_status: 'open',
    conversation_capacity: 3,
  }).then(({ error: preferencesError }) => expect(preferencesError).toBeNull());
  const { data: methodId, error: methodError } = await member.client.rpc('save_profile_contact_method', {
    target_method_id: null,
    target_method_type: 'email',
    target_value: `${randomUUID().slice(0, 8)}@work.example`,
    target_label: 'Work email',
    make_primary: true,
  });
  expect(methodError).toBeNull();
  return { competencyId: competency!.id as string, methodId: String(methodId) };
}

async function eventsFor(admin: ReturnType<typeof createLocalAdminClient>, profileId: string) {
  const { data, error } = await admin.from('member_activity_events')
    .select('event_name, subject_type, properties, organisation_id').eq('profile_id', profileId);
  expect(error).toBeNull();
  return data ?? [];
}

async function scoreFor(admin: ReturnType<typeof createLocalAdminClient>, profileId: string) {
  const { data, error } = await admin.from('member_intent_scores').select('*').eq('profile_id', profileId).single();
  expect(error).toBeNull();
  return data!;
}

test('member activity signals are captured, private and drive the intent score', async () => {
  const admin = createLocalAdminClient();
  const requester = await createLocalMember('Signal Requester');
  const expert = await createLocalMember('Signal Expert');
  const unique = randomUUID().slice(0, 8);
  let organisationId: string | null = null;

  try {
    const { data: organisation } = await admin.from('organisations')
      .insert({ slug: `signal-rt-${unique}`, name: 'Signal Retailer', organisation_type: 'retailer' }).select('id').single();
    organisationId = organisation!.id;

    const requesterSetup = await prepareProfile(requester, 'Signal Requester', 'retail-operations');
    await prepareProfile(expert, 'Signal Expert', 'platform-assessment');
    await admin.from('profile_organisations').insert({ profile_id: requester.id, organisation_id: organisationId, role_title: 'Head of Commerce' })
      .then(({ error }) => expect(error).toBeNull());

    const early = await eventsFor(admin, requester.id);
    expect(early.map((item) => item.event_name)).toEqual(expect.arrayContaining([
      'commonwork_account_created', 'commonwork_profile_completed',
    ]));
    const baseline = await scoreFor(admin, requester.id);
    expect(baseline.intent_score).toBe(0);
    expect(baseline.fit_score).toBe(30);

    const makeNeed = async (title: string) => {
      const { data: need, error } = await requester.client.from('competence_needs').insert({
        owner_profile_id: requester.id,
        title,
        business_outcome: 'Choose a platform with confidence.',
        problem_statement: 'We need a defensible comparison of options.',
        conversation_type: 'peer_exchange',
        visibility: 'private_matches',
        status: 'draft',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      }).select('id').single();
      expect(error).toBeNull();
      const { data: competency } = await admin.from('competencies').select('id').eq('slug', 'platform-assessment').single();
      await requester.client.from('need_competencies').insert({ need_id: need!.id, competency_id: competency!.id, importance: 'essential' })
        .then(({ error: linkError }) => expect(linkError).toBeNull());
      await requester.client.from('competence_needs').update({ status: 'active' }).eq('id', need!.id)
        .then(({ error: activateError }) => expect(activateError).toBeNull());
      return need!.id as string;
    };

    const draftEvents = await eventsFor(admin, requester.id);
    expect(draftEvents.some((item) => item.event_name === 'commonwork_need_created')).toBe(false);

    const needId = await makeNeed('Assess platform options');
    const afterNeed = await eventsFor(admin, requester.id);
    const needEvent = afterNeed.find((item) => item.event_name === 'commonwork_need_created');
    expect(needEvent).toMatchObject({ subject_type: 'need', organisation_id: organisationId });
    expect(needEvent!.properties).toEqual({ visibility: 'private_matches', has_retailer_organisation: false });
    const needScore = await scoreFor(admin, requester.id);
    expect(needScore.intent_score).toBe(20);

    await requester.client.rpc('generate_matches_for_need', { target_need_id: needId })
      .then(({ error }) => expect(error).toBeNull());
    const { data: matches } = await requester.client.from('matches').select('id').eq('need_id', needId);
    expect(matches!.length).toBeGreaterThan(0);
    const { error: introError } = await requester.client.rpc('request_introduction', {
      target_match_id: matches![0].id,
      target_route: 'direct',
      target_suggested_introducer_id: null,
      target_trusted_connector_id: null,
      target_intermediary_note: '',
      target_why_this_person: 'Their experience directly relates to this business problem.',
      target_why_now: 'We are reviewing the approach this month.',
      target_proposed_conversation: 'Compare the evidence and practical validation choices.',
      target_requester_offer: 'I can share our current review framework.',
      target_contact_method_id: requesterSetup.methodId,
    });
    expect(introError).toBeNull();

    const afterIntro = await eventsFor(admin, requester.id);
    const introEvent = afterIntro.find((item) => item.event_name === 'commonwork_introduction_requested');
    expect(introEvent).toMatchObject({ subject_type: 'introduction', properties: { route: 'direct' } });
    expect(JSON.stringify(afterIntro)).not.toMatch(/Their experience|defensible comparison|review framework/);

    const introScore = await scoreFor(admin, requester.id);
    expect(introScore.intent_score).toBe(40);
    expect(introScore.total_score).toBeGreaterThan(needScore.total_score);
    expect(introScore.tier).toBe('high');

    // Catalogue views are recorded once per subject per day.
    await requester.client.rpc('record_catalogue_view', { target_subject_type: 'provider_product', target_slug: 'salesforce-commerce-cloud' });
    await requester.client.rpc('record_catalogue_view', { target_subject_type: 'provider_product', target_slug: 'salesforce-commerce-cloud' });
    await requester.client.rpc('record_catalogue_view', { target_subject_type: 'provider_product', target_slug: 'does-not-exist' });
    const views = (await eventsFor(admin, requester.id)).filter((item) => item.event_name === 'commonwork_product_viewed');
    expect(views).toHaveLength(1);
    const viewScore = await scoreFor(admin, requester.id);
    expect(viewScore.value_score).toBe(introScore.value_score + 5);
    expect(viewScore.total_score).toBeGreaterThan(introScore.total_score);

    // Members cannot read, write or score signals directly.
    const read = await requester.client.from('member_activity_events').select('id');
    expect(read.error || read.data?.length === 0).toBeTruthy();
    const write = await requester.client.from('member_activity_events')
      .insert({ profile_id: requester.id, event_name: 'commonwork_membership_started' });
    expect(write.error).toBeTruthy();
    const scores = await requester.client.from('member_intent_scores').select('profile_id');
    expect(scores.error).toBeTruthy();
    const forged = await requester.client.rpc('record_member_activity', {
      target_profile_id: requester.id, target_event_name: 'commonwork_need_created',
    });
    expect(forged.error).toBeTruthy();
  } finally {
    await requester.remove();
    await expert.remove();
    if (organisationId) await admin.from('organisations').delete().eq('id', organisationId);
  }

  // Deleting a profile removes its events.
  const { count } = await admin.from('member_activity_events').select('id', { count: 'exact', head: true }).eq('profile_id', requester.id);
  expect(count).toBe(0);
});
