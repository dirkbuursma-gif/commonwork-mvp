import { expect, test } from '@playwright/test';
import { isOwnAccountRequest } from '../src/lib/workspace-access';
import { validateReturnPath } from '../src/lib/auth-return-path';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

test('own-account exceptions are exact paths and methods, not workspace admission', () => {
  for (const path of ['/account', '/api/account']) for (const method of ['GET', 'HEAD']) expect(isOwnAccountRequest(path, method)).toBe(true);
  expect(isOwnAccountRequest('/api/account', 'POST')).toBe(true);
  for (const path of ['/account/me', '/api/account/export', '/api/privacy', '/profiles/me', '/api/onboarding', '/intelligence']) expect(isOwnAccountRequest(path, 'GET')).toBe(false);
  expect(isOwnAccountRequest('/account', 'POST')).toBe(false);
  for (const method of ['PUT', 'PATCH', 'DELETE']) expect(isOwnAccountRequest('/api/account', method)).toBe(false);
  expect(validateReturnPath('/account')).toBe('/account');
  for (const path of ['//example.test/account', '/account?return_to=https://example.test', '/account/other']) expect(validateReturnPath(path)).toBeNull();
});

test('event-only users manage only their own account without a workspace grant', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const people: LocalMember[] = [];
  const origin = 'http://127.0.0.1:4322';
  try {
    const anonymous = await page.request.get('/account', { maxRedirects: 0 });
    expect(anonymous.status()).toBe(303);
    expect(new URL(anonymous.headers().location!, origin).searchParams.get('return_to')).toBe('/account');
    const attendee = await createLocalMember('Local account attendee', { workspaceAccess: false }); people.push(attendee);
    const other = await createLocalMember('Local other account', { workspaceAccess: false }); people.push(other);
    const member = await createLocalMember('Local normal member'); people.push(member);
    expect((await admin.from('profiles').insert({ id: other.id, display_name: 'Other private account' })).error).toBeNull();
    const otherRequest = await other.client.rpc('request_member_privacy_action', { target_request_type: 'account_deletion', target_note: 'OTHER_ACCOUNT_PRIVATE_NOTE' });
    expect(otherRequest.error).toBeNull();
    await page.context().addCookies(attendee.cookies.map(({ name, value, url }) => ({ name, value, url })));
    await page.goto('/insights');
    await page.getByRole('link', { name: 'Your account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
    const absent = await admin.from('profiles').select('id').eq('id', attendee.id).maybeSingle();
    expect(absent.error).toBeNull(); expect(absent.data).toBeNull();
    const exported = await page.request.get(`/api/account?profile_id=${other.id}`);
    expect(exported.status()).toBe(200); expect(exported.headers()['cache-control']).toBe('private, no-store');
    expect(exported.headers()['content-disposition']).toContain('attachment');
    const data = await exported.json();
    expect(data.authentication_email).toBe(attendee.email); expect(data.profile).toBeNull();
    const rejected = await page.request.post('/api/account', { headers: { origin: 'https://example.invalid' }, form: { action: 'request-deletion' }, maxRedirects: 0 });
    expect(rejected.status()).toBe(403);
    const stillAbsent = await admin.from('profiles').select('id').eq('id', attendee.id).maybeSingle();
    expect(stillAbsent.error).toBeNull(); expect(stillAbsent.data).toBeNull();
    await page.getByLabel('Note for the account request (optional)').fill('Local attendee deletion request');
    await page.getByRole('button', { name: 'Request account deletion', exact: true }).click();
    await expect(page.getByText('Your account deletion request has been recorded for operator review.', { exact: true })).toBeVisible();
    const ownRequest = await admin.from('member_privacy_requests').select('id, status').eq('profile_id', attendee.id).eq('request_type', 'account_deletion').single();
    expect(ownRequest.error).toBeNull(); expect(ownRequest.data?.status).toBe('pending');
    if (!ownRequest.data) throw new Error('Own privacy request missing.');
    const tampered = await page.request.post('/api/account', { headers: { origin }, form: { action: 'cancel-request', request_id: String(otherRequest.data), profile_id: other.id }, maxRedirects: 0 });
    expect(tampered.status()).toBe(303); expect(tampered.headers().location).toContain('status=action-failed');
    const otherUnchanged = await admin.from('member_privacy_requests').select('status').eq('id', otherRequest.data).single();
    expect(otherUnchanged.error).toBeNull(); expect(otherUnchanged.data?.status).toBe('pending');
    await page.reload();
    await expect(page.locator(`[data-request-id="${String(otherRequest.data)}"]`)).toHaveCount(0);
    await page.locator(`[data-request-id="${ownRequest.data.id}"]`).getByRole('button', { name: 'Cancel request' }).click();
    await expect(page.getByText('Your pending request has been cancelled.', { exact: true })).toBeVisible();
    const profile = await admin.from('profiles').select('id, profile_visibility, professional_summary, onboarding_completed').eq('id', attendee.id).single();
    expect(profile.error).toBeNull(); expect(profile.data).toMatchObject({ id: attendee.id, profile_visibility: 'private', professional_summary: '', onboarding_completed: false });
    const preferences = await admin.from('contact_preferences').select('profile_id').eq('profile_id', attendee.id);
    expect(preferences.error).toBeNull(); expect(preferences.data).toEqual([]);
    const workspace = await attendee.client.rpc('can_access_member_workspace');
    expect(workspace.error).toBeNull(); expect(workspace.data).toBe(false);
    for (const path of ['/intelligence', '/introductions', '/profiles/me']) expect((await page.request.get(path, { maxRedirects: 0 })).status()).toBe(403);
    expect((await page.request.post('/api/onboarding', { maxRedirects: 0 })).status()).toBe(403);
    const memberContext = await browser.newContext({ baseURL: origin });
    try {
      await memberContext.addCookies(member.cookies.map(({ name, value, url }) => ({ name, value, url })));
      expect((await memberContext.request.get('/intelligence', { maxRedirects: 0 })).status()).toBe(200);
      expect((await memberContext.request.get('/account', { maxRedirects: 0 })).status()).toBe(200);
    } finally { await memberContext.close(); }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    expect((await page.request.get('/account', { maxRedirects: 0 })).status()).toBe(303);
  } finally { for (const person of people) await person.remove(); }
});
