import { expect, test } from '@playwright/test';
import { eventSignupConfig, eventSignupAllowed, encodeEventPending, decodeEventPending, requestEventEmailCode, EVENT_PENDING_SECONDS } from '../src/lib/event-email-code-auth';

const id = '00000000-0000-4000-8000-000000000090';
const event = { id, slug: 'local-event', is_published: true };
const secret = 'local-test-signing-key-'.repeat(3);
const environment = { COMMONWORK_EVENT_SIGNUP_ENABLED: 'true', COMMONWORK_EVENT_SIGNUP_SIGNING_SECRET: secret, COMMONWORK_EVENT_SIGNUP_TURNSTILE_SITE_KEY: 'local-test-site-key', COMMONWORK_EVENT_SIGNUP_EVENT_IDS: id };

test('registration is default-off, configuration-complete, event-allowlisted and blocked on Production', () => {
  expect(eventSignupConfig({})).toBeNull();
  expect(eventSignupConfig({ ...environment, COMMONWORK_EVENT_SIGNUP_ENABLED: 'false' })).toBeNull();
  expect(eventSignupConfig({ ...environment, VERCEL_ENV: 'production' })).toBeNull();
  expect(eventSignupConfig({ ...environment, COMMONWORK_EVENT_SIGNUP_SIGNING_SECRET: 'short' })).toBeNull();
  expect(eventSignupConfig({ ...environment, COMMONWORK_EVENT_SIGNUP_EVENT_IDS: '' })).toBeNull();
  expect(eventSignupConfig({ ...environment, COMMONWORK_EVENT_SIGNUP_EVENT_IDS: 'not-a-uuid' })).toBeNull();
  expect(eventSignupConfig({ ...environment, COMMONWORK_EVENT_SIGNUP_TURNSTILE_SITE_KEY: '' })).toBeNull();
  const config = eventSignupConfig(environment);
  expect(eventSignupAllowed(config, event)).toBe(true);
  expect(eventSignupAllowed(config, { ...event, is_published: false })).toBe(false);
  expect(eventSignupAllowed(config, { ...event, id: '00000000-0000-4000-8000-000000000091' })).toBe(false);
  expect(eventSignupAllowed(config, { ...event, slug: 'manage' })).toBe(false);
});

test('pending challenge is signed, event-bound, expiring and does not trust client metadata', () => {
  const now = Date.now();
  const pending = { email: 'attendee@example.test', eventId: id, slug: event.slug, sentAt: now };
  const encoded = encodeEventPending(pending, secret);
  expect(decodeEventPending(encoded, secret, id, event.slug, now)).toEqual(pending);
  expect(decodeEventPending(encoded, 'another-test-key', id, event.slug, now)).toBeNull();
  expect(decodeEventPending(encoded, secret, 'another-event', event.slug, now)).toBeNull();
  expect(decodeEventPending(encoded, secret, id, 'another-event', now)).toBeNull();
  expect(decodeEventPending(encoded, secret, id, event.slug, now + EVENT_PENDING_SECONDS * 1000)).toBeNull();
  expect(decodeEventPending(encoded, secret, id, event.slug, now - 1)).toBeNull();
  const [body, signature] = encoded.split('.');
  const forged = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'));
  forged.email = 'another@example.test'; forged.workspace_access = true;
  const tampered = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;
  expect(decodeEventPending(tampered, secret, id, event.slug, now)).toBeNull();
  expect(decodeEventPending('not-a-challenge', secret, id, event.slug, now)).toBeNull();
});

test('only enabled published-event requests with CAPTCHA input reach the account-creation API', async () => {
  const calls: unknown[] = [];
  const client = { auth: { signInWithOtp: async (input: unknown) => { calls.push(input); return { error: null }; } } };
  const config = eventSignupConfig(environment);
  expect(await requestEventEmailCode(client, null, event, 'a@example.test', 'captcha')).toBe('disabled');
  expect(await requestEventEmailCode(client, config, { ...event, is_published: false }, 'a@example.test', 'captcha')).toBe('disabled');
  expect(await requestEventEmailCode(client, config, event, 'a@example.test', '')).toBe('invalid');
  expect(await requestEventEmailCode(client, config, event, 'bad-address', 'captcha')).toBe('invalid');
  expect(calls).toEqual([]);
  expect(await requestEventEmailCode(client, config, event, ' A@Example.Test ', 'captcha')).toBe('sent');
  expect(calls).toEqual([{ email: 'a@example.test', options: { shouldCreateUser: true, captchaToken: 'captcha' } }]);
  const rateLimited = { auth: { signInWithOtp: async () => ({ error: { status: 429 } }) } };
  expect(await requestEventEmailCode(rateLimited, config, event, 'a@example.test', 'captcha')).toBe('rate_limited');
  const hiddenRejection = { auth: { signInWithOtp: async () => ({ error: { status: 422 } }) } };
  expect(await requestEventEmailCode(hiddenRejection, config, event, 'a@example.test', 'captcha')).toBe('sent');
});

test('the new HTTP route remains closed without registration configuration', async ({ page }) => {
  for (const method of ['GET', 'POST']) {
    const result = method === 'GET'
      ? await page.request.get('/events/local-event/join', { maxRedirects: 0 })
      : await page.request.post('/events/local-event/join', { headers: { origin: 'http://127.0.0.1:4322' }, form: { action: 'send', email: 'not-sent@example.test', event_account_notice: 'on', 'cf-turnstile-response': 'not-a-real-token' }, maxRedirects: 0 });
    expect(result.status()).toBe(404);
    expect(result.headers()['cache-control']).toBe('private, no-store');
    expect(result.headers()['set-cookie'] ?? '').not.toContain('cw_event_signup_pending');
  }
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Email me a code', exact: true })).toBeVisible();
});
