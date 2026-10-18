import { expect, test } from '@playwright/test';
import { GET } from '../src/pages/api/events/video';

type VideoContext = Parameters<typeof GET>[0];
function context(query: string, user?: Record<string, unknown>): VideoContext {
  return { url: new URL(`https://example.test/api/events/video?${query}`), locals: { user } } as unknown as VideoContext;
}

test('video endpoint requires an authenticated member before storage access', async () => {
  const response = await GET(context('event_slug=commonwork-lisbon-preview&clip=geoffy'));
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Location')).toBeNull();
});

test('local preview identity cannot receive signed video URLs', async () => {
  const response = await GET(context('event_slug=commonwork-lisbon-preview&clip=begen', { id: 'local-preview', isLocalTestUser: true }));
  expect(response.status).toBe(403);
  expect(response.headers.get('Location')).toBeNull();
});

test('video endpoint rejects other events before storage access', async () => {
  const response = await GET(context('event_slug=other-event&clip=geoffy', { id: 'boundary-test' }));
  expect(response.status).toBe(404);
  expect(response.headers.get('Location')).toBeNull();
});

test('video endpoint rejects unknown clips and object-path injection', async () => {
  for (const clip of ['rierino', 'becited', '../other.mp4', 'toString', 'https://example.test/video.mp4']) {
    const query = new URLSearchParams({ event_slug: 'commonwork-lisbon-preview', clip });
    const response = await GET(context(query.toString(), { id: 'boundary-test' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBeNull();
  }
});
