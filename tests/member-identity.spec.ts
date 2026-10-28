import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember } from './helpers/local-supabase';
import { getMemberInitials, isValidUsername, MEMBER_AVATARS, normalizeUsername } from '../src/lib/member-identity';

const initialAvatar = 'initials';

async function addSession(page: import('@playwright/test').Page, member: Awaited<ReturnType<typeof createLocalMember>>) {
  await page.context().addCookies(member.cookies.map(({ name, value }) => ({
    name,
    value,
    url: 'http://127.0.0.1:4322',
  })));
}

async function addProfile(admin: ReturnType<typeof createLocalAdminClient>, profileId: string, displayName: string, visibility: 'private' | 'members' = 'private') {
  const { error } = await admin.from('profiles').insert({
    id: profileId,
    display_name: displayName,
    professional_summary: 'A practical professional summary.',
    what_i_contribute: 'Evidence-led experience.',
    profile_visibility: visibility,
  });
  expect(error).toBeNull();
}

function identityRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data;
}

test('username normalization and built-in avatar set stay deterministic', () => {
  expect(normalizeUsername('  Alex-Jensen  ')).toBe('alex-jensen');
  for (const username of ['abc', 'a1-b2', '1abc']) expect(isValidUsername(username)).toBe(true);
  for (const username of ['ab', '-abc', 'abc-', 'abc--def', 'abc_def', 'éclair', 'a'.repeat(31)]) {
    expect(isValidUsername(username)).toBe(false);
  }
  expect(MEMBER_AVATARS.map((avatar) => avatar.id)).toEqual([
    'initials', 'compass', 'leaf', 'orbit', 'wave', 'spark', 'grid', 'sun',
  ]);
  const migration = readFileSync(new URL('../supabase/migrations/20261027100000_member_identity_slice_a.sql', import.meta.url), 'utf8');
  const enumBody = migration.match(/create type public\.member_avatar_id as enum \(([\s\S]*?)\);/)?.[1] ?? '';
  expect([...enumBody.matchAll(/'([a-z]+)'/g)].map((match) => match[1])).toEqual(MEMBER_AVATARS.map((avatar) => avatar.id));
  expect(getMemberInitials('  Ada van Example ')).toBe('AV');
  expect(getMemberInitials('')).toBe('M');
});

test('existing members need no username and shell identity never uses auth email', async ({ browser }) => {
  const member = await createLocalMember('Existing Member Name');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await addProfile(createLocalAdminClient(), member.id, 'Existing Member Name');
    const { data: identity, error } = await member.client.rpc('get_my_identity');
    expect(error).toBeNull();
    expect(identityRow(identity)).toMatchObject({
      profile_id: member.id,
      display_name: 'Existing Member Name',
      username: null,
      avatar_id: initialAvatar,
    });

    await addSession(await context.newPage(), member);
    const page = context.pages()[0]!;
    await page.goto('/today');
    const card = page.locator('.member-identity-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('Existing Member Name', { exact: true })).toBeVisible();
    await expect(card.getByText(member.email, { exact: true })).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Edit profile', exact: true })).toHaveAttribute('href', '/onboarding?step=contribution');
    await expect(card.getByRole('link', { name: 'My introductions', exact: true })).toHaveAttribute('href', '/introductions');

    await page.setViewportSize({ width: 390, height: 844 });
    const compact = page.locator('.shared-topbar .member-identity-compact');
    await expect(compact).toBeVisible();
    const summary = compact.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(compact).toHaveAttribute('open', '');
    await expect(compact.getByRole('link', { name: 'View profile', exact: true })).toBeVisible();
    await expect(compact.getByRole('link', { name: 'Edit profile', exact: true })).toBeVisible();
    await expect(compact.getByRole('link', { name: 'My introductions', exact: true })).toBeVisible();
    const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(widths.content).toBeLessThanOrEqual(390);
    await expect(page.locator('body')).not.toContainText(member.email);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/profiles/me#identity');
    await page.getByLabel('Display name').fill('Existing Member Name');
    await page.getByLabel('Built-in avatar').selectOption('compass');
    await page.getByRole('button', { name: 'Save identity' }).click();
    await expect(page).toHaveURL(/status=identity-saved/);
    const { data: editedIdentity } = await member.client.rpc('get_my_identity');
    expect(identityRow(editedIdentity)).toMatchObject({ display_name: 'Existing Member Name', username: null, avatar_id: 'compass' });
  } finally {
    await context.close();
    await member.remove();
  }
});

test('identity RPC preserves profile data and direct username writes are denied', async () => {
  const member = await createLocalMember('Before Identity');
  const outsider = await createLocalMember('Other Member');
  const admin = createLocalAdminClient();
  const fixture = randomUUID();
  let providerId: string | null = null;
  let organisationId: string | null = null;
  try {
    await addProfile(admin, member.id, 'Before Identity');
    const { error: directNameError } = await member.client.from('profiles')
      .update({ display_name: 'Forged display name' }).eq('id', member.id);
    expect(directNameError).toBeTruthy();
    const { error: directAvatarError } = await member.client.from('profiles')
      .update({ avatar_id: 'sun' }).eq('id', member.id);
    expect(directAvatarError).toBeTruthy();
    const { error: directUpdateError } = await member.client.from('profiles')
      .update({ username: 'forged-handle' }).eq('id', member.id);
    expect(directUpdateError).toBeTruthy();
    const { error: directInsertError } = await outsider.client.from('profiles').insert({
      id: outsider.id,
      display_name: 'Other Member',
      username: 'forged-handle',
    });
    expect(directInsertError).toBeTruthy();

    const { data: competency } = await admin.from('competencies').select('id').eq('slug', 'product-data-quality').single();
    const { data: profileCompetency, error: profileCompetencyError } = await admin.from('profile_competencies').insert({
      profile_id: member.id, competency_id: competency!.id, member_statement: 'Existing competence survives identity edits.', discoverable: true,
    }).select('id').single();
    expect(profileCompetencyError).toBeNull();
    const { data: evidence, error: evidenceError } = await admin.from('competence_evidence').insert({
      profile_competency_id: profileCompetency!.id, title: 'Existing example', context: 'Context remains.',
      contribution: 'Contribution remains.', outcome: 'Outcome remains.', visibility: 'members',
    }).select('id').single();
    expect(evidenceError).toBeNull();
    expect((await admin.from('contact_preferences').insert({ profile_id: member.id, open_to_peer_exchange: true })).error).toBeNull();

    const { data: provider, error: providerError } = await admin.from('providers').insert({
      slug: `identity-provider-${fixture}`, name: 'Identity preservation provider', source_system: 'local-identity-test', source_record_id: fixture,
    }).select('id').single();
    expect(providerError).toBeNull();
    providerId = provider!.id;
    const { data: product, error: productError } = await admin.from('provider_products').insert({
      provider_id: providerId, slug: `identity-product-${fixture}`, name: 'Identity preservation product',
      source_system: 'local-identity-test', source_record_id: fixture,
    }).select('id').single();
    expect(productError).toBeNull();
    const { data: organisation, error: organisationError } = await admin.from('organisations').insert({
      slug: `identity-organisation-${fixture}`, name: 'Identity preservation organisation',
      organisation_type: 'vendor', provider_id: providerId,
    }).select('id').single();
    expect(organisationError).toBeNull();
    organisationId = organisation!.id;
    expect((await admin.from('profile_organisations').insert({
      profile_id: member.id, organisation_id: organisationId, role_title: 'Existing role', is_primary: true,
    })).error).toBeNull();
    expect((await admin.from('profile_product_affiliations').insert({
      profile_id: member.id, provider_product_id: product!.id, role_title: 'Existing affiliation',
      consent_given: true, consented_at: new Date().toISOString(), verification_status: 'self_declared',
    })).error).toBeNull();
    expect((await admin.from('profiles').update({ profile_visibility: 'members', onboarding_completed: true }).eq('id', member.id)).error).toBeNull();

    const { data: saved, error: saveError } = await member.client.rpc('save_my_identity', {
      target_display_name: 'Ada Example',
      target_avatar_id: 'compass',
      target_username: '  Ada-Example  ',
    });
    expect(saveError).toBeNull();
    expect(identityRow(saved)).toMatchObject({ display_name: 'Ada Example', username: 'ada-example', avatar_id: 'compass' });

    const { error: secondClaimError } = await member.client.rpc('save_my_identity', {
      target_display_name: 'Ada Example',
      target_avatar_id: 'compass',
      target_username: 'different-handle',
    });
    expect(secondClaimError?.code).toBe('23514');

    const { error: professionalEditError } = await member.client.from('profiles').update({
      professional_summary: 'Updated without changing identity.',
      what_i_contribute: 'Still intact.',
    }).eq('id', member.id);
    expect(professionalEditError).toBeNull();
    const { data: savedProfile } = await admin.from('profiles')
      .select('display_name, username, avatar_id, onboarding_completed, professional_summary, what_i_contribute')
      .eq('id', member.id).single();
    expect(savedProfile).toMatchObject({
      display_name: 'Ada Example', username: 'ada-example', avatar_id: 'compass',
      onboarding_completed: true, professional_summary: 'Updated without changing identity.', what_i_contribute: 'Still intact.',
    });
    const { data: preservedCompetence } = await admin.from('profile_competencies').select('member_statement').eq('profile_id', member.id).single();
    const { data: preservedEvidence } = await admin.from('competence_evidence').select('title').eq('id', evidence!.id).single();
    const { data: preservedPreferences } = await admin.from('contact_preferences').select('open_to_peer_exchange').eq('profile_id', member.id).single();
    const { data: preservedOrganisation } = await admin.from('profile_organisations').select('role_title').eq('profile_id', member.id).single();
    const { data: preservedAffiliation } = await admin.from('profile_product_affiliations').select('role_title').eq('profile_id', member.id).single();
    expect(preservedCompetence?.member_statement).toContain('survives');
    expect(preservedEvidence?.title).toBe('Existing example');
    expect(preservedPreferences?.open_to_peer_exchange).toBe(true);
    expect(preservedOrganisation?.role_title).toBe('Existing role');
    expect(preservedAffiliation?.role_title).toBe('Existing affiliation');

    const invalidAvatar = await member.client.rpc('save_my_identity', {
      target_display_name: 'Ada Example', target_avatar_id: 'remote-url', target_username: null,
    });
    expect(invalidAvatar.error).toBeTruthy();
    const reservedName = await member.client.rpc('save_my_identity', {
      target_display_name: 'Ada Example', target_avatar_id: 'compass', target_username: 'admin',
    });
    expect(reservedName.error).toBeTruthy();
  } finally {
    if (organisationId) await admin.from('organisations').delete().eq('id', organisationId);
    if (providerId) await admin.from('providers').delete().eq('id', providerId);
    await Promise.all([member.remove(), outsider.remove()]);
  }
});

test('identity RPC creates a private incomplete profile without auto-assigning a handle', async () => {
  const member = await createLocalMember('New Identity Member');
  try {
    const { data: saved, error } = await member.client.rpc('save_my_identity', {
      target_display_name: 'New Identity Member', target_avatar_id: 'initials', target_username: null,
    });
    expect(error).toBeNull();
    expect(identityRow(saved)).toMatchObject({ profile_id: member.id, username: null, avatar_id: 'initials' });
    const { data: profile } = await member.client.rpc('get_my_profile');
    expect(identityRow(profile)).toMatchObject({ id: member.id, onboarding_completed: false, profile_visibility: 'private' });
  } finally { await member.remove(); }
});

test('event-only accounts cannot read or change workspace identity', async () => {
  const attendee = await createLocalMember('Event-only Attendee', { workspaceAccess: false });
  try {
    const { error: readError } = await attendee.client.rpc('get_my_identity');
    expect(readError?.code).toBe('42501');
    const { error: saveError } = await attendee.client.rpc('save_my_identity', {
      target_display_name: 'Event-only Attendee', target_avatar_id: 'sun', target_username: 'event-only-member',
    });
    expect(saveError?.code).toBe('42501');
    const { data: noProfile } = await attendee.client.from('profiles').select('id').eq('id', attendee.id).maybeSingle();
    expect(noProfile).toBeNull();
  } finally { await attendee.remove(); }
});

test('username uniqueness is atomic across members and across concurrent first claims by one member', async () => {
  const first = await createLocalMember('First Member');
  const second = await createLocalMember('Second Member');
  const sameMember = await createLocalMember('Concurrent Member');
  try {
    const [firstClaim, secondClaim] = await Promise.all([
      first.client.rpc('save_my_identity', { target_display_name: 'First Member', target_avatar_id: 'initials', target_username: 'shared-handle' }),
      second.client.rpc('save_my_identity', { target_display_name: 'Second Member', target_avatar_id: 'initials', target_username: 'SHARED-HANDLE' }),
    ]);
    expect([firstClaim, secondClaim].filter((result) => !result.error)).toHaveLength(1);
    expect([firstClaim, secondClaim].filter((result) => result.error?.code === '23505')).toHaveLength(1);

    const [claimA, claimB] = await Promise.all([
      sameMember.client.rpc('save_my_identity', { target_display_name: 'Concurrent Member', target_avatar_id: 'leaf', target_username: 'handle-one' }),
      sameMember.client.rpc('save_my_identity', { target_display_name: 'Concurrent Member', target_avatar_id: 'wave', target_username: 'handle-two' }),
    ]);
    expect([claimA, claimB].filter((result) => !result.error)).toHaveLength(1);
    expect([claimA, claimB].filter((result) => result.error?.code === '23514')).toHaveLength(1);
  } finally {
    await Promise.all([first.remove(), second.remove(), sameMember.remove()]);
  }
});

test('identity stays behind profile visibility and introduction name snapshots stay unchanged', async () => {
  const owner = await createLocalMember('Original Display Name');
  const visitor = await createLocalMember('Visiting Member');
  const admin = createLocalAdminClient();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  let introductionId: string | null = null;
  try {
    await addProfile(admin, owner.id, 'Original Display Name', 'private');
    await addProfile(admin, visitor.id, 'Visiting Member', 'members');
    const { data: competency } = await admin.from('competencies').select('id').eq('slug', 'product-data-quality').single();
    const { data: recipientCompetency, error: ownerCompetencyError } = await admin.from('profile_competencies').insert({
      profile_id: owner.id, competency_id: competency!.id, member_statement: 'Visible only under current profile rules.', discoverable: true,
    }).select('id').single();
    expect(ownerCompetencyError).toBeNull();
    expect((await admin.from('competence_evidence').insert({
      profile_competency_id: recipientCompetency!.id, title: 'Visible evidence', context: 'Context.', contribution: 'Contribution.', outcome: 'Outcome.', visibility: 'matches_only',
    })).error).toBeNull();
    expect((await admin.from('contact_preferences').insert({ profile_id: owner.id, open_to_peer_exchange: true, availability_status: 'open', conversation_capacity: 2 })).error).toBeNull();
    const { data: visitorCompetency, error: visitorCompetencyError } = await admin.from('profile_competencies').insert({
      profile_id: visitor.id, competency_id: competency!.id, member_statement: 'Available recipient competence.', discoverable: true,
    }).select('id').single();
    expect(visitorCompetencyError).toBeNull();
    expect((await admin.from('competence_evidence').insert({
      profile_competency_id: visitorCompetency!.id, title: 'Recipient evidence', context: 'Context.', contribution: 'Contribution.', outcome: 'Outcome.', visibility: 'matches_only',
    })).error).toBeNull();
    expect((await admin.from('contact_preferences').insert({ profile_id: visitor.id, open_to_peer_exchange: true, availability_status: 'open', conversation_capacity: 2 })).error).toBeNull();
    const { error: claimError } = await owner.client.rpc('save_my_identity', {
      target_display_name: 'Original Display Name', target_avatar_id: 'sun', target_username: 'visible-handle',
    });
    expect(claimError).toBeNull();

    const { data: hidden } = await visitor.client.from('discoverable_profiles')
      .select('id, display_name, username, avatar_id').eq('id', owner.id).maybeSingle();
    expect(hidden).toBeNull();
    const { error: visibilityError } = await admin.from('profiles').update({ profile_visibility: 'members' }).eq('id', owner.id);
    expect(visibilityError).toBeNull();
    const { data: visible } = await visitor.client.from('discoverable_profiles')
      .select('id, display_name, username, avatar_id').eq('id', owner.id).maybeSingle();
    expect(visible).toMatchObject({ id: owner.id, display_name: 'Original Display Name', username: 'visible-handle', avatar_id: 'sun' });
    expect(visible).not.toHaveProperty('email');
    const { error: directProfileFieldError } = await visitor.client.from('profiles')
      .select('username, avatar_id').eq('id', owner.id);
    expect(directProfileFieldError).toBeTruthy();

    const { data: contactMethod, error: contactError } = await owner.client.rpc('save_profile_contact_method', {
      target_method_id: null, target_method_type: 'email', target_value: 'original.owner@example.test',
      target_label: 'Work email', make_primary: true,
    });
    expect(contactError).toBeNull();
    const { data: need, error: needError } = await owner.client.from('competence_needs').insert({
      owner_profile_id: owner.id, title: 'Identity snapshot need', business_outcome: 'Understand product-data quality.',
      problem_statement: 'Compare practical controls.', what_requester_offers: 'Share useful context.',
      conversation_type: 'peer_exchange', visibility: 'private_matches', status: 'draft', expires_at: expiresAt,
    }).select('id').single();
    expect(needError).toBeNull();
    expect((await owner.client.from('need_competencies').insert({
      need_id: need!.id, competency_id: competency!.id, importance: 'essential',
    })).error).toBeNull();
    expect((await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', need!.id)).error).toBeNull();
    expect((await owner.client.rpc('generate_matches_for_need', { target_need_id: need!.id })).error).toBeNull();
    const { data: match, error: matchError } = await owner.client.from('matches')
      .select('id').eq('need_id', need!.id).eq('matched_profile_id', visitor.id).single();
    expect(matchError).toBeNull();
    const { data: requestedId, error: requestError } = await owner.client.rpc('request_introduction', {
      target_match_id: match!.id, target_route: 'direct', target_suggested_introducer_id: null,
      target_trusted_connector_id: null, target_why_this_person: 'The expertise is relevant.',
      target_why_now: 'The work starts soon.', target_proposed_conversation: 'Compare practical approaches.',
      target_requester_offer: 'Share our current checklist.', target_contact_method_id: String(contactMethod),
      target_intermediary_note: '',
    });
    expect(requestError).toBeNull();
    introductionId = String(requestedId);
    const { data: originalSnapshot } = await admin.from('introductions')
      .select('requester_display_name_snapshot, recipient_display_name_snapshot')
      .eq('id', introductionId).single();
    expect(originalSnapshot).toEqual({ requester_display_name_snapshot: 'Original Display Name', recipient_display_name_snapshot: 'Visiting Member' });

    const { error: renameDisplayError } = await owner.client.rpc('save_my_identity', {
      target_display_name: 'Updated Display Name', target_avatar_id: 'orbit', target_username: 'visible-handle',
    });
    expect(renameDisplayError).toBeNull();
    const { data: snapshot } = await admin.from('introductions')
      .select('requester_display_name_snapshot, recipient_display_name_snapshot').eq('id', introductionId).single();
    expect(snapshot).toEqual({ requester_display_name_snapshot: 'Original Display Name', recipient_display_name_snapshot: 'Visiting Member' });
  } finally {
    if (introductionId) await admin.from('introductions').delete().eq('id', introductionId);
    await Promise.all([owner.remove(), visitor.remove()]);
  }
});