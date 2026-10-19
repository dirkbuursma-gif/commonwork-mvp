import { expect, test } from '@playwright/test';
import { publicVideoResponse } from '../src/pages/api/events/video';

const origin = 'https://unit.invalid';
const eventId = '00000000-0000-4000-8000-00000000e001';
const configuration = () => ({ origin, key: 'sb_secret_unit_fixture_only' });
const filenames = {
  geoffy: 'Geoffy-in-60-seconds-EN-1080p.mp4',
  begen: 'AdMultify by Begen Video Teaser.mp4',
  rierino: 'Rierino_Agentic_Commerce_InRetail_2026_music.mp4',
};
function url(clip: string, event = 'commonwork-lisbon-preview') {
  return new URL(`https://app.invalid/api/events/video?${new URLSearchParams({ event_slug: event, clip })}`);
}

test('all three public clips receive five-minute redirects without a user or attendee lookup', async () => {
  for (const [clip, filename] of Object.entries(filenames)) {
    const path = `/object/sign/event-materials/${eventId}/videos/${encodeURIComponent(filename)}`;
    let calls = 0;
    const fetcher = (async (input, init) => {
      calls++;
      expect(String(input)).toBe(`${origin}/storage/v1${path}`);
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ expiresIn: 300 }));
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe(configuration().key);
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('cookie')).toBeNull();
      return Response.json({ signedURL: `${path}?token=unit-fixture` });
    }) as typeof fetch;
    const response = await publicVideoResponse(url(clip), { configuration, fetcher });
    expect(calls).toBe(1);
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe(origin);
    expect(decodeURIComponent(location.pathname)).toBe(`/storage/v1/object/sign/event-materials/${eventId}/videos/${filename}`);
    expect(location.searchParams.get('token')).toBe('unit-fixture');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(configuration().key);
  }
});

test('unknown events, unknown clips, PDF and path injection never reach storage', async () => {
  const configuration = () => { throw new Error('Must not read credentials'); };
  for (const clip of ['becited', '../other.mp4', 'toString', 'constructor', 'presentation.pdf', 'https://evil.invalid/video.mp4', '']) {
    const response = await publicVideoResponse(url(clip), { configuration });
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  }
  expect((await publicVideoResponse(url('geoffy', 'other-event'), { configuration })).status).toBe(404);
});

test('missing or mismatched server configuration fails closed without a link', async () => {
  const response = await publicVideoResponse(url('geoffy'), { configuration: () => { throw new Error('private diagnostic'); } });
  expect(response.status).toBe(503);
  expect(response.headers.get('location')).toBeNull();
  expect(await response.text()).not.toContain('private diagnostic');
});

test('upstream denial and untrusted signing responses cannot redirect to arbitrary objects or hosts', async () => {
  const path = `/object/sign/event-materials/${eventId}/videos/${filenames.geoffy}`;
  for (const signedURL of [undefined, 'https://evil.invalid/video?token=x', `${path.replace(filenames.geoffy, 'presentation.pdf')}?token=x`, `${path}`, `${path}?token=x#fragment`]) {
    const fetcher = (async () => Response.json({ signedURL })) as typeof fetch;
    const response = await publicVideoResponse(url('geoffy'), { configuration, fetcher });
    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
  }
  const fetcher = (async () => new Response('private upstream error', { status: 403 })) as typeof fetch;
  const denied = await publicVideoResponse(url('geoffy'), { configuration, fetcher });
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain('private upstream error');
});

test('legacy server credentials stay in upstream headers, never the browser redirect', async () => {
  const key = 'unit-legacy-server-credential';
  const fetcher = (async (_input, init) => {
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${key}`);
    return Response.json({ signedURL: `/object/sign/event-materials/${eventId}/videos/${filenames.geoffy}?token=unit-fixture` });
  }) as typeof fetch;
  const response = await publicVideoResponse(url('geoffy'), { configuration: () => ({ origin, key }), fetcher });
  expect(response.status).toBe(307);
  expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(key);
});
