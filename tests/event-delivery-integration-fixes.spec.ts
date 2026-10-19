import { expect, test } from '@playwright/test';
import { streamEventObject } from '../src/lib/events/object-delivery';
const eventId = '00000000-0000-4000-8000-00000000e098';
const path = `${eventId}/video.mp4`;
const configuration = () => ({ origin: 'https://unit.invalid', key: 'unit-only-not-a-real-key' });
function privacy(headers: Record<string, string>) {
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers['cdn-cache-control']).toBe('no-store');
  expect(headers['vercel-cdn-cache-control']).toBe('no-store');
  expect(headers.location).toBeUndefined();
}
test('middleware preserves document authentication and lets anonymous video validation run without sign-in redirects', async ({ request }) => {
  const document = await request.post('/api/events/material', { form: { material_id: eventId }, headers: { origin: 'http://127.0.0.1:4322' }, maxRedirects: 0 });
  expect(document.status()).toBe(401); privacy(document.headers());
  // No uploaded fixture is needed: a forbidden clip must be rejected by the video route itself.
  const video = await request.get('/api/events/video?event_slug=agentic-commerce-lisbon-2026&clip=not-an-allowed-video', { maxRedirects: 0 });
  expect(video.status()).toBe(404); privacy(video.headers());
  const preflight = await request.get('/api/events/material', { maxRedirects: 0 });
  expect([401, 404, 503]).toContain(preflight.status()); privacy(preflight.headers());
});
test('missing 416 headers and inconsistent out-of-bounds 206 metadata use HEAD, not whole-body retry', async () => {
  for (const status of [416, 206]) {
    const calls: string[] = [];
    const fetcher = (async (url, init) => {
      calls.push(init?.method ?? 'GET');
      expect(String(url)).toBe(`https://unit.invalid/storage/v1/object/authenticated/event-materials/${path}`);
      expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
      const headers = new Headers(init?.headers); expect(headers.get('cookie')).toBeNull();
      if (init?.method === 'HEAD') {
        expect(headers.get('range')).toBeNull();
        return new Response(null, { headers: { 'content-length': '8' } });
      }
      expect(headers.get('range')).toBe('bytes=20-');
      return new Response('private upstream fixture error', { status, headers: status === 206 ? { 'content-range': 'bytes 20-7/8' } : {} });
    }) as typeof fetch;
    const response = await streamEventObject({ request: new Request('https://app.invalid', { headers: { range: 'bytes=20-' } }), eventId, path, video: true }, { configuration, fetcher });
    expect(response.status).toBe(416); expect(response.headers.get('content-range')).toBe('bytes */8');
    expect(await response.text()).toBe(''); expect(calls).toEqual(['GET', 'HEAD']);
    privacy(Object.fromEntries(response.headers));
  }
});
test('range fallback cannot turn missing, denied or contradictory size metadata into a successful response', async () => {
  for (const [status, size] of [[200, '8'], [200, 'not-a-size'], [200, '-1'], [403, '8']] as const) {
    const fetcher = (async (_url, init) => init?.method === 'HEAD'
      ? new Response(null, { status, headers: { 'content-length': size } })
      : new Response('private upstream fixture error', { status: 416 })) as typeof fetch;
    const response = await streamEventObject({ request: new Request('https://app.invalid', { headers: { range: 'bytes=0-1' } }), eventId, path, video: true }, { configuration, fetcher });
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('private upstream fixture error');
    privacy(Object.fromEntries(response.headers));
  }
});
