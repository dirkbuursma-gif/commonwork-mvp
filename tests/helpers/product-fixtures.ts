import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { createLocalAdminClient } from './local-supabase';

export type Admin = ReturnType<typeof createLocalAdminClient>;
export type ProductFixture = { providerId: string; productId: string; slug: string; name: string; providerName: string };
export type Availability = 'published' | 'draft';

/** Creates provider+product pairs with neutral names so public-text assertions stay meaningful. */
export async function createProducts(admin: Admin, label: string, count = 1, options: { product?: Availability; provider?: Availability } = {}): Promise<ProductFixture[]> {
  const stamp = new Date().toISOString();
  const seeds = Array.from({ length: count }, (_, index) => {
    const suffix = randomUUID();
    return { suffix, index, providerName: `Interest Provider ${label} ${index + 1} ${suffix.slice(0, 6)}`, name: `Interest Product ${label} ${index + 1} ${suffix.slice(0, 6)}` };
  });
  const providers = await admin.from('providers').insert(seeds.map((seed) => ({
    slug: `interest-provider-${seed.suffix}`, name: seed.providerName, source_system: 'local-follow-test', source_record_id: seed.suffix,
  }))).select('id, slug');
  expect(providers.error).toBeNull();
  const providerBySlug = new Map((providers.data ?? []).map((row) => [row.slug as string, row.id as string]));
  const products = await admin.from('provider_products').insert(seeds.map((seed) => ({
    provider_id: providerBySlug.get(`interest-provider-${seed.suffix}`), slug: `interest-product-${seed.suffix}`, name: seed.name,
    source_system: 'local-follow-test', source_record_id: seed.suffix,
  }))).select('id, slug');
  expect(products.error).toBeNull();
  const productBySlug = new Map((products.data ?? []).map((row) => [row.slug as string, row.id as string]));
  const providerStatus = options.provider ?? 'published';
  const productStatus = options.product ?? 'published';
  const statuses = await admin.from('provider_publication_status').insert(seeds.flatMap((seed) => [
    { provider_id: providerBySlug.get(`interest-provider-${seed.suffix}`), status: providerStatus, published_at: providerStatus === 'published' ? stamp : null },
    { provider_product_id: productBySlug.get(`interest-product-${seed.suffix}`), status: productStatus, published_at: productStatus === 'published' ? stamp : null },
  ]));
  expect(statuses.error).toBeNull();
  return seeds.map((seed) => ({
    providerId: providerBySlug.get(`interest-provider-${seed.suffix}`)!, productId: productBySlug.get(`interest-product-${seed.suffix}`)!,
    slug: `interest-product-${seed.suffix}`, name: seed.name, providerName: seed.providerName,
  }));
}

export async function removeProducts(admin: Admin, fixtures: ProductFixture[]) {
  if (fixtures.length) await admin.from('providers').delete().in('id', fixtures.map((fixture) => fixture.providerId));
}

export async function followRows(admin: Admin, memberId: string, productId?: string) {
  let query = admin.from('product_follows').select('provider_product_id, followed_at').eq('member_id', memberId);
  if (productId) query = query.eq('provider_product_id', productId);
  const { data, error } = await query;
  expect(error).toBeNull();
  return data ?? [];
}
