import { expect, test } from '@playwright/test';
import {
  categorizeAuthCallbackError,
  getAuthCallbackInput,
  isAuthCallbackDiagnosticsEnabled,
  isSessionAuthCookieName,
  isSessionCookieWriteAttempt,
  logAuthCallbackDiagnostic,
} from '../src/lib/auth-callback-diagnostics';

test('callback diagnostics classify missing parameters without a verifier cookie', () => {
  expect(getAuthCallbackInput(new URLSearchParams(), [])).toMatchObject({
    branch: 'missing',
    otpType: 'missing',
    code: null,
    tokenHash: null,
    pkceVerifierCookiePresent: false,
  });
});

test('callback diagnostics classify code callbacks and detect only verifier cookie names', () => {
  expect(
    getAuthCallbackInput(
      new URLSearchParams('code=sensitive-code&type=unrelated'),
      ['sb-project-auth-token-code-verifier'],
    ),
  ).toMatchObject({
    branch: 'code',
    otpType: 'invalid',
    code: 'sensitive-code',
    tokenHash: null,
    pkceVerifierCookiePresent: true,
  });
});

test('callback diagnostics classify token-hash callbacks and allow only supported OTP types', () => {
  expect(
    getAuthCallbackInput(
      new URLSearchParams('token_hash=sensitive-hash&type=magiclink'),
      ['sb-project-auth-token-flow-AbCd1234-code-verifier', 'unrelated=value'],
    ),
  ).toMatchObject({
    branch: 'token_hash',
    otpType: 'magiclink',
    tokenHash: 'sensitive-hash',
    pkceVerifierCookiePresent: true,
  });

  expect(getAuthCallbackInput(new URLSearchParams('token_hash=hash&type=invite'), [])).toMatchObject({
    branch: 'token_hash',
    otpType: 'invite',
  });

  expect(getAuthCallbackInput(new URLSearchParams('token_hash=hash&type=signup'), [])).toMatchObject({
    branch: 'token_hash',
    otpType: 'invalid',
  });
  expect(getAuthCallbackInput(new URLSearchParams('token_hash=hash'), [])).toMatchObject({
    branch: 'token_hash',
    otpType: 'missing',
  });
});

test('callback error categorisation uses only safe allowlisted categories', () => {
  expect(categorizeAuthCallbackError({ name: 'AuthPKCECodeVerifierMissingError', message: 'secret' })).toBe(
    'pkce_verifier_missing',
  );
  expect(categorizeAuthCallbackError({ code: 'otp_expired', message: 'secret' })).toBe('otp_expired');
  expect(categorizeAuthCallbackError({ code: 'untrusted_error_code', message: 'secret' })).toBe('unknown');
  expect(categorizeAuthCallbackError(new Error('secret'))).toBe('unknown');
});

test('callback diagnostics are off by default and require the approved Preview branch', () => {
  expect(isAuthCallbackDiagnosticsEnabled({})).toBe(false);
  expect(
    isAuthCallbackDiagnosticsEnabled({
      COMMONWORK_AUTH_CALLBACK_DIAGNOSTICS: 'enabled',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_REF: 'build/pilot-hardening',
    }),
  ).toBe(false);
  expect(
    isAuthCallbackDiagnosticsEnabled({
      COMMONWORK_AUTH_CALLBACK_DIAGNOSTICS: 'enabled',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'other-branch',
    }),
  ).toBe(false);
  expect(
    isAuthCallbackDiagnosticsEnabled({
      COMMONWORK_AUTH_CALLBACK_DIAGNOSTICS: 'enabled',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'build/pilot-hardening',
    }),
  ).toBe(true);
});

test('callback diagnostics do not expose input secrets and disable logging by default', () => {
  const messages: string[] = [];
  const sensitiveValues = ['sensitive-code', 'sensitive-hash', 'cookie-secret', 'member@example.test', 'raw-error-message'];

  logAuthCallbackDiagnostic(
    false,
    {
      branch: 'token_hash',
      otp_type: 'email',
      pkce_verifier_cookie_present: true,
      exchange_succeeded: false,
      error_category: 'otp_expired',
      session_cookie_write_attempted: false,
    },
    (message) => messages.push(message),
  );
  expect(messages).toEqual([]);

  logAuthCallbackDiagnostic(
    true,
    {
      branch: 'token_hash',
      otp_type: 'email',
      pkce_verifier_cookie_present: true,
      exchange_succeeded: false,
      error_category: categorizeAuthCallbackError({
        code: 'otp_expired',
        message: sensitiveValues.join(' '),
        email: sensitiveValues[3],
        cookie: sensitiveValues[2],
      }),
      session_cookie_write_attempted: false,
    },
    (message) => messages.push(message),
  );

  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0])).toMatchObject({
    event: 'auth_callback_diagnostic',
    branch: 'token_hash',
    otp_type: 'email',
    pkce_verifier_cookie_present: true,
    exchange_succeeded: false,
    error_category: 'otp_expired',
    session_cookie_write_attempted: false,
  });
  for (const value of sensitiveValues) expect(messages[0]).not.toContain(value);
  expect(JSON.parse(messages[0]).request_id).toMatch(/^[0-9a-f-]{36}$/);
});

test('only session-token cookies indicate a session-cookie write attempt', () => {
  expect(isSessionAuthCookieName('sb-project-auth-token')).toBe(true);
  expect(isSessionAuthCookieName('sb-project-auth-token.0')).toBe(true);
  expect(isSessionAuthCookieName('sb-project-auth-token-code-verifier')).toBe(false);
  expect(isSessionAuthCookieName('unrelated-cookie')).toBe(false);

  expect(isSessionCookieWriteAttempt([
    { name: 'sb-project-auth-token', value: 'redacted-session-value', options: { maxAge: 3600 } },
  ])).toBe(true);
  expect(isSessionCookieWriteAttempt([
    { name: 'sb-project-auth-token-code-verifier', value: 'redacted-verifier', options: { maxAge: 3600 } },
  ])).toBe(false);
  expect(isSessionCookieWriteAttempt([
    { name: 'sb-project-auth-token', value: '', options: { maxAge: 0 } },
  ])).toBe(false);
});

test('diagnostic logging failures never propagate to the callback', () => {
  expect(() =>
    logAuthCallbackDiagnostic(
      true,
      {
        branch: 'code',
        otp_type: 'not_applicable',
        pkce_verifier_cookie_present: true,
        exchange_succeeded: false,
        error_category: 'unknown',
        session_cookie_write_attempted: false,
      },
      () => {
        throw new Error('sink unavailable');
      },
    ),
  ).not.toThrow();
});

test('synthetic sentinels are absent from success and error diagnostics', () => {
  const sentinels = ['SENTINEL-CODE-123', 'SENTINEL-HASH-456', 'sentinel@example.invalid', 'SENTINEL-COOKIE-789'];
  const input = getAuthCallbackInput(
    new URLSearchParams(`code=${sentinels[0]}&token_hash=${sentinels[1]}&email=${sentinels[2]}`),
    [`sb-x-auth-token-code-verifier`],
  );
  const messages: string[] = [];
  for (const [ok, err] of [[true, null], [false, categorizeAuthCallbackError(new Error(sentinels.join(' ')))]] as const) {
    logAuthCallbackDiagnostic(
      true,
      {
        branch: input.branch,
        otp_type: input.otpType,
        pkce_verifier_cookie_present: input.pkceVerifierCookiePresent,
        exchange_succeeded: ok,
        error_category: err,
        session_cookie_write_attempted: ok,
      },
      (m) => messages.push(m),
    );
  }
  expect(messages).toHaveLength(2);
  for (const m of messages) for (const s of sentinels) expect(m).not.toContain(s);
});
