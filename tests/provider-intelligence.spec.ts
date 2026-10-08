import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { validateIntelligenceReturnPath } from '../src/lib/auth-return-path';
import { createLocalAdminClient, createLocalMember } from './helpers/local-supabase';

test('return paths allow only local Intelligence routes', () => {
  expect(validateIntelligenceReturnPath('/intelligence')).toBe('/intelligence');
  expect(validateIntelligenceReturnPath('/intelligence/category/agentic-commerce')).toBe('/intelligence/category/agentic-commerce');
  expect(validateIntelligenceReturnPath('/intelligence/provider/adobe')).toBe('/intelligence/provider/adobe');
  expect(validateIntelligenceReturnPath('/intelligence/product/adobe-commerce')).toBe('/intelligence/product/adobe-commerce');
  expect(validateIntelligenceReturnPath('https://evil.example')).toBeNull();
  expect(validateIntelligenceReturnPath('//evil.example/intelligence')).toBeNull();
  expect(validateIntelligenceReturnPath('/today')).toBeNull();
  expect(validateIntelligenceReturnPath('/intelligence/category/a?next=https://evil.example')).toBeNull();
  expect(validateIntelligenceReturnPath('/intelligence\\category\\a')).toBeNull();
});

test('signed-out access to Intelligence carries only an allowed return path', async ({ page }) => {
  await page.goto('/intelligence/category/commerce-platforms');
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get('return_to')).toBe('/intelligence/category/commerce-platforms');

  await page.goto('/sign-in?return_to=https%3A%2F%2Fevil.example');
  await expect(page.locator('input[name="return_to"]')).toHaveCount(0);
});

test('a signed-in member can browse published intelligence and continue to Find', async ({ browser }) => {
  const member = await createLocalMember('Intelligence Browse Member');
  const context = await browser.newContext();
  try {
    await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const page = await context.newPage();
    await page.goto('/intelligence');
    await expect(page.getByRole('heading', { name: 'Intelligence', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Commerce Platforms' }).click();
    await expect(page.getByRole('heading', { name: 'Commerce Platforms', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Adobe Commerce' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Relevant experts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find competence' }).last()).toHaveAttribute('href', '/find');
    await page.getByRole('link', { name: 'Adobe Commerce' }).click();
    await expect(page.getByRole('heading', { name: 'Adobe Commerce', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find competence' }).last()).toHaveAttribute('href', '/find');
  } finally {
    await context.close();
    await member.remove();
  }
});

test('unpublished provider products are hidden by RLS', async () => {
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Unpublished Intelligence Member');
  const unique = randomUUID();
  let providerId: string | null = null;
  try {
    const { data: provider, error: providerError } = await admin.from('providers').insert({
      slug: `draft-provider-${unique}`,
      name: 'Draft Test Provider',
      summary: 'A local unpublished RLS fixture.',
      source_system: 'local-playwright-test',
      source_record_id: unique,
      is_seed_data: false,
    }).select('id').single();
    expect(providerError).toBeNull();
    providerId = provider!.id;

    const { data: product, error: productError } = await admin.from('provider_products').insert({
      provider_id: providerId,
      slug: `draft-product-${unique}`,
      name: 'Draft Test Product',
      source_system: 'local-playwright-test',
      source_record_id: unique,
      is_seed_data: false,
    }).select('id').single();
    expect(productError).toBeNull();

    const { error: providerPublicationError } = await admin.from('provider_publication_status').insert({
      provider_id: providerId,
      status: 'published',
      published_at: new Date().toISOString(),
    });
    expect(providerPublicationError).toBeNull();
    const { error: productPublicationError } = await admin.from('provider_publication_status').insert({
      provider_product_id: product!.id,
      status: 'draft',
    });
    expect(productPublicationError).toBeNull();

    const { data, error } = await member.client.from('provider_products')
      .select('id').eq('id', product!.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  } finally {
    if (providerId) await admin.from('providers').delete().eq('id', providerId);
    await member.remove();
  }
});

test('category experts come only from completed discoverable profiles', async ({ browser }) => {
  const member = await createLocalMember('Product Data Test Expert');
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const { data: competency, error: competencyError } = await member.client.from('competencies')
      .select('id').eq('slug', 'product-data-quality').single();
    expect(competencyError).toBeNull();

    const { error: profileError } = await member.client.from('profiles').insert({
      id: member.id,
      display_name: 'Product Data Test Expert',
      professional_summary: 'Helps commerce teams improve product data quality.',
      what_i_contribute: 'I define product data validation and ownership practices.',
      what_i_am_exploring: 'Evidence-led enrichment workflows.',
      profile_visibility: 'members',
    });
    expect(profileError).toBeNull();

    const { data: profileCompetency, error: profileCompetencyError } = await member.client
      .from('profile_competencies').insert({
        profile_id: member.id,
        competency_id: competency!.id,
        member_statement: 'I make product data more complete and consistent.',
        evidence_status: 'demonstrated',
        discoverable: true,
      }).select('id').single();
    expect(profileCompetencyError).toBeNull();

    const { error: evidenceError } = await member.client.from('competence_evidence').insert({
      profile_competency_id: profileCompetency!.id,
      title: 'Product data quality example',
      context: 'A fictional catalogue contained inconsistent product attributes.',
      contribution: 'I mapped required fields and assigned data ownership.',
      outcome: 'The team gained repeatable product data checks.',
      visibility: 'members',
    });
    expect(evidenceError).toBeNull();
    const { error: preferencesError } = await member.client.from('contact_preferences').insert({
      profile_id: member.id,
      open_to_peer_exchange: true,
      availability_status: 'selective',
      conversation_capacity: 1,
    });
    expect(preferencesError).toBeNull();

    await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: 'http://127.0.0.1:4322' })));
    const page = await context.newPage();
    await page.goto('/intelligence/category/product-data-enrichment');
    const expertLink = page.getByRole('link', { name: /Product Data Test Expert/ });
    await expect(expertLink).toBeVisible();
    await expect(expertLink).not.toContainText(member.email);
    await page.getByRole('button', { name: /theme/i }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
    await member.remove();
  }
});