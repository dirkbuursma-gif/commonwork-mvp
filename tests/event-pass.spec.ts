import { expect, test } from '@playwright/test';
import { eventPassCookieName, generateEventAccessCode, hashEventAccessCode, issueEventPass, verifyEventAccessCode, verifyEventPass } from '../src/lib/events/event-pass';

const now = 1700000000000;
const secret = 'synthetic-event-pass-signing-secret-for-tests-only';
const binding = { eventId: '00000000-0000-4000-8000-00000000e001', version: '00000000-0000-4000-8000-000000000001', enabled: true, expiresAt: null };

test('codes are salted hashes, not plaintext, and malformed input is refused', () => {
  const code = generateEventAccessCode();
  const first = hashEventAccessCode(code);
  const second = hashEventAccessCode(code);
  expect(code).toHaveLength(24);
  expect(first.salt).not.toBe(second.salt);
  expect(first.hash).not.toContain(code);
  expect(verifyEventAccessCode(code, first.salt, first.hash)).toBe(true);
  expect(verifyEventAccessCode(` ${code} `, first.salt, first.hash)).toBe(true);
  for (const candidate of [null, '', 'wrong-code-fixture', 'x'.repeat(257)]) expect(verifyEventAccessCode(candidate, first.salt, first.hash)).toBe(false);
  expect(verifyEventAccessCode(code, 'bad-salt', first.hash)).toBe(false);
});

test('passes expire and are scoped to an event and current version', () => {
  const pass = issueEventPass(binding, secret, now, 60);
  expect(verifyEventPass(pass, binding, secret, now + 1)).toBe(true);
  expect(verifyEventPass(pass, binding, secret, now + 60000)).toBe(false);
  expect(verifyEventPass(pass, binding, secret, now - 1)).toBe(false);
  expect(verifyEventPass(pass, { ...binding, enabled: false }, secret, now)).toBe(false);
  expect(verifyEventPass(pass, { ...binding, eventId: '00000000-0000-4000-8000-00000000e002' }, secret, now)).toBe(false);
  expect(verifyEventPass(pass, { ...binding, version: '00000000-0000-4000-8000-000000000002' }, secret, now)).toBe(false);
  expect(verifyEventPass(pass, { ...binding, expiresAt: now }, secret, now)).toBe(false);
});

test('tampering, another signing key and malformed tokens fail closed', () => {
  const pass = issueEventPass(binding, secret, now);
  const [body, signature] = pass.split('.');
  const forged = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'));
  forged.eventId = '00000000-0000-4000-8000-00000000e002';
  const altered = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`;
  for (const value of [undefined, '', altered, 'bad.token', `${pass}.extra`, 'x'.repeat(2049)]) expect(verifyEventPass(value, binding, secret, now)).toBe(false);
  expect(verifyEventPass(pass, binding, `${secret}-different`, now)).toBe(false);
  expect(verifyEventPass(pass, binding, 'short', now)).toBe(false);
  expect(() => issueEventPass(binding, 'short', now)).toThrow('Event pass signing is not configured.');
  expect(() => issueEventPass(binding, secret, now, 86401)).toThrow('Event pass unavailable.');
});

test('event expiry caps session lifetime and cookie names are isolated', () => {
  const limited = { ...binding, expiresAt: now + 1000 };
  const pass = issueEventPass(limited, secret, now);
  expect(verifyEventPass(pass, limited, secret, now + 999)).toBe(true);
  expect(verifyEventPass(pass, limited, secret, now + 1000)).toBe(false);
  expect(eventPassCookieName(binding.eventId)).not.toBe(eventPassCookieName('00000000-0000-4000-8000-00000000e002'));
  expect(() => eventPassCookieName('../other')).toThrow('Invalid event reference.');
});
