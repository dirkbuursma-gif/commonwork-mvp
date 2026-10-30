import { randomUUID } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { createProducts, removeProducts, type ProductFixture } from './helpers/product-fixtures';

const ORIGIN = 'http://127.0.0.1:4322';

async function withProfile(admin: ReturnType<typeof createLocalAdminClient>, member: LocalMember, displayName: string) {
  const { error } = await admin.from('profiles').insert({ id: member.id, display_name: displayName });
  expect(error).toBeNull();
  return member;
}

async function memberContext(browser: Browser, member: LocalMember) {
  const context = await browser.newContext();
  await context.addCookies(member.cookies.map(({ name, value }) => ({ name, value, url: ORIGIN })));
  return context;
}

test('operator onboards a company, publishes through review, converts terms and revokes writer access without data loss', async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = createLocalAdminClient();
  const suffix = randomUUID().slice(0, 10);
  const operator = await withProfile(admin, await createLocalMember('Synthetic Company Operator'), 'Synthetic Company Operator');
  await operator.provisionAdministrator();
  const author = await withProfile(admin, await createLocalMember('Synthetic Company Writer'), 'Synthetic Company Writer');
  const follower = await withProfile(admin, await createLocalMember('Synthetic Company Follower'), 'Synthetic Company Follower');
  const extraMember = await withProfile(admin, await createLocalMember('Synthetic Extra Member', { workspaceAccess: false }), 'Synthetic Extra Member');
  const overSeatMember = await withProfile(admin, await createLocalMember('Synthetic Over-seat Member'), 'Synthetic Over-seat Member');
  const operatorContext = await memberContext(browser, operator);
  const authorContext = await memberContext(browser, author);
  const companyPage = await operatorContext.newPage();
  const writerPage = await authorContext.newPage();
  let providerId: string | null = null;
  let organisationId: string | null = null;
  let articleId: string | null = null;
  let articleSlug = '';

  try {
    await companyPage.goto('/admin/companies');
    await expect(companyPage.getByRole('heading', { name: 'Company membership' })).toBeVisible();
    await companyPage.locator('input[name="provider_name"]').fill(`Synthetic Company ${suffix}`);
    await companyPage.locator('input[name="provider_slug"]').fill(`synthetic-company-${suffix}`);
    await companyPage.locator('select[name="provider_type"]').selectOption('organisation');
    await companyPage.locator('input[name="organisation_slug"]').fill(`synthetic-organisation-${suffix}`);
    await companyPage.locator('select[name="organisation_type"]').selectOption('advisor');
    await companyPage.locator('input[name="website_url"]').fill(`https://company-${suffix}.example.test`);
    await companyPage.locator('input[name="source_system"]').fill('local-operator-acceptance');
    await companyPage.locator('input[name="source_record_id"]').fill(suffix);
    await companyPage.locator('input[name="source_url"]').fill(`https://evidence.example.test/company/${suffix}`);
    await companyPage.locator('textarea[name="provider_summary"]').fill('Synthetic local company profile.');
    await companyPage.locator('textarea[name="organisation_summary"]').fill('Synthetic local organisation record.');
    const companySaveResponse = companyPage.waitForResponse((response) => response.url().endsWith('/api/admin/companies') && response.request().method() === 'POST');
    await companyPage.getByRole('button', { name: 'Save company draft' }).click();
    const savedCompanyResponse = await companySaveResponse;
    expect(savedCompanyResponse.ok()).toBe(true);
    await expect(companyPage).toHaveURL(/company=[0-9a-f-]{36}/i);
    providerId = new URL(companyPage.url()).searchParams.get('company');
    expect(providerId).toBeTruthy();

    const company = await admin.from('providers').select('id, is_seed_data').eq('id', providerId!).single();
    expect(company.error).toBeNull();
    expect(company.data?.is_seed_data).toBe(false);
    const organisation = await admin.from('organisations').select('id, provider_id, organisation_type').eq('provider_id', providerId!).single();
    expect(organisation.error).toBeNull();
    expect(organisation.data?.organisation_type).toBe('advisor');
    organisationId = organisation.data!.id;
    expect((await admin.from('provider_products').select('id').eq('provider_id', providerId!)).data).toEqual([]);

    await companyPage.locator('select[name="catalogue_status"]').selectOption('published');
    await companyPage.locator('input[name="disclosure_note"]').fill('Synthetic fixture; local test only.');
    await companyPage.getByRole('button', { name: 'Save catalogue status' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Catalogue status updated.');

    const membershipIdBefore = await companyPage.locator('[name="action"][value="save-membership"]').evaluate((input) => {
      const membershipTitle = input.closest('section')?.querySelector('h2')?.textContent;
      return membershipTitle;
    });
    expect(membershipIdBefore).toBe('Business membership');
    await companyPage.locator('select[name="membership_status"]').selectOption('active');
    await companyPage.locator('select[name="commercial_status"]').selectOption('complimentary_founding');
    await companyPage.locator('select[name="seat_limit_type"]').selectOption('capped');
    await companyPage.locator('input[name="included_seats"]').fill('3');
    await companyPage.locator('textarea[name="seat_terms"]').fill('Three connected company people for this synthetic local acceptance.');
    await companyPage.getByRole('button', { name: 'Save Business membership' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Business membership saved.');
    const foundingMembership = await admin.from('company_memberships').select('id, review_due_at, included_seats, included_benefits').eq('provider_id', providerId!).single();
    expect(foundingMembership.error).toBeNull();
    expect(new Date(foundingMembership.data!.review_due_at!).getTime() - Date.now()).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(foundingMembership.data?.included_seats).toBe(3);
    expect(foundingMembership.data?.included_benefits).toEqual(expect.arrayContaining(['company_catalogue_profile', 'company_people_seats', 'company_insight_updates']));
    expect((await admin.from('company_memberships').update({ review_due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }).eq('id', foundingMembership.data!.id)).error).toBeNull();
    expect((await admin.from('company_memberships').select('status').eq('id', foundingMembership.data!.id).single()).data?.status).toBe('active');

    await companyPage.getByRole('button', { name: 'Enable eligible company publishing' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Company publishing entitlement updated.');
    await companyPage.locator('[data-member-search] input[name="email"]').fill(author.email);
    await companyPage.getByRole('button', { name: 'Find account' }).click();
    await expect(companyPage.locator('[data-member-result]')).toContainText('confirmed account');
    await expect(companyPage.locator('[data-member-connect]')).toBeVisible();
    await companyPage.locator('[data-member-connect] input[name="role_title"]').fill('Synthetic local writer');
    const memberConnectResponse = companyPage.waitForResponse((response) => response.url().endsWith('/api/admin/companies') && response.request().method() === 'POST');
    await companyPage.getByRole('button', { name: 'Connect existing account' }).click();
    expect((await memberConnectResponse).ok()).toBe(true);
    await expect(companyPage).toHaveURL(/company=[0-9a-f-]{36}/i);
    const authorAffiliation = await admin.from('profile_organisations').select('verification_status').eq('profile_id', author.id).eq('organisation_id', organisationId!).single();
    expect(authorAffiliation.data?.verification_status).toBe('self_declared');

    const authorRow = companyPage.locator('li.event-material').filter({ hasText: author.email });
    await authorRow.locator('input[name="verification_basis"]').fill('Synthetic local test identity and company claim verified.');
    await authorRow.getByRole('button', { name: 'Approve affiliation' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Affiliation verified');
    await authorRow.getByRole('button', { name: 'Grant writer scope' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Writer scope updated');
    const verifiedAffiliation = await admin.from('profile_organisations').select('verification_status, verification_basis, verified_by').eq('profile_id', author.id).eq('organisation_id', organisationId!).single();
    expect(verifiedAffiliation.data).toMatchObject({ verification_status: 'approved', verification_basis: expect.stringContaining('Synthetic'), verified_by: operator.id });
    const activeAssignment = await admin.from('company_publishing_assignments').select('id, status, provider_product_id').eq('provider_id', providerId!).eq('profile_id', author.id).single();
    expect(activeAssignment.data).toMatchObject({ status: 'active', provider_product_id: null });

    expect((await operator.client.rpc('admin_connect_company_member', {
      target_organisation_id: organisationId, exact_email: follower.email, target_role_title: 'Synthetic follower', target_is_primary: false,
    })).error).toBeNull();
    await companyPage.locator('[data-member-search] input[name="email"]').fill(extraMember.email);
    await companyPage.getByRole('button', { name: 'Find account' }).click();
    await expect(companyPage.locator('[data-member-result]')).toContainText('workspace none');
    await companyPage.locator('[data-member-connect] input[name="role_title"]').fill('Synthetic accepted invitee');
    await companyPage.getByRole('button', { name: 'Connect existing account' }).click();
    await expect(companyPage).toHaveURL(/company=[0-9a-f-]{36}/i);
    expect((await admin.from('workspace_memberships').select('status').eq('user_id', extraMember.id).maybeSingle()).data).toBeNull();
    const extraMemberRow = companyPage.locator('li.event-material').filter({ hasText: extraMember.email });
    await expect(extraMemberRow).toContainText('workspace none');
    await extraMemberRow.getByRole('button', { name: 'Grant platform workspace access' }).click();
    await expect(companyPage.getByText('Platform workspace access updated.')).toBeVisible();
    expect((await admin.from('workspace_memberships').select('status, source, granted_by').eq('user_id', extraMember.id).single()).data).toMatchObject({ status: 'active', source: 'operator', granted_by: operator.id });
    expect((await extraMember.client.rpc('list_my_company_publishing_scopes')).data).toEqual([]);
    expect((await operator.client.rpc('admin_connect_company_member', {
      target_organisation_id: organisationId, exact_email: overSeatMember.email, target_role_title: '', target_is_primary: false,
    })).error?.code).toBe('23514');
    expect((await admin.from('profile_organisations').select('profile_id').eq('organisation_id', organisationId!)).data).toHaveLength(3);

    expect((await follower.client.rpc('follow_provider', { target_provider_id: providerId })).error).toBeNull();
    await writerPage.goto('/company/publishing');
    await expect(writerPage.getByRole('heading', { name: 'New company publication' })).toBeVisible();
    articleSlug = `synthetic-operator-article-${suffix}`;
    await writerPage.locator('select[name="scope"]').selectOption({ label: `Synthetic Company ${suffix} · Company` });
    await writerPage.locator('input[name="title"]').fill('Synthetic company membership update');
    await writerPage.locator('input[name="slug"]').fill(articleSlug);
    await writerPage.locator('textarea[name="summary"]').fill('Synthetic local acceptance draft.');
    await writerPage.locator('textarea[name="body"]').fill('Not a real company publication.');
    await writerPage.getByRole('button', { name: 'Save draft' }).click();
    await expect(writerPage.getByText('Draft saved.', { exact: true })).toBeVisible();
    await writerPage.getByRole('button', { name: 'Publish' }).click();
    await expect(writerPage.getByRole('status')).toContainText('awaiting Commonwork editorial review');
    const article = await admin.from('insight_articles').select('id, status, provider_id, author_profile_id').eq('slug', articleSlug).single();
    expect(article.data).toMatchObject({ status: 'draft', provider_id: providerId, author_profile_id: author.id });
    articleId = article.data!.id;
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toEqual([]);

    await companyPage.goto('/insights/editor');
    const reviewRow = companyPage.locator('li.event-material').filter({ hasText: 'Synthetic company membership update' });
    await expect(reviewRow).toBeVisible();
    await reviewRow.locator('textarea[name="feedback"]').fill('Add the source link before publication.');
    await reviewRow.getByRole('button', { name: 'Return with feedback' }).click();
    await expect(companyPage).toHaveURL(/status=review-rejected/);
    await writerPage.goto('/company/publishing');
    await expect(writerPage.getByText('Review feedback: Add the source link before publication.')).toBeVisible();
    await writerPage.getByRole('link', { name: 'Edit', exact: true }).click();
    await writerPage.locator('textarea[name="summary"]').fill('Resubmitted with reviewed source context.');
    await writerPage.getByRole('button', { name: 'Save draft' }).click();
    await expect(writerPage.getByText('Draft saved.', { exact: true })).toBeVisible();
    await writerPage.getByRole('button', { name: 'Publish' }).click();
    await expect(writerPage.getByRole('status')).toContainText('awaiting Commonwork editorial review');
    await companyPage.goto('/insights/editor');
    const resubmittedReviewRow = companyPage.locator('li.event-material').filter({ hasText: 'Synthetic company membership update' });
    await expect(resubmittedReviewRow).toBeVisible();
    await resubmittedReviewRow.getByRole('button', { name: 'Approve and publish' }).click();
    await expect(companyPage).toHaveURL(/status=review-approved/);
    const published = await admin.from('insight_articles').select('status, published_by, author_profile_id').eq('id', articleId).single();
    expect(published.data).toMatchObject({ status: 'published', published_by: operator.id, author_profile_id: author.id });
    const notices = await admin.from('notifications').select('id, profile_id').eq('insight_article_id', articleId);
    expect(notices.data).toHaveLength(1);
    expect(notices.data?.[0]?.profile_id).toBe(follower.id);
    expect((await admin.from('email_deliveries').select('id').eq('notification_id', notices.data![0]!.id)).data).toEqual([]);

    await writerPage.goto('/company/publishing');
    await writerPage.getByRole('button', { name: 'Withdraw' }).click();
    await expect(writerPage.getByRole('status')).toContainText('Publication withdrawn.');
    await writerPage.getByRole('button', { name: 'Publish' }).click();
    await expect(writerPage.getByRole('status')).toContainText('Publication is live.');
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toHaveLength(1);

    const membershipId = foundingMembership.data!.id;
    await companyPage.goto(`/admin/companies?company=${providerId}`);
    await companyPage.locator('select[name="commercial_status"]').selectOption('commercial_agreement');
    await companyPage.locator('input[name="agreement_evidence_url"]').fill(`https://agreements.example.test/${suffix}`);
    await companyPage.getByRole('button', { name: 'Save Business membership' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Business membership saved.');
    const convertedMembership = await admin.from('company_memberships').select('id, status, commercial_status, review_due_at').eq('provider_id', providerId!).single();
    expect(convertedMembership.data).toMatchObject({ id: membershipId, status: 'active', commercial_status: 'commercial_agreement', review_due_at: null });
    const convertedEntitlement = await admin.from('company_publishing_entitlements').select('status, entitlement_type, agreement_evidence_url').eq('provider_id', providerId!).single();
    expect(convertedEntitlement.data).toMatchObject({ status: 'active', entitlement_type: 'commercial_agreement', agreement_evidence_url: `https://agreements.example.test/${suffix}` });
    expect((await admin.from('company_publishing_assignments').select('status').eq('provider_id', providerId!).eq('profile_id', author.id).single()).data?.status).toBe('active');
    expect((await admin.from('insight_articles').select('id').eq('id', articleId)).data).toHaveLength(1);
    expect((await admin.from('provider_follows').select('member_id').eq('provider_id', providerId!).eq('member_id', follower.id)).data).toHaveLength(1);

    await companyPage.locator('select[name="membership_status"]').selectOption('suspended');
    expect(await companyPage.locator('select[name="membership_status"]').inputValue()).toBe('suspended');
    const membershipUpdateResponse = companyPage.waitForResponse((response) => response.url().endsWith('/api/admin/companies') && response.request().method() === 'POST');
    await companyPage.getByRole('button', { name: 'Save Business membership' }).click();
    const savedMembershipResponse = await membershipUpdateResponse;
    expect(savedMembershipResponse.status()).toBe(200);
    expect(savedMembershipResponse.request().postData()).toContain('suspended');
    expect((await admin.from('company_memberships').select('status').eq('provider_id', providerId!).single()).data?.status).toBe('suspended');
    expect((await admin.from('company_publishing_entitlements').select('status').eq('provider_id', providerId!).single()).data?.status).toBe('revoked');
    expect((await admin.from('company_publishing_assignments').select('status').eq('provider_id', providerId!).eq('profile_id', author.id).single()).data?.status).toBe('active');
    expect((await admin.from('insight_articles').select('status').eq('id', articleId).single()).data?.status).toBe('published');
    await writerPage.goto('/company/publishing');
    await expect(writerPage.getByText('Company publishing access required.')).toBeVisible();

    await companyPage.locator('select[name="membership_status"]').selectOption('active');
    await companyPage.getByRole('button', { name: 'Save Business membership' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Business membership saved.');
    expect((await admin.from('company_publishing_entitlements').select('status').eq('provider_id', providerId!).single()).data?.status).toBe('revoked');
    await companyPage.getByRole('button', { name: 'Enable eligible company publishing' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Company publishing entitlement updated.');
    await writerPage.goto('/company/publishing');
    await expect(writerPage.getByText('Synthetic company membership update')).toBeVisible();

    await companyPage.getByRole('button', { name: 'Revoke company writer' }).click();
    await expect(companyPage.getByRole('status')).toContainText('Writer scope updated');
    expect((await admin.from('company_publishing_assignments').select('status, revoked_at').eq('provider_id', providerId!).eq('profile_id', author.id).single()).data).toMatchObject({ status: 'revoked', revoked_at: expect.any(String) });
    await writerPage.goto('/company/publishing');
    expect(writerPage.url()).toContain('/company/publishing');
    await expect(writerPage.getByText('Company publishing access required.')).toBeVisible();
    expect((await admin.from('insight_articles').select('status').eq('id', articleId).single()).data?.status).toBe('published');
    expect((await admin.from('notifications').select('id').eq('insight_article_id', articleId)).data).toHaveLength(1);
    expect((await admin.from('company_membership_audit').select('action').eq('provider_id', providerId!).order('created_at')).data?.map((row) => row.action)).toEqual(expect.arrayContaining(['created', 'commercial_conversion', 'suspended', 'resumed']));
    expect((await admin.from('company_publication_review_audit').select('action').eq('article_id', articleId).order('created_at')).data?.map((row) => row.action)).toEqual(['returned', 'approved']);
  } finally {
    await Promise.all([operatorContext.close(), authorContext.close()]);
    if (providerId) {
      await admin.from('company_publication_review_audit').delete().eq('provider_id', providerId);
      if (articleId) await admin.from('insight_articles').delete().eq('id', articleId);
      if (organisationId) await admin.from('organisations').delete().eq('id', organisationId);
      await admin.from('company_membership_audit').delete().eq('provider_id', providerId);
      await admin.from('company_operator_audit').delete().eq('provider_id', providerId);
      await admin.from('company_publication_review_audit').delete().eq('provider_id', providerId);
      await admin.from('company_publishing_assignment_audit').delete().eq('provider_id', providerId);
      await admin.from('company_publishing_entitlement_audit').delete().eq('provider_id', providerId);
      await admin.from('company_memberships').delete().eq('provider_id', providerId);
      await admin.from('company_publishing_entitlements').delete().eq('provider_id', providerId);
      await admin.from('company_publishing_assignments').delete().eq('provider_id', providerId);
      await admin.from('provider_follows').delete().eq('provider_id', providerId);
      await admin.from('providers').delete().eq('id', providerId);
    }
    await Promise.all([operator.remove(), author.remove(), follower.remove(), extraMember.remove(), overSeatMember.remove()]);
  }
});

test('operator reuses an existing organisation, refuses duplicates, and does not create unaccepted accounts', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const suffix = randomUUID().slice(0, 10);
  const operator = await withProfile(admin, await createLocalMember('Synthetic Reuse Operator'), 'Synthetic Reuse Operator');
  await operator.provisionAdministrator();
  const member = await withProfile(admin, await createLocalMember('Synthetic Non-admin'), 'Synthetic Non-admin');
  const context = await memberContext(browser, operator);
  const page = await context.newPage();
  let providerId: string | null = null;
  let organisationId: string | null = null;
  try {
    const orphan = await admin.from('organisations').insert({
      slug: `unlinked-company-${suffix}`, name: `Synthetic Existing Organisation ${suffix}`,
      organisation_type: 'advisor', summary: 'Synthetic existing organisation to reuse.', provider_id: null,
    }).select('id').single();
    expect(orphan.error).toBeNull();
    organisationId = orphan.data!.id;

    expect((await member.client.rpc('admin_search_companies', { search_term: suffix })).error?.code).toBe('42501');
    const seedCompanies = await operator.client.rpc('admin_search_companies', { search_term: 'Adobe' });
    expect(seedCompanies.error).toBeNull();
    const seedCompany = (seedCompanies.data as Array<{ is_seed_data: boolean; provider_id: string | null }> | null)?.find((row) => row.is_seed_data && row.provider_id);
    expect(seedCompany).toBeTruthy();
    expect((await operator.client.rpc('admin_set_company_catalogue_status', {
      target_provider_id: seedCompany!.provider_id, target_status: 'published', target_disclosure_note: 'Synthetic attempt.',
    })).error?.code).toBe('42501');
    const missingEmail = `not-created-${suffix}@example.test`;
    expect((await operator.client.rpc('admin_search_company_member', { exact_email: missingEmail })).data).toBeNull();
    expect((await admin.auth.admin.listUsers()).data.users.some((user) => user.email === missingEmail)).toBe(false);

    await page.goto('/admin/companies');
    await page.locator('input[name="search"]').fill(`Synthetic Existing Organisation ${suffix}`);
    await page.getByRole('button', { name: 'Search' }).click();
    const result = page.locator('li.event-material').filter({ hasText: `Synthetic Existing Organisation ${suffix}` });
    await expect(result.getByText('Organisation not linked to a provider')).toBeVisible();
    await result.getByRole('button', { name: 'Link existing organisation' }).click();
    await page.locator('input[name="provider_slug"]').fill(`reused-company-${suffix}`);
    await page.locator('select[name="provider_type"]').selectOption('organisation');
    await page.locator('input[name="website_url"]').fill(`https://reused-${suffix}.example.test`);
    await page.locator('input[name="source_system"]').fill('local-organisation-reuse-test');
    await page.locator('input[name="source_record_id"]').fill(suffix);
    await page.locator('input[name="source_url"]').fill(`https://evidence.example.test/reused/${suffix}`);
    await page.locator('textarea[name="provider_summary"]').fill('Synthetic linked company profile.');
    await page.getByRole('button', { name: 'Save company draft' }).click();
    await expect(page).toHaveURL(/company=[0-9a-f-]{36}/i);
    providerId = new URL(page.url()).searchParams.get('company');
    expect(providerId).toBeTruthy();

    const linked = await admin.from('organisations').select('id, provider_id').eq('id', organisationId!).single();
    expect(linked.data).toMatchObject({ id: organisationId, provider_id: providerId });
    expect((await admin.from('organisations').select('id').eq('provider_id', providerId!)).data).toHaveLength(1);
    expect((await admin.from('provider_products').select('id').eq('provider_id', providerId!)).data).toEqual([]);

    const duplicate = await operator.client.rpc('admin_save_company', {
      target_provider_id: null, target_organisation_id: null,
      target_provider_slug: `reused-company-${suffix}`, target_provider_name: `Synthetic Existing Organisation ${suffix}`,
      target_provider_type: 'organisation', target_website_url: `https://reused-${suffix}.example.test`,
      target_provider_summary: 'Synthetic linked company profile.', target_source_system: 'local-organisation-reuse-test',
      target_source_record_id: suffix, target_source_url: `https://evidence.example.test/reused/${suffix}`,
      target_organisation_slug: `duplicate-organisation-${suffix}`, target_organisation_type: 'advisor',
      target_organisation_summary: '',
    });
    expect(duplicate.error?.code).toBe('23505');
    expect((await admin.from('providers').select('id').eq('slug', `reused-company-${suffix}`)).data).toHaveLength(1);
  } finally {
    await context.close();
    if (providerId) {
      await admin.from('company_operator_audit').delete().eq('provider_id', providerId);
      await admin.from('organisations').delete().eq('provider_id', providerId);
      await admin.from('provider_publication_status').delete().eq('provider_id', providerId);
      await admin.from('providers').delete().eq('id', providerId);
    }
    if (organisationId) await admin.from('organisations').delete().eq('id', organisationId);
    await Promise.all([operator.remove(), member.remove()]);
  }
});

test('operator changes draft/public status only for an existing sourced product', async ({ browser }) => {
  const admin = createLocalAdminClient();
  const operator = await withProfile(admin, await createLocalMember('Synthetic Product Operator'), 'Synthetic Product Operator');
  await operator.provisionAdministrator();
  const [product] = await createProducts(admin, 'operator-product-visibility', 1, { provider: 'published', product: 'draft' });
  const context = await memberContext(browser, operator);
  const page = await context.newPage();
  let fixtures: ProductFixture[] = product ? [product] : [];
  try {
    expect(product).toBeTruthy();
    expect((await admin.from('provider_products').update({
      summary: 'Synthetic local product profile with documented source.',
      source_url: 'https://evidence.example.test/product/source',
    }).eq('id', product!.productId)).error).toBeNull();
    await page.goto(`/admin/companies?company=${product!.providerId}`);
    await expect(page.getByRole('heading', { name: /Company membership/ })).toBeVisible();
    const productRow = page.locator('li.event-material').filter({ hasText: product!.name });
    await expect(productRow).toContainText('Current status: draft');
    await productRow.locator('select[name="product_status"]').selectOption('published');
    await productRow.getByRole('button', { name: 'Save product status' }).click();
    await expect(page).toHaveURL(/company=[0-9a-f-]{36}.*status=Product/);
    expect((await admin.from('provider_publication_status').select('status').eq('provider_product_id', product!.productId).single()).data?.status).toBe('published');
    const productStatus = page.locator('select[name="product_status"]');
    await productStatus.selectOption('draft');
    expect(await productStatus.inputValue()).toBe('draft');
    const productDraftResponse = page.waitForResponse((response) => response.url().endsWith('/api/admin/companies') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save product status' }).click();
    const productDraftResult = await productDraftResponse;
    expect(productDraftResult.status()).toBe(200);
    expect(productDraftResult.request().postData()).toContain('draft');
    await expect(page).toHaveURL(/company=[0-9a-f-]{36}.*status=Product/);
    expect((await admin.from('provider_publication_status').select('status').eq('provider_product_id', product!.productId).single()).data?.status).toBe('draft');
    expect((await admin.from('provider_products').select('id').eq('provider_id', product!.providerId)).data).toHaveLength(1);
  } finally {
    await context.close();
    await removeProducts(admin, fixtures);
    await operator.remove();
  }
});