import { expect, test, type Page } from '@playwright/test';
import { createLocalMember, type LocalMember } from './helpers/local-supabase';

type PreparedMember = LocalMember & { competencyId: string };

async function createProfile(member: LocalMember, displayName: string, discoverable = true) {
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: displayName,
    professional_summary: `${displayName} works on practical commerce problems.`,
    what_i_contribute: `${displayName} contributes clear, evidence-led thinking.`,
    what_i_am_exploring: 'Useful professional conversations.',
    profile_visibility: discoverable ? 'members' : 'private',
  });
  expect(error).toBeNull();
}

async function prepareMember(member: LocalMember, displayName: string, withContact = true): Promise<PreparedMember> {
  const { data: competency, error: vocabularyError } = await member.client
    .from('competencies')
    .select('id')
    .eq('slug', 'product-data-quality')
    .single();
  expect(vocabularyError).toBeNull();
  await createProfile(member, displayName);
  const { data: profileCompetency, error: competencyError } = await member.client
    .from('profile_competencies')
    .insert({
      profile_id: member.id,
      competency_id: competency!.id,
      member_statement: `${displayName} improves product-data quality with practical controls.`,
      discoverable: true,
    })
    .select('id')
    .single();
  expect(competencyError).toBeNull();
  const { error: evidenceError } = await member.client.from('competence_evidence').insert({
    profile_competency_id: profileCompetency!.id,
    title: 'Product-data improvement example',
    context: 'Product records were inconsistent across several channels.',
    contribution: 'I defined data ownership and validation rules.',
    outcome: 'Teams could review and correct incomplete records.',
    visibility: 'matches_only',
  });
  expect(evidenceError).toBeNull();
  const { error: preferencesError } = await member.client.from('contact_preferences').insert({
    profile_id: member.id,
    open_to_peer_exchange: true,
    availability_status: 'open',
    conversation_capacity: 3,
  });
  expect(preferencesError).toBeNull();
  if (withContact) await addContactMethod(member, 'email', `${displayName.toLowerCase().replaceAll(' ', '.')}@work.example`, 'Work email');
  return { ...member, competencyId: competency!.id };
}

async function addContactMethod(member: LocalMember, methodType: 'email' | 'calendar_url', value: string, label: string) {
  const { data, error } = await member.client.rpc('save_profile_contact_method', {
    target_method_id: null,
    target_method_type: methodType,
    target_value: value,
    target_label: label,
    make_primary: true,
  });
  expect(error).toBeNull();
  return String(data);
}

async function createNeedWithMatches(owner: LocalMember, recipient: PreparedMember, title: string) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: need, error: needError } = await owner.client
    .from('competence_needs')
    .insert({
      owner_profile_id: owner.id,
      title,
      business_outcome: 'Improve product-data readiness for several channels.',
      problem_statement: 'Teams need clearer ownership and evidence-led validation.',
      what_requester_offers: 'A peer exchange on practical validation approaches.',
      conversation_type: 'peer_exchange',
      visibility: 'private_matches',
      expires_at: expiresAt,
      status: 'draft',
    })
    .select('id')
    .single();
  expect(needError).toBeNull();
  const { error: needTermError } = await owner.client.from('need_competencies').insert({
    need_id: need!.id,
    competency_id: recipient.competencyId,
    importance: 'essential',
  });
  expect(needTermError).toBeNull();
  const { error: activateError } = await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', need!.id);
  expect(activateError).toBeNull();
  const { error: matchingError } = await owner.client.rpc('generate_matches_for_need', { target_need_id: need!.id });
  expect(matchingError).toBeNull();
  const { data: match, error: matchError } = await owner.client
    .from('matches')
    .select('id, need_id, matched_profile_id, status')
    .eq('need_id', need!.id)
    .eq('matched_profile_id', recipient.id)
    .single();
  expect(matchError).toBeNull();
  return { needId: need!.id, matchId: match!.id };
}

async function getPrimaryContactMethodId(member: LocalMember) {
  const { data, error } = await member.client
    .from('profile_contact_methods')
    .select('id')
    .eq('profile_id', member.id)
    .eq('is_primary', true)
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function requestIntroduction(
  owner: LocalMember,
  matchId: string,
  contactMethodId: string,
  route: 'direct' | 'suggested_introducer' | 'trusted_connector',
  suggestedIntroducerId: string | null = null,
  trustedConnectorId: string | null = null,
) {
  const { data, error } = await owner.client.rpc('request_introduction', {
    target_match_id: matchId,
    target_route: route,
    target_suggested_introducer_id: suggestedIntroducerId,
    target_trusted_connector_id: trustedConnectorId,
    target_why_this_person: 'Their experience directly relates to this business problem.',
    target_why_now: 'We are reviewing the approach this month.',
    target_proposed_conversation: 'Compare the evidence and practical validation choices.',
    target_requester_offer: 'I can share our current review framework.',
    target_contact_method_id: contactMethodId,
    target_intermediary_note: route === 'direct' ? '' : 'They understand this work context and may help us connect.',
  });
  expect(error).toBeNull();
  return String(data);
}

async function addSession(page: Page, member: LocalMember) {
  await page.context().addCookies(member.cookies.map(({ name, value }) => ({
    name,
    value,
    url: 'http://127.0.0.1:4322',
  })));
}

async function completeRequestThroughUi(page: Page, matchId: string) {
  await page.goto(`/introductions/request/${matchId}`);
  await expect(page.getByRole('heading', { name: 'Request an introduction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What the recipient will receive' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByLabel('Why this person?').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Why now?')).toBeFocused();
  await page.getByLabel('Why this person?').fill('Their product-data experience directly relates to the work we need to do.');
  await page.getByLabel('Why now?').fill('We are reviewing our catalogue validation approach this month.');
  await page.getByLabel('What conversation do you propose?').fill('Compare practical ownership and validation approaches.');
  await page.getByLabel('What can you contribute in return?').fill('I can share our current channel-readiness framework.');
  await page.getByRole('button', { name: 'Preview and send request' }).click();
  await expect(page).toHaveURL(/\/introductions\/[0-9a-f-]+\?status=request-sent/);
  return page.url().match(/\/introductions\/([0-9a-f-]+)/)?.[1] ?? '';
}

test('signed-out visitors cannot access the introduction inbox', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/introductions');
    await expect(page).toHaveURL(/\/sign-in/);
  } finally {
    await context.close();
  }
});

test('direct introduction keeps contact private until consent and feedback private to its author', async ({ browser }) => {
  const owner = await createLocalMember('Requester Member');
  const recipient = await createLocalMember('Recipient Member');
  const outsider = await createLocalMember('Unrelated Member');
  const preparedRecipient = await prepareMember(recipient, 'Recipient Member', false);
  await createProfile(owner, 'Requester Member', false);
  await createProfile(outsider, 'Unrelated Member', false);
  const { needId, matchId } = await createNeedWithMatches(owner, preparedRecipient, 'Improve product-data validation');
  const ownerContext = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
  const recipientContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const outsiderContext = await browser.newContext();

  try {
    const { data: hiddenOwnerMethod } = await recipient.client
      .from('profile_contact_methods')
      .select('value')
      .eq('profile_id', owner.id);
    expect(hiddenOwnerMethod).toEqual([]);

    await addSession(await ownerContext.newPage(), owner);
    const ownerPage = ownerContext.pages()[0]!;
    await ownerPage.goto('/profiles/me');
    await ownerPage.getByLabel('Type').selectOption('email');
    await expect(ownerPage.getByLabel('Contact value')).toHaveValue('');
    await ownerPage.getByLabel('Contact value').fill('requester.work@example.test');
    await ownerPage.getByLabel('Label').fill('Professional email');
    await ownerPage.getByLabel('Set as primary').check();
    await ownerPage.getByRole('button', { name: 'Save contact method' }).click();
    await expect(ownerPage.getByText('Contact method saved privately.')).toBeVisible();
    const { data: ownerMethods, error: ownerMethodError } = await owner.client
      .from('profile_contact_methods')
      .select('id, value, label')
      .eq('profile_id', owner.id);
    expect(ownerMethodError).toBeNull();
    expect(ownerMethods).toEqual([expect.objectContaining({ value: 'requester.work@example.test', label: 'Professional email' })]);

    const introductionId = await completeRequestThroughUi(ownerPage, matchId);
    expect(introductionId).toMatch(/^[0-9a-f-]+$/);
    await expect(ownerPage.getByRole('heading', { name: 'Introduction with Recipient Member' })).toBeVisible();
    await expect(ownerPage.locator('body')).toContainText('awaiting recipient');

    const { data: createdRow, error: directTableError } = await owner.client
      .from('introductions')
      .select('id')
      .eq('id', introductionId)
      .maybeSingle();
    expect(directTableError).toBeNull();
    expect(createdRow?.id).toBe(introductionId);
    const { error: requesterCannotAcceptError } = await owner.client.rpc('recipient_introduction_response', {
      target_introduction_id: introductionId,
      target_action: 'accept',
      target_contact_method_id: ownerMethods![0]!.id,
    });
    expect(requesterCannotAcceptError).toBeTruthy();
    const { data: unrelatedRow } = await outsider.client
      .from('introductions')
      .select('id')
      .eq('id', introductionId)
      .maybeSingle();
    expect(unrelatedRow).toBeNull();
    const { error: hiddenContactColumnError } = await owner.client
      .from('introduction_participants')
      .select('contact_method_value')
      .eq('introduction_id', introductionId);
    expect(hiddenContactColumnError).toBeTruthy();

    const { data: prematureOwnerContacts, error: ownerReleaseError } = await owner.client.rpc('release_introduction_contacts', {
      target_introduction_id: introductionId,
    });
    expect(ownerReleaseError).toBeTruthy();
    expect(prematureOwnerContacts).toBeNull();
    const { data: prematureRecipientContacts, error: recipientReleaseError } = await recipient.client.rpc('release_introduction_contacts', {
      target_introduction_id: introductionId,
    });
    expect(recipientReleaseError).toBeTruthy();
    expect(prematureRecipientContacts).toBeNull();

    const { data: outsiderInbox, error: outsiderInboxError } = await outsider.client.rpc('get_my_introduction_inbox');
    expect(outsiderInboxError).toBeNull();
    expect(outsiderInbox).toEqual([]);
    await outsiderContext.addCookies(outsider.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto(`/introductions/${introductionId}`);
    await expect(outsiderPage.getByRole('heading', { name: 'This introduction is unavailable' })).toBeVisible();
    await expect(outsiderPage.locator('body')).not.toContainText('Recipient Member');

    await addSession(await recipientContext.newPage(), recipient);
    const recipientPage = recipientContext.pages()[0]!;
    await recipientPage.goto('/introductions');
    await expect(recipientPage.locator('body')).not.toContainText(owner.email);
    await expect(recipientPage.getByRole('heading', { name: 'Incoming' })).toBeVisible();
    await expect(recipientPage.getByRole('link', { name: 'Requester Member' })).toBeVisible();
    const { data: requestNotification } = await recipient.client
      .from('notifications')
      .select('id')
      .eq('introduction_id', introductionId)
      .eq('type', 'introduction_requested')
      .single();
    const { data: firstReadAt, error: firstReadError } = await recipient.client.rpc('mark_introduction_notification_read', {
      target_notification_id: requestNotification!.id,
    });
    expect(firstReadError).toBeNull();
    const { data: repeatedReadAt, error: repeatedReadError } = await recipient.client.rpc('mark_introduction_notification_read', {
      target_notification_id: requestNotification!.id,
    });
    expect(repeatedReadError).toBeNull();
    expect(repeatedReadAt).toBe(firstReadAt);
    await recipientPage.getByRole('link', { name: 'Requester Member' }).click();
    await expect(recipientPage.getByText('Professional email')).toBeVisible();
    await expect(recipientPage.locator('body')).not.toContainText('requester.work@example.test');
    await expect(recipientPage.getByText('Add a contact method before accepting.')).toBeVisible();

    const { error: preIntroductionFeedbackError } = await recipient.client.rpc('submit_introduction_feedback', {
      target_introduction_id: introductionId,
      target_conversation_occurred: true,
      target_match_relevant: true,
      target_competencies_relevant: true,
      target_welcome_future: true,
      target_private_feedback: 'Must not be accepted before introduction.',
    });
    expect(preIntroductionFeedbackError).toBeTruthy();

    await recipientPage.goto('/profiles/me');
    await recipientPage.getByLabel('Type').selectOption('calendar_url');
    await recipientPage.getByLabel('Contact value').fill('https://calendar.example.test/recipient-ui');
    await recipientPage.getByLabel('Label').fill('Work calendar');
    await recipientPage.getByRole('button', { name: 'Save contact method' }).click();
    await expect(recipientPage.getByText('Contact method saved privately.')).toBeVisible();
    const { data: recipientMethods, error: recipientMethodError } = await recipient.client
      .from('profile_contact_methods')
      .select('id, value, label')
      .eq('profile_id', recipient.id);
    expect(recipientMethodError).toBeNull();
    expect(recipientMethods).toEqual([expect.objectContaining({ value: 'https://calendar.example.test/recipient-ui', label: 'Work calendar' })]);
    await recipientPage.goto(`/introductions/${introductionId}`);
    await recipientPage.getByLabel('Contact method to share if the introduction proceeds').selectOption(recipientMethods![0]!.id);
    await recipientPage.getByRole('button', { name: 'Accept introduction' }).click();
    await expect(recipientPage.locator('body')).toContainText('introduced');

    const { data: ownerContacts, error: ownerContactsError } = await owner.client.rpc('release_introduction_contacts', {
      target_introduction_id: introductionId,
    });
    expect(ownerContactsError).toBeNull();
    expect(ownerContacts).toEqual([expect.objectContaining({ profile_id: recipient.id, method_type: 'calendar_url', value: 'https://calendar.example.test/recipient-ui', label: 'Work calendar' })]);
    expect(ownerContacts?.some((item: { value: string }) => item.value === recipient.email)).toBe(false);

    const { data: recipientContacts, error: recipientContactsError } = await recipient.client.rpc('release_introduction_contacts', {
      target_introduction_id: introductionId,
    });
    expect(recipientContactsError).toBeNull();
    expect(recipientContacts).toEqual([expect.objectContaining({ profile_id: owner.id, method_type: 'email', value: 'requester.work@example.test', label: 'Professional email' })]);
    expect(recipientContacts?.some((item: { value: string }) => item.value === owner.email)).toBe(false);
    const { error: deleteReleasedMethodError } = await recipient.client.rpc('delete_profile_contact_method', {
      target_method_id: recipientMethods![0]!.id,
    });
    expect(deleteReleasedMethodError).toBeNull();
    const { data: preservedContactSnapshot, error: preservedSnapshotError } = await owner.client.rpc('release_introduction_contacts', {
      target_introduction_id: introductionId,
    });
    expect(preservedSnapshotError).toBeNull();
    expect(preservedContactSnapshot).toEqual([expect.objectContaining({ profile_id: recipient.id, value: 'https://calendar.example.test/recipient-ui' })]);

    const { error: ownerFeedbackError } = await owner.client.rpc('submit_introduction_feedback', {
      target_introduction_id: introductionId,
      target_conversation_occurred: true,
      target_match_relevant: true,
      target_competencies_relevant: true,
      target_welcome_future: true,
      target_private_feedback: 'My private follow-up only.',
    });
    expect(ownerFeedbackError).toBeNull();
    const { data: recipientCannotSeeOwnerFeedback } = await recipient.client
      .from('introduction_feedback')
      .select('private_feedback')
      .eq('introduction_id', introductionId);
    expect(recipientCannotSeeOwnerFeedback).toEqual([]);

    const { error: recipientFeedbackError } = await recipient.client.rpc('submit_introduction_feedback', {
      target_introduction_id: introductionId,
      target_conversation_occurred: true,
      target_match_relevant: true,
      target_competencies_relevant: true,
      target_welcome_future: false,
      target_private_feedback: 'My own private follow-up.',
    });
    expect(recipientFeedbackError).toBeNull();
    const { data: finalIntro } = await owner.client.rpc('get_my_introduction_inbox');
    expect(finalIntro).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: introductionId, status: 'completed' }),
    ]));

    const { error: snapshotUpdateError } = await owner.client
      .from('competence_needs')
      .update({ business_outcome: 'Changed after the introduction was issued.' })
      .eq('id', needId);
    expect(snapshotUpdateError).toBeNull();
    const { data: unchangedSnapshot } = await owner.client.rpc('get_my_introduction_inbox');
    const completedItem = unchangedSnapshot?.find((item: { introduction_id: string; approved_context_snapshot: Record<string, unknown> }) => item.introduction_id === introductionId);
    expect(completedItem?.approved_context_snapshot.business_problem_summary).toContain('Improve product-data readiness');
  } finally {
    await ownerContext.close();
    await recipientContext.close();
    await outsiderContext.close();
    await owner.remove();
    await recipient.remove();
    await outsider.remove();
  }
});

test('suggested introducers confirm familiarity and Connectors act only on assigned requests', async () => {
  const owner = await createLocalMember('Introduction Requester');
  const recipient = await createLocalMember('Introduction Recipient');
  const suggestedIntroducer = await createLocalMember('Suggested Introducer');
  const connector = await createLocalMember('Trusted Connector');
  const replacementConnector = await createLocalMember('Replacement Connector');
  const outsider = await createLocalMember('Unrelated Member');

  try {
    await createProfile(owner, 'Introduction Requester', false);
    const preparedRecipient = await prepareMember(recipient, 'Introduction Recipient');
    await prepareMember(suggestedIntroducer, 'Suggested Introducer');
    await prepareMember(connector, 'Trusted Connector');
    await prepareMember(replacementConnector, 'Replacement Connector');
    await createProfile(outsider, 'Unrelated Member', false);
    await connector.provisionConnector(2);
    await replacementConnector.provisionConnector(2);
    const ownerMethodId = await addContactMethod(owner, 'email', 'requester.route@example.test', 'Work email');
    const recipientMethodId = await getPrimaryContactMethodId(recipient);
    const { matchId: suggestedMatchId } = await createNeedWithMatches(owner, preparedRecipient, 'Peer review for product data');
    const suggestedIntroductionId = await requestIntroduction(owner, suggestedMatchId, ownerMethodId, 'suggested_introducer', suggestedIntroducer.id);
    const { data: earlyIntroducerInbox } = await suggestedIntroducer.client.rpc('get_my_introduction_inbox');
    expect(earlyIntroducerInbox).toEqual([]);
    const { data: earlyIntroducerNotifications } = await suggestedIntroducer.client
      .from('notifications')
      .select('id')
      .eq('introduction_id', suggestedIntroductionId);
    expect(earlyIntroducerNotifications).toEqual([]);
    const { data: recipientPendingInbox } = await recipient.client.rpc('get_my_introduction_inbox');
    expect(recipientPendingInbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: suggestedIntroductionId, route: 'suggested_introducer', assignment_type: null, assigned_profile_id: null }),
    ]));

    const { data: clarifyResult, error: clarifyError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: suggestedIntroductionId,
      target_action: 'ask_context',
      target_context_question: 'Which product-data signals are most important to compare?',
    });
    expect(clarifyError).toBeNull();
    expect(clarifyResult).toBe('awaiting_requester_context');
    const { data: contextResult, error: contextError } = await owner.client.rpc('requester_introduction_context_response', {
      target_introduction_id: suggestedIntroductionId,
      target_context_response: 'We are focusing on attribute completeness, ownership and channel consistency.',
    });
    expect(contextError).toBeNull();
    expect(contextResult).toBe('awaiting_recipient');
    const { error: secondClarificationError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: suggestedIntroductionId,
      target_action: 'ask_context',
      target_context_question: 'Can you send another clarification?',
    });
    expect(secondClarificationError).toBeTruthy();

    const { data: recipientAccept, error: recipientAcceptError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: suggestedIntroductionId,
      target_action: 'accept',
      target_contact_method_id: recipientMethodId,
    });
    expect(recipientAcceptError).toBeNull();
    expect(recipientAccept).toBe('awaiting_connector');
    const { data: recipientConsentedInbox } = await recipient.client.rpc('get_my_introduction_inbox');
    expect(recipientConsentedInbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: suggestedIntroductionId, assignment_type: null, assigned_profile_id: null }),
    ]));
    const { error: falseMutualError } = await suggestedIntroducer.client.rpc('connector_introduction_response', {
      target_introduction_id: suggestedIntroductionId,
      target_action: 'make_introduction',
    });
    expect(falseMutualError).toBeTruthy();
    const { data: mutualConfirm, error: mutualError } = await suggestedIntroducer.client.rpc('connector_introduction_response', {
      target_introduction_id: suggestedIntroductionId,
      target_action: 'confirm_mutual',
    });
    expect(mutualError).toBeNull();
    expect(mutualConfirm).toBe('introduced');
    const { data: suggestedInbox } = await suggestedIntroducer.client.rpc('get_my_introduction_inbox');
    expect(suggestedInbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: suggestedIntroductionId, knows_both: true, status: 'introduced' }),
    ]));

    const { data: outsiderInbox } = await outsider.client.rpc('get_my_introduction_inbox');
    expect(outsiderInbox).toEqual([]);
    const { data: outsiderNotifications } = await outsider.client.from('notifications').select('id').eq('introduction_id', suggestedIntroductionId);
    expect(outsiderNotifications).toEqual([]);
    const { error: selfAppointmentError } = await outsider.client.from('connectors').insert({
      profile_id: outsider.id,
      status: 'active',
      introduction_capacity: 1,
      approved_at: new Date().toISOString(),
    });
    expect(selfAppointmentError).toBeTruthy();

    const recipientTwo = await createLocalMember('Second Recipient');
    try {
      const preparedRecipientTwo = await prepareMember(recipientTwo, 'Second Recipient');
      const recipientTwoMethodId = await getPrimaryContactMethodId(recipientTwo);
      const { matchId: connectorMatchId } = await createNeedWithMatches(owner, preparedRecipientTwo, 'Connector route for product data');
      const trustedIntroductionId = await requestIntroduction(owner, connectorMatchId, ownerMethodId, 'trusted_connector', null, connector.id);
      expect(await connector.connectorCapacity()).toBe(1);
      const { data: earlyConnectorInbox } = await connector.client.rpc('get_my_introduction_inbox');
      expect(earlyConnectorInbox).toEqual([]);
      const { data: earlyConnectorNotifications } = await connector.client
        .from('notifications')
        .select('id')
        .eq('introduction_id', trustedIntroductionId);
      expect(earlyConnectorNotifications).toEqual([]);
      const { data: unassignedConnectorInbox } = await replacementConnector.client.rpc('get_my_introduction_inbox');
      expect(unassignedConnectorInbox).toEqual([]);
      const { data: acceptTwo, error: acceptTwoError } = await recipientTwo.client.rpc('recipient_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'accept',
        target_contact_method_id: recipientTwoMethodId,
      });
      expect(acceptTwoError).toBeNull();
      expect(acceptTwo).toBe('awaiting_connector');
      const { data: recipientTwoInbox } = await recipientTwo.client.rpc('get_my_introduction_inbox');
      expect(recipientTwoInbox).toEqual(expect.arrayContaining([
        expect.objectContaining({ introduction_id: trustedIntroductionId, assignment_type: null, assigned_profile_id: null }),
      ]));

      const { error: connectorQuestionError } = await connector.client.rpc('connector_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'ask_context',
        target_context_question: 'Which part of the work should we prioritize?',
      });
      expect(connectorQuestionError).toBeNull();
      const { data: connectorContextResponse, error: connectorContextError } = await owner.client.rpc('requester_introduction_context_response', {
        target_introduction_id: trustedIntroductionId,
        target_context_response: 'We want to compare current catalogue validation and ownership practices.',
      });
      expect(connectorContextError).toBeNull();
      expect(connectorContextResponse).toBe('awaiting_connector');
      const { error: secondConnectorQuestionError } = await connector.client.rpc('connector_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'ask_context',
        target_context_question: 'A second clarification should fail.',
      });
      expect(secondConnectorQuestionError).toBeTruthy();

      const { data: suggestedResult, error: suggestError } = await connector.client.rpc('connector_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'suggest_another_member',
        target_suggested_profile_id: replacementConnector.id,
      });
      expect(suggestError).toBeNull();
      expect(suggestedResult).toBe('awaiting_requester_review');
      expect(await connector.connectorCapacity()).toBe(2);

      const { data: approvedReplacement, error: approvalError } = await owner.client.rpc('requester_review_intermediary_suggestion', {
        target_introduction_id: trustedIntroductionId,
        accept_suggestion: true,
      });
      expect(approvalError).toBeNull();
      expect(approvedReplacement).toBe('awaiting_connector');
      expect(await replacementConnector.connectorCapacity()).toBe(1);
      const { data: revokedConnectorNotices } = await connector.client
        .from('notifications')
        .select('read_at')
        .eq('introduction_id', trustedIntroductionId)
        .eq('type', 'connector_action_required');
      expect(revokedConnectorNotices?.length).toBeGreaterThan(0);
      expect(revokedConnectorNotices?.every((notice) => notice.read_at !== null)).toBe(true);
      const { data: formerConnectorInbox } = await connector.client.rpc('get_my_introduction_inbox');
      expect(formerConnectorInbox?.some((item: { introduction_id: string }) => item.introduction_id === trustedIntroductionId)).toBe(false);
      const { data: replacementConnectorInbox } = await replacementConnector.client.rpc('get_my_introduction_inbox');
      expect(replacementConnectorInbox?.some((item: { introduction_id: string }) => item.introduction_id === trustedIntroductionId)).toBe(true);
      const { error: oldConnectorError } = await connector.client.rpc('connector_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'make_introduction',
      });
      expect(oldConnectorError).toBeTruthy();
      const { data: completedResult, error: completedError } = await replacementConnector.client.rpc('connector_introduction_response', {
        target_introduction_id: trustedIntroductionId,
        target_action: 'make_introduction',
      });
      expect(completedError).toBeNull();
      expect(completedResult).toBe('introduced');
      expect(await replacementConnector.connectorCapacity()).toBe(2);
    } finally {
      await recipientTwo.remove();
    }
  } finally {
    await owner.remove();
    await recipient.remove();
    await suggestedIntroducer.remove();
    await connector.remove();
    await replacementConnector.remove();
    await outsider.remove();
  }
});

test('four-role browser acceptance keeps intermediary and contact data private on mobile', async ({ browser }) => {
  test.setTimeout(90_000);
  const requester = await createLocalMember('Four Role Requester');
  const recipient = await createLocalMember('Four Role Recipient');
  const connectorA = await createLocalMember('Connector A');
  const connectorB = await createLocalMember('Connector B');
  const requesterContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const recipientContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const connectorAContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const connectorBContext = await browser.newContext({ viewport: { width: 375, height: 812 } });

  try {
    await createProfile(requester, 'Four Role Requester', false);
    const preparedRecipient = await prepareMember(recipient, 'Four Role Recipient');
    await prepareMember(connectorA, 'Connector A');
    await prepareMember(connectorB, 'Connector B');
    await connectorA.provisionConnector(2);
    await connectorB.provisionConnector(2);
    const requesterContactId = await addContactMethod(requester, 'email', 'requester.pilot@example.test', 'Pilot email');
    const { needId, matchId } = await createNeedWithMatches(requester, preparedRecipient, 'A contextual pilot conversation');
    const introductionId = await requestIntroduction(requester, matchId, requesterContactId, 'trusted_connector', null, connectorA.id);

    const requesterPage = await requesterContext.newPage();
    const recipientPage = await recipientContext.newPage();
    const connectorAPage = await connectorAContext.newPage();
    const connectorBPage = await connectorBContext.newPage();
    await Promise.all([
      addSession(requesterPage, requester),
      addSession(recipientPage, recipient),
      addSession(connectorAPage, connectorA),
      addSession(connectorBPage, connectorB),
    ]);

    await requesterPage.goto(`/introductions/${introductionId}`);
    await expect(requesterPage.getByRole('heading', { name: 'Introduction with Four Role Recipient' })).toBeVisible();
    await expect(requesterPage.getByText('awaiting recipient')).toBeVisible();
    expect(await requesterPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await recipientPage.goto(`/introductions/${introductionId}`);
    await expect(recipientPage.getByRole('heading', { name: 'Introduction with Four Role Requester' })).toBeVisible();
    await expect(recipientPage.getByText('Improve product-data readiness')).toBeVisible();
    await expect(recipientPage.getByRole('button', { name: 'Accept introduction' })).toBeVisible();
    await expect(recipientPage.locator('body')).not.toContainText('Connector A');
    await expect(recipientPage.locator('body')).not.toContainText('Connector B');
    await expect(recipientPage.locator('body')).not.toContainText('requester.pilot@example.test');
    expect(await recipientPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await connectorAPage.goto('/introductions');
    await expect(connectorAPage.getByRole('heading', { name: 'For you to facilitate' })).toHaveCount(0);
    await expect(connectorAPage.locator('body')).not.toContainText('Four Role Recipient');
    await connectorBPage.goto('/introductions');
    await expect(connectorBPage.getByRole('heading', { name: 'For you to facilitate' })).toHaveCount(0);

    await recipientPage.getByLabel('Contact method to share if the introduction proceeds').selectOption(await getPrimaryContactMethodId(recipient));
    await recipientPage.getByRole('button', { name: 'Accept introduction' }).click();
    await expect(recipientPage.locator('body')).toContainText('awaiting connector');
    await connectorAPage.reload();
    await expect(connectorAPage.getByRole('heading', { name: 'For you to facilitate' })).toBeVisible();
    await expect(connectorAPage.getByRole('link', { name: 'Four Role Requester and Four Role Recipient' })).toBeVisible();
    await connectorAPage.getByRole('link', { name: 'Four Role Requester and Four Role Recipient' }).click();
    await expect(connectorAPage.getByRole('heading', { name: 'Facilitate this introduction' })).toBeVisible();
    await expect(connectorAPage.getByText('They understand this work context and may help us connect.')).toBeVisible();
    await expect(connectorAPage.locator('body')).not.toContainText('four.role.recipient@example.test');
    expect(await connectorAPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await connectorAPage.getByLabel('Person to suggest').selectOption(connectorB.id);
    await connectorAPage.getByRole('button', { name: 'Send suggestion to requester' }).click();
    await expect(connectorAPage.getByRole('heading', { name: 'This introduction is unavailable' })).toBeVisible();
    await expect(connectorAPage.locator('body')).not.toContainText('Four Role Recipient');

    await requesterPage.reload();
    await expect(requesterPage.getByRole('heading', { name: 'Review another person' })).toBeVisible();
    await expect(requesterPage.locator('body')).toContainText('Connector B');
    await requesterPage.getByRole('button', { name: 'Approve suggested person' }).click();
    await expect(requesterPage.getByText('Introduction update saved.')).toBeVisible();

    await connectorAPage.reload();
    await expect(connectorAPage.getByRole('heading', { name: 'This introduction is unavailable' })).toBeVisible();
    await expect(connectorAPage.locator('body')).not.toContainText('Four Role Recipient');

    await connectorBPage.reload();
    await expect(connectorBPage.getByRole('heading', { name: 'For you to facilitate' })).toBeVisible();
    await connectorBPage.getByRole('link', { name: 'Four Role Requester and Four Role Recipient' }).click();
    await expect(connectorBPage.getByRole('button', { name: 'Make the introduction' })).toBeVisible();
    await connectorBPage.getByRole('button', { name: 'Make the introduction' }).click();
    await expect(connectorBPage.getByText('Introduction update saved.')).toBeVisible();

    await requesterPage.reload();
    await expect(requesterPage.getByRole('heading', { name: 'You are introduced' })).toBeVisible();
    await expect(requesterPage.getByText('four.role.recipient@work.example')).toBeVisible();
    await expect(requesterPage.locator('body')).not.toContainText(recipient.email);
    expect(await requesterPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    const { error: needCleanupError } = await requester.client.from('competence_needs').update({ status: 'archived' }).eq('id', needId);
    expect(needCleanupError).toBeNull();
  } finally {
    await requesterContext.close();
    await recipientContext.close();
    await connectorAContext.close();
    await connectorBContext.close();
    await requester.remove();
    await recipient.remove();
    await connectorA.remove();
    await connectorB.remove();
  }
});

test('active requests are idempotent, retry rules are private and expiry allows a later request', async () => {
  let owner = await createLocalMember('Retry Requester');
  const owners = [owner];
  const recipient = await createLocalMember('Retry Recipient');
  let preparedRecipient: PreparedMember;

  try {
    await createProfile(owner, 'Retry Requester', false);
    preparedRecipient = await prepareMember(recipient, 'Retry Recipient');
    let ownerMethodId = await addContactMethod(owner, 'email', 'retry.requester@example.test', 'Work email');
    const recipientMethodId = await getPrimaryContactMethodId(recipient);

    const firstNeed = await createNeedWithMatches(owner, preparedRecipient, 'Retry policy one');
    const firstId = await requestIntroduction(owner, firstNeed.matchId, ownerMethodId, 'direct');
    const replayId = await requestIntroduction(owner, firstNeed.matchId, ownerMethodId, 'direct');
    expect(replayId).toBe(firstId);
    const { data: activeRows } = await owner.client.from('introductions').select('id').eq('id', firstId);
    expect(activeRows).toHaveLength(1);
    const { data: firstDecline, error: firstDeclineError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: firstId,
      target_action: 'decline_not_relevant',
    });
    expect(firstDeclineError).toBeNull();
    expect(firstDecline).toBe('declined');
    const { data: recipientDeclineDetail } = await recipient.client.rpc('get_my_introduction_inbox');
    expect(recipientDeclineDetail).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: firstId, my_decline_reason: 'declined_not_relevant' }),
    ]));
    const { data: requesterDeclineDetail } = await owner.client.rpc('get_my_introduction_inbox');
    expect(requesterDeclineDetail).toEqual(expect.arrayContaining([
      expect.objectContaining({ introduction_id: firstId, my_decline_reason: null }),
    ]));
    const { error: relevantRetryError } = await owner.client.rpc('request_introduction', {
      target_match_id: firstNeed.matchId,
      target_route: 'direct',
      target_why_this_person: 'Their experience is relevant to this problem.',
      target_why_now: 'We are reviewing the work now.',
      target_proposed_conversation: 'Compare practical validation methods.',
      target_requester_offer: 'I can share a current framework.',
      target_contact_method_id: ownerMethodId,
    });
    expect(relevantRetryError).toBeTruthy();

    const secondNeed = await createNeedWithMatches(owner, preparedRecipient, 'Retry policy two');
    const secondId = await requestIntroduction(owner, secondNeed.matchId, ownerMethodId, 'direct');
    const retryDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const { error: notNowError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: secondId,
      target_action: 'decline_not_now',
      target_retry_after: retryDate,
    });
    expect(notNowError).toBeNull();
    const { error: notNowRetryError } = await owner.client.rpc('request_introduction', {
      target_match_id: secondNeed.matchId,
      target_route: 'direct',
      target_why_this_person: 'Their experience is relevant to this problem.',
      target_why_now: 'We are reviewing the work now.',
      target_proposed_conversation: 'Compare practical validation methods.',
      target_requester_offer: 'I can share a current framework.',
      target_contact_method_id: ownerMethodId,
    });
    expect(notNowRetryError).toBeTruthy();
    await recipient.setIntroductionRetryAfter(secondId, recipient.id, new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    const retryAfterDateId = await requestIntroduction(owner, secondNeed.matchId, ownerMethodId, 'direct');
    expect(retryAfterDateId).not.toBe(secondId);

    owner = await createLocalMember('Retry Requester Two');
    owners.push(owner);
    await createProfile(owner, 'Retry Requester Two', false);
    ownerMethodId = await addContactMethod(owner, 'email', 'retry.requester.two@example.test', 'Work email');
    const thirdNeed = await createNeedWithMatches(owner, preparedRecipient, 'Retry policy three');
    const thirdId = await requestIntroduction(owner, thirdNeed.matchId, ownerMethodId, 'direct');
    const { error: capacityDeclineError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: thirdId,
      target_action: 'decline_no_capacity',
    });
    expect(capacityDeclineError).toBeNull();
    const { error: changedAvailabilityError } = await recipient.client.from('contact_preferences')
      .update({ availability_status: 'selective' })
      .eq('profile_id', recipient.id);
    expect(changedAvailabilityError).toBeNull();
    const afterCapacityChangeId = await requestIntroduction(owner, thirdNeed.matchId, ownerMethodId, 'direct');
    expect(afterCapacityChangeId).not.toBe(thirdId);
    await recipient.expireIntroduction(afterCapacityChangeId);
    const { data: expiredResult, error: expiryError } = await recipient.client.rpc('expire_introduction_if_due', {
      target_introduction_id: afterCapacityChangeId,
    });
    expect(expiryError).toBeNull();
    expect(expiredResult).toBe('expired');
    const { data: expiredAcceptance, error: expiredAcceptError } = await recipient.client.rpc('recipient_introduction_response', {
      target_introduction_id: afterCapacityChangeId,
      target_action: 'accept',
      target_contact_method_id: recipientMethodId,
    });
    expect(expiredAcceptError).toBeNull();
    expect(expiredAcceptance).toBe('expired');
    const retryAfterExpiryId = await requestIntroduction(owner, thirdNeed.matchId, ownerMethodId, 'direct');
    expect(retryAfterExpiryId).not.toBe(afterCapacityChangeId);

    const fourthNeed = await createNeedWithMatches(owner, preparedRecipient, 'Retry after requester cancellation');
    const fourthId = await requestIntroduction(owner, fourthNeed.matchId, ownerMethodId, 'direct');
    const { data: cancelledResult, error: cancelError } = await owner.client.rpc('cancel_introduction', {
      target_introduction_id: fourthId,
    });
    expect(cancelError).toBeNull();
    expect(cancelledResult).toBe('cancelled');
    const retryAfterCancelId = await requestIntroduction(owner, fourthNeed.matchId, ownerMethodId, 'direct');
    expect(retryAfterCancelId).not.toBe(fourthId);

    const { error: dismissalError } = await owner.client.from('matches').update({ status: 'dismissed' }).eq('id', thirdNeed.matchId);
    expect(dismissalError).toBeNull();
    const { error: dismissedMatchError } = await owner.client.rpc('request_introduction', {
      target_match_id: thirdNeed.matchId,
      target_route: 'direct',
      target_why_this_person: 'Their experience is relevant to this problem.',
      target_why_now: 'We are reviewing the work now.',
      target_proposed_conversation: 'Compare practical validation methods.',
      target_requester_offer: 'I can share a current framework.',
      target_contact_method_id: ownerMethodId,
    });
    expect(dismissedMatchError).toBeTruthy();
    const { data: recipientContactMethods } = await recipient.client.from('profile_contact_methods').select('id').eq('profile_id', owner.id);
    expect(recipientContactMethods).toEqual([]);
    expect(recipientMethodId).toBeTruthy();
  } finally {
    for (const requester of owners) await requester.remove();
    await recipient.remove();
  }
});
test('concurrent accept and decline serialize to one terminal outcome', async () => {
  const owner = await createLocalMember('Concurrent Requester');
  const recipient = await createLocalMember('Concurrent Recipient');

  try {
    await createProfile(owner, 'Concurrent Requester', false);
    const preparedRecipient = await prepareMember(recipient, 'Concurrent Recipient');
    const ownerMethodId = await addContactMethod(owner, 'email', 'concurrent.owner@example.test', 'Work email');
    const recipientMethodId = await getPrimaryContactMethodId(recipient);
    const need = await createNeedWithMatches(owner, preparedRecipient, 'Concurrent response need');
    const introductionId = await requestIntroduction(owner, need.matchId, ownerMethodId, 'direct');

    const results = await Promise.all([
      recipient.client.rpc('recipient_introduction_response', {
        target_introduction_id: introductionId,
        target_action: 'accept',
        target_contact_method_id: recipientMethodId,
      }),
      recipient.client.rpc('recipient_introduction_response', {
        target_introduction_id: introductionId,
        target_action: 'decline_not_now',
      }),
    ]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const { data: ownerInbox } = await owner.client.rpc('get_my_introduction_inbox');
    const finalRequest = ownerInbox?.find((item: { introduction_id: string; status: string; my_consent_status: string }) => item.introduction_id === introductionId);
    expect(['introduced', 'declined']).toContain(finalRequest?.status);
    const { data: recipientInbox } = await recipient.client.rpc('get_my_introduction_inbox');
    const recipientRequest = recipientInbox?.find((item: { introduction_id: string; status: string; my_consent_status: string }) => item.introduction_id === introductionId);
    expect(recipientRequest?.status).toBe(finalRequest?.status);
    expect((finalRequest?.status === 'introduced' && recipientRequest?.my_consent_status === 'accepted')
      || (finalRequest?.status === 'declined' && recipientRequest?.my_consent_status === 'declined')).toBe(true);
  } finally {
    await owner.remove();
    await recipient.remove();
  }
});
