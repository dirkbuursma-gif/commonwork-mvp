import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { readWorkspaceAccess, isEventResourceRequest } from '../src/lib/workspace-access';
import { createLocalAdminClient, createLocalMember } from './helpers/local-supabase';

test('workspace lookup fails closed; resource exemptions exclude management', async () => {
  expect(await readWorkspaceAccess({ rpc: async () => ({ data: true, error: null }) })).toBe(true);
  for (const data of [false, null, undefined, 'true', 1]) expect(await readWorkspaceAccess({ rpc: async () => ({ data, error: null }) })).toBe(false);
  expect(await readWorkspaceAccess({ rpc: async () => { throw new Error('unavailable'); } })).toBe(false);
  expect(await readWorkspaceAccess({ rpc: async () => ({ data: true, error: {} }) })).toBe(false);
  for (const path of ['/events/example/presentation', '/events/example/guide', '/events/example/guide/print', '/api/events/video']) expect(isEventResourceRequest(path, 'GET')).toBe(true);
  for (const path of ['/today', '/events/manage', '/events/manage/presentation', '/events/example/manage', '/insights/editor', '/api/events/manage']) expect(isEventResourceRequest(path, 'GET')).toBe(false);
  expect(isEventResourceRequest('/api/events/material', 'POST')).toBe(true);
  expect(isEventResourceRequest('/api/events/video', 'POST')).toBe(false);
});

test('event-only requests preserve approval checks and do not grant workspace access', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const admin = createLocalAdminClient();
  const member = await createLocalMember('Local route member');
  let attendee: Awaited<ReturnType<typeof createLocalMember>> | undefined;
  let eventId: string | undefined;
  let memberContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const slug = `route-boundary-${randomUUID()}`;
  try {
    attendee = await createLocalMember('Local route attendee', { workspaceAccess: false });
    const profiles = await admin.from('profiles').insert([{ id: member.id, display_name: 'Local route member' }, { id: attendee.id, display_name: 'Local route attendee' }]);
    expect(profiles.error).toBeNull();
    const event = await admin.from('events').insert({ slug, title: 'Local route event', manager_profile_id: member.id, is_published: true }).select('id').single();
    expect(event.error).toBeNull();
    if (!event.data) throw new Error('Local event missing.');
    eventId = event.data.id;
    await page.context().addCookies(attendee.cookies.map(({ name, value, url }) => ({ name, value, url })));
    for (const path of ['/today', '/me', '/find', '/intelligence', '/events/manage', `/events/${slug}/manage`, '/insights/editor']) expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
    expect((await page.request.post('/api/needs', { maxRedirects: 0 })).status()).toBe(403);
    const views = ['presentation', 'guide', 'guide/print'];
    for (const view of views) expect((await page.request.get(`/events/${slug}/${view}`)).status()).toBe(403);
    await page.goto('/insights');
    await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
    await page.goto(`/events/${slug}`);
    await page.getByRole('button', { name: 'Request attendee access', exact: true }).click();
    await expect(page.getByText('Your request is awaiting a decision by the event manager', { exact: true })).toBeVisible();
    const approved = await admin.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: member.id }).eq('event_id', eventId).eq('profile_id', attendee.id);
    expect(approved.error).toBeNull();
    for (const view of views) expect((await page.request.get(`/events/${slug}/${view}`)).status()).toBe(200);
    const spoof = await attendee.client.auth.updateUser({ data: { workspace_access: true, canAccessWorkspace: true } });
    expect(spoof.error).toBeNull();
    expect((await page.request.get('/intelligence')).status()).toBe(403);
    const revoked = await admin.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString() }).eq('event_id', eventId).eq('profile_id', attendee.id);
    expect(revoked.error).toBeNull();
    expect((await page.request.get(`/events/${slug}/guide`)).status()).toBe(403);
    memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' });
    await memberContext.addCookies(member.cookies.map(({ name, value, url }) => ({ name, value, url })));
    expect((await memberContext.request.get('/intelligence')).status()).toBe(200);
    const membership = await admin.from('workspace_memberships').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', member.id);
    expect(membership.error).toBeNull();
    expect((await memberContext.request.get('/intelligence')).status()).toBe(403);
  } finally {
    await memberContext?.close();
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    await Promise.all([member.remove(), attendee?.remove()]);
  }
});
