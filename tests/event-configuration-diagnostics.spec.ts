import { expect, test } from '@playwright/test';
import { describeDeliveryConfigurationFailure, describeStagingDeliveryBinding } from '../src/lib/events/configuration-diagnostics';
import { GET } from '../src/pages/api/events/material';

const ref = 'jcpwiijzycjgsfvyeeyv';
const publicUrl = `https://${ref}.supabase.co`;
function token(claims: Record<string, unknown>): string {
  return `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
}
const claims = () => ({ role: 'service_role', ref, exp: Math.floor(Date.now() / 1000) + 600 });
function diagnose(change: Record<string, unknown> = {}) {
  return describeDeliveryConfigurationFailure({ publicUrl, privateKey: token(claims()), development: false, server: true, ...change });
}

test('configuration diagnostics identify failed predicates using only fixed labels', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ server: false }, 'SERVER_ONLY'],
    [{ publicUrl: undefined }, 'PUBLIC_URL_MISSING'],
    [{ publicUrl: 'not-a-url' }, 'PUBLIC_URL_INVALID'],
    [{ publicUrl: 'https://example.invalid' }, 'PUBLIC_URL_REJECTED'],
    [{ publicUrl: `${publicUrl}/unexpected` }, 'PUBLIC_URL_REJECTED'],
    [{ privateKey: undefined }, 'PRIVATE_KEY_MISSING'],
    [{ privateKey: 'fixture-not-a-real-key\n' }, 'PRIVATE_KEY_LINE_BREAK'],
    [{ privateKey: 'fixture-not-a-real-key' }, 'PRIVATE_KEY_FORMAT'],
    [{ privateKey: token({ ...claims(), role: 'anon' }) }, 'PRIVATE_KEY_ROLE'],
    [{ privateKey: token({ ...claims(), exp: 1 }) }, 'PRIVATE_KEY_EXPIRED'],
    [{ privateKey: token({ ...claims(), ref: 'different-fixture' }) }, 'PRIVATE_KEY_PROJECT'],
  ];
  for (const [change, expected] of cases) expect(diagnose(change)).toBe(expected);
});

test('diagnostics never claim successful authorization or reject documented key families by speculation', () => {
  expect(diagnose()).toBe('CONFIG_CHECK_FAILED');
  expect(diagnose({ privateKey: 'sb_secret_fixture' })).toBe('CONFIG_CHECK_FAILED');
  expect(diagnose({ publicUrl: 'http://127.0.0.1:54321', development: true })).toBe('CONFIG_CHECK_FAILED');
});

test('Preview preflight failure does not serialize a key, claims, raw exception or upstream URL', async () => {
  const previousEnvironment = process.env.VERCEL_ENV;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fakeKey = 'fixture-private-not-a-real-key';
  process.env.VERCEL_ENV = 'preview';
  process.env.SUPABASE_SERVICE_ROLE_KEY = fakeKey;
  try {
    const response = await GET({} as Parameters<typeof GET>[0]);
    expect(response.status).toBe(503);
    const body = await response.text();
    const lines = body.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^Configure server-only event delivery for this Preview\. Diagnostic: [A-Z_]+\.$/);
    expect(lines[1]).toMatch(/^Runtime URL matches staging: (true|false)$/);
    expect(lines[2]).toBe('Runtime private-key project claim is present: false');
    expect(lines[3]).toBe('Runtime private-key project claim matches staging: false');
    expect(body).not.toContain(fakeKey);
    expect(body).not.toContain(publicUrl);
    expect(body).not.toContain(ref);
    expect(body).not.toContain('TypeError');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
    process.env.VERCEL_ENV = 'production';
    const unavailable = await GET({} as Parameters<typeof GET>[0]);
    expect(unavailable.status).toBe(404);
    const unavailableBody = await unavailable.text();
    expect(unavailableBody).not.toContain('Diagnostic:');
    expect(unavailableBody).not.toContain('Runtime ');
  } finally {
    if (previousEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnvironment;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('staging binding diagnostics distinguish URL, missing claim and different key using only booleans', () => {
  const inspect = (change: Record<string, unknown> = {}) =>
    describeStagingDeliveryBinding({ publicUrl, privateKey: token(claims()), ...change });
  expect(inspect()).toEqual({ urlMatchesStaging: true, keyRefPresent: true, keyRefMatchesStaging: true });
  expect(inspect({ publicUrl: `https://${'a'.repeat(20)}.supabase.co` })).toEqual({
    urlMatchesStaging: false, keyRefPresent: true, keyRefMatchesStaging: true,
  });
  expect(inspect({ privateKey: token({ role: 'service_role' }) })).toEqual({
    urlMatchesStaging: true, keyRefPresent: false, keyRefMatchesStaging: false,
  });
  expect(inspect({ privateKey: token({ ...claims(), ref: 'different-fixture' }) })).toEqual({
    urlMatchesStaging: true, keyRefPresent: true, keyRefMatchesStaging: false,
  });
  expect(inspect({ publicUrl: 'not-a-url', privateKey: 'fixture-not-a-real-key' })).toEqual({
    urlMatchesStaging: false, keyRefPresent: false, keyRefMatchesStaging: false,
  });
  expect(inspect({ privateKey: 'sb_secret_fixture' })).toEqual({
    urlMatchesStaging: true, keyRefPresent: false, keyRefMatchesStaging: false,
  });
  const fakeKey = token({ ...claims(), marker: 'private-claim-fixture' });
  const result = inspect({ privateKey: fakeKey });
  expect(Object.keys(result).sort()).toEqual(['keyRefMatchesStaging', 'keyRefPresent', 'urlMatchesStaging']);
  expect(Object.values(result).every((value) => typeof value === 'boolean')).toBe(true);
  expect(JSON.stringify(result)).not.toContain(fakeKey);
  expect(JSON.stringify(result)).not.toContain('private-claim-fixture');
  expect(JSON.stringify(result)).not.toContain(ref);
});
