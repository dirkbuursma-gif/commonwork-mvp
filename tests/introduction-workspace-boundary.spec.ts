import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('introduction business access requires membership while own privacy and safety controls remain available', async () => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Local introduction member');
  const people: LocalMember[] = [member];
  const introIds: string[] = [];
  let eventId: string | undefined;
  try {
    const attendee = await createLocalMember('Local introduction attendee', { workspaceAccess: false }); people.push(attendee);
    const peer = await createLocalMember('Local introduction peer'); people.push(peer);
    const stranger = await createLocalMember('Local introduction stranger'); people.push(stranger);
    for (const person of people) expect((await admin.from('profiles').insert({ id: person.id, display_name: 'Local introduction fixture' })).error).toBeNull();
    await attendee.provisionConnector();
    const contacts = await admin.from('profile_contact_methods').insert([
      { profile_id: member.id, method_type: 'email', value: member.email, label: 'Local contact', is_primary: true },
      { profile_id: attendee.id, method_type: 'email', value: attendee.email, label: 'Local contact', is_primary: true },
    ]).select('id, profile_id, value');
    expect(contacts.error).toBeNull();
    const attendeeMethod = contacts.data?.find((c: { profile_id: string }) => c.profile_id === attendee.id);
    const memberMethod = contacts.data?.find((c: { profile_id: string }) => c.profile_id === member.id);
    if (!attendeeMethod || !memberMethod) throw new Error('Local contacts missing.');
    const now = new Date().toISOString();
    const vocabulary = await admin.from('competencies').select('id').eq('slug', 'product-data-quality').single();
    expect(vocabulary.error).toBeNull();
    if (!vocabulary.data) throw new Error('Local competence missing.');
    const pendingNeed = await admin.from('competence_needs').insert({
      owner_profile_id: member.id, title: 'Local introduction boundary need',
      business_outcome: 'Local product-data outcome', problem_statement: 'Local product-data problem',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }).select('id').single();
    expect(pendingNeed.error).toBeNull();
    if (!pendingNeed.data) throw new Error('Local active need missing.');
    expect((await admin.from('need_competencies').insert({ need_id: pendingNeed.data.id, competency_id: vocabulary.data.id, importance: 'essential' })).error).toBeNull();
    expect((await admin.from('competence_needs').update({ status: 'active' }).eq('id', pendingNeed.data.id)).error).toBeNull();
    const pendingMatch = await admin.from('matches').insert({
      need_id: pendingNeed.data.id, matched_profile_id: peer.id, relevance_band: 'good', score_internal: 80,
    }).select('id').single();
    expect(pendingMatch.error).toBeNull();
    if (!pendingMatch.data) throw new Error('Local pending match missing.');
    async function makeIntroduction(recipient: string, route: string, status: string, source?: { needId: string; matchId: string }): Promise<string> {
      const result = await admin.from('introductions').insert({
        requester_profile_id: member.id, recipient_profile_id: recipient,
        requester_display_name_snapshot: 'Local requester', recipient_display_name_snapshot: 'Local recipient',
        need_id: source?.needId ?? null, match_id: source?.matchId ?? null,
        route, status, introduced_at: status === 'introduced' ? now : null,
        why_this_person: 'Local experience', why_now: 'Local timing',
        proposed_conversation: 'Local conversation', requester_offer: 'Local contribution',
      }).select('id').single();
      expect(result.error).toBeNull();
      if (!result.data) throw new Error('Local introduction missing.');
      introIds.push(result.data.id);
      return result.data.id as string;
    }
    const introduced = await makeIntroduction(attendee.id, 'direct', 'introduced');
    const assigned = await makeIntroduction(peer.id, 'trusted_connector', 'awaiting_connector', { needId: pendingNeed.data.id, matchId: pendingMatch.data.id });
    for (const [person, method, role] of [[member, memberMethod, 'requester'], [attendee, attendeeMethod, 'recipient']] as const) {
      expect((await admin.from('introduction_participants').insert({
        introduction_id: introduced, profile_id: person.id, role, consent_status: 'accepted', consented_at: now,
        selected_contact_method_id: method.id, contact_method_type: 'email', contact_method_label: 'Local contact',
        contact_method_value: method.value, contact_method_snapshot_at: now,
      })).error).toBeNull();
    }
    for (const [person, role] of [[member, 'requester'], [peer, 'recipient'], [attendee, 'connector']] as const) {
      expect((await admin.from('introduction_participants').insert({
        introduction_id: assigned, profile_id: person.id, role,
        consent_status: role === 'connector' ? 'pending' : 'accepted', consented_at: role === 'connector' ? null : now,
      })).error).toBeNull();
    }
    expect((await admin.from('connector_assignments').insert({ introduction_id: assigned, assigned_profile_id: attendee.id, assignment_type: 'trusted_connector', created_by: member.id })).error).toBeNull();
    expect((await admin.from('introduction_feedback').insert({ introduction_id: introduced, profile_id: attendee.id, conversation_occurred: true, private_feedback: 'Local private feedback' })).error).toBeNull();
    const notice = await admin.from('notifications').insert({ profile_id: attendee.id, introduction_id: introduced, type: 'introduction_requested', title: 'Local notification', body: 'Local introduction notice' }).select('id').single();
    expect(notice.error).toBeNull();
    if (!notice.data) throw new Error('Local notification missing.');
    const deniedCalls: Array<[string, Record<string, unknown>]> = [
      ['get_my_introduction_inbox', {}],
      ['release_introduction_contacts', { target_introduction_id: introduced }],
      ['expire_introduction_if_due', { target_introduction_id: introduced }],
      ['recipient_introduction_response', { target_introduction_id: introduced, target_action: 'accept', target_contact_method_id: attendeeMethod.id }],
      ['requester_introduction_context_response', { target_introduction_id: introduced, target_context_response: 'Local context' }],
      ['connector_introduction_response', { target_introduction_id: assigned, target_action: 'make_introduction' }],
      ['requester_review_intermediary_suggestion', { target_introduction_id: assigned, accept_suggestion: true }],
      ['cancel_introduction', { target_introduction_id: introduced }],
      ['submit_introduction_feedback', { target_introduction_id: introduced, target_conversation_occurred: true, target_match_relevant: true, target_competencies_relevant: true, target_welcome_future: false, target_private_feedback: 'Denied local update' }],
      ['request_introduction', { target_match_id: randomUUID(), target_route: 'direct', target_suggested_introducer_id: null, target_trusted_connector_id: null, target_why_this_person: 'Local person', target_why_now: 'Local timing', target_proposed_conversation: 'Local conversation', target_requester_offer: 'Local contribution', target_contact_method_id: attendeeMethod.id, target_intermediary_note: '' }],
    ];
    async function assertDenied() {
      for (const table of ['introductions', 'introduction_participants', 'connector_assignments', 'introduction_feedback']) {
        const result = await attendee.client.from(table).select('id');
        expect(result.error, table).toBeNull(); expect(result.data, table).toEqual([]);
      }
      const notifications = await attendee.client.from('notifications').select('id').eq('introduction_id', introduced);
      expect(notifications.error).toBeNull(); expect(notifications.data).toEqual([]);
      for (const [name, args] of deniedCalls) {
        const result = await attendee.client.rpc(name, args);
        expect(result.error?.code, name).toBe('42501');
        expect(result.error?.message, name).toBe('Workspace membership is required.');
        expect(result.data, name).toBeNull();
      }
      const state = await admin.from('introductions').select('status').eq('id', assigned).single();
      expect(state.error).toBeNull(); expect(state.data?.status).toBe('awaiting_connector');
      const feedback = await admin.from('introduction_feedback').select('private_feedback').eq('introduction_id', introduced).eq('profile_id', attendee.id).single();
      expect(feedback.error).toBeNull(); expect(feedback.data?.private_feedback).toBe('Local private feedback');
    }
    await assertDenied();
    expect((await admin.from('workspace_memberships').insert({ user_id: attendee.id, status: 'active', source: 'operator' })).error).toBeNull();
    const inbox = await attendee.client.rpc('get_my_introduction_inbox');
    expect(inbox.error).toBeNull();
    expect(inbox.data).toEqual(expect.arrayContaining([expect.objectContaining({ introduction_id: introduced }), expect.objectContaining({ introduction_id: assigned })]));
    const stillPending = await admin.from('introductions').select('status').eq('id', assigned).single();
    expect(stillPending.error).toBeNull(); expect(stillPending.data?.status).toBe('awaiting_connector');
    const released = await attendee.client.rpc('release_introduction_contacts', { target_introduction_id: introduced });
    expect(released.error).toBeNull();
    expect(released.data).toEqual([expect.objectContaining({ profile_id: member.id, value: member.email })]);
    const outsider = await stranger.client.rpc('get_my_introduction_inbox');
    expect(outsider.error).toBeNull(); expect(outsider.data).toEqual([]);
    expect((await admin.from('workspace_memberships').update({ status: 'revoked', revoked_at: now }).eq('user_id', attendee.id)).error).toBeNull();
    await assertDenied();
    const event = await admin.from('events').insert({ slug: `intro-boundary-${randomUUID()}`, title: 'Local introduction boundary event', manager_profile_id: member.id, is_published: true }).select('id').single();
    expect(event.error).toBeNull(); if (!event.data) throw new Error('Local event missing.'); eventId = event.data.id;
    expect((await admin.from('event_attendees').insert({ event_id: eventId, profile_id: attendee.id, status: 'approved', decided_at: now, decided_by: member.id })).error).toBeNull();
    const eventAccess = await attendee.client.rpc('has_approved_event_access', { target_event_id: eventId });
    expect(eventAccess.error).toBeNull(); expect(eventAccess.data).toBe(true);
    const workspace = await attendee.client.rpc('can_access_member_workspace');
    expect(workspace.error).toBeNull(); expect(workspace.data).toBe(false);
    await assertDenied();
    const unrelatedBlock = await attendee.client.rpc('block_member_from_introductions', { target_profile_id: stranger.id, should_block: true });
    expect(unrelatedBlock.error?.code).toBe('42501'); expect(unrelatedBlock.data).toBeNull();
    const safetyBlock = await attendee.client.rpc('block_member_from_introductions', { target_profile_id: member.id, should_block: true });
    expect(safetyBlock.error).toBeNull(); expect(safetyBlock.data).toBe(true);
    const unblock = await attendee.client.rpc('block_member_from_introductions', { target_profile_id: member.id, should_block: false });
    expect(unblock.error).toBeNull(); expect(unblock.data).toBe(true);
    const report = await attendee.client.rpc('report_introduction', { target_introduction_id: introduced, target_category: 'privacy_concern', target_details: 'Local safety-control regression' });
    expect(report.error).toBeNull(); expect(typeof report.data).toBe('string');
    const privacy = await attendee.client.rpc('request_member_privacy_action', { target_request_type: 'data_export', target_note: 'Local privacy-control regression' });
    expect(privacy.error).toBeNull();
    const requests = await attendee.client.rpc('get_my_privacy_requests');
    expect(requests.error).toBeNull(); expect(requests.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: privacy.data })]));
    const ownExport = await attendee.client.rpc('export_my_member_data');
    expect(ownExport.error).toBeNull(); expect(ownExport.data?.authentication_email).toBe(attendee.email);
    const ownMethods = await attendee.client.rpc('get_my_contact_methods');
    expect(ownMethods.error).toBeNull(); expect(ownMethods.data).toEqual([expect.objectContaining({ id: attendeeMethod.id, value: attendee.email })]);
  } finally {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    if (introIds.length) await admin.from('introductions').delete().in('id', introIds);
    for (const person of people) await person.remove();
  }
});
