import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { assertPublicCatalogueAlias, memberCategory, memberProduct } from './helpers/catalogue-boundary';

test('a first event request creates only a private minimal profile and cannot grant broader access', async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createLocalAdminClient();
  const manager = await createLocalMember('Local first-request manager');
  const people: LocalMember[] = [manager];
  const eventIds: string[] = [];
  const origin = 'http://127.0.0.1:4322';
  try {
    const attendee = await createLocalMember('Local first-request attendee', { workspaceAccess: false }); people.push(attendee);
    const existing = await createLocalMember('Local existing member'); people.push(existing);
    expect((await admin.from('profiles').insert({ id: manager.id, display_name: 'Local first-request manager' })).error).toBeNull();
    expect((await admin.from('profiles').insert({ id: existing.id, display_name: 'Existing member name', professional_summary: 'Existing professional summary', what_i_contribute: 'Existing contribution', profile_visibility: 'private' })).error).toBeNull();
    expect((await admin.from('contact_preferences').insert({ profile_id: existing.id, open_to_peer_exchange: true, availability_status: 'selective', conversation_capacity: 1 })).error).toBeNull();
    const beforeProfile = await admin.from('profiles').select('*').eq('id', existing.id).single();
    const beforePreferences = await admin.from('contact_preferences').select('*').eq('profile_id', existing.id).single();
    expect(beforeProfile.error).toBeNull(); expect(beforePreferences.error).toBeNull();
    const key = randomUUID();
    const events = await admin.from('events').insert([
      { slug: `first-request-${key}`, title: 'Local public event', manager_profile_id: manager.id, is_published: true },
      { slug: `private-request-${key}`, title: 'Local unpublished event', manager_profile_id: manager.id, is_published: false },
    ]).select('id, slug, is_published');
    expect(events.error).toBeNull();
    eventIds.push(...(events.data ?? []).map((e: { id: string }) => e.id));
    const published = events.data?.find((e: { is_published: boolean }) => e.is_published);
    const unpublished = events.data?.find((e: { is_published: boolean }) => !e.is_published);
    if (!published || !unpublished) throw new Error('Local event fixtures missing.');
    await page.context().addCookies(attendee.cookies.map(({ name, value, url }) => ({ name, value, url })));
    for (const id of [unpublished.id, randomUUID()]) {
      const denied = await attendee.client.rpc('request_event_attendance', { target_event_id: id });
      expect(denied.error?.code).toBe('42501'); expect(denied.data).toBeNull();
    }
    const mismatch = await page.request.post('/api/events/attendance', { headers: { origin }, form: { slug: unpublished.slug, event_id: published.id }, maxRedirects: 0 });
    expect(mismatch.status()).toBe(404);
    const crossOrigin = await page.request.post('/api/events/attendance', { headers: { origin: 'https://example.invalid' }, form: { slug: published.slug, event_id: published.id }, maxRedirects: 0 });
    expect(crossOrigin.status()).toBe(403);
    const absent = await admin.from('profiles').select('id').eq('id', attendee.id).maybeSingle();
    expect(absent.error).toBeNull(); expect(absent.data).toBeNull();
    await page.goto(`/events/${published.slug}`);
    await page.getByRole('button', { name: 'Request attendee access', exact: true }).click();
    await expect(page.getByText('Your request is awaiting a decision by the event manager', { exact: true })).toBeVisible();
    const profile = await admin.from('profiles').select('*').eq('id', attendee.id).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toMatchObject({ id: attendee.id, display_name: 'Event attendee', professional_summary: '', what_i_contribute: '', what_i_am_exploring: '', profile_visibility: 'private', onboarding_completed: false });
    for (const table of ['contact_preferences', 'profile_competencies', 'profile_organisations', 'profile_product_affiliations']) {
      const rows = await admin.from(table).select('profile_id').eq('profile_id', attendee.id);
      expect(rows.error, table).toBeNull(); expect(rows.data, table).toEqual([]);
    }
    const membership = await attendee.client.rpc('can_access_member_workspace');
    expect(membership.error).toBeNull(); expect(membership.data).toBe(false);
    const pending = await attendee.client.from('event_attendees').select('status, decided_at, decided_by').eq('event_id', published.id).eq('profile_id', attendee.id).single();
    expect(pending.error).toBeNull(); expect(pending.data).toEqual({ status: 'requested', decided_at: null, decided_by: null });
    const guideBefore = await page.request.get(`/events/${published.slug}/guide`, { maxRedirects: 0 });
    expect(guideBefore.status()).toBe(403);
    const spoof = await page.request.post('/api/events/attendance', { headers: { origin }, form: { slug: published.slug, event_id: published.id, profile_id: manager.id, status: 'approved', decided_by: manager.id }, maxRedirects: 0 });
    expect(spoof.status()).toBe(303); expect(spoof.headers().location).toContain('status=already-requested');
    const unchanged = await attendee.client.from('event_attendees').select('status').eq('event_id', published.id).eq('profile_id', attendee.id).single();
    expect(unchanged.error).toBeNull(); expect(unchanged.data?.status).toBe('requested');
    expect((await admin.from('event_attendees').update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id }).eq('event_id', published.id).eq('profile_id', attendee.id)).error).toBeNull();
    expect((await page.request.get(`/events/${published.slug}/guide`, { maxRedirects: 0 })).status()).toBe(200);
    expect((await attendee.client.rpc('request_event_attendance', { target_event_id: published.id })).data).toBe('already-requested');
    const approved = await attendee.client.from('event_attendees').select('status').eq('event_id', published.id).eq('profile_id', attendee.id).single();
    expect(approved.error).toBeNull(); expect(approved.data?.status).toBe('approved');
    expect((await admin.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString() }).eq('event_id', published.id).eq('profile_id', attendee.id)).error).toBeNull();
    expect((await attendee.client.rpc('request_event_attendance', { target_event_id: published.id })).data).toBe('already-requested');
    const revoked = await attendee.client.from('event_attendees').select('status').eq('event_id', published.id).eq('profile_id', attendee.id).single();
    expect(revoked.error).toBeNull(); expect(revoked.data?.status).toBe('revoked');
    expect((await page.request.get(`/events/${published.slug}/guide`, { maxRedirects: 0 })).status()).toBe(403);
    await assertPublicCatalogueAlias(page.request);
    for (const path of [memberCategory, memberProduct]) expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
    const afterPublicBrowse = await attendee.client.rpc('can_access_member_workspace');
    expect(afterPublicBrowse.error).toBeNull(); expect(afterPublicBrowse.data).toBe(false);
    const hidden = await existing.client.from('discoverable_profiles').select('id').eq('id', attendee.id);
    expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
    const existingRequest = await existing.client.rpc('request_event_attendance', { target_event_id: published.id });
    expect(existingRequest.error).toBeNull(); expect(existingRequest.data).toBe('requested');
    const afterProfile = await admin.from('profiles').select('*').eq('id', existing.id).single();
    const afterPreferences = await admin.from('contact_preferences').select('*').eq('profile_id', existing.id).single();
    expect(afterProfile.error).toBeNull(); expect(afterPreferences.error).toBeNull();
    expect(afterProfile.data).toEqual(beforeProfile.data); expect(afterPreferences.data).toEqual(beforePreferences.data);
  } finally {
    if (eventIds.length) await admin.from('events').delete().in('id', eventIds);
    for (const person of people) await person.remove();
  }
});
