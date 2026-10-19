import { Buffer } from 'node:buffer';
import { expect, test, type BrowserContext } from '@playwright/test';
import { getLisbonEventContextById, getLisbonEventContextBySlug, matchesLisbonEventContext } from '../src/lib/events/lisbon-context';
import { getEventCatalogueSelections, getCatalogueJourneyContext } from '../src/lib/event-catalogue';
import { getEventIdentity } from '../src/lib/events/inretail-2026';
import { GET, publicVideoResponse } from '../src/pages/api/events/video';
import { createLocalAdminClient, createLocalMember, type LocalMember } from './helpers/local-supabase';
import { assertPublicVideo } from './helpers/public-event-video';

const staging = { id: '00000000-0000-4000-8000-00000000e001', slug: 'commonwork-lisbon-preview' };
const production = { id: 'c3118b54-7568-4ef6-9159-124dc86e7971', slug: 'agentic-commerce-lisbon-2026' };
const products = ['geoffy', 'admultify', 'rierino-commerce-platform', 'be-cited'];
const clips = { geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4', begen: 'AdMultify by Begen Video Teaser.mp4', rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4' };
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
function videoContext(query: string): VideoContext {
  return { url: new URL(`https://example.test/api/events/video?${query}`), locals: {} } as unknown as VideoContext;
}

test('each configured event can sign all three public clips without an attendee identity', async () => {
  for (const event of [staging, production]) {
    for (const [clip, filename] of Object.entries(clips)) {
      const url = videoContext(new URLSearchParams({ event_slug: event.slug, clip }).toString()).url;
      const path = `/object/sign/event-materials/${event.id}/videos/${encodeURIComponent(filename)}`;
      const fetcher = (async (input) => {
        expect(String(input)).toBe(`https://unit.invalid/storage/v1${path}`);
        return Response.json({ signedURL: `${path}?token=unit-fixture` });
      }) as typeof fetch;
      const response = await publicVideoResponse(url, { configuration: () => ({ origin: 'https://unit.invalid', key: 'sb_secret_unit_fixture_only' }), fetcher });
      expect(response.status).toBe(307);
      expect(decodeURIComponent(new URL(response.headers.get('location')!).pathname)).toBe(`/storage/v1/object/sign/event-materials/${event.id}/videos/${filename}`);
    }
  }
});

test('production video request rejects unknown clips and path injection before storage', async () => {
  for (const clip of ['becited', '../other.mp4', 'toString', 'presentation.pdf', 'https://example.test/video.mp4']) {
    const response = await GET(videoContext(new URLSearchParams({ event_slug: production.slug, clip }).toString()));
    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBeNull();
  }
  const unknown = await GET(videoContext('event_slug=agentic-commerce-lisbon-2026-other&clip=geoffy'));
  expect(unknown.status).toBe(404);
  expect(unknown.headers.get('Location')).toBeNull();
});

test.describe('production-pair public videos against local Supabase only', () => {
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

  test('anonymous, owner, unapproved, approved and revoked visitors receive the exact public clip bytes', async ({ browser }) => {
    if (!admin || !manager || !visitor) throw new Error('Local fixtures were not created.');
    const contexts: BrowserContext[] = [];
    try {
      const anonymous = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' }); contexts.push(anonymous);
      const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' }); contexts.push(owner);
      const attendee = await browser.newContext({ baseURL: 'http://127.0.0.1:4322' }); contexts.push(attendee);
      await owner.addCookies(manager.cookies.map(({ name, value, url }) => ({ name, value, url })));
      await attendee.addCookies(visitor.cookies.map(({ name, value, url }) => ({ name, value, url })));
      const allowed = async (client: BrowserContext) => {
        for (const [clip, filename] of Object.entries(clips)) {
          await assertPublicVideo(client.request, production.slug, production.id, clip, filename, Buffer.from(fixtureContent(filename)));
        }
      };
      await allowed(anonymous); await allowed(owner); await allowed(attendee);
      expect((await admin.from('event_attendees').insert({ event_id: production.id, profile_id: visitor.id, status: 'approved', decided_at: new Date().toISOString(), decided_by: manager.id })).error).toBeNull();
      await allowed(attendee);
      for (const filename of Object.values(clips)) {
        const direct = await visitor.client.storage.from('event-materials').download(`${production.id}/videos/${filename}`);
        expect(direct.error).toBeTruthy(); expect(direct.data).toBeNull();
        const signed = await visitor.client.storage.from('event-materials').createSignedUrl(`${production.id}/videos/${filename}`, 300);
        expect(signed.error).toBeTruthy(); expect(signed.data).toBeNull();
      }
      expect((await admin.from('event_attendees').update({ status: 'revoked', decided_at: new Date().toISOString() }).eq('event_id', production.id).eq('profile_id', visitor.id)).error).toBeNull();
      await allowed(attendee); await allowed(anonymous);
    } finally { await Promise.all(contexts.map((context) => context.close())); }
  });
});
