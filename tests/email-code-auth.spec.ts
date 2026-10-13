import { expect, test } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import {
  decodePendingSignIn,
  encodePendingSignIn,
  normalizeCode,
  normalizeEmail,
  readPendingSignIn,
  requestEmailCode,
  resendSecondsRemaining,
  RESEND_COOLDOWN_SECONDS,
  signInPath,
  verifyEmailCode,
  writePendingSignIn,
  type EmailCodeAuthClient,
} from '../src/lib/email-code-auth';
import { validateIntelligenceReturnPath } from '../src/lib/auth-return-path';
import { logPilotFailure } from '../src/lib/observability';

const SECRET_CODE = '482913';

function fakeClient(result: { error: unknown } | Error) {
  const calls: { method: string; args: unknown }[] = [];
  const respond = async () => {
    if (result instanceof Error) throw result;
    return result as { error: { status?: number; code?: string } | null };
  };
  const client: EmailCodeAuthClient = {
    auth: {
      signInWithOtp: async (args) => (calls.push({ method: 'signInWithOtp', args }), respond()),
      verifyOtp: async (args) => (calls.push({ method: 'verifyOtp', args }), respond()),
    },
  };
  return { client, calls };
}

test('email normalisation and code validation accept pasted codes without assuming a length', () => {
  expect(normalizeEmail('  Dirk@Example.COM ')).toBe('dirk@example.com');
  expect(normalizeEmail('not-an-email')).toBeNull();
  expect(normalizeEmail(`${'a'.repeat(250)}@x.io`)).toBeNull();
  expect(normalizeEmail(null)).toBeNull();

  expect(normalizeCode('482913')).toBe('482913');
  expect(normalizeCode(' 482 913 ')).toBe('482913');
  expect(normalizeCode('48291357')).toBe('48291357');
  expect(normalizeCode('12345')).toBeNull();
  expect(normalizeCode('12345678901')).toBeNull();
  expect(normalizeCode('abc123')).toBeNull();
  expect(normalizeCode('123456; drop')).toBeNull();
  expect(normalizeCode(undefined)).toBeNull();
});

test('requesting a code keeps shouldCreateUser false and uses no email redirect', async () => {
  const { client, calls } = fakeClient({ error: null });
  expect(await requestEmailCode(client, 'invited@example.com')).toBe('sent');
  expect(calls).toEqual([
    { method: 'signInWithOtp', args: { email: 'invited@example.com', options: { shouldCreateUser: false } } },
  ]);
});

test('request outcomes: rate limit, hidden non-invited rejection and unavailable', async () => {
  expect(await requestEmailCode(fakeClient({ error: { status: 429 } }).client, 'a@b.co')).toBe('rate_limited');
  expect(
    await requestEmailCode(fakeClient({ error: { status: 400, code: 'over_email_send_rate_limit' } }).client, 'a@b.co'),
  ).toBe('rate_limited');
  // A rejected non-invited address must look identical to a successful send.
  expect(await requestEmailCode(fakeClient({ error: { status: 422, code: 'otp_disabled' } }).client, 'a@b.co')).toBe('sent');

  const failures: unknown[] = [];
  expect(
    await requestEmailCode(fakeClient({ error: { status: 500 } }).client, 'a@b.co', (e) => failures.push(e)),
  ).toBe('unavailable');
  expect(await requestEmailCode(fakeClient(new Error('network')).client, 'a@b.co', (e) => failures.push(e))).toBe(
    'unavailable',
  );
  expect(failures).toHaveLength(2);
});

test('verification outcomes: invalid, expired, rate-limited, server and thrown failures', async () => {
  const verify = (result: { error: unknown } | Error) => verifyEmailCode(fakeClient(result).client, 'a@b.co', SECRET_CODE);
  expect(await verify({ error: { status: 403, code: 'otp_expired' } })).toBe('invalid_code');
  expect(await verify({ error: { status: 422 } })).toBe('invalid_code');
  expect(await verify({ error: { status: 429, code: 'over_request_rate_limit' } })).toBe('rate_limited');
  expect(await verify({ error: { status: 503 } })).toBe('unavailable');
  expect(await verify(new Error('boom'))).toBe('unavailable');
  expect(await verify({ error: null })).toBe('verified');
});

test('verification sends type email with the submitted code only once per call', async () => {
  const { client, calls } = fakeClient({ error: { status: 429 } });
  await verifyEmailCode(client, 'a@b.co', SECRET_CODE);
  expect(calls).toEqual([{ method: 'verifyOtp', args: { email: 'a@b.co', token: SECRET_CODE, type: 'email' } }]);
});

test('successful verification writes session cookies through the SSR client', async () => {
  const requests: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const fetchMock: typeof fetch = async (input) => {
    requests.push(new URL(String(input instanceof Request ? input.url : input)).pathname);
    return new Response(
      JSON.stringify({
        access_token: 'synthetic-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: 'synthetic-refresh-token',
        user: { id: '00000000-0000-4000-8000-000000000009', aud: 'authenticated', email: 'a@b.co', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const written: { name: string; value: string }[] = [];
  const supabase = createServerClient('http://127.0.0.1:54321', 'synthetic-anon-key', {
    global: { fetch: fetchMock },
    cookies: { getAll: () => [], setAll: (cookies) => { written.push(...cookies); } },
  });

  expect(await verifyEmailCode(supabase as unknown as EmailCodeAuthClient, 'a@b.co', SECRET_CODE)).toBe('verified');
  expect(requests).toEqual(['/auth/v1/verify']);
  expect(written.some(({ name, value }) => name.includes('auth-token') && value.length > 0)).toBe(true);
});

test('failed verification writes no session cookies', async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  const written: { name: string; value: string }[] = [];
  const supabase = createServerClient('http://127.0.0.1:54321', 'synthetic-anon-key', {
    global: { fetch: fetchMock },
    cookies: { getAll: () => [], setAll: (cookies) => { written.push(...cookies); } },
  });
  expect(await verifyEmailCode(supabase as unknown as EmailCodeAuthClient, 'a@b.co', SECRET_CODE)).toBe('invalid_code');
  expect(written.filter(({ value }) => value.length > 0)).toEqual([]);
});

test('pending sign-in cookie round-trips only the email and send time and rejects tampering', () => {
  const pending = { email: 'a@b.co', sentAt: 1_700_000_000_000 };
  expect(decodePendingSignIn(encodePendingSignIn(pending))).toEqual(pending);
  expect(decodePendingSignIn('not-base64-json')).toBeNull();
  expect(decodePendingSignIn(encodePendingSignIn({ email: 'bad', sentAt: 1 }))).toBeNull();
  expect(decodePendingSignIn(undefined)).toBeNull();
  expect(encodePendingSignIn(pending)).not.toContain(SECRET_CODE);

  const jar = new Map<string, string>();
  const options: Record<string, unknown>[] = [];
  const cookies = {
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string, o: Record<string, unknown>) => (jar.set(name, value), options.push(o)),
    delete: (name: string) => void jar.delete(name),
  };
  writePendingSignIn(cookies, pending, 'https://example.test/api/auth/sign-in');
  expect(readPendingSignIn(cookies)).toEqual(pending);
  expect(options[0]).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
});

test('resend cooldown is a UX guard on an unsigned cookie, so a modified send time is accepted by design', () => {
  const forged = decodePendingSignIn(encodePendingSignIn({ email: 'other@example.test', sentAt: 0 }));
  expect(forged).toEqual({ email: 'other@example.test', sentAt: 0 });
  expect(resendSecondsRemaining(forged!, 1_000_000)).toBe(0);
});

test('resend cooldown counts down and never goes negative', () => {
  const pending = { email: 'a@b.co', sentAt: 1_000_000 };
  expect(resendSecondsRemaining(pending, 1_000_000)).toBe(RESEND_COOLDOWN_SECONDS);
  expect(resendSecondsRemaining(pending, 1_000_000 + 20_000)).toBe(RESEND_COOLDOWN_SECONDS - 20);
  expect(resendSecondsRemaining(pending, 1_000_000 + 600_000)).toBe(0);
  expect(resendSecondsRemaining(pending, 500_000)).toBe(RESEND_COOLDOWN_SECONDS);
});

test('return_to survives redirects only when it passes the existing validation', () => {
  expect(signInPath('/sign-in/code', 'sent', '/intelligence/provider/acme')).toBe(
    '/sign-in/code?status=sent&return_to=%2Fintelligence%2Fprovider%2Facme',
  );
  expect(signInPath('/sign-in', 'invalid', null)).toBe('/sign-in?status=invalid');
  for (const hostile of ['https://evil.test', '//evil.test', '/\\evil.test', '/today', 'javascript:alert(1)']) {
    expect(validateIntelligenceReturnPath(hostile)).toBeNull();
  }
});

test('failure logging never includes codes, emails or raw messages', () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: unknown) => void lines.push(String(line));
  try {
    const error = Object.assign(new Error(`Token ${SECRET_CODE} for a@b.co is invalid`), {
      name: 'AuthApiError',
      status: 403,
      code: 'otp_expired',
    });
    logPilotFailure('email_code_verify_failed', error, { action: 'email_code' });
  } finally {
    console.error = original;
  }
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain(SECRET_CODE);
  expect(lines[0]).not.toContain('a@b.co');
  expect(lines[0]).toContain('email_code_verify_failed');
});

const baseURL = 'http://127.0.0.1:4322';

async function withPendingCookie(context: import('@playwright/test').BrowserContext, sentAt = Date.now() - 120_000) {
  await context.addCookies([
    { name: 'cw_signin_pending', value: encodePendingSignIn({ email: 'synthetic.member@example.test', sentAt }), url: baseURL },
  ]);
}

test('sign-in page requests an email code and no longer offers a link', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
  await expect(page.getByText('sign-in link')).toHaveCount(0);
});

test('code entry requires a pending sign-in and never exposes the email or code in URLs', async ({ page, context }) => {
  await page.goto('/sign-in/code?return_to=%2Fintelligence');
  await expect(page).toHaveURL(/\/sign-in\?status=expired&return_to=%2Fintelligence$/);

  const direct = await page.request.post('/api/auth/verify-code', {
    form: { code: SECRET_CODE },
    maxRedirects: 0,
    headers: { origin: baseURL },
  });
  expect(direct.status()).toBe(303);
  expect(direct.headers().location).toBe('/sign-in?status=expired');

  await withPendingCookie(context);
  await page.goto('/sign-in/code?return_to=%2Fintelligence');
  await expect(page.getByLabel('Sign-in code')).toHaveAttribute('autocomplete', 'one-time-code');
  await page.getByLabel('Sign-in code').fill(`${SECRET_CODE.slice(0, 3)} ${SECRET_CODE.slice(3)}`);
  await expect(page.getByLabel('Sign-in code')).toHaveValue('482 913');
  await expect(page.locator('input[name="return_to"]').first()).toHaveValue('/intelligence');
  expect(page.url()).not.toContain('synthetic.member');
  expect(page.url()).not.toContain(SECRET_CODE);
});

test('hostile return_to values are dropped on the code page and endpoints', async ({ page, context }) => {
  await withPendingCookie(context);
  await page.goto('/sign-in/code?return_to=https%3A%2F%2Fevil.test');
  await expect(page.locator('input[name="return_to"]')).toHaveCount(0);

  const response = await page.request.post('/api/auth/verify-code', {
    form: { code: 'abc', return_to: '//evil.test' },
    maxRedirects: 0,
    headers: { origin: baseURL },
  });
  expect(response.headers().location).toBe('/sign-in/code?status=invalid-format');
});

test('malformed codes are rejected before any Supabase request and keep return_to', async ({ page, context }) => {
  await withPendingCookie(context);
  const response = await page.request.post('/api/auth/verify-code', {
    form: { code: '12', return_to: '/intelligence' },
    maxRedirects: 0,
    headers: { origin: baseURL },
  });
  expect(response.headers().location).toBe('/sign-in/code?status=invalid-format&return_to=%2Fintelligence');
});

test('resend is disabled during the cooldown and refused server-side', async ({ page, context }) => {
  await withPendingCookie(context, Date.now() - 5_000);
  await page.goto('/sign-in/code');
  await expect(page.getByRole('button', { name: /Request a new code in \d+s/ })).toBeDisabled();

  const refused = await page.request.post('/api/auth/resend-code', { form: {}, maxRedirects: 0, headers: { origin: baseURL } });
  expect(refused.headers().location).toBe('/sign-in/code?status=wait');
});

test('submitting the code twice sends one verification request and disables the button', async ({ page, context }) => {
  await withPendingCookie(context);
  let posts = 0;
  await page.route('**/api/auth/verify-code', async (route) => {
    posts += 1;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 303, headers: { location: '/sign-in/code?status=invalid-code' } });
  });
  await page.goto('/sign-in/code');
  await page.getByLabel('Sign-in code').fill(SECRET_CODE);
  const disabledAfterFirstSubmit = await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form[action="/api/auth/verify-code"]')!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    form.requestSubmit();
    const disabled = button.disabled;
    form.requestSubmit();
    return disabled;
  });
  expect(disabledAfterFirstSubmit).toBe(true);
  await expect(page.getByText('That code is invalid or has expired.')).toBeVisible();
  expect(posts).toBe(1);
  expect(page.url()).not.toContain(SECRET_CODE);
});

test('a wrong code and a non-invited address give generic, safe outcomes', async ({ page, context }) => {
  const sent = await page.request.post('/api/auth/sign-in', {
    form: { email: `nobody-${Date.now()}@example.test`, return_to: '/intelligence' },
    maxRedirects: 0,
    headers: { origin: baseURL },
  });
  expect(sent.headers().location).toBe('/sign-in/code?status=sent&return_to=%2Fintelligence');
  expect(sent.headers().location).not.toContain('example.test');
  expect(sent.headers()['set-cookie']).toContain('HttpOnly');

  await withPendingCookie(context);
  const wrong = await page.request.post('/api/auth/verify-code', { form: { code: SECRET_CODE }, maxRedirects: 0, headers: { origin: baseURL } });
  expect(wrong.headers().location).toBe('/sign-in/code?status=invalid-code');
  expect(wrong.headers()['set-cookie'] ?? '').not.toContain('auth-token');
});

test('protected routes still redirect unauthenticated members to sign-in', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('use a different email clears only the pending cookie and requests no email', async ({ page, context }) => {
  await withPendingCookie(context);
  await context.addCookies([{ name: 'unrelated_cookie', value: 'keep', url: baseURL }]);
  let supabaseRequests = 0;
  await page.route('**/auth/v1/**', async (route) => {
    supabaseRequests += 1;
    await route.abort();
  });

  await page.goto('/sign-in/code?return_to=%2Fintelligence');
  await expect(page.getByText('synthetic.member@example.test')).toBeVisible();
  await page.getByRole('button', { name: 'Use a different email address' }).click();
  await expect(page).toHaveURL(/\/sign-in\?return_to=%2Fintelligence$/);

  const cookies = await context.cookies(baseURL);
  expect(cookies.find((c) => c.name === 'cw_signin_pending')).toBeUndefined();
  expect(cookies.find((c) => c.name === 'unrelated_cookie')?.value).toBe('keep');

  await page.goto('/sign-in/code');
  await expect(page).toHaveURL(/\/sign-in\?status=expired$/);
  await expect(page.getByText('synthetic.member@example.test')).toHaveCount(0);
  expect(supabaseRequests).toBe(0);
});

test('change-email endpoint expires the cookie header and drops hostile return_to', async ({ page }) => {
  const response = await page.request.post('/api/auth/change-email', {
    form: { return_to: '//evil.test' },
    maxRedirects: 0,
    headers: { origin: baseURL },
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe('/sign-in');
  const setCookie = response.headers()['set-cookie'] ?? '';
  expect(setCookie).toContain('cw_signin_pending=');
  expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
  expect(setCookie).not.toContain('auth-token');
});
