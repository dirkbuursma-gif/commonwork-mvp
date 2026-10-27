import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient } from './helpers/local-supabase';

test('catalogue cards group details and private actions without unsolicited event content', async ({ page }) => {
  const admin = createLocalAdminClient();
  const slug = `card-presentation-${randomUUID()}`;
  let providerId: string | undefined;
  try {
    const provider = await admin.from('providers').insert({ slug, name: 'Card presentation provider', source_system: 'local-presentation-test', source_record_id: slug, is_seed_data: false }).select('id').single();
    expect(provider.error).toBeNull();
    if (!provider.data) throw new Error('Provider fixture missing');
    providerId = provider.data.id;
    const product = await admin.from('provider_products').insert({ provider_id: providerId, slug, name: 'Card presentation product', summary: 'Source catalogue listing. Detailed capabilities have not yet been supplied in the imported source record.', source_system: 'local-presentation-test', source_record_id: slug, is_seed_data: false }).select('id').single();
    expect(product.error).toBeNull();
    if (!product.data) throw new Error('Product fixture missing');
    expect((await admin.from('provider_publication_status').insert([{ provider_id: providerId, status: 'published', published_at: new Date().toISOString() }, { provider_product_id: product.data.id, status: 'published', published_at: new Date().toISOString() }])).error).toBeNull();
    await page.goto('/catalogue?q=Card%20presentation%20product');
    const card = page.locator('.catalogue-card').filter({ hasText: 'Card presentation product' });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.catalogue-category-icon')).toHaveAttribute('aria-hidden', 'true');
    await expect(card.locator('.catalogue-summary')).toHaveText('Product description not yet available.');
    await expect(card.locator('details')).not.toHaveAttribute('open', '');
    await expect(page.getByRole('region', { name: 'Related event videos' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Explore the Agentic Commerce event collection and videos' })).toHaveCount(0);
    await card.getByRole('link', { name: 'Card presentation product', exact: true }).click();
    await expect(card.locator('details')).toHaveAttribute('open', '');
    const tools = card.getByRole('complementary', { name: 'Member product tools' });
    await expect(tools).toBeVisible();
    await expect(tools.getByRole('link', { name: 'Continue to member product tools', exact: true })).toHaveAttribute('href', `/intelligence/product/${slug}?workspace=1`);
    await expect(page.locator('.public-product-tools')).toHaveCount(0);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
    }
  } finally { if (providerId) await admin.from('providers').delete().eq('id', providerId); }
});
