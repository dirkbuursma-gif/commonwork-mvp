import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalAnonymousClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { assertPublicVideo } from './helpers/public-event-video';

test('same attendee session and application URL warm successfully, then deny immediately after manager revocation', async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const people: LocalMember[] = [];
  const eventId = randomUUID(); const path = `${eventId}/revocation.txt`; const content = `synthetic ${randomUUID()}`;
  try {
    const manager = await createLocalMember('Delivery manager'); people.push(manager);
    const attendee = await createLocalMember('Delivery attendee', { workspaceAccess: false }); people.push(attendee);
    const outsider = await createLocalMember('Delivery outsider', { workspaceAccess: false }); people.push(outsider);
    expect((await admin.from('profiles').insert({ id: manager.id, display_name: 'Delivery manager' })).error).toBeNull();
    expect((await admin.from('events').insert({ id: eventId, slug: `delivery-${eventId}`, title: 'Local delivery test', manager_profile_id: manager.id, is_published: true })).error).toBeNull();
    expect((await manager.client.storage.from('event-materials').upload(path, content, { contentType: 'text/plain' })).error).toBeNull();
    const meta = await manager.client.from('event_materials').insert({ event_id: eventId, kind: 'guide', title: 'Local delivery fixture', storage_path: path }).select('id').single();
    expect(meta.error).toBeNull(); if (!meta.data) throw new Error('Fixture missing');
    const form = { material_id: meta.data.id }; const url = '/api/events/material'; const origin = 'http://127.0.0.1:4322';
    const read = (extra: Record<string, string> = {}) => page.request.post(url, { form: { ...form, ...extra }, headers: { origin }, maxRedirects: 0 });
    async function denied(expected: number) {
      const response = await read(); expect(response.status()).toBe(expected);
      expect(await response.text()).not.toContain(content); expect(response.headers().location).toBeUndefined();
      expect(response.headers()['cache-control']).toBe('private, no-store');
      expect(response.headers()['vercel-cdn-cache-control']).toBe('no-store');
    }
    await denied(401);
    await page.context().addCookies(attendee.cookies.map(({ name, value, url }) => ({ name, value, url })));
    const token = (await attendee.client.auth.getSession()).data.session?.access_token;
    await denied(403);
    expect((await attendee.client.rpc('request_event_attendance', { target_event_id: eventId })).error).toBeNull();
    expect((await attendee.client.auth.updateUser({ data: { role: 'service_role', status: 'approved', event_id: eventId } })).error).toBeNull();
    await denied(403);
    expect((await manager.client.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', eventId).eq('profile_id', attendee.id).select('status').single()).error).toBeNull();
    for (let i = 0; i < 3; i++) {
      const response = await read(); expect(response.status()).toBe(200); expect(await response.text()).toBe(content);
      expect(response.headers()['cache-control']).toBe('private, no-store');
      expect(response.headers()['cdn-cache-control']).toBe('no-store');
      expect(response.headers()['vercel-cdn-cache-control']).toBe('no-store');
      expect(response.headers().location).toBeUndefined();
      expect(JSON.stringify(response.headers())).not.toMatch(/storage\/v1|token=|sb_secret_/);
    }
    for (const client of [attendee.client, outsider.client, createLocalAnonymousClient()]) {
      const download = await client.storage.from('event-materials').download(path); expect(download.error).toBeTruthy(); expect(download.data).toBeNull();
      const sign = await client.storage.from('event-materials').createSignedUrl(path, 300); expect(sign.error).toBeTruthy(); expect(sign.data).toBeNull();
    }
    expect((await read({ event_id: randomUUID() })).status()).toBe(404);
    expect((await read({ event_slug: 'wrong-event' })).status()).toBe(404);
    const crossOrigin = await page.request.post(url, { form, headers: { origin: 'https://evil.invalid' }, maxRedirects: 0 }); expect(crossOrigin.status()).toBe(403);
    expect((await attendee.client.rpc('can_access_member_workspace')).data).toBe(false);
    expect((await manager.client.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', eventId).eq('profile_id', attendee.id).select('status').single()).error).toBeNull();
    await denied(403);
    expect((await attendee.client.auth.getSession()).data.session?.access_token).toBe(token);
    await page.context().clearCookies(); await page.context().addCookies(outsider.cookies.map(({ name, value, url }) => ({ name, value, url })));
    await denied(403);
  } finally {
    await admin.storage.from('event-materials').remove([path]);
    await admin.from('events').delete().eq('id', eventId);
    for (const person of people.reverse()) await person.remove();
  }
});

test('public video redirects anonymously and retains access after attendee revocation, including Storage ranges', async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient(); const people: LocalMember[] = [];
  const eventId = 'c3118b54-7568-4ef6-9159-124dc86e7971';
  const filename = 'Geoffy-in-60-seconds-EN-1080p.mp4';
  const path = `${eventId}/videos/${filename}`;
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  let createdEvent = false; let uploaded = false;
  try {
    const manager = await createLocalMember('Local video manager'); people.push(manager);
    const attendee = await createLocalMember('Local video attendee', { workspaceAccess: false }); people.push(attendee);
    expect((await admin.from('profiles').insert({ id: manager.id, display_name: 'Local video manager' })).error).toBeNull();
    const event = await admin.from('events').insert({ id: eventId, slug: 'agentic-commerce-lisbon-2026', title: 'Local video fixture only', manager_profile_id: manager.id, is_published: true });
    expect(event.error, 'Do not overwrite an existing configured local event').toBeNull(); createdEvent = !event.error;
    const upload = await manager.client.storage.from('event-materials').upload(path, bytes, { contentType: 'video/mp4', upsert: false });
    expect(upload.error).toBeNull(); uploaded = !upload.error;
    const allowed = () => assertPublicVideo(page.request, 'agentic-commerce-lisbon-2026', eventId, 'geoffy', filename, bytes, true);
    await allowed();
    await page.context().addCookies(attendee.cookies.map(({ name, value, url }) => ({ name, value, url })));
    const token = (await attendee.client.auth.getSession()).data.session?.access_token;
    await allowed();
    expect((await attendee.client.rpc('request_event_attendance', { target_event_id: eventId })).error).toBeNull();
    await allowed();
    expect((await manager.client.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', eventId).eq('profile_id', attendee.id).select('status').single()).error).toBeNull();
    await allowed();
    expect((await attendee.client.storage.from('event-materials').download(path)).error).toBeTruthy();
    expect((await attendee.client.storage.from('event-materials').createSignedUrl(path, 300)).error).toBeTruthy();
    expect((await manager.client.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', eventId).eq('profile_id', attendee.id).select('status').single()).error).toBeNull();
    await allowed();
    expect((await attendee.client.auth.getSession()).data.session?.access_token).toBe(token);
    await page.context().clearCookies();
    await allowed();
  } finally {
    if (uploaded) await admin.storage.from('event-materials').remove([path]);
    if (createdEvent) await admin.from('events').delete().eq('id', eventId);
    for (const person of people.reverse()) await person.remove();
  }
});
