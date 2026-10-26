import { expect, test } from '@playwright/test';
import { publicEventResourcesEnabled } from '../src/lib/events/public-resource-policy';

const staging = '00000000-0000-4000-8000-00000000e001';
const production = 'c3118b54-7568-4ef6-9159-124dc86e7971';
test('public resource policy denies empty, malformed and unrelated opt-ins', () => {
  for (const raw of ['', ' ', '*', 'true', 'commonwork-lisbon-preview', `${staging},`, `${staging},*`, 'x'.repeat(4097), '11111111-1111-4111-8111-111111111111']) {
    expect(publicEventResourcesEnabled('commonwork-lisbon-preview', raw)).toBe(false);
  }
});
test('public resource policy binds opt-in to the exact configured event identity', () => {
  expect(publicEventResourcesEnabled('commonwork-lisbon-preview', staging)).toBe(true);
  expect(publicEventResourcesEnabled('agentic-commerce-lisbon-2026', staging)).toBe(false);
  expect(publicEventResourcesEnabled('agentic-commerce-lisbon-2026', production)).toBe(true);
  expect(publicEventResourcesEnabled('commonwork-lisbon-preview', production)).toBe(false);
  expect(publicEventResourcesEnabled('agentic-commerce-lisbon-2026', ` ${staging}, ${production} `)).toBe(true);
  for (const slug of ['other-event', '__proto__', 'toString', '../commonwork-lisbon-preview']) expect(publicEventResourcesEnabled(slug, `${staging},${production}`)).toBe(false);
});
