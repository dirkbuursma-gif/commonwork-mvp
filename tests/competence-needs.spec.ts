import { expect, test } from '@playwright/test';
import { createLocalMember, type LocalMember } from './helpers/local-supabase';

type CompetenceSetup = {
  competencyId: string;
  discoverable?: boolean;
  evidenceVisibility?: Array<'private' | 'matches_only' | 'members'>;
};

async function createProfile(member: LocalMember, displayName: string, visibility: 'private' | 'members' = 'members') {
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: displayName,
    professional_summary: `${displayName} works with product data and commerce operations.`,
    what_i_contribute: `${displayName} helps teams make product-data decisions with evidence.`,
    what_i_am_exploring: 'Reliable workflows across channels.',
    profile_visibility: visibility,
  });
  expect(error).toBeNull();
}

async function addCompetence(member: LocalMember, setup: CompetenceSetup) {
  const { data: profileCompetence, error: competenceError } = await member.client
    .from('profile_competencies')
    .insert({
      profile_id: member.id,
      competency_id: setup.competencyId,
      member_statement: 'I improve product-data quality with practical validation and ownership rules.',
      discoverable: setup.discoverable ?? true,
    })
    .select('id')
    .single();
  expect(competenceError).toBeNull();

  for (const visibility of setup.evidenceVisibility ?? ['members']) {
    const { error } = await member.client.from('competence_evidence').insert({
      profile_competency_id: profileCompetence!.id,
      title: visibility === 'private' ? 'Private evidence must not appear' : 'Shareable data-quality example',
      context: 'Product records had inconsistent values across channels.',
      contribution: 'I mapped ownership and added validation rules.',
      outcome: 'Teams could identify and resolve data-quality issues.',
      visibility,
    });
    expect(error).toBeNull();
  }
}

async function prepareMemberProfile(
  member: LocalMember,
  displayName: string,
  competences: CompetenceSetup[],
  availability: 'open' | 'selective' | 'introductions_only' | 'unavailable' = 'open',
) {
  await createProfile(member, displayName);
  for (const competence of competences) await addCompetence(member, competence);
  const { error } = await member.client.from('contact_preferences').insert({
    profile_id: member.id,
    open_to_peer_exchange: true,
    availability_status: availability,
    conversation_capacity: 2,
  });
  expect(error).toBeNull();
}

async function addSession(page: import('@playwright/test').Page, member: LocalMember) {
  await page.context().addCookies(member.cookies.map(({ name, value }) => ({
    name,
    value,
    url: 'http://127.0.0.1:4322',
  })));
}

test('a member creates a private need and gets privacy-safe explained matches', async ({ browser }) => {
  const owner = await createLocalMember('Need Owner');
  const runSuffix = owner.id.slice(0, 8);
  const matchedName = `Sofia Mendes ${runSuffix}`;
  const secondMatchedName = `Taylor Analyst ${runSuffix}`;
  const matchedMember = await createLocalMember(matchedName);
  const secondMatchedMember = await createLocalMember(secondMatchedName);
  const unavailableMember = await createLocalMember('Unavailable Member');
  const undiscoverableMember = await createLocalMember('Undiscoverable Member');
  const outsider = await createLocalMember('Unrelated Member');
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'dark' });

  try {
    const { data: terms, error: termsError } = await owner.client
      .from('competencies')
      .select('id, slug')
      .in('slug', ['product-data-quality', 'product-information-management', 'commerce-platforms']);
    expect(termsError).toBeNull();
    const termIds = new Map((terms ?? []).map((term) => [term.slug, term.id]));
    const productQualityId = termIds.get('product-data-quality');
    const productInformationId = termIds.get('product-information-management');
    const platformsId = termIds.get('commerce-platforms');
    expect(productQualityId).toBeTruthy();
    expect(productInformationId).toBeTruthy();
    expect(platformsId).toBeTruthy();

    await createProfile(owner, 'Need Owner', 'private');
    await prepareMemberProfile(matchedMember, matchedName, [{
      competencyId: productQualityId!,
      evidenceVisibility: ['matches_only', 'private'],
    }]);
    await prepareMemberProfile(secondMatchedMember, secondMatchedName, [{ competencyId: productInformationId! }]);
    await prepareMemberProfile(unavailableMember, 'Unavailable Member', [{ competencyId: productQualityId! }], 'unavailable');
    await prepareMemberProfile(undiscoverableMember, 'Undiscoverable Member', [
      { competencyId: productQualityId!, discoverable: false },
      { competencyId: platformsId! },
    ]);

    await addSession(await context.newPage(), owner);
    const page = context.pages()[0]!;
    await page.goto('/find/new');
    await expect(page.getByRole('heading', { name: 'Describe a need' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByLabel('Short title').fill('Improve product-data quality');
    await page.getByLabel('Desired business outcome').fill('Improve accurate product data across channels.');
    await page.getByLabel('Problem to solve').fill('Product information is inconsistent and teams lack clear ownership.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/find\/[0-9a-f-]+\?status=draft-saved/);
    const draftId = page.url().match(/\/find\/([0-9a-f-]+)/)?.[1];
    expect(draftId).toBeTruthy();
    await expect(page.getByText('Draft need', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Continue editing' }).click();
    await expect(page).toHaveURL(new RegExp(`/find/${draftId}/edit`));
    await expect(page.getByLabel('Short title')).toHaveValue('Improve product-data quality');
    const firstContinue = page.getByRole('button', { name: 'Continue to competence' });
    await firstContinue.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Which competence matters?' })).toBeVisible();

    const search = page.getByLabel('Search competence vocabulary');
    await search.fill('Product-data quality');
    const qualityOption = page.locator('[data-competence-option]').filter({ hasText: 'Product-data quality' });
    await qualityOption.getByLabel('Essential').check();
    await qualityOption.getByLabel('Useful').check();
    await expect(qualityOption.getByLabel('Essential')).not.toBeChecked();
    await qualityOption.getByLabel('Essential').check();
    await qualityOption.getByLabel(/Why does this competence matter/).fill('The team needs practical data-quality controls.');

    await search.fill('Product information management');
    const informationOption = page.locator('[data-competence-option]').filter({ hasText: 'Product information management' });
    await informationOption.getByLabel('Essential').check();
    await page.getByRole('button', { name: 'Continue to context' }).click();
    await expect(page.getByRole('heading', { name: 'Add useful context' })).toBeVisible();
    await page.getByLabel('Relevant context').fill('The catalogue spans several sales channels and teams.');
    await page.getByLabel('What can you offer in return?').fill('A peer exchange on practical validation and ownership.');
    await page.getByRole('button', { name: 'Review need' }).click();
    await expect(page.getByRole('heading', { name: 'Set visibility and expiry' })).toBeVisible();
    await expect(page.getByLabel('Expiry date and time')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Activate and find competence' }).click();

    await expect(page).toHaveURL(/\/find\/[0-9a-f-]+\?status=need-activated/);
    await expect(page.getByRole('heading', { name: 'Relevant people' })).toBeVisible();
    await expect(page.getByRole('heading', { name: matchedName })).toBeVisible();
    await expect(page.getByRole('heading', { name: secondMatchedName })).toBeVisible();
    const sofiaCard = page.locator('.match-card').filter({ has: page.getByRole('heading', { name: matchedName }) });
    const taylorCard = page.locator('.match-card').filter({ has: page.getByRole('heading', { name: secondMatchedName }) });
    await expect(sofiaCard.getByText('Shareable data-quality example')).toBeVisible();
    await expect(page.getByText('Private evidence must not appear')).toHaveCount(0);
    await expect(sofiaCard.getByText(/No discoverable profile information confirms/)).toHaveCount(1);
    await expect(taylorCard.getByText(/No discoverable profile information confirms/)).toHaveCount(1);
    await expect(page.getByText('Unavailable Member')).toHaveCount(0);
    await expect(page.getByText('Undiscoverable Member')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/\b\d+\s*%/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    const needId = page.url().match(/\/find\/([0-9a-f-]+)/)?.[1];
    expect(needId).toBeTruthy();
    const memberContext = await browser.newContext();
    await memberContext.addCookies(matchedMember.cookies.map(({ name, value }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
    })));
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/find/${needId}`);
    await expect(memberPage.getByRole('heading', { name: 'This need is unavailable' })).toBeVisible();
    await expect(memberPage.locator('body')).not.toContainText('Improve product-data quality');
    await memberContext.close();

    const { data: savedNeed, error: needReadError } = await owner.client
      .from('competence_needs')
      .select('id, status, visibility, expires_at')
      .eq('id', needId!)
      .single();
    expect(needReadError).toBeNull();
    expect(savedNeed).toMatchObject({ id: needId, status: 'active', visibility: 'private_matches' });
    expect(savedNeed?.expires_at).toBeTruthy();

    const { data: savedTerms, error: needTermsError } = await owner.client
      .from('need_competencies')
      .select('competency_id, importance, context')
      .eq('need_id', needId!);
    expect(needTermsError).toBeNull();
    expect(savedTerms).toEqual(expect.arrayContaining([
      expect.objectContaining({ competency_id: productQualityId, importance: 'essential', context: 'The team needs practical data-quality controls.' }),
      expect.objectContaining({ competency_id: productInformationId, importance: 'essential' }),
    ]));

    const { data: matchRows, error: matchError } = await owner.client
      .from('matches')
      .select('id, matched_profile_id, relevance_band, status')
      .eq('need_id', needId!);
    expect(matchError).toBeNull();
    expect(matchRows?.map((match) => match.matched_profile_id)).toEqual(expect.arrayContaining([matchedMember.id, secondMatchedMember.id]));
    expect(matchRows?.length).toBeGreaterThanOrEqual(2);
    expect(matchRows?.every((match) => match.status === 'new')).toBe(true);
    expect(matchRows?.every((match) => ['strong', 'good', 'possible'].includes(match.relevance_band))).toBe(true);

    const { error: hiddenScoreError } = await owner.client
      .from('matches')
      .select('score_internal')
      .eq('id', matchRows![0]!.id);
    expect(hiddenScoreError).toBeTruthy();
    const { error: hiddenWeightError } = await owner.client
      .from('match_reasons')
      .select('weight_internal')
      .eq('match_id', matchRows![0]!.id);
    expect(hiddenWeightError).toBeTruthy();

    for (const member of [matchedMember, outsider]) {
      const { data: privateNeed } = await member.client.from('competence_needs').select('id').eq('id', needId!).maybeSingle();
      const { data: privateTerms } = await member.client.from('need_competencies').select('id').eq('need_id', needId!);
      expect(privateNeed).toBeNull();
      expect(privateTerms).toEqual([]);
      for (const match of matchRows!) {
        const { data: privateMatch } = await member.client.from('matches').select('id').eq('id', match.id).maybeSingle();
        const { data: privateReasons } = await member.client.from('member_match_reasons').select('id').eq('match_id', match.id);
        expect(privateMatch).toBeNull();
        expect(privateReasons).toEqual([]);
      }
    }

    const { data: visibleCompetence } = await outsider.client
      .from('profile_competencies')
      .select('id')
      .eq('profile_id', matchedMember.id)
      .eq('competency_id', productQualityId!)
      .single();
    expect(visibleCompetence?.id).toBeTruthy();
    const { data: hiddenEvidence } = await outsider.client
      .from('competence_evidence')
      .select('id, visibility')
      .eq('profile_competency_id', visibleCompetence!.id);
    expect(hiddenEvidence).toEqual([]);

    await page.getByRole('button', { name: `Save match for ${matchedName}` }).click();
    await expect(page.getByText('Match saved.')).toBeVisible();
    await expect(sofiaCard.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Dismiss match for ${secondMatchedName}` }).click();
    await expect(page.getByText('Match dismissed.')).toBeVisible();
    await expect(page.getByRole('heading', { name: matchedName })).toBeVisible();
    await expect(page.getByRole('heading', { name: secondMatchedName })).toHaveCount(0);

    const { data: finalMatchStatuses } = await owner.client.from('matches').select('matched_profile_id, status').eq('need_id', needId!);
    expect(finalMatchStatuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ matched_profile_id: matchedMember.id, status: 'saved' }),
      expect.objectContaining({ matched_profile_id: secondMatchedMember.id, status: 'dismissed' }),
    ]));
  } finally {
    try {
      await context.close();
    } finally {
      await Promise.all([
        owner.remove(),
        matchedMember.remove(),
        secondMatchedMember.remove(),
        unavailableMember.remove(),
        undiscoverableMember.remove(),
        outsider.remove(),
      ]);
    }
  }
});

test('drafts stay private, network briefs are explicit, and expired needs create no new matches', async ({ browser }) => {
  const owner = await createLocalMember('Network Need Owner');
  const visitor = await createLocalMember('Network Visitor');
  const context = await browser.newContext();

  try {
    const { data: term, error: termError } = await owner.client
      .from('competencies')
      .select('id')
      .eq('slug', 'workflow-automation')
      .single();
    expect(termError).toBeNull();
    await createProfile(owner, 'Network Need Owner', 'private');

    await context.addCookies(owner.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const page = await context.newPage();
    await page.goto('/find/new');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/find\/[0-9a-f-]+\?status=draft-saved/);
    await expect(page.getByText('Draft need', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No suitable matches yet' })).toHaveCount(0);
    const draftId = page.url().match(/\/find\/([0-9a-f-]+)/)?.[1];
    expect(draftId).toBeTruthy();
    const { data: privateDraft, error: draftError } = await owner.client
      .from('competence_needs')
      .select('id, status, title')
      .eq('id', draftId!)
      .single();
    expect(draftError).toBeNull();
    expect(privateDraft).toMatchObject({ id: draftId, status: 'draft', title: '' });
    const { data: hiddenDraft } = await visitor.client
      .from('competence_needs')
      .select('id')
      .eq('id', draftId!)
      .maybeSingle();
    expect(hiddenDraft).toBeNull();

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: networkNeed, error: networkInsertError } = await owner.client
      .from('competence_needs')
      .insert({
        owner_profile_id: owner.id,
        title: 'Shared automation brief',
        business_outcome: 'Reduce repetitive review work.',
        problem_statement: 'Manual review delays operations.',
        visibility: 'network',
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    expect(networkInsertError).toBeNull();
    const { error: termInsertError } = await owner.client.from('need_competencies').insert({
      need_id: networkNeed!.id,
      competency_id: term!.id,
      importance: 'essential',
    });
    expect(termInsertError).toBeNull();
    const { error: activateError } = await owner.client.from('competence_needs').update({ status: 'active' }).eq('id', networkNeed!.id);
    expect(activateError).toBeNull();

    const { data: visibleNetworkNeed } = await visitor.client
      .from('competence_needs')
      .select('id, title, status')
      .eq('id', networkNeed!.id)
      .single();
    expect(visibleNetworkNeed).toMatchObject({ id: networkNeed!.id, title: 'Shared automation brief', status: 'active' });
    const { data: visibleNetworkTerm } = await visitor.client
      .from('need_competencies')
      .select('competency_id, importance')
      .eq('need_id', networkNeed!.id);
    expect(visibleNetworkTerm).toEqual([{ competency_id: term!.id, importance: 'essential' }]);

    const { data: generatedCount, error: matchingError } = await owner.client.rpc('generate_matches_for_need', { target_need_id: networkNeed!.id });
    expect(matchingError).toBeNull();
    const { data: ownerMatches, error: ownerMatchesError } = await owner.client
      .from('matches').select('id, matched_profile_id').eq('need_id', networkNeed!.id);
    expect(ownerMatchesError).toBeNull();
    expect(ownerMatches).toHaveLength(generatedCount ?? 0);
    const matchIdsBeforeExpiry = (ownerMatches ?? []).map((match) => match.id).sort();
    const { data: visitorMatches, error: visitorMatchesError } = await visitor.client
      .from('matches').select('id').eq('need_id', networkNeed!.id);
    expect(visitorMatchesError).toBeNull();
    expect(visitorMatches).toEqual([]);

    await page.goto(`/find/${networkNeed!.id}`);
    if ((generatedCount ?? 0) > 0) {
      await expect(page.getByRole('heading', { name: 'Relevant people' })).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'No suitable matches yet' })).toBeVisible();
    }

    const visitorContext = await browser.newContext();
    await visitorContext.addCookies(visitor.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(`/find/${networkNeed!.id}`);
    await expect(visitorPage.getByRole('heading', { name: 'Shared automation brief' })).toBeVisible();
    await expect(visitorPage.getByText('Need owner’s match results are private')).toBeVisible();
    await visitorContext.close();

    const { error: expireError } = await owner.client.from('competence_needs').update({ status: 'expired' }).eq('id', networkNeed!.id);
    expect(expireError).toBeNull();
    const { data: expiredCount, error: expiredMatchingError } = await owner.client.rpc('generate_matches_for_need', { target_need_id: networkNeed!.id });
    expect(expiredCount).toBeNull();
    expect(expiredMatchingError).toBeTruthy();
    const { data: matchesAfterExpiry } = await owner.client.from('matches').select('id').eq('need_id', networkNeed!.id);
    expect((matchesAfterExpiry ?? []).map((match) => match.id).sort()).toEqual(matchIdsBeforeExpiry);
    await page.reload();
    await expect(page.getByText('This need has expired. New matches are not generated for expired needs.')).toBeVisible();
  } finally {
    await context.close();
    await owner.remove();
    await visitor.remove();
  }
});