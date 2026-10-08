import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

async function createDiscoverableProfile(member: LocalMember, name: string) {
  const { error } = await member.client.from('profiles').insert({
    id: member.id,
    display_name: name,
    professional_summary: `${name} works on practical commerce problems.`,
    what_i_contribute: `${name} contributes clear, evidence-led thinking.`,
    what_i_am_exploring: 'Useful professional conversations.',
    profile_visibility: 'members',
  });
  expect(error).toBeNull();
  const { data: competency } = await member.client.from('competencies').select('id').eq('slug', 'platform-assessment').single();
  const { data: profileCompetency, error: competencyError } = await member.client.from('profile_competencies').insert({
    profile_id: member.id,
    competency_id: competency!.id,
    member_statement: `${name} applies this competence in practice.`,
    discoverable: true,
  }).select('id').single();
  expect(competencyError).toBeNull();
  const { error: evidenceError } = await member.client.from('competence_evidence').insert({
    profile_competency_id: profileCompetency!.id,
    title: 'Practical example',
    context: 'A realistic commerce situation.',
    contribution: 'I structured the decision.',
    outcome: 'The team could act with confidence.',
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
}

test('product affiliations are unambiguous, curator-managed and consent-gated', async () => {
  const admin = createLocalAdminClient();
  const expert = await createLocalMember('Affiliation Expert');
  const unlinked = await createLocalMember('Affiliation Unlinked');
  const viewer = await createLocalMember('Affiliation Viewer');
  const unique = randomUUID().slice(0, 8);
  const orgIds: string[] = [];

  try {
    const { data: product } = await admin.from('provider_products').select('id, provider_id').eq('slug', 'salesforce-commerce-cloud').single();
    const { data: vendorOrg, error: orgError } = await admin.from('organisations')
      .insert({ slug: `aff-${unique}`, name: 'Affiliation Vendor', organisation_type: 'vendor', provider_id: product!.provider_id })
      .select('id').single();
    expect(orgError).toBeNull();
    orgIds.push(vendorOrg!.id);

    await createDiscoverableProfile(expert, 'Affiliation Expert');
    await createDiscoverableProfile(unlinked, 'Affiliation Unlinked');
    await createDiscoverableProfile(viewer, 'Affiliation Viewer');
    await admin.from('profile_organisations').insert({ profile_id: expert.id, organisation_id: vendorOrg!.id, role_title: 'Solutions Architect' })
      .then(({ error }) => expect(error).toBeNull());

    // A member without an organisation link to the product's provider is rejected.
    const ambiguous = await admin.from('profile_product_affiliations')
      .insert({ profile_id: unlinked.id, provider_product_id: product!.id });
    expect(ambiguous.error).toBeTruthy();

    // consent_given and consented_at must agree.
    const inconsistent = await admin.from('profile_product_affiliations')
      .insert({ profile_id: expert.id, provider_product_id: product!.id, consent_given: true });
    expect(inconsistent.error).toBeTruthy();

    // Members cannot self-declare an affiliation.
    const selfDeclared = await expert.client.from('profile_product_affiliations')
      .insert({ profile_id: expert.id, provider_product_id: product!.id });
    expect(selfDeclared.error).toBeTruthy();

    const { error: createError } = await admin.from('profile_product_affiliations')
      .insert({ profile_id: expert.id, provider_product_id: product!.id, role_title: 'Solutions Architect' });
    expect(createError).toBeNull();

    // Without consent, only the member sees the row.
    const ownRows = await expert.client.from('profile_product_affiliations').select('provider_product_id').eq('profile_id', expert.id);
    expect(ownRows.data).toHaveLength(1);
    const hiddenRows = await viewer.client.from('profile_product_affiliations').select('provider_product_id').eq('profile_id', expert.id);
    expect(hiddenRows.data).toEqual([]);

    const { error: consentError } = await admin.from('profile_product_affiliations')
      .update({ consent_given: true, consented_at: new Date().toISOString() })
      .eq('profile_id', expert.id).eq('provider_product_id', product!.id);
    expect(consentError).toBeNull();

    const visibleRows = await viewer.client.from('profile_product_affiliations').select('provider_product_id, role_title').eq('profile_id', expert.id);
    expect(visibleRows.data).toEqual([expect.objectContaining({ provider_product_id: product!.id, role_title: 'Solutions Architect' })]);

    // Moving the affiliation to a member outside the provider is rejected as well.
    const moved = await admin.from('profile_product_affiliations')
      .update({ profile_id: unlinked.id }).eq('profile_id', expert.id);
    expect(moved.error).toBeTruthy();
  } finally {
    if (orgIds.length) await admin.from('organisations').delete().in('id', orgIds);
    await expert.remove();
    await unlinked.remove();
    await viewer.remove();
  }
});
