import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { articleProvenance, getInsightsByline, sourceRevision } from '../src/lib/insights-provenance';
import { insightPreviewSummaries } from '../src/lib/insights-editorial-metadata';
import { validateReturnPath } from '../src/lib/auth-return-path';
const contentDirectory = resolve('src/content/insights');
const articleTitles = {
  'product-data-is-a-margin-line': 'Product data is a margin line now, not an IT ticket',
  'dpp-registry-is-live': 'The Digital Product Passport registry is live, and customs can query it',
  'testing-the-agent-ready-claim': 'How to test an "agent-ready" claim',
} as const;
const articleDates = { 'product-data-is-a-margin-line': '2026-08-27', 'dpp-registry-is-live': '2026-08-20', 'testing-the-agent-ready-claim': '2026-08-13' } as const;
const approvedPreviewSummaries = {
  'product-data-is-a-margin-line': 'Product feeds are no longer just an IT concern: commerce channels use structured attributes to shortlist products, while product-safety and passport rules attach accountability to those same fields. This review traces why return rates, warnings and data quality now belong in buying, sourcing and procurement decisions.',
  'dpp-registry-is-live': 'The European Commission’s Digital Product Passport registry is operational, with organisations enrolling and customs able to check passport registration before release for free circulation. This brief explains why the registry’s verification role matters to sourcing, what it stores, and why batteries are the first affected category.',
  'testing-the-agent-ready-claim': 'Published commerce protocols give buyers concrete questions to ask about an ‘agent-ready’ claim. This review sets out six checks for platforms, PIM vendors and implementation partners—from naming the protocol and supporting its fields to update latency, commercial signals, machine readability and agent traffic.',
} as const;
function renderedWords(text: string): string[] { return text.replace(/’/g, "'").match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi)?.map((word) => word.toLowerCase()) ?? []; }
function sourceWords(markdown: string): string[] { return renderedWords(markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/[^\s)]+/g, ' ').replace(/<[^>]*>/g, ' ').replace(/[`*_>#]/g, ' ').replace(/&(?:amp|nbsp|mdash|ndash|quot|#\d+);/g, ' ')); }
function browserErrors(page: Page) { const errors: string[] = []; page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message)); return errors; }
async function assertMark(page: Page) {
  const mark = await page.locator('.editorial-brand .brand-mark path').first().evaluate((path) => { if (!(path instanceof SVGPathElement)) throw new Error('Invalid logo path'); const bounds = path.getBBox(); return { path: path.getAttribute('d'), width: bounds.width, height: bounds.height }; });
  expect(mark.path).toMatch(/^M/); expect(mark.width).toBeGreaterThan(0); expect(mark.height).toBeGreaterThan(0);
}

test('article comparison allows typographic apostrophes but rejects changed word sequences', () => {
  const expected = sourceWords("Google's catalogue keeps the source words."); expect(renderedWords('Google’s catalogue keeps the source words.')).toEqual(expected);
  for (const altered of ['Google’s catalogue keeps the words.', 'Google’s catalogue keeps all the source words.', 'Google’s source catalogue keeps the words.', 'Google’s catalogue replaces the source words.']) expect(renderedWords(altered)).not.toEqual(expected);
});
test('editorial snapshots retain their source Git blobs and byline provenance', () => {
  expect(sourceRevision).toBe('b2ee4b427d9b1b455add456a9abea01b615070fc'); expect(getInsightsByline('dirk-buursma')).toBe('Dirk Buursma, Commerce Partners');
  for (const [slug, provenance] of Object.entries(articleProvenance)) { const markdown = readFileSync(resolve(contentDirectory, `${slug}.md`)); expect(createHash('sha1').update(`blob ${markdown.length}\0`).update(markdown).digest('hex'), slug).toBe(provenance.sourceBlob); expect(getInsightsByline(provenance.sourceAuthorId)).toBe('Dirk Buursma, Commerce Partners'); }
  expect(articleProvenance['testing-the-agent-ready-claim'].sourceUrl).toBe('https://www.commerce-partners.com/review/testing-the-agent-ready-claim.html');
});
test('approved index summaries are separate metadata with 35 to 50 words each', () => {
  expect(insightPreviewSummaries).toEqual(approvedPreviewSummaries);
  for (const [slug, summary] of Object.entries(insightPreviewSummaries)) { const count = summary.match(/\b[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*\b/gu)?.length ?? 0; expect(count, slug).toBeGreaterThanOrEqual(35); expect(count, slug).toBeLessThanOrEqual(50); }
});
test('return paths include only the pilot editorial routes in addition to existing Intelligence paths', () => {
  for (const path of ['/insights', '/insights?topic=standards-regulation', '/insights/product-data-is-a-margin-line', '/intelligence/category/agentic-commerce']) expect(validateReturnPath(path)).toBe(path);
  for (const path of ['/about', '/insights/not-a-pilot-article', '/insights?topic=other', '/insights?topic=product-data&next=https://evil.example', '//evil.example/insights']) expect(validateReturnPath(path)).toBeNull();
});
test('public Insights index filters the independent article collection', async ({ page, request }) => {
  const response = await request.get('/insights'); expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toContain('no-store');
  await page.goto('/insights'); await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible(); await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read review', exact: true })).toHaveCount(3); await expect(page.getByText('By Dirk Buursma, Commerce Partners')).toHaveCount(3); await expect(page.getByText(/Today|My competence|Introductions/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Product Data', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/insights\?topic=product-data$/); await expect(page.getByRole('heading', { name: articleTitles['product-data-is-a-margin-line'] })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read review', exact: true })).toHaveCount(1); await expect(page.getByRole('link', { name: 'Product Data', exact: true })).toHaveAttribute('aria-current', 'page');
});
test('all public article routes render the complete source text and safe source link', async ({ page }) => {
  for (const [slug, title] of Object.entries(articleTitles)) {
    expect((await page.goto(`/insights/${slug}`))?.status()).toBe(200); await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('.insight-article-head time')).toHaveAttribute('datetime', articleDates[slug as keyof typeof articleDates]); await expect(page.getByRole('link', { name: 'Back to Insights' })).toBeVisible();
    await expect(page.locator('.insight-article-byline')).toHaveText('Dirk Buursma, Commerce Partners'); await expect(page.getByRole('heading', { name: 'Related reviews' })).toBeVisible(); await expect(page.locator('.insight-related-card')).toHaveCount(2);
    expect(renderedWords(await page.locator('.insight-prose').innerText()), slug).toEqual(sourceWords(readFileSync(resolve(contentDirectory, `${slug}.md`), 'utf8')));
  }
  await page.goto('/insights/testing-the-agent-ready-claim'); await expect(page.locator('.insight-prose a[href="https://www.commerce-partners.com/editorial-policy.html"]')).toHaveCount(1);
});
test('unknown articles are public 404s while private workspace routes remain protected', async ({ page, request }) => {
  expect((await request.get('/insights/not-a-pilot-article')).status()).toBe(404); expect((await page.goto('/insights/not-a-pilot-article'))?.status()).toBe(404); await expect(page.getByRole('heading', { name: 'Review not found' })).toBeVisible();
  const response = await request.get('/today', { maxRedirects: 0 }); expect(response.status()).toBe(303); expect(response.headers().location).toContain('/sign-in'); expect((await request.get('/intelligence', { maxRedirects: 0 })).status()).toBe(303);
  for (const path of ['/api/auth/sign-out', '/insights/product-data-is-a-margin-line']) expect((await request.post(path, { maxRedirects: 0, headers: { origin: 'http://127.0.0.1:4322' } })).status()).toBe(303);
});
test('signed-in readers retain the public shell and explicitly enter their workspace', async ({ page }) => {
  await page.goto('/sign-in'); await page.getByRole('button', { name: 'Enter local test workspace' }).click(); await expect(page).toHaveURL(/\/today$/);
  await page.goto('/insights'); await expect(page.locator('.insight-summary')).toHaveText(Object.values(approvedPreviewSummaries));
  for (const path of ['/insights', '/insights/product-data-is-a-margin-line']) {
    await page.goto(path); await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible(); await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0); await expect(page.getByRole('link', { name: 'My workspace', exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 1, name: articleTitles['product-data-is-a-margin-line'] })).toBeVisible();
  await page.getByRole('link', { name: 'My workspace', exact: true }).click(); await expect(page).toHaveURL(/\/today$/); await expect(page.getByRole('navigation', { name: 'Workspace' }).first()).toBeVisible(); await expect(page.getByText('Local test session')).toBeVisible();
});
test('public index and article fit mobile, intermediate and desktop widths', async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); for (const path of ['/insights', '/insights/dpp-registry-is-live']) { await page.goto(path); const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })); expect(dimensions.content, `${path} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport); } }
});
test('public mobile navigation supports keyboard use, focus indication and Escape', async ({ page }) => {
  const errors = browserErrors(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/insights');
  await expect(page.locator('.editorial-brand')).toHaveAccessibleName('About Commonwork'); await expect(page.locator('.editorial-brand')).toBeVisible(); await assertMark(page);
  const menu = page.locator('.public-mobile'); const toggle = menu.locator('summary'); const items = menu.locator('.public-mobile-links');
  await expect(toggle).toBeVisible(); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(items).toBeHidden();
  await toggle.focus(); await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); await expect(menu).toHaveAttribute('open', '');
  for (const name of ['Events', 'Insights', 'Catalogue', 'About', 'Join Commonwork', 'Sign in']) await expect(items.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(items.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(items.getByRole('link', { name: 'Events', exact: true })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Escape'); await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(toggle).toBeFocused(); await expect(items).toBeHidden(); expect(errors).toEqual([]);
});
test('public desktop header retains its full navigation and editorial secondary text meets contrast', async ({ page }) => {
  const errors = browserErrors(page); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/insights/testing-the-agent-ready-claim'); await assertMark(page);
  const desktop = page.getByRole('navigation', { name: 'Public navigation' }).locator('.public-desktop');
  for (const name of ['Events', 'Insights', 'Catalogue', 'About', 'Join Commonwork', 'Sign in']) await expect(desktop.getByRole('link', { name, exact: true })).toBeVisible();
  await expect(desktop.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible(); await expect(page.locator('.public-mobile summary')).toBeHidden();
  const ratios = await page.locator('.insight-meta, .insight-topic-label, .insight-byline, .insight-related-card span').evaluateAll((elements) => elements.map((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (color: number[]) => { const c = color.map((v) => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
    const foreground = luminance(parse(getComputedStyle(element).color)); const surface = element.closest('.insight-card, .insight-related-card'); const background = luminance(parse(getComputedStyle(surface ?? document.body).backgroundColor)); return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  }));
  expect(ratios.length).toBeGreaterThan(0); expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5); expect(errors).toEqual([]);
});
