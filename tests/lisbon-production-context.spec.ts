import { Buffer } from 'node:buffer';
import { expect, test, type BrowserContext } from '@playwright/test';
import { getLisbonEventContextById, getLisbonEventContextBySlug, matchesLisbonEventContext } from '../src/lib/events/lisbon-context';
import { getEventCatalogueSelections, getCatalogueJourneyContext } from '../src/lib/event-catalogue';
import { getEventIdentity } from '../src/lib/events/inretail-2026';
import { GET } from '../src/pages/api/events/video';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';

const staging = { id: '00000000-0000-4000-8000-00000000e001', slug: 'commonwork-lisbon-preview' };
const production = { id: 'c3118b54-7568-4ef6-9159-124dc86e7971', slug: 'agentic-commerce-lisbon-2026' };
const products = ['geoffy', 'admultify', 'rierino-commerce-platform', 'be-cited'];
const clips = { geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4', begen: 'AdMultify by Begen Video Teaser.mp4' };
const fixtureContent = (filename: string) => `local-only ${production.id} ${filename}`;
test.setTimeout(60_000);

for (const event of [staging, production]) {
  test(`configured event preserves its own branding and catalogue context: ${event.slug}`, () => {
    expect(getLisbonEventContextById(event.id)?.eventSlug).toBe(event.slug);
    expect(getLisbonEventContextBySlug(event.slug)?.eventId).toBe(event.id);
    expect(matchesLisbonEventContext(event.id, event.slug)).toBe(true);
    expect(getEventIdentity(event.id)?.sessionTitleEn).toBe('Agentic Commerce: When AI Enters the Shopping Journey');
    const selections = getEventCatalogueSelections(event.id);
    expect(selections.map((selection) => selection.productSlug)).toEqual(products);
    for (const selection of selections) {
      expect(selection.eventId).toBe(event.id);
      expect(selection.eventSlug).toBe(event.slug);
      expect(getCatalogueJourneyContext(event.slug, selection.productSlug)).toEqual(selection);
    }
  });
}

test('crossed, missing and prototype-like identities cannot acquire an event context', () => {
  expect(matchesLisbonEventContext(production.id, staging.slug)).toBe(false);
  expect(matchesLisbonEventContext(staging.id, production.slug)).toBe(false);
  expect(matchesLisbonEventContext(undefined, undefined)).toBe(false);
  expect(matchesLisbonEventContext(null, null)).toBe(false);
  for (const input of [undefined, null, '', 'unrelated-event', '__proto__', 'toString']) {
    expect(getLisbonEventContextById(input)).toBeNull();
    expect(getLisbonEventContextBySlug(input)).toBeNull();
  }
  expect(getEventIdentity('unrelated-event')).toBeNull();
  expect(getCatalogueJourneyContext(production.slug, 'adobe-commerce')).toBeNull();
});

type VideoContext = Parameters<typeof GET>[0];
function videoContext(query: string, user?: Record<string, unknown>): VideoContext {
  return { url: new URL(`https://example.test/api/events/video?${query}`), locals: { user } } as unknown as VideoContext;
}

test('production identity does not bypass authentication or preview-identity denial', async () => {
  const query = new URLSearchParams({ event_slug: production.slug, clip: 'geoffy' }).toString();
  const anonymous = await GET(videoContext(query));
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers.get('Location')).toBeNull();
  const preview = await GET(videoContext(query, { id: 'local-preview', isLocalTestUser: true }));
  expect(preview.status).toBe(403);
  expect(preview.headers.get('Location')).toBeNull();
});

test('production video request rejects unknown clips and path injection before storage', async () => {
  for (const clip of ['rierino', 'becited', '../other.mp4', 'toString', 'https://example.test/video.mp4']) {
    const query = new URLSearchParams({ event_slug: production.slug, clip }).toString();
    const response = await GET(videoContext(query, { id: 'boundary-test' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBeNull();
  }
  const unknown = await GET(videoContext('event_slug=agentic-commerce-lisbon-2026-other&clip=geoffy', { id: 'boundary-test' }));
  expect(unknown.status).toBe(404);
  expect(unknown.headers.get('Location')).toBeNull();
});

test.describe('production-pair authorization against local Supabase only', () => {
  let admin: ReturnType<typeof createLocalAdminClient> | undefined;
  let manager: LocalMember | undefined;
  let visitor: LocalMember | undefined;
  let eventCreated = false;
  const uploadedPaths: string[] = [];

  test.beforeAll(async () => {
    admin = createLocalAdminClient();
    manager = await createLocalMember('Local production-pair manager');
    visitor = await createLocalMember('Local production-pair visitor');
    const { error: profilesError } = await admin.from('profiles').insert([
      { id: manager.id, display_name: 'Local production-pair manager' },
      { id: visitor.id, display_name: 'Local production-pair visitor' },
    ]);
    if (profilesError) throw profilesError;
    const { error: eventError } = await admin.from('events').insert({
      id: production.id, slug: production.slug, title: 'Local production identity authorization fixture',
      manager_profile_id: manager.id, is_published: true,
    });
    if (eventError) throw eventError;
    eventCreated = true;
    for (const filename of Object.values(clips)) {
      const path = `${production.id}/videos/${filename}`;
      // Distinct synthetic bytes prove both event and clip identity, not real playback.
      const { error } = await admin.storage.from('event-materials').upload(path, Buffer.from(fixtureContent(filename)), { contentType: 'video/mp4' });
      if (error) throw error;
      uploadedPaths.push(path);
    }
  });

  test.afterAll(async () => {
    if (admin && eventCreated && manager) {
      if (uploadedPaths.length) await admin.storage.from('event-materials').remove(uploadedPaths);
      await admin.from('events').delete().eq('id', production.id).eq('manager_profile_id', manager.id);
    }
    await Promise.all([manager?.remove(), visitor?.remove()]);
  });

  test('owner and approved attendee receive only production clip bytes; unapproved and revoked attendees are denied', async ({ browser }) => {
    if (!admin || !manager || !visitor) throw new Error('Local authorization fixtures were not created.');
    let managerContext: BrowserContext | undefined;
    let visitorContext: BrowserContext | undefined;
    try {
      managerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' });
      visitorContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' });
      await managerContext.addCookies(manager.cookies.map(({ name, value, url }) => ({ name, value, url })));
      await visitorContext.addCookies(visitor.cookies.map(({ name, value, url }) => ({ name, value, url })));
      const requestPath = (clip: string) => '/api/events/video?' + new URLSearchParams({ event_slug: production.slug, clip }).toString();
      const assertAllowed = async (client: BrowserContext, clip: string, filename: string) => {
        const response = await client.request.get(requestPath(clip), { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect(response.headers()['cache-control']).toBe('private, no-store');
        expect(response.headers()['cdn-cache-control']).toBe('no-store');
        expect(response.headers()['vercel-cdn-cache-control']).toBe('no-store');
        expect(response.headers()['referrer-policy']).toBe('no-referrer');
        expect(response.headers()['content-type']).toBe('video/mp4');
        expect(response.headers().location).toBeUndefined();
        expect(JSON.stringify(response.headers())).not.toMatch(/storage\/v1|token=|sb_secret_/);
        expect(await response.text()).toBe(fixtureContent(filename));
      };
      for (const [clip, filename] of Object.entries(clips)) {
        await assertAllowed(managerContext, clip, filename);
        const denied = await visitorContext.request.get(requestPath(clip), { maxRedirects: 0 });
        expect(denied.status()).toBe(403);
        expect(denied.headers().location).toBeUndefined();
        expect(await denied.text()).not.toContain(fixtureContent(filename));
      }
      const { error: approveError } = await admin.from('event_attendees').insert({
        event_id: production.id, profile_id: visitor.id, status: 'approved',
        decided_at: new Date().toISOString(), decided_by: manager.id,
      });
      expect(approveError).toBeNull();
      for (const [clip, filename] of Object.entries(clips)) {
        await assertAllowed(visitorContext, clip, filename);
        await assertAllowed(visitorContext, clip, filename);
        const direct = await visitor.client.storage.from('event-materials').download(`${production.id}/videos/${filename}`);
        expect(direct.error).toBeTruthy(); expect(direct.data).toBeNull();
        const signed = await visitor.client.storage.from('event-materials').createSignedUrl(`${production.id}/videos/${filename}`, 300);
        expect(signed.error).toBeTruthy(); expect(signed.data).toBeNull();
      }
      const { error: revokeError } = await admin.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString() })
        .eq('event_id', production.id).eq('profile_id', visitor.id);
      expect(revokeError).toBeNull();
      for (const [clip, filename] of Object.entries(clips)) {
        const denied = await visitorContext.request.get(requestPath(clip), { maxRedirects: 0 });
        expect(denied.status()).toBe(403);
        expect(denied.headers().location).toBeUndefined();
        expect(denied.headers()['cache-control']).toBe('private, no-store');
        expect(await denied.text()).not.toContain(fixtureContent(filename));
      }
    } finally {
      await Promise.all([managerContext?.close(), visitorContext?.close()]);
    }
  });
});
