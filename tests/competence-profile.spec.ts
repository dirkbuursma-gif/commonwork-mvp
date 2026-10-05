import { expect, test } from '@playwright/test';
import { createLocalMember } from './helpers/local-supabase';

test('a real member completes competence onboarding and sees the persisted profile', async ({ browser }) => {
  const member = await createLocalMember('Sofia Mendes');
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });

  try {
    expect(member.cookies.length).toBeGreaterThan(0);
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    const expectMobileWidth = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    };
    await page.goto('/onboarding?step=contribution');
    await expect(page.getByRole('heading', { name: 'Start with the work you know' })).toBeVisible();
    await expectMobileWidth();

    await page.getByLabel('Name shown on your profile').fill('Sofia Mendes');
    await page.getByLabel('Professional summary').fill('Commerce leader working across product data and digital operations.');
    await page.getByLabel('What can you contribute to another professional?').fill('I help teams improve product-data quality and make commerce decisions with evidence.');
    await page.getByLabel('What are you exploring?').fill('Governed agent workflows for catalogue operations.');
    await page.getByLabel('Profile visibility').selectOption('members');
    await page.getByLabel('Name shown on your profile').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Professional summary')).toBeFocused();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page).toHaveURL(/step=competencies/);
    await expectMobileWidth();

    const { error: forgedCompletionError } = await member.client
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', member.id);
    expect(forgedCompletionError).toBeTruthy();
    const { data: partialProfile } = await member.client.rpc('get_my_profile');
    const partialRows = Array.isArray(partialProfile) ? partialProfile : [partialProfile];
    expect(partialRows[0]?.onboarding_completed).toBe(false);

    const { data: canonical } = await member.client
      .from('competencies')
      .select('id')
      .eq('slug', 'product-data-quality')
      .single();
    expect(canonical?.id).toBeTruthy();

    await page.getByLabel('Shared competence').selectOption(canonical!.id);
    await page.getByLabel('How do you apply this?').fill('I define validation rules and help teams resolve inconsistent catalogue attributes.');
    await page.getByLabel('Show this competence on my member profile').check();
    await page.getByRole('button', { name: 'Add competence' }).click();
    await expect(page.getByRole('heading', { name: 'Product-data quality' })).toBeVisible();
    const { data: savedCompetence } = await member.client
      .from('profile_competencies')
      .select('id')
      .eq('profile_id', member.id)
      .single();
    const { error: forgedEvidenceStatusError } = await member.client
      .from('profile_competencies')
      .update({ evidence_status: 'peer_confirmed' })
      .eq('id', savedCompetence!.id);
    expect(forgedEvidenceStatusError).toBeTruthy();

    await page.getByText('Can’t find a suitable competence?').click();
    await page.getByLabel('Suggested term').fill('Commerce data stewardship');
    await page.getByLabel('Category').selectOption('practical_capability');
    await page.getByLabel('Why is it useful?').fill('This describes ownership and ongoing quality practices across commerce product data.');
    await page.getByRole('button', { name: 'Suggest for review' }).click();
    await expect(page.getByText('Suggestion saved for vocabulary review.')).toBeVisible();
    const { data: suggestion } = await member.client
      .from('competency_suggestions')
      .select('name, status')
      .eq('profile_id', member.id)
      .single();
    expect(suggestion).toMatchObject({ name: 'Commerce data stewardship', status: 'pending' });
    const { data: notCanonical } = await member.client
      .from('competencies')
      .select('id')
      .eq('slug', 'commerce-data-stewardship')
      .maybeSingle();
    expect(notCanonical).toBeNull();

    await page.getByRole('link', { name: 'Continue to evidence' }).click();
    await expectMobileWidth();

    await page.getByLabel('Example title').fill('Catalogue quality improvement');
    await page.getByLabel('Situation or business problem').fill('Product attributes differed across sales channels and were difficult to compare.');
    await page.getByLabel('Your contribution').fill('I mapped the source fields and introduced validation and ownership rules.');
    await page.getByLabel('Outcome or learning').fill('Teams gained a repeatable quality review and clearer product records.');
    await page.getByLabel('Supporting link').fill('https://example.com/work-sample');
    await page.getByRole('button', { name: 'Save evidence' }).click();
    await expect(page.getByRole('heading', { name: 'Saved examples' })).toBeVisible();
    await page.getByRole('link', { name: 'Continue to conversations' }).click();
    await expectMobileWidth();

    await page.getByLabel('Peer exchange').check();
    await page.getByLabel('Event introductions').check();
    await page.getByLabel('Availability').selectOption('selective');
    await page.getByLabel('Conversation capacity per month').fill('2');
    await page.getByRole('button', { name: 'Save and view profile' }).click();
    await expect(page).toHaveURL(new RegExp(`/profiles/${member.id}`));
    await expect(page.getByRole('heading', { name: 'Sofia Mendes' })).toBeVisible();
    await expect(page.getByText('Catalogue quality improvement')).toBeVisible();
    await expect(page.getByText('Peer exchange')).toBeVisible();

    await expectMobileWidth();

    const { data: savedProfile } = await member.client.rpc('get_my_profile');
    const profileRows = Array.isArray(savedProfile) ? savedProfile : [savedProfile];
    expect(profileRows[0]?.onboarding_completed).toBe(true);
    expect(profileRows[0]?.profile_visibility).toBe('members');
  } finally {
    await context.close();
    await member.remove();
  }
});

test('a member can navigate all onboarding steps with the keyboard', async ({ browser }) => {
  const member = await createLocalMember('Morgan Casey');
  const context = await browser.newContext();

  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const page = await context.newPage();
    await page.goto('/onboarding?step=contribution');

    const steps = [
      { label: 'Competencies', route: 'competencies', heading: 'Name what you know and do' },
      { label: 'Evidence', route: 'evidence', heading: 'Show where you applied it' },
      { label: 'Conversations', route: 'conversations', heading: 'Choose the conversations you welcome' },
      { label: 'Contribution', route: 'contribution', heading: 'Start with the work you know' },
    ];

    for (const step of steps) {
      const link = page.getByRole('navigation', { name: 'Profile setup progress' })
        .getByRole('link', { name: step.label, exact: true });
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`step=${step.route}`));
      await expect(page.getByRole('heading', { name: step.heading })).toBeVisible();
    }
  } finally {
    await context.close();
    await member.remove();
  }
});

test('another authenticated member sees only permitted profile and evidence fields', async ({ browser }) => {
  const owner = await createLocalMember('Alex Jensen');
  const visitor = await createLocalMember('Jordan Lee');

  try {
    const { error: profileError } = await owner.client.from('profiles').insert({
      id: owner.id,
      display_name: 'Alex Jensen',
      professional_summary: 'Commerce operations leader.',
      what_i_contribute: 'I improve product and order workflows.',
      what_i_am_exploring: 'Safer workflow automation.',
      profile_visibility: 'private',
    });
    expect(profileError).toBeNull();

    const { data: canonical } = await owner.client
      .from('competencies')
      .select('id')
      .eq('slug', 'product-data-quality')
      .single();
    expect(canonical?.id).toBeTruthy();

    const { data: profileCompetence, error: competenceError } = await owner.client
      .from('profile_competencies')
      .insert({
        profile_id: owner.id,
        competency_id: canonical!.id,
        member_statement: 'I create product quality rules with merchandising and engineering teams.',
        evidence_status: 'demonstrated',
        discoverable: true,
      })
      .select('id')
      .single();
    expect(competenceError).toBeNull();
    expect(profileCompetence?.id).toBeTruthy();

    const { data: preferences, error: preferencesError } = await owner.client
      .from('contact_preferences')
      .insert({
        profile_id: owner.id,
        open_to_peer_exchange: true,
        open_to_event_introductions: true,
        commercial_approaches: true,
        availability_status: 'selective',
        conversation_capacity: 1,
      })
      .select('profile_id')
      .single();
    expect(preferencesError).toBeNull();
    expect(preferences?.profile_id).toBe(owner.id);

    const visibilityIds: Record<string, string> = {};
    for (const visibility of ['private', 'matches_only', 'members'] as const) {
      const { data, error } = await owner.client
        .from('competence_evidence')
        .insert({
          profile_competency_id: profileCompetence!.id,
          title: `${visibility} example`,
          context: 'A set of product records used inconsistent attributes.',
          contribution: 'I mapped the fields and created a review workflow.',
          outcome: 'The team could identify and correct missing information.',
          visibility,
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      visibilityIds[visibility] = data!.id;
    }

    const { data: demonstratedCompetence } = await owner.client
      .from('profile_competencies')
      .select('evidence_status')
      .eq('id', profileCompetence!.id)
      .single();
    expect(demonstratedCompetence?.evidence_status).toBe('demonstrated');

    const { data: ownerEvidence, error: ownerEvidenceError } = await owner.client
      .from('competence_evidence')
      .select('id, visibility')
      .eq('profile_competency_id', profileCompetence!.id);
    expect(ownerEvidenceError).toBeNull();
    expect(ownerEvidence).toHaveLength(3);

    const { data: hiddenProfile, error: hiddenProfileError } = await visitor.client
      .from('discoverable_profiles')
      .select('id, display_name, professional_summary, what_i_contribute, what_i_am_exploring')
      .eq('id', owner.id)
      .maybeSingle();
    expect(hiddenProfileError).toBeNull();
    expect(hiddenProfile).toBeNull();

    const { error: visibilityError } = await owner.client
      .from('profiles')
      .update({ profile_visibility: 'members' })
      .eq('id', owner.id);
    expect(visibilityError).toBeNull();

    const { data: publicProfile, error: publicProfileError } = await visitor.client
      .from('discoverable_profiles')
      .select('id, display_name, professional_summary, what_i_contribute, what_i_am_exploring')
      .eq('id', owner.id)
      .maybeSingle();
    expect(publicProfileError).toBeNull();
    expect(publicProfile?.display_name).toBe('Alex Jensen');
    expect(publicProfile).not.toHaveProperty('email');
    expect(publicProfile).not.toHaveProperty('onboarding_completed');

    const { data: publicPreferences, error: publicPreferencesError } = await visitor.client
      .from('discoverable_contact_preferences')
      .select('profile_id, open_to_peer_exchange, open_to_event_introductions, availability_status, conversation_capacity')
      .eq('profile_id', owner.id)
      .maybeSingle();
    expect(publicPreferencesError).toBeNull();
    expect(publicPreferences?.open_to_peer_exchange).toBe(true);
    expect(publicPreferences).not.toHaveProperty('commercial_approaches');

    const visitorContext = await browser.newContext();
    await visitorContext.addCookies(visitor.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`/profiles/${owner.id}`);
    await expect(visitorPage.getByRole('heading', { name: 'Alex Jensen' })).toBeVisible();
    await expect(visitorPage.getByText('I improve product and order workflows.')).toBeVisible();
    await expect(visitorPage.getByText('members example')).toBeVisible();
    await expect(visitorPage.getByText('private example')).toHaveCount(0);
    await expect(visitorPage.getByText('matches_only example')).toHaveCount(0);
    await expect(visitorPage.getByText(owner.email)).toHaveCount(0);
    await expect(visitorPage.getByText('Commercial approaches')).toHaveCount(0);
    await visitorContext.close();

    const { data: visibleEvidence, error: visibleEvidenceError } = await visitor.client
      .from('competence_evidence')
      .select('id, visibility')
      .eq('profile_competency_id', profileCompetence!.id);
    expect(visibleEvidenceError).toBeNull();
    expect(visibleEvidence?.map((item) => item.id)).toEqual([visibilityIds.members]);

    const { data: blockedRows, error: crossOwnerWriteError } = await visitor.client
      .from('profile_competencies')
      .insert({
        profile_id: owner.id,
        competency_id: canonical!.id,
        member_statement: 'Attempt to write another member\'s record.',
      })
      .select('id');
    expect(crossOwnerWriteError).toBeTruthy();
    expect(blockedRows).toBeNull();

    const { data: changedRows, error: crossOwnerUpdateError } = await visitor.client
      .from('profile_competencies')
      .update({ member_statement: 'Attempt to edit another member’s statement.' })
      .eq('id', profileCompetence!.id)
      .select('id');
    expect(crossOwnerUpdateError).toBeNull();
    expect(changedRows).toEqual([]);

    const { data: ownerCompetence } = await owner.client
      .from('profile_competencies')
      .select('member_statement')
      .eq('id', profileCompetence!.id)
      .single();
    expect(ownerCompetence?.member_statement).toBe('I create product quality rules with merchandising and engineering teams.');

    const { error: canonicalWriteError } = await visitor.client
      .from('competencies')
      .insert({ name: 'Unauthorized canonical term', slug: 'unauthorized-canonical-term', category: 'knowledge' });
    expect(canonicalWriteError).toBeTruthy();

    for (const evidenceId of Object.values(visibilityIds)) {
      const { error } = await owner.client.from('competence_evidence').delete().eq('id', evidenceId);
      expect(error).toBeNull();
    }
    const { data: revertedCompetence } = await owner.client
      .from('profile_competencies')
      .select('evidence_status')
      .eq('id', profileCompetence!.id)
      .single();
    expect(revertedCompetence?.evidence_status).toBe('declared');
    const { data: revertedProfile } = await owner.client.rpc('get_my_profile');
    const revertedRows = Array.isArray(revertedProfile) ? revertedProfile : [revertedProfile];
    expect(revertedRows[0]?.onboarding_completed).toBe(false);
  } finally {
    await owner.remove();
    await visitor.remove();
  }
});
