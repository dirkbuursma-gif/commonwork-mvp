import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember } from './helpers/local-supabase';

const draftProviderSlugs = ['plumbed', 'staffcloud', 'geoffy', 'vtex'];
const draftProductSlugs = ['plumbed-integration-platform', 'staffcloud-managed-ecommerce-support', 'geoffy', 'vtex-commerce-platform'];

test('provider_type accepts only the defined values and defaults to software_vendor', async () => {
  const admin = createLocalAdminClient();
  const { data: seeded } = await admin.from('providers').select('slug, provider_type').in('slug', ['rierino', 'staffcloud', 'plumbed']);
  const types = Object.fromEntries((seeded ?? []).map((row) => [row.slug, row.provider_type]));
  expect(types).toEqual({ rierino: 'software_vendor', plumbed: 'software_vendor', staffcloud: 'service_partner' });

  const { error } = await admin.from('providers').update({ provider_type: 'reseller' }).eq('slug', 'rierino');
  expect(error?.message).toContain('provider_type');
});

test('new onboarding categories carry their competency links', async () => {
  const admin = createLocalAdminClient();
  const { data } = await admin.from('category_competency_links')
    .select('provider_categories!inner(slug), competencies!inner(slug)')
    .in('provider_categories.slug', ['ecommerce-operations-support', 'integration-automation']);
  const links = (data ?? []).map((row: any) => `${row.provider_categories.slug}:${row.competencies.slug}`).sort();
  expect(links).toEqual([
    'ecommerce-operations-support:product-data-quality',
    'ecommerce-operations-support:retail-operations',
    'ecommerce-operations-support:workflow-automation',
    'integration-automation:commerce-architecture',
    'integration-automation:systems-integration',
    'integration-automation:workflow-automation',
  ]);
});

test('draft providers retain source provenance and await Commonwork review', async () => {
  const admin = createLocalAdminClient();
  const { data: providerStatus } = await admin.from('provider_publication_status')
    .select('status, published_at, providers!inner(slug, reviewed_at, reviewed_by, source_system, source_record_id, source_url)')
    .in('providers.slug', draftProviderSlugs);
  expect(providerStatus).toHaveLength(4);
  for (const row of providerStatus ?? []) {
    expect(row.status).toBe('draft');
    expect(row.published_at).toBeNull();
    const provider = (row as any).providers;
    expect(provider.reviewed_at).toBeNull();
    expect(provider.reviewed_by).toBeNull();
  }
  const { data: productStatus } = await admin.from('provider_publication_status')
    .select('status, published_at, provider_products!inner(slug, reviewed_at, reviewed_by, source_system, source_record_id, source_url)')
    .in('provider_products.slug', draftProductSlugs);
  expect(productStatus).toHaveLength(4);
  for (const row of productStatus ?? []) {
    expect(row.status).toBe('draft');
    expect(row.published_at).toBeNull();
    const product = (row as any).provider_products;
    expect(product.reviewed_at).toBeNull();
    expect(product.reviewed_by).toBeNull();
  }

  const providerSources = (providerStatus ?? []).map((row) => {
    const provider = (row as any).providers;
    return `${provider.slug}:${provider.source_system}:${provider.source_record_id}:${provider.source_url}`;
  });
  expect(providerSources).toEqual(expect.arrayContaining([
    'geoffy:cp-partner-intake-2026-09-14:geoffy:https://geoffy.ai',
    'vtex:cp-provider-export-2026-09-02:vtex:https://vtex.com',
  ]));
  const productSources = (productStatus ?? []).map((row) => {
    const product = (row as any).provider_products;
    return `${product.slug}:${product.source_system}:${product.source_record_id}:${product.source_url}`;
  });
  expect(productSources).toEqual(expect.arrayContaining([
    'geoffy:cp-partner-intake-2026-09-14:geoffy:https://geoffy.ai',
    'vtex-commerce-platform:cp-platform-catalogue-2026-10-07:plat-czu1ajo74:https://vtex.com/en-us/vtex-io/',
  ]));

  const member = await createLocalMember('Draft Hidden Member');
  try {
    const { data: providers } = await member.client.from('providers').select('slug').in('slug', draftProviderSlugs);
    const { data: products } = await member.client.from('provider_products').select('slug').in('slug', draftProductSlugs);
    expect(providers).toEqual([]);
    expect(products).toEqual([]);

    const { data: competencies, error: competenciesError } = await member.client.from('competencies')
      .select('id, slug').in('slug', ['product-data-enrichment', 'platform-assessment']);
    expect(competenciesError).toBeNull();
    expect(competencies).toHaveLength(2);
    const { error: profileError } = await member.client.from('profiles').insert({
      id: member.id,
      display_name: 'Draft Hidden Member',
    });
    expect(profileError).toBeNull();
    const { data: need, error: needError } = await member.client.from('competence_needs').insert({
      owner_profile_id: member.id,
      title: 'Assess product data enrichment options',
      business_outcome: 'Improve machine-readable product data.',
      problem_statement: 'Product data needs better structure for discovery.',
      conversation_type: 'peer_exchange',
      visibility: 'private_matches',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      status: 'draft',
    }).select('id').single();
    expect(needError).toBeNull();
    const { error: needCompetencyError } = await member.client.from('need_competencies').insert(
      (competencies ?? []).map(({ id }) => ({ need_id: need!.id, competency_id: id, importance: 'essential' })),
    );
    expect(needCompetencyError).toBeNull();
    const { data: suggestions, error: suggestionsError } = await member.client
      .rpc('get_need_product_suggestions', { target_need_id: need!.id });
    expect(suggestionsError).toBeNull();
    const suggestedSlugs = (suggestions as Array<{ product_slug: string }>).map(({ product_slug }) => product_slug);
    expect(suggestedSlugs).not.toContain('geoffy');
    expect(suggestedSlugs).not.toContain('vtex-commerce-platform');
  } finally {
    await member.remove();
  }
});

test('draft partners do not appear in the Intelligence category pages', async ({ browser }) => {
  const member = await createLocalMember('Draft Category Member');
  const context = await browser.newContext();
  try {
    await member.client.from('profiles').insert({ id: member.id, display_name: 'Draft Category Member' })
      .then(({ error }) => expect(error).toBeNull());
    await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const page = await context.newPage();
    for (const [slug, name] of [['integration-automation', 'Plumbed'], ['ecommerce-operations-support', 'Staffcloud'], ['agentic-commerce', 'Geoffy'], ['product-data-enrichment', 'Geoffy'], ['commerce-platforms', 'VTEX']]) {
      await page.goto(`/intelligence/category/${slug}`);
      await expect(page.getByText(name, { exact: false })).toHaveCount(0);
    }
  } finally {
    await context.close();
    await member.remove();
  }
});
