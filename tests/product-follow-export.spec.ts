import { expect, request as playwrightRequest, test } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember } from './helpers/local-supabase';
import { createProducts, followRows, removeProducts } from './helpers/product-fixtures';

const ORIGIN = 'http://127.0.0.1:4322';
const previousKeys = [
  'exported_at', 'authentication_email', 'profile', 'competencies', 'contact_preferences', 'contact_methods',
  'needs', 'introductions', 'feedback', 'privacy_requests', 'notifications', 'blocked_members',
];
type ExportedFollow = { product_id: string; followed_at: string; available: boolean; product_slug: string | null; product_name: string | null; provider_name: string | null };

async function exportOf(member: { client: { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> } }) {
  const { data, error } = await member.client.rpc('export_my_member_data');
  expect(error).toBeNull();
  return data as Record<string, unknown> & { product_follows: ExportedFollow[] };
}

test('the export keeps every existing field and adds only the member\'s own active follows with followed_at', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const [first, second, other] = await createProducts(admin, 'export', 3);
  const member = await createLocalMember('Export Member');
  const neighbour = await createLocalMember('Export Neighbour');
  try {
    expect((await admin.from('profiles').insert({ id: member.id, display_name: 'Export Member' })).error).toBeNull();
    const empty = await exportOf(member);
    expect(Object.keys(empty).sort()).toEqual([...previousKeys, 'product_follows'].sort());
    expect(empty.product_follows).toEqual([]);
    expect(empty).toMatchObject({ authentication_email: member.email, profile: { id: member.id } });

    expect((await member.client.rpc('follow_product', { target_product_id: first!.productId })).error).toBeNull();
    expect((await member.client.rpc('follow_product', { target_product_id: second!.productId })).error).toBeNull();
    expect((await neighbour.client.rpc('follow_product', { target_product_id: other!.productId })).error).toBeNull();
    expect((await neighbour.client.rpc('follow_product', { target_product_id: first!.productId })).error).toBeNull();

    const stored = new Map((await followRows(admin, member.id)).map((row) => [row.provider_product_id as string, row.followed_at as string]));
    const exported = await exportOf(member);
    expect(exported.product_follows).toHaveLength(2);
    expect(new Set(exported.product_follows.map((row) => row.product_id))).toEqual(new Set([first!.productId, second!.productId]));
    for (const row of exported.product_follows) {
      expect(new Date(row.followed_at).getTime()).toBe(new Date(stored.get(row.product_id)!).getTime());
      expect(row.available).toBe(true);
    }
    const firstRow = exported.product_follows.find((row) => row.product_id === first!.productId)!;
    expect(firstRow).toMatchObject({ product_slug: first!.slug, product_name: first!.name, provider_name: first!.providerName });
    for (const key of previousKeys) expect(exported, key).toHaveProperty(key);

    // Cross-member isolation in both directions: nothing of the neighbour appears, and vice versa.
    const memberJson = JSON.stringify(exported);
    expect(memberJson).not.toContain(other!.productId);
    expect(memberJson).not.toContain(other!.name);
    expect(memberJson).not.toContain(neighbour.id);
    const neighbourExport = await exportOf(neighbour);
    expect(new Set(neighbourExport.product_follows.map((row) => row.product_id))).toEqual(new Set([other!.productId, first!.productId]));
    expect(JSON.stringify(neighbourExport)).not.toContain(second!.productId);
    expect(JSON.stringify(neighbourExport)).not.toContain(member.id);

    // Only active follows: unfollowing removes the entry, and a re-follow carries a fresh followed_at.
    const original = new Date(stored.get(first!.productId)!).getTime();
    expect((await member.client.rpc('unfollow_product', { target_product_id: first!.productId })).error).toBeNull();
    expect((await exportOf(member)).product_follows.map((row) => row.product_id)).toEqual([second!.productId]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await member.client.rpc('follow_product', { target_product_id: first!.productId })).error).toBeNull();
    const refollowed = (await exportOf(member)).product_follows.find((row) => row.product_id === first!.productId)!;
    expect(new Date(refollowed.followed_at).getTime()).toBeGreaterThan(original);

    // Owner-only: no anonymous export.
    const anonymous = await createLocalAnonymousClient().rpc('export_my_member_data');
    expect(anonymous.error).toBeTruthy();
    expect(anonymous.data).toBeNull();
  } finally {
    await removeProducts(admin, [first!, second!, other!]);
    await Promise.all([member.remove(), neighbour.remove()]);
  }
});

test('unavailable products appear only as a stable reference and followed_at, without unpublished details', async () => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const [byProduct, byProvider, live] = await createProducts(admin, 'export-unavailable', 3);
  const member = await createLocalMember('Unavailable Export Member');
  try {
    for (const target of [byProduct!, byProvider!, live!]) expect((await member.client.rpc('follow_product', { target_product_id: target.productId })).error).toBeNull();
    expect((await admin.from('provider_publication_status').update({ status: 'draft' }).eq('provider_product_id', byProduct!.productId)).error).toBeNull();
    expect((await admin.from('provider_publication_status').update({ status: 'draft' }).eq('provider_id', byProvider!.providerId)).error).toBeNull();

    const exported = await exportOf(member);
    expect(exported.product_follows).toHaveLength(3);
    for (const hidden of [byProduct!, byProvider!]) {
      const row = exported.product_follows.find((entry) => entry.product_id === hidden.productId)!;
      expect(row).toEqual({ product_id: hidden.productId, followed_at: expect.any(String), available: false, product_slug: null, product_name: null, provider_name: null });
    }
    const json = JSON.stringify(exported);
    for (const secret of [byProduct!.name, byProduct!.providerName, byProduct!.slug, byProvider!.name, byProvider!.providerName, byProvider!.slug]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(exported.product_follows.find((entry) => entry.product_id === live!.productId)).toMatchObject({ available: true, product_name: live!.name });
  } finally {
    await removeProducts(admin, [byProduct!, byProvider!, live!]);
    await member.remove();
  }
});

test('the owner download endpoint returns the extended export only to the signed-in owner', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const [product] = await createProducts(admin, 'export-download');
  const member = await createLocalMember('Download Member');
  const context = await browser.newContext();
  const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
  try {
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: ORIGIN })));
    const download = await context.request.get(`${ORIGIN}/api/privacy`);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain('commonwork-member-export.json');
    expect(download.headers()['cache-control']).toBe('no-store');
    const body = await download.json();
    expect(body).toMatchObject({ authentication_email: member.email });
    expect(body.product_follows).toEqual([expect.objectContaining({ product_id: product!.productId, available: true, product_name: product!.name })]);

    const signedOut = await anonymous.get('/api/privacy', { maxRedirects: 0 });
    expect(signedOut.status()).toBe(303);
    expect(signedOut.headers().location).toContain('/sign-in');
    expect(await signedOut.text()).not.toContain(product!.name);
  } finally {
    await Promise.all([context.close(), anonymous.dispose()]);
    await removeProducts(admin, [product!]);
    await member.remove();
  }
});
