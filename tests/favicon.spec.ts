import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('all document layouts declare the Commonwork SVG favicon', () => {
  for (const name of ['AppLayout', 'AuthLayout', 'EditorialLayout', 'PlaybookLayout']) {
    const source = readFileSync(`src/layouts/${name}.astro`, 'utf8');
    expect(source, name).toContain('rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=commonwork-1"');
  }
});

test('favicon is publicly served and uses the shared logo geometry', async ({ request, page }) => {
  const response = await request.get('/favicon.svg?v=commonwork-1', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  const svg = await response.text();
  expect(svg).toContain('viewBox="0 0 32 32"');
  expect(svg).toContain('M13 5H5V24H13M19 5H27V24H19');
  expect(svg).toContain('M11 24H21');
  expect(svg).toContain('#35243b');
  expect(svg).toContain('#c7462d');
  expect(svg).not.toContain('<script');
  for (const path of ['/sign-in', '/insights', '/catalogue', '/discover/events']) {
    await page.goto(path);
    await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg?v=commonwork-1');
  }
});
