import { expect, test } from '@playwright/test';
import { eventCodePageRoute, eventCodeAccessEnabled, readEventAccessForm, resolveEventResourceAccess } from '../src/lib/events/event-code-server';

test('code route exemptions exclude management and unrelated workspace features', () => {
  for (const path of ['/events/lisbon/access', '/events/lisbon/presentation', '/events/lisbon/guide', '/events/lisbon/guide/print']) expect(eventCodePageRoute(path, 'GET')?.slug).toBe('lisbon');
  expect(eventCodePageRoute('/events/lisbon/access', 'POST')).not.toBeNull();
  for (const path of ['/events/manage', '/events/manage/presentation', '/events/lisbon/manage', '/events/lisbon/join', '/account', '/intelligence', '/events/lisbon/guide/print/extra']) expect(eventCodePageRoute(path, 'GET')).toBeNull();
  expect(eventCodePageRoute('/events/lisbon/presentation', 'POST')).toBeNull();
});

test('code form reader is bounded and accepts only ordinary URL-encoded form bodies', async () => {
  const form = await readEventAccessForm(new Request('https://app.invalid/events/lisbon/access', { method: 'POST', body: new URLSearchParams({ action: 'unlock', code: 'synthetic-test-code' }) }));
  expect(form.get('code')).toBe('synthetic-test-code');
  await expect(readEventAccessForm(new Request('https://app.invalid', { method: 'POST', body: 'x'.repeat(4097), headers: { 'content-type': 'application/x-www-form-urlencoded' } }))).rejects.toThrow('Invalid event form.');
  await expect(readEventAccessForm(new Request('https://app.invalid', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))).rejects.toThrow('Invalid event form.');
});

test('disabled code mode does not admit an anonymous user or a local preview identity', async () => {
  const previous = process.env.COMMONWORK_EVENT_CODE_ACCESS_ENABLED;
  delete process.env.COMMONWORK_EVENT_CODE_ACCESS_ENABLED;
  try {
    expect(eventCodeAccessEnabled()).toBe(false);
    const ctx = { locals: {}, request: new Request('https://app.invalid'), cookies: { get: () => undefined } } as unknown as Parameters<typeof resolveEventResourceAccess>[0];
    expect(await resolveEventResourceAccess(ctx, 'lisbon')).toEqual({ status: 'unauthorized' });
    const preview = { ...ctx, locals: { user: { id: 'fixture', email: 'fixture@example.test', user_metadata: {}, isLocalTestUser: true } } };
    expect(await resolveEventResourceAccess(preview, 'lisbon')).toEqual({ status: 'forbidden' });
  } finally { if (previous === undefined) delete process.env.COMMONWORK_EVENT_CODE_ACCESS_ENABLED; else process.env.COMMONWORK_EVENT_CODE_ACCESS_ENABLED = previous; }
});
