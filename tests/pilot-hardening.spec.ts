import { expect, test } from '@playwright/test';
import { createLocalMember } from './helpers/local-supabase';

async function createProfile(member: Awaited<ReturnType<typeof createLocalMember>>, name: string, discoverable = false) {
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: name,
    professional_summary: `${name} works on practical commerce problems.`,
    what_i_contribute: 'Evidence-led professional context.',
    what_i_am_exploring: 'Useful peer conversations.',
    profile_visibility: discoverable ? 'members' : 'private',
  });
  expect(error).toBeNull();
}

async function productDataCompetencyId(member: Awaited<ReturnType<typeof createLocalMember>>) {
  const { data, error } = await member.client.from('competencies').select('id').eq('slug', 'product-data-quality').single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function makeMatchReady(member: Awaited<ReturnType<typeof createLocalMember>>, name: string, competencyId: string) {
  await createProfile(member, name, true);
  const { data: profileCompetency, error: competenceError } = await member.client
    .from('profile_competencies')
    .insert({ profile_id: member.id, competency_id: competencyId, member_statement: `${name} improves product-data quality.`, discoverable: true })
    .select('id')
    .single();
  expect(competenceError).toBeNull();
  const { error: evidenceError } = await member.client.from('competence_evidence').insert({
    profile_competency_id: profileCompetency!.id,
    title: 'Product data example',
    context: 'Product data had inconsistent attributes.',
    contribution: 'I introduced validation and ownership.',
    outcome: 'Teams could resolve inconsistent product records.',
    visibility: 'members',
  });
  expect(evidenceError).toBeNull();
  const { error: preferencesError } = await member.client.from('contact_preferences').insert({
    profile_id: member.id,
    open_to_peer_exchange: true,
    availability_status: 'open',
    conversation_capacity: 2,
  });
  expect(preferencesError).toBeNull();
}

async function insertDraftNeed(member: Awaited<ReturnType<typeof createLocalMember>>, competencyId: string, title: string) {
  const { data: need, error: needError } = await member.client.from('competence_needs').insert({
    owner_profile_id: member.id,
    title,
    business_outcome: 'Improve product-data readiness across channels.',
    problem_statement: 'Ownership and validation are inconsistent.',
    conversation_type: 'peer_exchange',
    visibility: 'private_matches',
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).select('id').single();
  expect(needError).toBeNull();
  const { error: termsError } = await member.client.from('need_competencies').insert({
    need_id: need!.id,
    competency_id: competencyId,
    importance: 'essential',
  });
  expect(termsError).toBeNull();
  return need!.id as string;
}

async function addContactMethod(member: Awaited<ReturnType<typeof createLocalMember>>) {
  const { data, error } = await member.client.rpc('save_profile_contact_method', {
    target_method_id: null,
    target_method_type: 'email',
    target_value: `pilot-${member.id.slice(0, 8)}@example.test`,
    target_label: 'Work email',
    make_primary: true,
  });
  expect(error).toBeNull();
  return String(data);
}

test('Connector administration CLI is allowlisted, audited and guarded for production', async () => {
  const administrator = await createLocalMember('Pilot Administrator');
  const target = await createLocalMember('Pilot Connector');
  const ordinaryMember = await createLocalMember('Ordinary Member');

  try {
    for (const member of [administrator, target, ordinaryMember]) {
      const { error } = await member.client.from('profiles').insert({
        id: member.id,
        display_name: member === administrator ? 'Pilot Administrator' : member === target ? 'Pilot Connector' : 'Ordinary Member',
        professional_summary: 'A pilot test profile.',
        what_i_contribute: 'Practical professional context.',
        profile_visibility: 'private',
      });
      expect(error).toBeNull();
    }
    await administrator.provisionAdministrator();

    expect(() => ordinaryMember.runConnectorAdminCli(['add', target.email, '--capacity', '3', '--yes']))
      .toThrow(/not an active Commonwork administrator/);
    expect(() => administrator.runConnectorAdminCli(['add', target.email, '--capacity', '3'], 'production'))
      .toThrow(/Refusing a production Connector change/);

    const assignedOutput = administrator.runConnectorAdminCli(['add', target.email, '--capacity', '3', '--yes']);
    expect(assignedOutput).toContain('Assigned Connector Pilot Connector');
    expect(await target.connectorCapacity()).toBe(3);

    const listing = administrator.runConnectorAdminCli(['list', '--yes']);
    expect(listing).toContain('Pilot Connector');
    expect(listing).toContain('active');

    const removedOutput = administrator.runConnectorAdminCli(['remove', target.email, '--yes']);
    expect(removedOutput).toContain('Revoked Connector Pilot Connector');
    expect(listing).not.toContain('service_role');
  } finally {
    await administrator.remove();
    await target.remove();
    await ordinaryMember.remove();
  }
});

test('member privacy requests, export, deactivation and introduction blocks remain owner-scoped', async () => {
  const member = await createLocalMember('Privacy Member');
  const other = await createLocalMember('Other Member');
  try {
    await createProfile(other, 'Other Member', true);
    const competencyId = await productDataCompetencyId(member);
    await makeMatchReady(member, 'Privacy Member', competencyId);
    await addContactMethod(member);

    const { data: blockResult, error: blockError } = await member.client.rpc('block_member_from_introductions', {
      target_profile_id: other.id,
      should_block: true,
    });
    expect(blockError).toBeNull();
    expect(blockResult).toBe(true);
    const { data: ownBlocks } = await member.client.from('profile_introduction_blocks')
      .select('blocked_profile_id, blocked_display_name').eq('profile_id', member.id);
    expect(ownBlocks).toEqual([{ blocked_profile_id: other.id, blocked_display_name: 'Other Member' }]);
    const { data: hiddenBlocks } = await other.client.from('profile_introduction_blocks')
      .select('blocked_profile_id').eq('profile_id', member.id);
    expect(hiddenBlocks).toEqual([]);
    const { error: forgedBlockError } = await other.client.from('profile_introduction_blocks').insert({
      profile_id: member.id,
      blocked_profile_id: other.id,
      blocked_display_name: 'Forged entry',
    });
    expect(forgedBlockError).toBeTruthy();
    const { data: unblockResult, error: unblockError } = await member.client.rpc('block_member_from_introductions', {
      target_profile_id: other.id,
      should_block: false,
    });
    expect(unblockError).toBeNull();
    expect(unblockResult).toBe(true);

    const firstExportRequest = await member.client.rpc('request_member_privacy_action', {
      target_request_type: 'data_export',
      target_note: 'Provide my profile data.',
    });
    const repeatedExportRequest = await member.client.rpc('request_member_privacy_action', {
      target_request_type: 'data_export',
      target_note: 'Repeated request should be idempotent.',
    });
    expect(firstExportRequest.error).toBeNull();
    expect(repeatedExportRequest.error).toBeNull();
    expect(repeatedExportRequest.data).toBe(firstExportRequest.data);
    const { data: exportData, error: exportError } = await member.client.rpc('export_my_member_data');
    expect(exportError).toBeNull();
    expect(exportData).toMatchObject({ authentication_email: member.email, profile: { id: member.id } });
    expect(exportData?.contact_methods).toHaveLength(1);

    const { data: deletionRequest, error: deletionError } = await member.client.rpc('request_member_privacy_action', {
      target_request_type: 'account_deletion',
      target_note: 'Please review deletion of this test account.',
    });
    expect(deletionError).toBeNull();
    const { data: ownRequests } = await member.client.rpc('get_my_privacy_requests');
    expect(ownRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: deletionRequest, request_type: 'account_deletion', status: 'pending' }),
    ]));
    const { data: otherRequests } = await other.client.rpc('get_my_privacy_requests');
    expect(otherRequests).toEqual([]);

    const { data: deactivated, error: deactivateError } = await member.client.rpc('deactivate_my_member_profile');
    expect(deactivateError).toBeNull();
    expect(deactivated).toBe(true);
    const { data: profileData } = await member.client.rpc('get_my_profile');
    const profile = Array.isArray(profileData) ? profileData[0] : profileData;
    expect(profile?.profile_visibility).toBe('private');
    const { data: preferences } = await member.client.from('contact_preferences')
      .select('availability_status, conversation_capacity').eq('profile_id', member.id).single();
    expect(preferences).toMatchObject({ availability_status: 'unavailable', conversation_capacity: 0 });
  } finally {
    await member.remove();
    await other.remove();
  }
});

test('active needs, match recalculation and introduction requests are rate-limited in the database', async () => {
  const owner = await createLocalMember('Rate Limited Requester');
  const recipients = await Promise.all(Array.from({ length: 6 }, (_, index) => createLocalMember(`Rate Recipient ${index + 1}`)));
  try {
    await createProfile(owner, 'Rate Limited Requester');
    const competencyId = await productDataCompetencyId(owner);
    const activeNeedIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const needId = await insertDraftNeed(owner, competencyId, `Active need ${index + 1}`);
      const { error } = await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', needId);
      expect(error).toBeNull();
      activeNeedIds.push(needId);
    }
    const sixthNeedId = await insertDraftNeed(owner, competencyId, 'Sixth active need');
    const { error: sixthNeedError } = await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', sixthNeedId);
    expect(sixthNeedError).toBeTruthy();

    for (let index = 0; index < recipients.length; index += 1) {
      await makeMatchReady(recipients[index]!, `Rate Recipient ${index + 1}`, competencyId);
    }
    const requesterContactId = await addContactMethod(owner);
    const { data: generated, error: initialMatchError } = await owner.client.rpc('generate_matches_for_need', { target_need_id: activeNeedIds[0] });
    expect(initialMatchError).toBeNull();
    expect(generated).toBe(6);
    for (let count = 0; count < 8; count += 1) {
      const { error } = await owner.client.rpc('generate_matches_for_need', { target_need_id: activeNeedIds[0] });
      expect(error).toBeNull();
    }
    const concurrentRecalculations = await Promise.all([
      owner.client.rpc('generate_matches_for_need', { target_need_id: activeNeedIds[1] }),
      owner.client.rpc('generate_matches_for_need', { target_need_id: activeNeedIds[2] }),
    ]);
    expect(concurrentRecalculations.filter(({ error }) => !error)).toHaveLength(1);
    expect(concurrentRecalculations.filter(({ error }) => error?.code === 'P0001')).toHaveLength(1);
    const { error: eleventhRecalculationError } = await owner.client.rpc('generate_matches_for_need', { target_need_id: activeNeedIds[0] });
    expect(eleventhRecalculationError).toBeTruthy();

    const { data: matches, error: matchesError } = await owner.client.from('matches')
      .select('id, matched_profile_id').eq('need_id', activeNeedIds[0]).order('created_at', { ascending: true });
    expect(matchesError).toBeNull();
    for (let index = 0; index < 5; index += 1) {
      const match = matches!.find((item) => item.matched_profile_id === recipients[index]!.id);
      expect(match).toBeTruthy();
      const { error } = await owner.client.rpc('request_introduction', {
        target_match_id: match!.id,
        target_route: 'direct',
        target_suggested_introducer_id: null,
        target_trusted_connector_id: null,
        target_why_this_person: 'Their competence is relevant to this work.',
        target_why_now: 'We are reviewing this work this week.',
        target_proposed_conversation: 'Compare practical product-data validation methods.',
        target_requester_offer: 'I can share our current framework.',
        target_contact_method_id: requesterContactId,
        target_intermediary_note: '',
      });
      expect(error).toBeNull();
    }
    const sixthMatch = matches!.find((item) => item.matched_profile_id === recipients[5]!.id);
    const { error: sixthIntroductionError } = await owner.client.rpc('request_introduction', {
      target_match_id: sixthMatch!.id,
      target_route: 'direct',
      target_suggested_introducer_id: null,
      target_trusted_connector_id: null,
      target_why_this_person: 'Their competence is relevant to this work.',
      target_why_now: 'We are reviewing this work this week.',
      target_proposed_conversation: 'Compare practical product-data validation methods.',
      target_requester_offer: 'I can share our current framework.',
      target_contact_method_id: requesterContactId,
      target_intermediary_note: '',
    });
    expect(sixthIntroductionError).toBeTruthy();
  } finally {
    await owner.remove();
    for (const recipient of recipients) await recipient.remove();
  }
});
