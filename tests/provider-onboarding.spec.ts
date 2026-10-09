import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember } from './helpers/local-supabase';

const draftProviderSlugs = ['plumbed', 'staffcloud'];
const draftProductSlugs = ['plumbed-integration-platform', 'staffcloud-managed-ecommerce-support'];

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

test('draft Plumbed and Staffcloud records are stored as drafts but hidden from members', async () => {
  const admin = createLocalAdminClient();
  const { data: providerStatus } = await admin.from('provider_publication_status')
    .select('status, published_at, providers!inner(slug, reviewed_at, reviewed_by)').in('providers.slug', draftProviderSlugs);
  expect(providerStatus).toHaveLength(2);
  for (const row of providerStatus ?? []) {
    expect(row.status).toBe('draft');
    expect(row.published_at).toBeNull();
    expect((row as any).providers.reviewed_at).toBeNull();
    expect((row as any).providers.reviewed_by).toBeNull();
  }
  const { data: productStatus } = await admin.from('provider_publication_status')
    .select('status, published_at, provider_products!inner(slug, reviewed_at, reviewed_by)').in('provider_products.slug', draftProductSlugs);
  expect(productStatus).toHaveLength(2);
  for (const row of productStatus ?? []) {
    expect(row.status).toBe('draft');
    expect(row.published_at).toBeNull();
    expect((row as any).provider_products.reviewed_at).toBeNull();
    expect((row as any).provider_products.reviewed_by).toBeNull();
  }

  const member = await createLocalMember('Draft Hidden Member');
  try {
    const { data: providers } = await member.client.from('providers').select('slug').in('slug', draftProviderSlugs);
    const { data: products } = await member.client.from('provider_products').select('slug').in('slug', draftProductSlugs);
    expect(providers).toEqual([]);
    expect(products).toEqual([]);
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
    for (const [slug, name] of [['integration-automation', 'Plumbed'], ['ecommerce-operations-support', 'Staffcloud']]) {
      await page.goto(`/intelligence/category/${slug}`);
      await expect(page.getByText(name, { exact: false })).toHaveCount(0);
    }
  } finally {
    await context.close();
    await member.remove();
  }
});
