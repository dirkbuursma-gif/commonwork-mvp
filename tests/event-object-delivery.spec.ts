import { expect, test } from '@playwright/test';
import { streamEventObject, validObjectPath } from '../src/lib/events/object-delivery';
import { POST as material } from '../src/pages/api/events/material';
const eventId = '00000000-0000-4000-8000-00000000e099';
const path = `${eventId}/videos/a.mp4`;
const configuration = () => ({ origin: 'https://unit.invalid', key: 'unit-only-not-a-real-key' });
function request(range?: string) { return new Request('https://app.invalid/api/events/video', { headers: range ? { range } : {} }); }
function privateResponse(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  for (const key of ['CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) expect(response.headers.get(key)).toBe('no-store');
  for (const key of ['location', 'authorization', 'apikey', 'etag', 'set-cookie']) expect(response.headers.get(key)).toBeNull();
}
test('denied material requests and traversal never fetch privileged objects', async () => {
  let fetches = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { fetches++; throw new Error('Must not fetch'); }) as typeof fetch;
  try {
    const context = (user?: Record<string, unknown>, origin = 'https://app.invalid') => ({
      locals: { user }, request: new Request('https://app.invalid/api/events/material', { method: 'POST', headers: { origin }, body: new URLSearchParams({ material_id: eventId }) }),
    }) as unknown as Parameters<typeof material>[0];
    for (const [ctx, status] of [[context(), 401], [context({ isLocalTestUser: true }), 403], [context({ id: eventId }, 'https://evil.invalid'), 403]] as const) {
      const response = await material(ctx); expect(response.status).toBe(status); privateResponse(response);
    }
    for (const value of [`${eventId}/../x`, `${eventId}/%2e%2e/x`, `${eventId}//x`, `${eventId}/a\\b`, `https://evil.invalid/x`, `${eventId}/x\r\nLocation: evil`, `${eventId}/./x`]) {
      expect(validObjectPath(eventId, value)).toBe(false);
      const response = await streamEventObject({ request: request(), eventId, path: value }, { configuration });
      expect(response.status).toBe(400); privateResponse(response);
    }
    expect(fetches).toBe(0);
  } finally { globalThis.fetch = original; }
});
test('large object bodies are streamed and only safe headers cross the boundary', async () => {
  let sourceCancelled = false;
  const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { sourceCancelled = true; } });
  let called = false;
  const fetcher = (async (url, init) => {
    called = true;
    expect(String(url)).toContain('/storage/v1/object/authenticated/event-materials/');
    expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers); expect(headers.get('cookie')).toBeNull(); expect(headers.get('range')).toBeNull();
    return new Response(source, { headers: { 'content-type': 'text/html', location: 'https://internal.invalid/?token=secret', 'set-cookie': 'internal=secret', etag: 'secret' } });
  }) as typeof fetch;
  const response = await streamEventObject({ request: request(), eventId, path: `${eventId}/a"b.pdf` }, { configuration, fetcher });
  expect(called).toBe(true); expect(response.body).toBe(source); privateResponse(response);
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="a_b.pdf"');
  expect(JSON.stringify([...response.headers])).not.toMatch(/unit-only|internal\.invalid|token=|secret/);
  await response.body?.cancel(); expect(sourceCancelled).toBe(true);
});
test('single ranges, suffixes, 416 and invalid upstream ranges are handled without token forwarding', async () => {
  for (const [range, contentRange] of [['bytes=2-5', 'bytes 2-5/10'], ['bytes=2-', 'bytes 2-9/10'], ['bytes=-3', 'bytes 7-9/10']]) {
    const fetcher = (async (_url, init) => {
      expect(new Headers(init?.headers).get('range')).toBe(range);
      return new Response('x', { status: 206, headers: { 'content-range': contentRange } });
    }) as typeof fetch;
    const response = await streamEventObject({ request: request(range), eventId, path, video: true }, { configuration, fetcher });
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-type')).toBe('video/mp4'); privateResponse(response); await response.body?.cancel();
  }
  let fetched = false;
  const never = (async () => { fetched = true; throw new Error(); }) as typeof fetch;
  for (const range of ['bytes=0-1,3-4', 'bytes=8-2', 'bytes=-0', 'items=1-3', 'bytes=9007199254740993-']) {
    const response = await streamEventObject({ request: request(range), eventId, path }, { configuration, fetcher: never });
    expect(response.status).toBe(416); privateResponse(response);
  }
  expect(fetched).toBe(false);
  for (const [status, range, expected] of [[416, 'bytes */10', 416], [206, 'bytes 1-2/10', 502]] as const) {
    const fetcher = (async () => new Response('internal error', { status, headers: { 'content-range': range } })) as typeof fetch;
    const response = await streamEventObject({ request: request('bytes=20-'), eventId, path }, { configuration, fetcher });
    expect(response.status).toBe(expected); privateResponse(response); expect(await response.text()).not.toContain('internal error');
  }
});
test('missing configuration, redirects, upstream auth errors and aborts fail closed', async () => {
  const missing = await streamEventObject({ request: request(), eventId, path }, { configuration: () => { throw new Error('private key missing'); } });
  expect(missing.status).toBe(503); privateResponse(missing); expect(await missing.text()).not.toContain('private key');
  for (const status of [301, 302, 307, 401, 403, 404, 500]) {
    const fetcher = (async () => new Response('private upstream detail', { status, headers: { location: 'https://secret.invalid' } })) as typeof fetch;
    const response = await streamEventObject({ request: request(), eventId, path }, { configuration, fetcher });
    expect(response.status).toBe(503); privateResponse(response); expect(await response.text()).not.toContain('upstream detail');
  }
  const controller = new AbortController(); controller.abort();
  const fetcher = (async (_url, init) => { expect(init?.signal?.aborted).toBe(true); throw new DOMException('Aborted', 'AbortError'); }) as typeof fetch;
  const response = await streamEventObject({ request: new Request('https://app.invalid', { signal: controller.signal }), eventId, path }, { configuration, fetcher });
  expect(response.status).toBe(503); privateResponse(response);
});
