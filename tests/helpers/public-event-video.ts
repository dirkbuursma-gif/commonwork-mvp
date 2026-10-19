import { execFileSync } from 'node:child_process';
import { expect, request, type APIRequestContext } from '@playwright/test';

function localStorageOrigin(): URL {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { cwd: process.cwd(), encoding: 'utf8' });
  const line = output.split(/\r?\n/).find((line) => line.startsWith('API_URL='));
  if (!line) throw new Error('Local Supabase API URL is missing.');
  const value = line.slice('API_URL='.length).trim();
  const apiUrl: unknown = value.startsWith('"') ? JSON.parse(value) : value;
  if (typeof apiUrl !== 'string') throw new Error('Invalid local Supabase API URL.');
  const local = new URL(apiUrl);
  if (local.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(local.hostname) ||
      local.username || local.password || local.pathname !== '/' || local.search || local.hash) {
    throw new Error('Video fixture requests must use loopback-only local Supabase.');
  }
  return local;
}

export async function assertPublicVideo(client: APIRequestContext, slug: string, eventId: string, clip: string, filename: string, bytes: Uint8Array, ranges = false): Promise<void> {
  const response = await client.get('/api/events/video?' + new URLSearchParams({ event_slug: slug, clip }), { maxRedirects: 0 });
  expect(response.status(), 'Public video must sign successfully, not return an auth or configuration error').toBe(307);
  const headers = response.headers();
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers['cdn-cache-control']).toBe('no-store');
  expect(headers['vercel-cdn-cache-control']).toBe('no-store');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers.location).toBeTruthy();
  const target = new URL(headers.location);
  const local = localStorageOrigin();
  expect(target.origin).toBe(local.origin);
  expect(target.username).toBe(''); expect(target.password).toBe('');
  expect(target.hash).toBe('');
  expect(decodeURIComponent(target.pathname)).toBe(`/storage/v1/object/sign/event-materials/${eventId}/videos/${filename}`);
  expect(target.searchParams.get('token')).toBeTruthy();
  expect(JSON.stringify(headers)).not.toMatch(/sb_secret_|service_role/);
  const anonymous = await request.newContext();
  try {
    const video = await anonymous.get(target.href, { maxRedirects: 0 });
    expect(video.status()).toBe(200);
    expect(video.headers()['content-type']).toContain('video/mp4');
    expect([...await video.body()]).toEqual([...bytes]);
    if (ranges) {
      const partial = await anonymous.get(target.href, { headers: { range: 'bytes=2-4' }, maxRedirects: 0 });
      expect(partial.status()).toBe(206);
      expect(partial.headers()['content-range']).toBe(`bytes 2-4/${bytes.length}`);
      expect([...await partial.body()]).toEqual([...bytes.slice(2, 5)]);
      const invalid = await anonymous.get(target.href, { headers: { range: `bytes=${bytes.length + 20}-` }, maxRedirects: 0 });
      expect(invalid.status()).toBe(416);
    }
  } finally { await anonymous.dispose(); }
}
