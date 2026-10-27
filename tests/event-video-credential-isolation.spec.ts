import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validateVideoDeliveryConfiguration } from '../src/lib/events/video-delivery-configuration';

const publicUrl = `https://${'a'.repeat(20)}.supabase.co`;
const input = { publicUrl, privateKey: 'sb_secret_fixture', development: false, server: true };
const token = (claims: Record<string, unknown>) => `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;

test('video configuration accepts a dedicated modern secret without changing its value', () => {
  expect(validateVideoDeliveryConfiguration(input)).toEqual({ origin: publicUrl, key: input.privateKey });
});

test('missing, empty and malformed dedicated credentials fail with fixed errors', () => {
  for (const privateKey of [undefined, '', 'fixture-invalid', `${input.privateKey}\n`, token({ role: 'anon' }), token({ role: 'service_role', ref: 'different-project' }), token({ role: 'service_role', ref: 'a'.repeat(20), exp: 1 })]) {
    expect(() => validateVideoDeliveryConfiguration({ ...input, privateKey })).toThrow('Private delivery credential required.');
  }
});

test('server and origin checks remain enforced', () => {
  expect(() => validateVideoDeliveryConfiguration({ ...input, server: false })).toThrow('Server configuration required.');
  for (const url of [undefined, 'not-a-url', 'https://example.invalid', `${publicUrl}/other`, `${publicUrl}?x=1`]) {
    expect(() => validateVideoDeliveryConfiguration({ ...input, publicUrl: url })).toThrow('Invalid delivery configuration.');
  }
});

test('legacy project validation remains intact for explicitly supplied dedicated credentials', () => {
  const privateKey = token({ role: 'service_role', ref: 'a'.repeat(20), exp: Math.floor(Date.now() / 1000) + 600 });
  expect(validateVideoDeliveryConfiguration({ ...input, privateKey }).key).toBe(privateKey);
});

test('source boundary reads only the dedicated variable and keeps document configuration separate', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const reader = source('../src/lib/events/video-delivery-configuration.ts');
  const route = source('../src/pages/api/events/video.ts');
  const shared = source('../src/lib/events/object-delivery.ts');
  const material = source('../src/pages/api/events/material.ts');
  expect(reader).toContain('privateKey: process.env.COMMONWORK_VIDEO_SECRET_KEY');
  expect(reader).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|process\.env\.SUPABASE_SECRET_KEY/);
  expect(route).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|process\.env\.SUPABASE_SECRET_KEY/);
  expect(route).toContain("credentialVariable: 'COMMONWORK_VIDEO_SECRET_KEY'");
  expect(route).toContain('readVideoDeliveryConfiguration as readDeliveryConfiguration');
  expect(route).toContain('{ configuration, fetcher }');
  expect(route).toContain("access.status !== 'available'");
  expect(shared).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
  expect(material).not.toContain('COMMONWORK_VIDEO_SECRET_KEY');
});
