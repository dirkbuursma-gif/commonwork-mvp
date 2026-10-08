import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

async function createDiscoverableProfile(member: LocalMember, name: string, competencySlug: string) {
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

test('organisations connect needs to products, partners and affiliated people', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const requester = await createLocalMember('Org Requester');
  const expert = await createLocalMember('Org Vendor Expert');
  const outsider = await createLocalMember('Org Outsider');
  const unique = randomUUID().slice(0, 8);
  const orgIds: string[] = [];
  const context = await browser.newContext();

  try {
    const { data: competency } = await admin.from('competencies').select('id').eq('slug', 'platform-assessment').single();
    const { data: product } = await admin.from('provider_products').select('id, name').eq('slug', 'salesforce-commerce-cloud').single();
    const makeOrg = async (slug: string, name: string, type: string) => {
      const { data, error } = await admin.from('organisations').insert({ slug: `${slug}-${unique}`, name, organisation_type: type }).select('id').single();
      expect(error).toBeNull();
      orgIds.push(data!.id);
      return data!.id as string;
    };
    const retailerId = await makeOrg('rt', 'Test Retailer', 'retailer');
    const vendorId = await makeOrg('vd', 'Test Vendor', 'vendor');
    const partnerId = await makeOrg('si', 'Test Partner', 'si_gtm');
    const otherRetailerId = await makeOrg('rt2', 'Other Retailer', 'retailer');

    await createDiscoverableProfile(requester, 'Org Requester', 'retail-operations');
    await createDiscoverableProfile(expert, 'Org Vendor Expert', 'platform-assessment');
    await admin.from('profile_organisations').insert([
      { profile_id: requester.id, organisation_id: retailerId, role_title: 'Head of Commerce' },
    ]).then(({ error }) => expect(error).toBeNull());
    await admin.from('profile_organisations').insert({ profile_id: expert.id, organisation_id: vendorId, role_title: 'Solutions Architect' })
      .then(({ error }) => expect(error).toBeNull());
    await admin.from('organisation_competency_links').insert({ organisation_id: partnerId, competency_id: competency!.id })
      .then(({ error }) => expect(error).toBeNull());
    await admin.from('organisation_product_links').insert({ organisation_id: partnerId, provider_product_id: product!.id })
      .then(({ error }) => expect(error).toBeNull());

    const baseNeed = {
      owner_profile_id: requester.id,
      title: 'Assess commerce platform options',
      business_outcome: 'Choose a platform with confidence.',
      problem_statement: 'We need a defensible comparison of options.',
      conversation_type: 'peer_exchange',
      visibility: 'private_matches',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      retailer_segment: 'Fashion',
      current_stack_note: 'Legacy monolith',
    };

    const rejected = await requester.client.from('competence_needs')
      .insert({ ...baseNeed, status: 'draft', retailer_organisation_id: otherRetailerId });
    expect(rejected.error).toBeTruthy();

    const { data: need, error: needError } = await requester.client.from('competence_needs')
      .insert({ ...baseNeed, status: 'draft', retailer_organisation_id: retailerId }).select('id').single();
    expect(needError).toBeNull();
    await requester.client.from('need_competencies').insert({ need_id: need!.id, competency_id: competency!.id, importance: 'essential' })
      .then(({ error }) => expect(error).toBeNull());
    await requester.client.from('competence_needs').update({ status: 'active' }).eq('id', need!.id)
      .then(({ error }) => expect(error).toBeNull());
    await requester.client.rpc('generate_matches_for_need', { target_need_id: need!.id })
      .then(({ error }) => expect(error).toBeNull());

    const { data: products } = await requester.client.rpc('get_need_product_suggestions', { target_need_id: need!.id });
    expect((products as Array<{ product_slug: string }>).map((item) => item.product_slug)).toContain('salesforce-commerce-cloud');
    const { data: partners } = await requester.client.rpc('get_need_partner_suggestions', { target_need_id: need!.id });
    expect((partners as Array<{ organisation_name: string; implements_products: string[] }>)
      .find((item) => item.organisation_name === 'Test Partner')?.implements_products).toContain(product!.name);

    const { data: outsiderProducts } = await outsider.client.rpc('get_need_product_suggestions', { target_need_id: need!.id });
    const { data: outsiderPartners } = await outsider.client.rpc('get_need_partner_suggestions', { target_need_id: need!.id });
    expect(outsiderProducts).toEqual([]);
    expect(outsiderPartners).toEqual([]);

    const selfAffiliate = await expert.client.from('profile_organisations').insert({ profile_id: expert.id, organisation_id: partnerId });
    expect(selfAffiliate.error).toBeTruthy();
    const { data: visibleAffiliation } = await requester.client.from('profile_organisations')
      .select('role_title, organisations(name, organisation_type)').eq('profile_id', expert.id);
    expect(visibleAffiliation).toEqual([expect.objectContaining({ role_title: 'Solutions Architect' })]);

    await context.addCookies(requester.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const page = await context.newPage();
    await page.goto(`/find/${need!.id}`);
    await expect(page.getByRole('heading', { name: 'Products and partners to consider' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Salesforce Commerce Cloud' })).toBeVisible();
    await expect(page.getByText('Test Partner')).toBeVisible();
    await expect(page.getByText(/Solutions Architect, Test Vendor/)).toBeVisible();
    await expect(page.getByText('Legacy monolith')).toBeVisible();
  } finally {
    await context.close();
    if (orgIds.length) await admin.from('organisations').delete().in('id', orgIds);
    await requester.remove();
    await expert.remove();
    await outsider.remove();
  }
});
