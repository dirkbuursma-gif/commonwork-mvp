import { expect, test } from '@playwright/test';
import {
  createLocalAdminClient,
  createLocalAnonymousClient,
  createLocalMember,
} from './helpers/local-supabase';

test('geography remains optional, owner-controlled and private to authorized members', async ({ browser }) => {
  const member = await createLocalMember('Geography Test Member');
  const otherMember = await createLocalMember('Other Geography Member');
  const admin = createLocalAdminClient();
  const anonymous = createLocalAnonymousClient();

  try {
    const { error: profileInsertError } = await member.client.from('profiles').insert({
      id: member.id,
      display_name: 'Geography Test Member',
      professional_summary: 'A synthetic profile for migration tests.',
      what_i_contribute: 'A synthetic contribution.',
    });
    expect(profileInsertError).toBeNull();

    const { data: initialProfile, error: initialProfileError } = await member.client.rpc('get_my_profile');
    expect(initialProfileError).toBeNull();
    expect(initialProfile[0]).toMatchObject({ base_country_code: null, markets_served: [] });

    const context = await browser.newContext();
    try {
      await context.addCookies(member.cookies.map(({ name, value }) => ({
        name,
        value,
        url: 'http://127.0.0.1:4322',
      })));
      const page = await context.newPage();
      await page.goto('/onboarding');
      await expect(page.getByLabel('Base country')).toBeVisible();
      await expect(page.getByLabel('Markets served')).toBeVisible();
      await page.getByLabel('Base country').selectOption('NL');
      await page.getByLabel('Markets served').selectOption(['NL', 'BE']);
      await page.getByRole('button', { name: 'Save and continue' }).click();
      await expect(page).toHaveURL(/\/onboarding\?step=competencies&status=saved/);
    } finally {
      await context.close();
    }

    const { data: savedProfile, error: savedProfileError } = await member.client.rpc('get_my_profile');
    expect(savedProfileError).toBeNull();
    expect(savedProfile[0]).toMatchObject({
      base_country_code: 'NL',
      markets_served: ['BE', 'NL'],
    });

    const { data: privateProfile, error: memberReadError } = await otherMember.client
      .from('discoverable_profiles')
      .select('id, base_country_code, markets_served')
      .eq('id', member.id);
    expect(memberReadError).toBeNull();
    expect(privateProfile).toEqual([]);

    const { data: competence, error: competenceLookupError } = await member.client.from('competencies')
      .select('id')
      .eq('slug', 'customer-experience')
      .single();
    expect(competenceLookupError).toBeNull();
    const { data: profileCompetence, error: profileCompetenceError } = await member.client
      .from('profile_competencies')
      .insert({
        profile_id: member.id,
        competency_id: competence!.id,
        member_statement: 'A synthetic member-authored competence statement.',
        discoverable: true,
      })
      .select('id')
      .single();
    expect(profileCompetenceError).toBeNull();
    const { error: evidenceError } = await member.client.from('competence_evidence').insert({
      profile_competency_id: profileCompetence!.id,
      title: 'Private synthetic evidence',
      context: 'A synthetic private example.',
      contribution: 'A synthetic contribution.',
      outcome: 'A synthetic outcome.',
      visibility: 'private',
    });
    expect(evidenceError).toBeNull();
    const { error: preferencesError } = await member.client.from('contact_preferences').insert({
      profile_id: member.id,
    });
    expect(preferencesError).toBeNull();
    const { error: visibilityError } = await member.client.from('profiles')
      .update({ profile_visibility: 'members' })
      .eq('id', member.id);
    expect(visibilityError).toBeNull();

    const { data: discoverableProfile, error: discoverableReadError } = await otherMember.client
      .from('discoverable_profiles')
      .select('id, base_country_code, markets_served')
      .eq('id', member.id)
      .single();
    expect(discoverableReadError).toBeNull();
    expect(discoverableProfile).toMatchObject({
      id: member.id,
      base_country_code: 'NL',
      markets_served: ['BE', 'NL'],
    });

    const { error: anonymousViewError } = await anonymous
      .from('discoverable_profiles')
      .select('id, base_country_code, markets_served')
      .eq('id', member.id);
    expect(anonymousViewError).not.toBeNull();
    const { error: anonymousRpcError } = await anonymous.rpc('get_my_profile');
    expect(anonymousRpcError).not.toBeNull();

    const { data: vocabulary, error: vocabularyError } = await member.client
      .from('competencies')
      .select('name, slug, description')
      .in('slug', [
        'contact-centre-automation-impact-evaluation',
        'staffing-capacity-planning',
        'event-coordination',
      ]);
    expect(vocabularyError).toBeNull();
    expect(vocabulary).toHaveLength(3);
  } finally {
    await admin.from('profiles').delete().in('id', [member.id, otherMember.id]);
    await member.remove();
    await otherMember.remove();
  }
});

test('geography constraints reject invalid direct writes, including service-role writes', async () => {
  const member = await createLocalMember('Geography Constraint Member');
  const admin = createLocalAdminClient();

  try {
    const { error: profileInsertError } = await member.client.from('profiles').insert({
      id: member.id,
      display_name: 'Geography Constraint Member',
      professional_summary: 'A synthetic profile for constraint tests.',
      what_i_contribute: 'A synthetic contribution.',
    });
    expect(profileInsertError).toBeNull();

    const validWrite = await member.client.from('profiles').update({
      base_country_code: 'NL',
      markets_served: ['NL', 'BE'],
    }).eq('id', member.id);
    expect(validWrite.error).toBeNull();

    const invalidWrites = [
      { base_country_code: 'nl' },
      { base_country_code: 'ZZ' },
      { markets_served: null },
      { markets_served: ['NL', null] },
      { markets_served: ['NL', 'NL'] },
      { markets_served: Array.from({ length: 21 }, (_, index) => [
        'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS',
        'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF',
      ][index]) },
      { markets_served: [['NL', 'BE']] },
      { markets_served: ['ZZ'] },
    ];

    for (const changes of invalidWrites) {
      const { error } = await member.client.from('profiles').update(changes).eq('id', member.id);
      expect(error, JSON.stringify(changes)).not.toBeNull();
    }

    const { error: serviceRoleError } = await admin.from('profiles')
      .update({ base_country_code: 'nl' })
      .eq('id', member.id);
    expect(serviceRoleError).not.toBeNull();
  } finally {
    await admin.from('profiles').delete().eq('id', member.id);
    await member.remove();
  }
});
