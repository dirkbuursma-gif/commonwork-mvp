import { randomUUID } from 'node:crypto';
import { expect, request as playwrightRequest, test, type Browser } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { createProducts, removeProducts, type ProductFixture } from './helpers/product-fixtures';

const ORIGIN = 'http://127.0.0.1:4322';

async function withProfile(admin: ReturnType<typeof createLocalAdminClient>, member: LocalMember, displayName = member.email.split('@')[0]) {
  const { error } = await admin.from('profiles').insert({ id: member.id, display_name: displayName });
  expect(error).toBeNull();
  return member;
}

async function createPilotCompany(admin: ReturnType<typeof createLocalAdminClient>, type: 'advisor' | 'research' = 'advisor') {
  const suffix = randomUUID();
  const provider = await admin.from('providers').insert({
    slug: `pilot-company-${suffix}`, name: `Synthetic Founding Company ${suffix.slice(0, 6)}`,
    provider_type: 'organisation', source_system: 'local-company-publishing-test', source_record_id: suffix,
  }).select('id, slug, name').single();
  expect(provider.error).toBeNull();
  const organisation = await admin.from('organisations').insert({
    slug: `pilot-organisation-${suffix}`, name: provider.data!.name, organisation_type: type,
    provider_id: provider.data!.id,
  }).select('id').single();
  expect(organisation.error).toBeNull();
  const { error: statusError } = await admin.from('provider_publication_status').insert({
    provider_id: provider.data!.id, status: 'published', published_at: new Date().toISOString(),
  });
  expect(statusError).toBeNull();
  return { providerId: provider.data!.id as string, providerSlug: provider.data!.slug as string, providerName: provider.data!.name as string, organisationId: organisation.data!.id as string };
}

async function verifyCompanyAffiliation(admin: ReturnType<typeof createLocalAdminClient>, company: Awaited<ReturnType<typeof createPilotCompany>>, writer: LocalMember, operator: LocalMember) {
  const { error } = await admin.from('profile_organisations').insert({
    profile_id: writer.id, organisation_id: company.organisationId, role_title: 'Synthetic pilot writer', is_primary: true,
    verification_status: 'approved', verified_at: new Date().toISOString(), verified_by: operator.id,
  });
  expect(error).toBeNull();
}

async function memberContext(browser: Browser, member: LocalMember) {
  const context = await browser.newContext();
  await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: ORIGIN })));
  return context;
}

test('company publishing requires all gates and sends one private in-app notice on first publication only', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = createLocalAdminClient();
  const members: LocalMember[] = [];
  let company: Awaited<ReturnType<typeof createPilotCompany>> | null = null;
  let product: ProductFixture | null = null;
  let wrongOwnerProduct: ProductFixture | null = null;
  let operatorContext: Awaited<ReturnType<typeof memberContext>> | null = null;
  let writerContext: Awaited<ReturnType<typeof memberContext>> | null = null;
  const make = async (name: string, options?: { workspaceAccess?: boolean }) => {
    const member = await withProfile(admin, await createLocalMember(`Synthetic ${name}`, options), `Synthetic ${name}`);
    members.push(member);
    return member;
  };
  const operator = await make('Publishing Operator');
  await operator.provisionAdministrator();
  const writer = await make('Writer');
  const companyFollower = await make('Company Follower');
  const productFollower = await make('Product Follower');
  const bothFollower = await make('Company And Product Follower');
  const outsider = await make('Outsider');
  const unverified = await make('Unverified');
  const legacyCurated = await make('Legacy Curated');
  const noMembership = await make('No Membership', { workspaceAccess: false });
  try {
    const pilotCompany = await createPilotCompany(admin, 'advisor');
    company = pilotCompany;
    const [createdProduct, wrongProduct] = await createProducts(admin, 'company-publishing', 2);
    product = createdProduct!;
    wrongOwnerProduct = wrongProduct!;
    const { error: productOwnerError } = await admin.from('provider_products').update({ provider_id: company.providerId }).eq('id', product.productId);
    expect(productOwnerError).toBeNull();
    await verifyCompanyAffiliation(admin, company, writer, operator);
    expect((await admin.from('profile_organisations').insert({
      profile_id: unverified.id, organisation_id: company.organisationId, role_title: 'Unverified synthetic claim', is_primary: true,
    })).error).toBeNull();
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: null, target_profile_id: unverified.id,
      target_action: 'grant', actor_profile_id: operator.id,
    })).error?.code).toBe('42501');
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: null, target_profile_id: noMembership.id,
      target_action: 'grant', actor_profile_id: operator.id,
    })).error?.code).toBe('22023');
    expect((await admin.from('profile_organisations').insert({
      profile_id: legacyCurated.id, organisation_id: company.organisationId, role_title: 'Pre-migration curated fixture',
      is_primary: true, verification_status: 'legacy_curated', verified_at: null, verified_by: null,
    })).error).toBeNull();
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: null, target_profile_id: legacyCurated.id,
      target_action: 'grant', actor_profile_id: operator.id,
    })).error?.code).toBe('42501');
    expect((await admin.from('profile_organisations').update({
      verification_status: 'approved', verified_at: new Date().toISOString(), verified_by: operator.id,
    }).eq('profile_id', legacyCurated.id).eq('organisation_id', company.organisationId)).error).toBeNull();
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: null, target_profile_id: legacyCurated.id,
      target_action: 'grant', actor_profile_id: operator.id,
    })).error).toBeNull();
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: null, target_profile_id: legacyCurated.id,
      target_action: 'revoke', actor_profile_id: operator.id,
    })).error).toBeNull();
    const wrongCompanyProductSave = await writer.client.rpc('save_company_content', {
      target_article_id: null, target_slug: `wrong-company-product-${randomUUID()}`, target_title: 'Wrong scope',
      target_deck: '', target_summary: '', target_body: '', target_desk: 'Ecosystem', target_format: 'Brief',
      target_content_type: 'company_update', target_provider_id: company.providerId, target_product_id: wrongOwnerProduct.productId,
    });
    expect(wrongCompanyProductSave.error?.code).toBe('42501');
    expect((await admin.rpc('manage_company_publisher_assignment', {
      target_provider_id: company.providerId, target_product_id: wrongOwnerProduct.productId, target_profile_id: writer.id,
      target_action: 'grant', actor_profile_id: operator.id,
    })).error?.code).toBe('22023');
    const paidAttempt = await admin.rpc('manage_company_publishing_entitlement', {
      target_provider_id: company.providerId, target_action: 'grant', target_entitlement_type: 'paid', actor_profile_id: operator.id,
    });
    expect(paidAttempt.error?.code).toBe('42501');
    expect((await writer.client.rpc('list_my_company_publishing_scopes')).data).toEqual([]);

    expect(() => writer.runCompanyPublishingAdminCli(['entitlement-grant', pilotCompany.providerSlug, '--yes'])).toThrow();
    expect(operator.runCompanyPublishingAdminCli(['entitlement-grant', company.providerSlug, '--yes'])).toContain('Granted complimentary founding-pilot publishing');
    expect(operator.runCompanyPublishingAdminCli(['writer-grant', writer.id, company.providerSlug, '--yes'])).toContain('Granted company publishing');
    const initialEntitlement = await admin.from('company_publishing_entitlements').select('granted_at, review_due_at').eq('provider_id', company.providerId).single();
    expect(initialEntitlement.error).toBeNull();
    expect(new Date(initialEntitlement.data!.review_due_at!).getTime() - new Date(initialEntitlement.data!.granted_at).getTime()).toBe(90 * 24 * 60 * 60 * 1000);
    expect((await admin.from('company_publishing_entitlements').update({ review_due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }).eq('provider_id', company.providerId).eq('status', 'active')).error).toBeNull();
    expect((await writer.client.rpc('list_my_company_publishing_scopes')).data).toHaveLength(2);
    const scopes = await writer.client.rpc('list_my_company_publishing_scopes');
    expect(scopes.error).toBeNull();
    expect(scopes.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider_id: company.providerId, provider_product_id: null }),
      expect.objectContaining({ provider_id: company.providerId, provider_product_id: product.productId }),
    ]));
    expect((await writer.client.rpc('is_product_representative', { target_product_id: product.productId })).data).toBe(false);
    expect((await writer.client.rpc('get_product_follower_count', { target_product_id: product.productId })).error?.code).toBe('42501');

    for (const [member, followProvider, followProduct] of [
      [companyFollower, true, false], [productFollower, false, true], [bothFollower, true, true],
    ] as const) {
      if (followProvider) expect((await member.client.rpc('follow_provider', { target_provider_id: company.providerId })).error).toBeNull();
      if (followProduct) expect((await member.client.rpc('follow_product', { target_product_id: product.productId })).error).toBeNull();
    }

    const articleSlug = `synthetic-company-update-${randomUUID()}`;
    const saved = await writer.client.rpc('save_company_content', {
      target_article_id: null, target_slug: articleSlug, target_title: 'Synthetic company update',
      target_deck: 'A clearly labelled local test draft.', target_summary: 'Local test only.', target_body: 'Synthetic content.',
      target_desk: 'Ecosystem', target_format: 'Brief', target_content_type: 'company_update',
      target_provider_id: company.providerId, target_product_id: product.productId,
    });
    expect(saved.error).toBeNull();
    const articleId = saved.data as string;
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).data).toBe('review_required');
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toEqual([]);
    expect((await outsider.client.from('insight_articles').select('id').eq('id', articleId)).data).toEqual([]);
    expect((await outsider.client.rpc('save_company_content', {
      target_article_id: null, target_slug: `outside-${randomUUID()}`, target_title: 'Denied', target_deck: '', target_summary: '',
      target_body: '', target_desk: 'Ecosystem', target_format: 'Brief', target_content_type: 'company_update',
      target_provider_id: company.providerId, target_product_id: product.productId,
    })).error?.code).toBe('42501');

    const pending = await operator.client.rpc('list_pending_company_first_publications');
    expect(pending.error).toBeNull();
    expect(pending.data).toEqual(expect.arrayContaining([expect.objectContaining({ article_id: articleId, provider_name: company.providerName })]));
    expect((await writer.client.rpc('review_company_first_publication', { target_article_id: articleId, target_action: 'approve' })).error?.code).toBe('42501');
    operatorContext = await memberContext(browser, operator);
    const reviewPage = await operatorContext.newPage();
    await reviewPage.goto('/insights/editor');
    await expect(reviewPage.getByRole('heading', { name: 'First company publications awaiting review' })).toBeVisible();
    await expect(reviewPage.getByText('Synthetic company update')).toBeVisible();
    await reviewPage.getByRole('button', { name: 'Approve and publish' }).click();
    await expect(reviewPage).toHaveURL(/status=review-approved/);

    const published = await admin.from('insight_articles').select('status, author_profile_id, provider_id, provider_product_id, public_author_name, published_by, first_published_at').eq('id', articleId).single();
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ status: 'published', author_profile_id: writer.id, provider_id: company.providerId, provider_product_id: product.productId, public_author_name: expect.any(String), published_by: operator.id });
    expect(published.data?.first_published_at).toBeTruthy();
    expect((await outsider.client.from('insight_articles').select('author_profile_id').eq('id', articleId)).error).toBeTruthy();
    expect((await outsider.client.from('insight_articles').select('published_by, updated_by').eq('id', articleId)).error).toBeTruthy();
    const publicArticle = await createLocalAnonymousClient().from('insight_articles').select('slug, public_author_name').eq('id', articleId).single();
    expect(publicArticle.error).toBeNull();
    expect(publicArticle.data).toMatchObject({ public_author_name: 'Synthetic Writer' });
    const anonymousBrowser = await playwrightRequest.newContext({ baseURL: ORIGIN });
    try {
      const indexResponse = await anonymousBrowser.get('/insights');
      expect(indexResponse.status()).toBe(200);
      const indexHtml = await indexResponse.text();
      expect(indexHtml).toContain('Synthetic company update');
      expect(indexHtml).toContain(`By Synthetic Writer for ${company.providerName}`);
      const articleResponse = await anonymousBrowser.get(`/insights/${articleSlug}`);
      expect(articleResponse.status()).toBe(200);
      const articleHtml = await articleResponse.text();
      expect(articleHtml).toContain(`By Synthetic Writer for ${company.providerName}`);
      expect(articleHtml).not.toContain(writer.id);
      expect(articleHtml).not.toContain(operator.id);
    } finally {
      await anonymousBrowser.dispose();
    }

    const notices = await admin.from('notifications').select('id, profile_id, insight_article_id, type').eq('insight_article_id', articleId);
    expect(notices.error).toBeNull();
    expect(notices.data).toHaveLength(3);
    expect(new Set((notices.data ?? []).map((notice) => notice.profile_id))).toEqual(new Set([companyFollower.id, productFollower.id, bothFollower.id]));
    expect((notices.data ?? []).every((notice) => notice.type === 'company_publication_published')).toBe(true);
    const emailDeliveries = await admin.from('email_deliveries').select('id').in('notification_id', (notices.data ?? []).map((notice) => notice.id));
    expect(emailDeliveries.error).toBeNull();
    expect(emailDeliveries.data).toEqual([]);
    expect((await writer.client.from('provider_follows').select('member_id')).error).toBeTruthy();
    expect((await writer.client.from('product_follows').select('member_id')).error).toBeTruthy();

    const directEdit = await writer.client.from('insight_articles').update({ body: 'Direct edits withdraw to draft.' }).eq('id', articleId).select('status').single();
    expect(directEdit.error).toBeNull();
    expect(directEdit.data?.status).toBe('draft');
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toHaveLength(3);

    expect((await writer.client.rpc('save_company_content', {
      target_article_id: articleId, target_slug: `edited-${randomUUID()}`, target_title: 'Edited synthetic update', target_deck: '',
      target_summary: '', target_body: 'Edited.', target_desk: 'Ecosystem', target_format: 'Brief',
      target_content_type: 'company_update', target_provider_id: company.providerId, target_product_id: product.productId,
    })).error).toBeNull();
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).data).toBe('published');
    expect((await writer.client.rpc('withdraw_company_content', { target_article_id: articleId })).data).toBe(true);
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).data).toBe('published');
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toHaveLength(3);

    writerContext = await memberContext(browser, writer);
    const writerPage = await writerContext.newPage();
    await writerPage.goto('/company/publishing');
    await expect(writerPage.getByRole('heading', { name: 'New company publication' })).toBeVisible();
    await writerPage.locator('select[name="scope"]').selectOption({ label: `${company.providerName} · ${product.name}` });
    const uiSlug = `synthetic-ui-draft-${randomUUID()}`;
    await writerPage.locator('input[name="title"]').fill('Synthetic UI draft');
    await writerPage.locator('input[name="slug"]').fill(uiSlug);
    await writerPage.locator('textarea[name="summary"]').fill('A clearly labelled draft preview.');
    await writerPage.locator('textarea[name="body"]').fill('Synthetic local preview only.');
    await writerPage.getByRole('button', { name: 'Save draft' }).click();
    await expect(writerPage.getByRole('status')).toContainText('Draft saved.');
    await writerPage.goto(`/insights/${uiSlug}?preview=draft`);
    await expect(writerPage.getByRole('heading', { name: 'Synthetic UI draft' })).toBeVisible();
    await expect(writerPage.getByText(`By Synthetic Writer for ${company.providerName}`)).toBeVisible();

    const companyOnly = await writer.client.rpc('save_company_content', {
      target_article_id: null, target_slug: `synthetic-company-only-${randomUUID()}`, target_title: 'Synthetic company-only insight',
      target_deck: '', target_summary: 'Company-scoped only.', target_body: 'Synthetic company-only publication.',
      target_desk: 'Ecosystem', target_format: 'Brief', target_content_type: 'company_insight',
      target_provider_id: company.providerId, target_product_id: null,
    });
    expect(companyOnly.error).toBeNull();
    expect((await writer.client.rpc('publish_company_content', { target_article_id: companyOnly.data })).data).toBe('published');
    const companyOnlyNotices = await admin.from('notifications').select('id, profile_id').eq('insight_article_id', companyOnly.data);
    expect(companyOnlyNotices.data?.map((row) => row.profile_id).sort()).toEqual([companyFollower.id, bothFollower.id].sort());
    const companyOnlyEmail = await admin.from('email_deliveries').select('id').in('notification_id', (companyOnlyNotices.data ?? []).map((row) => row.id));
    expect(companyOnlyEmail.data).toEqual([]);

    expect(operator.runCompanyPublishingAdminCli(['writer-revoke', writer.id, company.providerSlug, '--yes'])).toContain('Revoked company publishing');
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).error?.code).toBe('42501');
    expect(operator.runCompanyPublishingAdminCli(['writer-grant', writer.id, company.providerSlug, '--yes'])).toContain('Granted company publishing');
    expect(operator.runCompanyPublishingAdminCli(['entitlement-expire', company.providerSlug, '--yes'])).toContain('Expired complimentary founding-pilot publishing');
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).error?.code).toBe('42501');
    expect(operator.runCompanyPublishingAdminCli(['entitlement-grant', company.providerSlug, '--yes'])).toContain('Granted complimentary founding-pilot publishing');
    expect(operator.runCompanyPublishingAdminCli(['entitlement-revoke', company.providerSlug, '--yes'])).toContain('Revoked complimentary founding-pilot publishing');
    const entitlementAudit = await admin.from('company_publishing_entitlement_audit').select('action').eq('provider_id', company.providerId).order('created_at');
    expect(entitlementAudit.data?.map((row) => row.action)).toEqual(['granted', 'expired', 'granted', 'revoked']);
    const assignmentAudit = await admin.from('company_publishing_assignment_audit').select('action').eq('target_profile_id', legacyCurated.id).order('created_at');
    expect(assignmentAudit.data?.map((row) => row.action)).toEqual(['granted', 'revoked']);

    expect((await writer.client.rpc('list_my_company_publishing_scopes')).data).toEqual([]);
    expect((await writer.client.rpc('publish_company_content', { target_article_id: articleId })).error?.code).toBe('42501');
    expect((await noMembership.client.rpc('list_my_company_publishing_scopes')).data).toEqual([]);
  } finally {
    await Promise.all([operatorContext?.close(), writerContext?.close()].filter(Boolean));
    if (company) {
      await admin.from('insight_articles').delete().eq('provider_id', company.providerId);
      await admin.from('providers').delete().eq('id', company.providerId);
      await admin.from('organisations').delete().eq('id', company.organisationId);
    }
    if (product) await removeProducts(admin, [product, ...(wrongOwnerProduct ? [wrongOwnerProduct] : [])]);
    await Promise.all(members.map((member) => member.remove()));
  }
});

test('company and product follows remain separate, private and share an accurate identity count', async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const member = await withProfile(admin, await createLocalMember('Synthetic Follow Member'));
  const [product] = await createProducts(admin, 'company-follow-ui', 1);
  const context = await memberContext(browser, member);
  let providerId: string | null = null;
  try {
    const provider = await admin.from('providers').insert({
      slug: `follow-company-${randomUUID()}`, name: 'Synthetic Follow Company',
      provider_type: 'organisation', source_system: 'local-company-follow-test', source_record_id: randomUUID(),
    }).select('id, slug').single();
    expect(provider.error).toBeNull();
    providerId = provider.data!.id as string;
    expect((await admin.from('provider_publication_status').insert({ provider_id: providerId, status: 'published', published_at: new Date().toISOString() })).error).toBeNull();

    const providerPage = await context.newPage();
    await providerPage.goto(`/intelligence/provider/${provider.data!.slug}`);
    const companyFollow = providerPage.getByRole('button', { name: 'Follow Synthetic Follow Company' });
    await expect(companyFollow).toBeVisible();
    await companyFollow.click();
    await expect(providerPage).toHaveURL(/company_follow=followed/);
    await providerPage.goto(`/intelligence/product/${product!.slug}`);
    await providerPage.getByRole('button', { name: `Follow ${product!.name}` }).click();
    await expect(providerPage.getByText('You are now following this product. Following is private interest only.')).toBeVisible();

    const followingPage = await context.newPage();
    await followingPage.goto('/following');
    await expect(followingPage.getByRole('heading', { name: 'Following companies and products' })).toBeVisible();
    await expect(followingPage.getByRole('heading', { name: '1 company followed' })).toBeVisible();
    await expect(followingPage.getByRole('heading', { name: '1 product followed' })).toBeVisible();
    await expect(followingPage.getByRole('heading', { name: 'Synthetic Follow Company' })).toBeVisible();
    await expect(followingPage.getByRole('heading', { name: product!.name })).toBeVisible();
    await expect(followingPage.getByRole('link', { name: 'Following companies, 1' }).first()).toBeVisible();
    await expect(followingPage.getByRole('link', { name: 'Following products, 1' }).first()).toBeVisible();
    expect((await admin.from('provider_follows').select('member_id').eq('member_id', member.id)).data).toHaveLength(1);
    expect((await admin.from('product_follows').select('provider_product_id').eq('member_id', member.id)).data).toHaveLength(1);
  } finally {
    await context.close();
    if (providerId) await admin.from('providers').delete().eq('id', providerId);
    if (product) await removeProducts(admin, [product]);
    await member.remove();
  }
});