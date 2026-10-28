import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type Browser, type BrowserContext } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { createProducts, followRows, removeProducts, type Admin, type ProductFixture } from './helpers/product-fixtures';

const ORIGIN = 'http://127.0.0.1:4322';

async function withProfile(admin: Admin, member: LocalMember) {
  const { error } = await admin.from('profiles').insert({ id: member.id, display_name: `Profile ${member.id.slice(0, 6)}` });
  expect(error).toBeNull();
  return member;
}

async function setWorkspaceMembership(admin: Admin, userId: string, active: boolean) {
  const { error } = await admin.from('workspace_memberships')
    .update(active ? { status: 'active', revoked_at: null } : { status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('user_id', userId);
  expect(error).toBeNull();
}

const grant = (admin: Admin, product: ProductFixture, member: LocalMember, operator: LocalMember, action = 'grant') =>
  admin.rpc('manage_product_representative', { target_product_id: product.productId, target_profile_id: member.id, target_action: action, actor_profile_id: operator.id });

const count = (member: LocalMember, product: ProductFixture) => member.client.rpc('get_product_follower_count', { target_product_id: product.productId });

async function declareAffiliation(admin: Admin, product: ProductFixture, member: LocalMember, operator: LocalMember, status: 'self_declared' | 'approved') {
  const suffix = randomUUID();
  const organisation = await admin.from('organisations').insert({
    slug: `interest-organisation-${suffix}`, name: `Interest Organisation ${suffix.slice(0, 6)}`, organisation_type: 'vendor', provider_id: product.providerId,
  }).select('id').single();
  expect(organisation.error).toBeNull();
  expect((await admin.from('profile_organisations').insert({
    profile_id: member.id, organisation_id: organisation.data!.id, role_title: 'Affiliate role', is_primary: true,
  })).error).toBeNull();
  const now = new Date().toISOString();
  expect((await admin.from('profile_product_affiliations').insert({
    profile_id: member.id, provider_product_id: product.productId, role_title: 'Affiliate', consent_given: true, consented_at: now,
    verification_status: status, ...(status === 'approved' ? { verified_at: now, verified_by: operator.id } : {}),
  })).error).toBeNull();
  return organisation.data!.id as string;
}

async function memberContext(browser: Browser, member: LocalMember): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: ORIGIN })));
  return context;
}

test('only an active, assigned representative reads the aggregate, and only for that product', async () => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const everyone: LocalMember[] = [];
  const organisations: string[] = [];
  const [productA, productB] = await createProducts(admin, 'aggregate', 2);
  try {
    const make = async (name: string, options?: { workspaceAccess?: boolean }) => { const member = await createLocalMember(name, options); everyone.push(member); return withProfile(admin, member); };
    const operator = await make('Operator');
    await operator.provisionAdministrator();
    const [rep, f1, f2, f3, outsider, selfDeclared, approved] = await Promise.all(['Rep', 'F1', 'F2', 'F3', 'Outsider', 'Self Declared', 'Approved'].map((name) => make(name)));
    const attendee = await make('No Workspace', { workspaceAccess: false });

    for (const follower of [f1, f2, f3]) expect((await follower.client.rpc('follow_product', { target_product_id: productA!.productId })).error).toBeNull();
    expect((await f1.client.rpc('follow_product', { target_product_id: productB!.productId })).error).toBeNull();

    // Before any assignment: denied, never a zero.
    const before = await count(rep, productA!);
    expect(before.error?.code).toBe('42501');
    expect(before.data).toBeNull();
    expect((await rep.client.rpc('is_product_representative', { target_product_id: productA!.productId })).data).toBe(false);

    const granted = await grant(admin, productA!, rep, operator);
    expect(granted.error).toBeNull();
    expect(granted.data?.[0]).toMatchObject({ assigned_product_id: productA!.productId, assigned_profile_id: rep.id, assignment_status: 'active', assigned_by: operator.id });
    expect((await count(rep, productA!)).data).toBe(3);
    expect((await rep.client.rpc('is_product_representative', { target_product_id: productA!.productId })).data).toBe(true);

    // Wrong product: denied even though that product has a follower.
    const wrong = await count(rep, productB!);
    expect(wrong.error?.code).toBe('42501');
    expect(wrong.data).toBeNull();
    expect((await rep.client.rpc('is_product_representative', { target_product_id: productB!.productId })).data).toBe(false);

    // Ordinary, self-declared and approved affiliates, an operator and an event-only account are all denied.
    organisations.push(await declareAffiliation(admin, productA!, selfDeclared, operator, 'self_declared'));
    organisations.push(await declareAffiliation(admin, productA!, approved, operator, 'approved'));
    for (const denied of [outsider, selfDeclared, approved, operator]) {
      const result = await count(denied, productA!);
      expect(result.error?.code, denied.id).toBe('42501');
      expect(result.data).toBeNull();
    }
    expect((await count(attendee, productA!)).error?.code).toBe('42501');
    expect((await createLocalAnonymousClient().rpc('get_product_follower_count', { target_product_id: productA!.productId })).error).toBeTruthy();

    // Counts are current active follows only, never history.
    expect((await f1.client.rpc('unfollow_product', { target_product_id: productA!.productId })).error).toBeNull();
    expect((await count(rep, productA!)).data).toBe(2);
    expect((await f1.client.rpc('follow_product', { target_product_id: productA!.productId })).error).toBeNull();
    expect((await f2.client.rpc('follow_product', { target_product_id: productA!.productId })).error).toBeNull();
    expect((await count(rep, productA!)).data).toBe(3);

    // A follower whose workspace membership ends leaves the aggregate and returns when restored.
    await setWorkspaceMembership(admin, f2.id, false);
    expect((await count(rep, productA!)).data).toBe(2);
    expect(await followRows(admin, f2.id, productA!.productId)).toHaveLength(1);
    await setWorkspaceMembership(admin, f2.id, true);
    expect((await count(rep, productA!)).data).toBe(3);

    // The representative's own membership is required: deactivation denies, restoration allows.
    await setWorkspaceMembership(admin, rep.id, false);
    expect((await count(rep, productA!)).error?.code).toBe('42501');
    expect((await rep.client.rpc('is_product_representative', { target_product_id: productA!.productId })).error?.code).toBe('42501');
    await setWorkspaceMembership(admin, rep.id, true);
    expect((await count(rep, productA!)).data).toBe(3);

    // Revocation removes access immediately, keeps history, and re-granting makes a new current assignment.
    const revoked = await grant(admin, productA!, rep, operator, 'revoke');
    expect(revoked.error).toBeNull();
    expect(revoked.data?.[0]).toMatchObject({ assignment_status: 'revoked', ended_by: operator.id });
    expect(revoked.data?.[0]?.ended_at).toBeTruthy();
    const afterRevoke = await count(rep, productA!);
    expect(afterRevoke.error?.code).toBe('42501');
    expect(afterRevoke.data).toBeNull();
    expect((await grant(admin, productA!, rep, operator, 'revoke')).error?.code).toBe('22023');
    expect((await grant(admin, productA!, rep, operator)).error).toBeNull();
    expect((await grant(admin, productA!, rep, operator)).error).toBeNull();
    const history = await admin.from('product_representatives').select('status').eq('profile_id', rep.id).eq('provider_product_id', productA!.productId);
    expect((history.data ?? []).map((row) => row.status).sort()).toEqual(['active', 'revoked']);
    expect((await admin.from('product_representatives').insert({ provider_product_id: productA!.productId, profile_id: rep.id, granted_by: operator.id })).error?.code).toBe('23505');
    expect((await count(rep, productA!)).data).toBe(3);
    const audit = await admin.from('product_representative_admin_audit').select('action').eq('target_profile_id', rep.id).order('created_at');
    expect((audit.data ?? []).map((row) => row.action)).toEqual(['granted', 'revoked', 'granted']);

    // Operator rules: administrators, active members and no self-assignment.
    expect((await grant(admin, productA!, operator, operator)).error?.code).toBe('42501');
    expect((await grant(admin, productA!, outsider, rep)).error?.code).toBe('42501');
    expect((await grant(admin, productA!, attendee, operator)).error?.code).toBe('22023');
    expect((await admin.rpc('manage_product_representative', { target_product_id: randomUUID(), target_profile_id: outsider.id, target_action: 'grant', actor_profile_id: operator.id })).error?.code).toBe('22023');
    expect((await grant(admin, productA!, outsider, operator, 'promote')).error?.code).toBe('22023');
    expect((await count(outsider, productA!)).error?.code).toBe('42501');
    expect((await admin.rpc('list_product_representatives', { actor_profile_id: rep.id })).error?.code).toBe('42501');
    const listed = await admin.rpc('list_product_representatives', { actor_profile_id: operator.id, target_product_id: productA!.productId });
    expect(listed.error).toBeNull();
    expect((listed.data ?? []).filter((row: { assignment_status: string }) => row.assignment_status === 'active')).toHaveLength(1);
  } finally {
    if (organisations.length) await admin.from('organisations').delete().in('id', organisations);
    await removeProducts(admin, [productA!, productB!]);
    await Promise.all(everyone.map((member) => member.remove()));
  }
});

test('representatives cannot read follower rows, assignments, manage access or assign themselves', async () => {
  const admin = createLocalAdminClient();
  const [product] = await createProducts(admin, 'denial');
  const operator = await withProfile(admin, await createLocalMember('Operator'));
  const rep = await withProfile(admin, await createLocalMember('Rep'));
  const follower = await withProfile(admin, await createLocalMember('Follower'));
  try {
    await operator.provisionAdministrator();
    expect((await follower.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    expect((await grant(admin, product!, rep, operator)).error).toBeNull();
    expect((await count(rep, product!)).data).toBe(1);

    for (const client of [rep.client, operator.client]) {
      expect((await client.from('product_follows').select('member_id, followed_at')).error).toBeTruthy();
      expect((await client.from('product_follows').select('*').eq('provider_product_id', product!.productId)).error).toBeTruthy();
      expect((await client.from('product_follows').insert({ member_id: rep.id, provider_product_id: product!.productId })).error).toBeTruthy();
      expect((await client.from('product_follows').delete().eq('member_id', follower.id)).error).toBeTruthy();
      expect((await client.from('product_representatives').select('*')).error).toBeTruthy();
      expect((await client.from('product_representatives').insert({ provider_product_id: product!.productId, profile_id: client === rep.client ? rep.id : operator.id, granted_by: operator.id })).error).toBeTruthy();
      expect((await client.from('product_representatives').update({ status: 'revoked' }).eq('profile_id', rep.id)).error).toBeTruthy();
      expect((await client.from('product_representative_admin_audit').select('*')).error).toBeTruthy();
      for (const [name, args] of [
        ['manage_product_representative', { target_product_id: product!.productId, target_profile_id: client === rep.client ? rep.id : operator.id, target_action: 'grant', actor_profile_id: operator.id }],
        ['list_product_representatives', { actor_profile_id: operator.id }],
        ['is_active_product_representative', { target_product_id: product!.productId }],
      ] as const) {
        expect((await client.rpc(name, args)).error, name).toBeTruthy();
      }
    }
    expect(await followRows(admin, follower.id, product!.productId)).toHaveLength(1);
    const rows = await admin.from('product_representatives').select('profile_id, status').eq('provider_product_id', product!.productId);
    expect(rows.data).toEqual([{ profile_id: rep.id, status: 'active' }]);
  } finally {
    await removeProducts(admin, [product!]);
    await Promise.all([operator.remove(), rep.remove(), follower.remove()]);
  }
});

test('the trusted operator CLI grants, lists and revokes; members and self-assignment are refused', async () => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const [product] = await createProducts(admin, 'cli');
  const operator = await withProfile(admin, await createLocalMember('CLI Operator'));
  const rep = await withProfile(admin, await createLocalMember('CLI Rep'));
  const follower = await withProfile(admin, await createLocalMember('CLI Follower'));
  try {
    await operator.provisionAdministrator();
    expect((await follower.client.rpc('follow_product', { target_product_id: product!.productId })).error).toBeNull();
    expect((await count(rep, product!)).error?.code).toBe('42501');

    expect(() => rep.runRepresentativeAdminCli(['grant', rep.email, product!.slug, '--yes'])).toThrow();
    expect(() => operator.runRepresentativeAdminCli(['grant', operator.email, product!.slug, '--yes'])).toThrow();
    expect(() => operator.runRepresentativeAdminCli(['grant', rep.email, 'Not A Slug', '--yes'])).toThrow();
    expect(() => operator.runRepresentativeAdminCli(['grant', rep.email, `missing-${randomUUID()}`, '--yes'])).toThrow();
    expect((await count(rep, product!)).error?.code).toBe('42501');

    expect(operator.runRepresentativeAdminCli(['grant', rep.email, product!.slug, '--yes'])).toContain('Granted follower-count access');
    expect((await count(rep, product!)).data).toBe(1);
    const listing = operator.runRepresentativeAdminCli(['list', product!.slug, '--yes']);
    expect(listing).toContain(rep.id);
    expect(listing).toContain('active');
    expect(listing).not.toContain(follower.id);
    expect(operator.runRepresentativeAdminCli(['revoke', rep.email, product!.slug, '--yes'])).toContain('Revoked follower-count access');
    expect((await count(rep, product!)).error?.code).toBe('42501');
  } finally {
    await removeProducts(admin, [product!]);
    await Promise.all([operator.remove(), rep.remove(), follower.remove()]);
  }
});

test('the representative section is private to authorised representatives and shows no identities', async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const [productA, productB] = await createProducts(admin, 'view', 2);
  const operator = await withProfile(admin, await createLocalMember('View Operator'));
  const rep = await withProfile(admin, await createLocalMember('View Rep'));
  const ordinary = await withProfile(admin, await createLocalMember('View Ordinary'));
  const followers = await Promise.all(['Secret Follower One', 'Secret Follower Two'].map(async (name) => withProfile(admin, await createLocalMember(name))));
  const repContext = await memberContext(browser, rep);
  const ordinaryContext = await memberContext(browser, ordinary);
  const anonymous = await playwrightRequest.newContext({ baseURL: ORIGIN });
  const path = (product: ProductFixture) => `/intelligence/product/${product.slug}?workspace=1`;
  try {
    await operator.provisionAdministrator();
    for (const follower of followers) expect((await follower.client.rpc('follow_product', { target_product_id: productA!.productId })).error).toBeNull();
    expect((await followers[0]!.client.rpc('follow_product', { target_product_id: productB!.productId })).error).toBeNull();
    expect((await grant(admin, productA!, rep, operator)).error).toBeNull();

    const repPage = await repContext.newPage();
    const response = await repPage.goto(path(productA!));
    expect(response?.headers()['cache-control']).toContain('no-store');
    const section = repPage.getByRole('region', { name: 'Product followers' });
    await expect(section).toBeVisible();
    await expect(section.getByText('Product representative view')).toBeVisible();
    await expect(section.locator('#product-follower-count')).toHaveText('2');
    await expect(section.getByText('Visible only to representatives authorised for this product')).toBeVisible();
    await expect(section.getByText(/interest within Commonwork\. It is not product use, endorsement or overall market popularity/)).toBeVisible();
    const html = await repPage.content();
    for (const follower of followers) {
      for (const secret of [follower.id, follower.email, 'Secret Follower']) expect(html, secret).not.toContain(secret);
    }

    await repPage.goto(path(productB!));
    await expect(repPage.getByRole('heading', { name: productB!.name })).toBeVisible();
    await expect(repPage.getByText('Product followers')).toHaveCount(0);

    const ordinaryPage = await ordinaryContext.newPage();
    await ordinaryPage.goto(path(productA!));
    await expect(ordinaryPage.getByRole('heading', { name: productA!.name })).toBeVisible();
    await expect(ordinaryPage.getByText('Product followers')).toHaveCount(0);
    await expect(ordinaryPage.locator('#product-follower-count')).toHaveCount(0);

    const publicHtml = await (await anonymous.get(`/catalogue?product=${productA!.slug}`)).text();
    expect(publicHtml).toContain(productA!.name);
    for (const forbidden of ['Product followers', 'product-follower-count', 'Product representative view']) expect(publicHtml, forbidden).not.toContain(forbidden);

    expect((await grant(admin, productA!, rep, operator, 'revoke')).error).toBeNull();
    await repPage.goto(path(productA!));
    await expect(repPage.getByRole('heading', { name: productA!.name })).toBeVisible();
    await expect(repPage.getByText('Product followers')).toHaveCount(0);
  } finally {
    await Promise.all([repContext.close(), ordinaryContext.close(), anonymous.dispose()]);
    await removeProducts(admin, [productA!, productB!]);
    await Promise.all([operator.remove(), rep.remove(), ordinary.remove(), ...followers.map((follower) => follower.remove())]);
  }
});
