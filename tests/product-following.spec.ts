import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type Browser, type BrowserContext } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { createProducts, followRows, removeProducts } from './helpers/product-fixtures';

const ORIGIN = 'http://127.0.0.1:4322';
async function memberContext(browser: Browser, member: LocalMember, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: ORIGIN })));
  return context;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('follow is idempotent, keeps followed_at, restarts after unfollow and survives races', async () => {
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Following Member');
  const [product] = await createProducts(admin, 'lifecycle');
  try {
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    const first = await followRows(admin, member.id, product!.productId);
    expect(first).toHaveLength(1);
    await pause(30);
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    const repeated = await followRows(admin, member.id, product!.productId);
    expect(repeated).toEqual(first);

    const concurrent = await Promise.all(Array.from({ length: 8 }, () => member.client.rpc('follow_product', { target_product_id: product!.productId })));
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    expect(await followRows(admin, member.id, product!.productId)).toEqual(first);

    expect((await member.client.rpc('unfollow_product', { target_product_id: product!.productId })).error).toBeNull();
    expect(await followRows(admin, member.id, product!.productId)).toEqual([]);
    expect((await member.client.rpc('unfollow_product', { target_product_id: product!.productId })).error).toBeNull();

    await pause(30);
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    const refollowed = await followRows(admin, member.id, product!.productId);
    expect(refollowed).toHaveLength(1);
    expect(new Date(refollowed[0]!.followed_at as string).getTime()).toBeGreaterThan(new Date(first[0]!.followed_at as string).getTime());

    const racing = await Promise.all(Array.from({ length: 12 }, (_, index) => member.client.rpc(index % 2 ? 'unfollow_product' : 'follow_product', { target_product_id: product!.productId })));
    expect(racing.every((result) => result.error === null)).toBe(true);
    const finalRows = await followRows(admin, member.id, product!.productId);
    expect(finalRows.length).toBeLessThanOrEqual(1);
    const count = await member.client.rpc('get_my_followed_product_count');
    expect(count.data).toBe(finalRows.length);
  } finally {
    await removeProducts(admin, [product!]);
    await member.remove();
  }
});

test('new follows need published products and providers; unpublished follows become generic entries', async () => {
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Availability Member');
  const [live] = await createProducts(admin, 'live');
  const [draftProduct] = await createProducts(admin, 'draft-product', 1, { product: 'draft' });
  const [draftProvider] = await createProducts(admin, 'draft-provider', 1, { provider: 'draft' });
  try {
    for (const target of [draftProduct!, draftProvider!]) {
      const rejected = await member.client.rpc('follow_product', { target_product_id: target.productId });
      expect(rejected.error?.code).toBe('22023');
      expect(`${rejected.error?.message}${rejected.error?.details}${rejected.error?.hint}`).not.toContain(target.name);
      expect(await followRows(admin, member.id, target.productId)).toEqual([]);
    }
    const unknown = await member.client.rpc('follow_product', { target_product_id: randomUUID() });
    expect(unknown.error?.code).toBe('22023');
    expect(unknown.error?.message).toBe((await member.client.rpc('follow_product', { target_product_id: draftProduct!.productId })).error?.message);
    expect((await member.client.rpc('get_product_follow_state', { target_slug: draftProduct!.slug })).data).toEqual([]);

    expect((await member.client.rpc('follow_product', { target_product_id: live!.productId })).error).toBeNull();
    const before = await member.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 0 });
    expect(before.data).toEqual([{ product_id: live!.productId, available: true, product_slug: live!.slug, product_name: live!.name, provider_name: live!.providerName }]);

    expect((await admin.from('provider_publication_status').update({ status: 'draft' }).eq('provider_product_id', live!.productId)).error).toBeNull();
    const hidden = await member.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 0 });
    expect(hidden.data).toEqual([{ product_id: live!.productId, available: false, product_slug: null, product_name: null, provider_name: null }]);
    expect(JSON.stringify(hidden.data)).not.toContain(live!.name);
    expect((await member.client.rpc('get_my_followed_product_count')).data).toBe(1);
    expect((await member.client.rpc('get_product_follow_state', { target_slug: live!.slug })).data).toEqual([]);
    expect((await member.client.rpc('follow_product', { target_product_id: live!.productId })).error?.code).toBe('22023');
    expect(await followRows(admin, member.id, live!.productId)).toHaveLength(1);

    expect((await admin.from('provider_publication_status').update({ status: 'published', published_at: new Date().toISOString() }).eq('provider_product_id', live!.productId)).error).toBeNull();
    expect((await admin.from('provider_publication_status').update({ status: 'draft' }).eq('provider_id', live!.providerId)).error).toBeNull();
    const providerHidden = await member.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 0 });
    expect(providerHidden.data).toEqual([{ product_id: live!.productId, available: false, product_slug: null, product_name: null, provider_name: null }]);

    expect((await member.client.rpc('unfollow_product', { target_product_id: live!.productId })).error).toBeNull();
    expect((await member.client.rpc('get_my_followed_product_count')).data).toBe(0);
  } finally {
    await removeProducts(admin, [live!, draftProduct!, draftProvider!]);
    await member.remove();
  }
});

test('members only reach their own follows and no follower aggregate exists', async () => {
  const admin = createLocalAdminClient();
  const owner = await createLocalMember('Follow Owner');
  const other = await createLocalMember('Other Member');
  const attendee = await createLocalMember('Event Only Attendee', { workspaceAccess: false });
  const [product] = await createProducts(admin, 'isolation');
  try {
    expect((await owner.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();

    expect((await other.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 0 })).data).toEqual([]);
    expect((await other.client.rpc('get_my_followed_product_count')).data).toBe(0);
    const otherState = await other.client.rpc('get_product_follow_state', { target_slug: product!.slug });
    expect(otherState.data).toEqual([{ product_id: product!.productId, following: false }]);
    expect((await other.client.rpc('unfollow_product', { target_product_id: product!.productId })).error).toBeNull();
    expect(await followRows(admin, owner.id, product!.productId)).toHaveLength(1);

    for (const client of [owner.client, other.client]) {
      expect((await client.from('product_follows').select('member_id')).error).toBeTruthy();
      expect((await client.from('product_follows').insert({ member_id: owner.id, provider_product_id: product!.productId })).error).toBeTruthy();
      expect((await client.from('product_follows').update({ followed_at: new Date().toISOString() }).eq('member_id', owner.id)).error).toBeTruthy();
      expect((await client.from('product_follows').delete().eq('member_id', owner.id)).error).toBeTruthy();
    }
    expect(await followRows(admin, owner.id, product!.productId)).toHaveLength(1);

    const anonymous = createLocalAnonymousClient();
    for (const [name, args] of [
      ['follow_product', { target_product_id: product!.productId }], ['unfollow_product', { target_product_id: product!.productId }],
      ['get_product_follow_state', { target_slug: product!.slug }], ['get_my_followed_product_count', {}],
      ['list_my_followed_products', { page_limit: 20, page_offset: 0 }],
    ] as const) {
      expect((await anonymous.rpc(name, args)).error, `${name} anonymous`).toBeTruthy();
      expect((await attendee.client.rpc(name, args)).error?.code, `${name} event-only`).toBe('42501');
    }
    expect(await followRows(admin, attendee.id)).toEqual([]);

    const aggregate = await owner.client.rpc('get_product_follower_count', { target_product_id: product!.productId });
    expect(aggregate.error).toBeTruthy();
    expect(aggregate.data).toBeNull();
  } finally {
    await removeProducts(admin, [product!]);
    await Promise.all([owner.remove(), other.remove(), attendee.remove()]);
  }
});

test('the follow endpoint enforces origin, method, session, membership and validation', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Endpoint Member');
  const attendee = await createLocalMember('Endpoint Attendee', { workspaceAccess: false });
  const [product] = await createProducts(admin, 'endpoint');
  const [unpublished] = await createProducts(admin, 'endpoint-draft', 1, { product: 'draft' });
  const context = await memberContext(browser, member);
  const attendeeContext = await memberContext(browser, attendee);
  const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
  const form = (overrides: Record<string, string> = {}) => ({ product_id: product!.productId, intent: 'follow', surface: 'catalogue', slug: product!.slug, ...overrides });
  try {
    const noOrigin = await context.request.post('/api/product-follows', { form: form(), maxRedirects: 0 });
    expect(noOrigin.status()).toBe(403);
    const foreign = await context.request.post('/api/product-follows', { form: form(), headers: { origin: 'https://evil.example' }, maxRedirects: 0 });
    expect(foreign.status()).toBe(403);
    expect(await followRows(admin, member.id)).toEqual([]);

    for (const url of ['/api/product-follows', `/api/product-follows?product_id=${product!.productId}&intent=follow&surface=catalogue&slug=${product!.slug}`]) {
      const read = await context.request.get(url, { maxRedirects: 0 });
      expect(read.status()).toBe(405);
      expect(read.headers().allow).toBe('POST');
    }
    expect(await followRows(admin, member.id)).toEqual([]);

    const invalidForms: Array<Record<string, string>> = [{ product_id: 'not-a-uuid' }, { intent: 'toggle' }, { surface: 'elsewhere' }, { slug: '//evil.example' }, { slug: 'Has Spaces' }, { from_event: '../x' }];
    for (const bad of invalidForms) {
      const response = await context.request.post('/api/product-follows', { form: form(bad), headers: { origin: ORIGIN }, maxRedirects: 0 });
      expect(response.status(), JSON.stringify(bad)).toBe(400);
    }

    const followed = await context.request.post('/api/product-follows', { form: form(), headers: { origin: ORIGIN }, maxRedirects: 0 });
    expect(followed.status()).toBe(303);
    expect(followed.headers().location).toBe(`/catalogue?product=${product!.slug}&follow=followed#follow-status`);
    expect(await followRows(admin, member.id, product!.productId)).toHaveLength(1);

    const stray = await context.request.post('/api/product-follows', {
      form: form({ surface: 'following', slug: '//evil.example', page: '3' }), headers: { origin: ORIGIN }, maxRedirects: 0,
    });
    expect(stray.status()).toBe(303);
    expect(stray.headers().location).toBe('/following?page=3&follow=followed#follow-status');

    const refused = await context.request.post('/api/product-follows', {
      form: form({ product_id: unpublished!.productId, slug: unpublished!.slug }), headers: { origin: ORIGIN }, maxRedirects: 0,
    });
    expect(refused.status()).toBe(303);
    expect(refused.headers().location).toContain('follow=unavailable');
    expect(await followRows(admin, member.id, unpublished!.productId)).toEqual([]);

    const unfollowed = await context.request.post('/api/product-follows', { form: form({ intent: 'unfollow', surface: 'product' }), headers: { origin: ORIGIN }, maxRedirects: 0 });
    expect(unfollowed.headers().location).toBe(`/intelligence/product/${product!.slug}?workspace=1&follow=unfollowed#follow-status`);
    expect(await followRows(admin, member.id, product!.productId)).toEqual([]);

    const signedOut = await anonymous.post('/api/product-follows', { form: form(), headers: { origin: ORIGIN }, maxRedirects: 0 });
    expect(signedOut.status()).toBe(303);
    expect(signedOut.headers().location).toContain('/sign-in');
    const eventOnly = await attendeeContext.request.post('/api/product-follows', { form: form(), headers: { origin: ORIGIN }, maxRedirects: 0 });
    expect(eventOnly.status()).toBe(403);
    expect(await followRows(admin, attendee.id)).toEqual([]);
  } finally {
    await Promise.all([context.close(), attendeeContext.close(), anonymous.dispose()]);
    await removeProducts(admin, [product!, unpublished!]);
    await Promise.all([member.remove(), attendee.remove()]);
  }
});

test('members follow, review and unfollow with keyboard-operable controls and an accurate private count', async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Journey Member');
  const [product] = await createProducts(admin, 'journey');
  const context = await memberContext(browser, member);
  const page = await context.newPage();
  const countLink = (value: number) => page.locator('.member-identity-card').getByRole('link', { name: `Following products, ${value}` });
  try {
    await page.goto('/today');
    await expect(countLink(0)).toBeVisible();
    await page.goto(`/catalogue?product=${product!.slug}`);
    await page.goto(`/intelligence/product/${product!.slug}?workspace=1`);
    await page.goto('/following');
    expect(await followRows(admin, member.id)).toEqual([]);
    await expect(page.getByRole('heading', { name: 'You are not following any products' })).toBeVisible();

    await page.goto(`/catalogue?product=${product!.slug}`);
    const follow = page.getByRole('button', { name: `Follow ${product!.name}` });
    await follow.focus();
    await expect(follow).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/follow=followed/);
    await expect(page.getByRole('status').filter({ hasText: 'You are now following this product' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Following ${product!.name}. Select to unfollow.` })).toBeVisible();
    await expect(page.getByText('Following is private interest only').first()).toBeVisible();

    await page.goto('/today');
    await expect(countLink(1)).toBeVisible();
    await page.goto('/following');
    const item = page.getByRole('listitem').filter({ hasText: product!.name });
    await expect(item.getByText(`By ${product!.providerName}`)).toBeVisible();
    await expect(item.getByRole('link', { name: `Product details for ${product!.name}` })).toHaveAttribute('href', `/intelligence/product/${product!.slug}?workspace=1`);
    await expect(page.locator('#following-total')).toHaveText('1');

    await item.getByRole('link', { name: `Product details for ${product!.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/intelligence/product/${product!.slug}`));
    await expect(page.getByRole('button', { name: `Following ${product!.name}. Select to unfollow.` })).toBeVisible();
    await page.getByRole('button', { name: `Following ${product!.name}. Select to unfollow.` }).click();
    await expect(page.getByRole('status').filter({ hasText: 'You no longer follow this product' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Follow ${product!.name}` })).toBeVisible();
    await page.getByRole('button', { name: `Follow ${product!.name}` }).click();
    await expect(page.getByRole('button', { name: `Following ${product!.name}. Select to unfollow.` })).toBeVisible();

    await page.goto('/following');
    const unfollow = page.getByRole('button', { name: `Unfollow ${product!.name}` });
    await unfollow.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/follow=unfollowed/);
    await expect(page.getByRole('heading', { name: 'You are not following any products' })).toBeVisible();
    await expect(countLink(0)).toBeVisible();
    expect(await followRows(admin, member.id)).toEqual([]);
  } finally {
    await context.close();
    await removeProducts(admin, [product!]);
    await member.remove();
  }
});

test('the private list paginates server-side, stays consistent and fits a phone', async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Pagination Member');
  const products = await createProducts(admin, 'page', 22);
  const base = Date.now();
  const context = await memberContext(browser, member, { width: 390, height: 844 });
  const page = await context.newPage();
  try {
    const inserted = await admin.from('product_follows').insert(products.map((product, index) => ({
      member_id: member.id, provider_product_id: product.productId, followed_at: new Date(base - index * 1000).toISOString(),
    })));
    expect(inserted.error).toBeNull();
    expect((await member.client.rpc('get_my_followed_product_count')).data).toBe(22);
    expect(((await member.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 0 })).data ?? [])).toHaveLength(20);
    expect(((await member.client.rpc('list_my_followed_products', { page_limit: 20, page_offset: 20 })).data ?? [])).toHaveLength(2);
    expect(((await member.client.rpc('list_my_followed_products', { page_limit: 1, page_offset: 0 })).data ?? [])).toHaveLength(1);
    expect(((await member.client.rpc('list_my_followed_products', { page_limit: 100000, page_offset: 0 })).data ?? []).length).toBeLessThanOrEqual(50);

    await page.goto('/following');
    await expect(page.locator('#following-total')).toHaveText('22');
    await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Unfollow / }) })).toHaveCount(20);
    await expect(page.getByText('Page 1 of 2').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: products[0]!.name })).toBeVisible();
    const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(overflow.content).toBeLessThanOrEqual(overflow.viewport);
    const box = await page.getByRole('button', { name: /^Unfollow / }).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: /^Unfollow / }) })).toHaveCount(2);
    await expect(page.locator('#following-total')).toHaveText('22');
    await page.goto('/following?page=99');
    await expect(page.getByText('Page 2 of 2').first()).toBeVisible();

    await page.getByRole('button', { name: /^Unfollow / }).first().click();
    await expect(page).toHaveURL(/follow=unfollowed/);
    await expect(page.locator('#following-total')).toHaveText('21');
    expect((await member.client.rpc('get_my_followed_product_count')).data).toBe(21);

    await page.locator('.shared-topbar .member-identity-compact summary').click();
    await expect(page.locator('.shared-topbar .member-identity-compact').getByRole('link', { name: 'Following products, 21' })).toBeVisible();
  } finally {
    await context.close();
    await removeProducts(admin, products);
    await member.remove();
  }
});

test('unavailable follows show a generic entry that can be removed without leaking details', async ({ browser }) => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Unavailable Member');
  const [product] = await createProducts(admin, 'vanishing');
  const context = await memberContext(browser, member);
  const page = await context.newPage();
  try {
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    expect((await admin.from('provider_publication_status').update({ status: 'draft' }).eq('provider_product_id', product!.productId)).error).toBeNull();
    await page.goto('/following');
    await expect(page.locator('#following-total')).toHaveText('1');
    await expect(page.getByRole('heading', { name: 'Product no longer available' })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(product!.name);
    expect(html).not.toContain(product!.providerName);
    expect(html).not.toContain(product!.slug);
    await expect(page.getByRole('link', { name: /Product details/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Unfollow unavailable product' }).click();
    await expect(page.getByRole('heading', { name: 'You are not following any products' })).toBeVisible();
    expect(await followRows(admin, member.id)).toEqual([]);
  } finally {
    await context.close();
    await removeProducts(admin, [product!]);
    await member.remove();
  }
});

test('public pages never expose follow controls, follower figures or product follow data', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Public Boundary Member');
  const [product] = await createProducts(admin, 'public');
  const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
  const context = await memberContext(browser, member);
  try {
    expect((await member.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();

    const publicPage = await anonymous.get(`/catalogue?product=${product!.slug}`);
    expect(publicPage.status()).toBe(200);
    const publicHtml = await publicPage.text();
    expect(publicHtml).toContain(product!.name);
    for (const forbidden of ['Follow product', 'Following', 'follower', 'Product followers', '/api/product-follows', 'product_follows']) {
      expect(publicHtml, forbidden).not.toContain(forbidden);
    }
    const catalogue = await createLocalAnonymousClient().rpc('read_public_catalogue');
    expect(JSON.stringify(catalogue.data).toLowerCase()).not.toContain('follow');

    const page = await context.newPage();
    await page.goto(`/intelligence/product/${product!.slug}?workspace=1`);
    await expect(page.getByRole('button', { name: /^Following / })).toBeVisible();
    const memberHtml = await page.content();
    expect(memberHtml).not.toContain('Product followers');
    expect(memberHtml.toLowerCase()).not.toContain('followers');
  } finally {
    await Promise.all([anonymous.dispose(), context.close()]);
    await removeProducts(admin, [product!]);
    await member.remove();
  }
});
