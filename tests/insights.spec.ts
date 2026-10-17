import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { articleProvenance, getInsightsByline, sourceRevision } from '../src/lib/insights-provenance';
import { insightPreviewSummaries } from '../src/lib/insights-editorial-metadata';
import { validateReturnPath } from '../src/lib/auth-return-path';

const contentDirectory = resolve('src/content/insights');
const articleTitles = {
  'product-data-is-a-margin-line': 'Product data is a margin line now, not an IT ticket',
  'dpp-registry-is-live': 'The Digital Product Passport registry is live, and customs can query it',
  'testing-the-agent-ready-claim': 'How to test an "agent-ready" claim',
} as const;
const articleDates = {
  'product-data-is-a-margin-line': '2026-08-27',
  'dpp-registry-is-live': '2026-08-20',
  'testing-the-agent-ready-claim': '2026-08-13',
} as const;
const approvedPreviewSummaries = {
  'product-data-is-a-margin-line':
    'Product feeds are no longer just an IT concern: commerce channels use structured attributes to shortlist products, while product-safety and passport rules attach accountability to those same fields. This review traces why return rates, warnings and data quality now belong in buying, sourcing and procurement decisions.',
  'dpp-registry-is-live':
    'The European Commission’s Digital Product Passport registry is operational, with organisations enrolling and customs able to check passport registration before release for free circulation. This brief explains why the registry’s verification role matters to sourcing, what it stores, and why batteries are the first affected category.',
  'testing-the-agent-ready-claim':
    'Published commerce protocols give buyers concrete questions to ask about an ‘agent-ready’ claim. This review sets out six checks for platforms, PIM vendors and implementation partners—from naming the protocol and supporting its fields to update latency, commercial signals, machine readability and agent traffic.',
} as const;

function sourceWords(markdown: string): string[] {
  const body = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  const plainText = body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_>#]/g, ' ')
    .replace(/&(?:amp|nbsp|mdash|ndash|quot|#\d+);/g, ' ');
  return plainText.match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi)?.map((word) => word.toLowerCase()) ?? [];
}

function renderedWords(text: string): string[] {
  return text.match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi)?.map((word) => word.toLowerCase()) ?? [];
}

test('editorial snapshots retain their source Git blobs and byline provenance', () => {
  expect(sourceRevision).toBe('b2ee4b427d9b1b455add456a9abea01b615070fc');
  expect(getInsightsByline('dirk-buursma')).toBe('Dirk Buursma, Commerce Partners');
  for (const [slug, provenance] of Object.entries(articleProvenance)) {
    const markdown = readFileSync(resolve(contentDirectory, `${slug}.md`));
    const blobHash = createHash('sha1')
      .update(`blob ${markdown.length}\0`)
      .update(markdown)
      .digest('hex');
    expect(blobHash, slug).toBe(provenance.sourceBlob);
    expect(getInsightsByline(provenance.sourceAuthorId)).toBe('Dirk Buursma, Commerce Partners');
  }
  expect(articleProvenance['testing-the-agent-ready-claim'].sourceUrl)
    .toBe('https://www.commerce-partners.com/review/testing-the-agent-ready-claim.html');
});

test('approved index summaries are separate metadata with 35 to 50 words each', () => {
  expect(insightPreviewSummaries).toEqual(approvedPreviewSummaries);
  for (const [slug, summary] of Object.entries(insightPreviewSummaries)) {
    const wordCount = summary.match(/\b[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*\b/gu)?.length ?? 0;
    expect(wordCount, slug).toBeGreaterThanOrEqual(35);
    expect(wordCount, slug).toBeLessThanOrEqual(50);
  }
});

test('return paths include only the pilot editorial routes in addition to existing Intelligence paths', () => {
  expect(validateReturnPath('/insights')).toBe('/insights');
  expect(validateReturnPath('/insights?topic=standards-regulation'))
    .toBe('/insights?topic=standards-regulation');
  expect(validateReturnPath('/insights/product-data-is-a-margin-line'))
    .toBe('/insights/product-data-is-a-margin-line');
  expect(validateReturnPath('/about')).toBeNull();
  expect(validateReturnPath('/insights/not-a-pilot-article')).toBeNull();
  expect(validateReturnPath('/insights?topic=other')).toBeNull();
  expect(validateReturnPath('/insights?topic=product-data&next=https://evil.example')).toBeNull();
  expect(validateReturnPath('//evil.example/insights')).toBeNull();
  expect(validateReturnPath('/intelligence/category/agentic-commerce'))
    .toBe('/intelligence/category/agentic-commerce');
});

test('public Insights index filters the independent article collection', async ({ page, request }) => {
  const response = await request.get('/insights');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');

  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read review', exact: true })).toHaveCount(3);
  await expect(page.getByText('By Dirk Buursma, Commerce Partners')).toHaveCount(3);
  await expect(page.getByText(/Today|My competence|Introductions/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Product Data', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/insights\?topic=product-data$/);
  await expect(page.getByRole('heading', { name: articleTitles['product-data-is-a-margin-line'] })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read review', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Product Data', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('all public article routes render the complete source text and safe source link', async ({ page }) => {
  for (const [slug, title] of Object.entries(articleTitles)) {
    const response = await page.goto(`/insights/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('.insight-article-head time'))
      .toHaveAttribute('datetime', articleDates[slug as keyof typeof articleDates]);
    await expect(page.getByRole('link', { name: 'Back to Insights' })).toBeVisible();
    await expect(page.locator('.insight-article-byline')).toHaveText('Dirk Buursma, Commerce Partners');
    await expect(page.getByRole('heading', { name: 'Related reviews' })).toBeVisible();
    await expect(page.locator('.insight-related-card')).toHaveCount(2);

    const sourceMarkdown = readFileSync(resolve(contentDirectory, `${slug}.md`), 'utf8');
    expect(renderedWords(await page.locator('.insight-prose').innerText()), slug)
      .toEqual(sourceWords(sourceMarkdown));
  }

  await page.goto('/insights/testing-the-agent-ready-claim');
  await expect(page.locator('.insight-prose a[href="https://www.commerce-partners.com/editorial-policy.html"]'))
    .toHaveCount(1);
});

test('unknown articles are public 404s while private workspace routes remain protected', async ({ page, request }) => {
  const missing = await request.get('/insights/not-a-pilot-article');
  expect(missing.status()).toBe(404);
  const missingPage = await page.goto('/insights/not-a-pilot-article');
  expect(missingPage?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Review not found' })).toBeVisible();

  const protectedResponse = await request.get('/today', { maxRedirects: 0 });
  expect(protectedResponse.status()).toBe(303);
  expect(protectedResponse.headers().location).toContain('/sign-in');
  const intelligenceResponse = await request.get('/intelligence', { maxRedirects: 0 });
  expect(intelligenceResponse.status()).toBe(303);
  const protectedApiResponse = await request.post('/api/auth/sign-out', {
    maxRedirects: 0,
    headers: { origin: 'http://127.0.0.1:4322' },
  });
  expect(protectedApiResponse.status()).toBe(303);
  const postResponse = await request.post('/insights/product-data-is-a-margin-line', {
    maxRedirects: 0,
    headers: { origin: 'http://127.0.0.1:4322' },
  });
  expect(postResponse.status()).toBe(303);
});

test('the existing development-only session gets the same article in the signed-in shell', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Enter local test workspace' }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto('/insights');
  await expect(page.locator('.insight-summary')).toHaveText([
    approvedPreviewSummaries['product-data-is-a-margin-line'],
    approvedPreviewSummaries['dpp-registry-is-live'],
    approvedPreviewSummaries['testing-the-agent-ready-claim'],
  ]);
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);

  await page.goto('/insights/product-data-is-a-margin-line');
  await expect(page.getByRole('heading', { level: 1, name: articleTitles['product-data-is-a-margin-line'] }))
    .toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);
  await expect(page.getByText('Local test session')).toBeVisible();
});

test('public index and article fit mobile, intermediate and desktop widths', async ({ page }) => {
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/insights', '/insights/dpp-registry-is-live']) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${path} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test('public mobile navigation supports keyboard use, focus indication and Escape', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/insights');
  await expect(page.getByRole('link', { name: 'Commonwork Insights home' })).toBeVisible();
  const mark = await page.locator('.editorial-brand .brand-mark path').first().evaluate((path) => {
    if (!(path instanceof SVGPathElement)) throw new Error('Brand mark path is not an SVG path.');
    const bounds = path.getBBox();
    return {
      path: path.getAttribute('d'),
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(mark.path).toMatch(/^M/);
  expect(mark.width).toBeGreaterThan(0);
  expect(mark.height).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'About Commonwork' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeHidden();

  const menuToggle = page.locator('.editorial-menu-toggle');
  await expect(menuToggle).toBeVisible();
  await menuToggle.focus();
  await page.keyboard.press('Enter');
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menuToggle).toHaveAccessibleName('Close menu');
  await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'About Commonwork' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

  await page.keyboard.press('Tab');
  const focusOutline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(focusOutline).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menuToggle).toBeFocused();
  await expect(page.getByRole('link', { name: 'About Commonwork' })).toBeHidden();
  expect(browserErrors).toEqual([]);
});

test('public desktop header retains its full navigation and editorial secondary text meets contrast', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/insights/testing-the-agent-ready-claim');
  const mark = await page.locator('.editorial-brand .brand-mark path').first().evaluate((path) => {
    if (!(path instanceof SVGPathElement)) throw new Error('Brand mark path is not an SVG path.');
    const bounds = path.getBBox();
    return {
      path: path.getAttribute('d'),
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(mark.path).toMatch(/^M/);
  expect(mark.width).toBeGreaterThan(0);
  expect(mark.height).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
  await expect(page.getByRole('link', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'About Commonwork' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();

  const contrastRatios = await page.locator(
    '.insight-meta, .insight-topic-label, .insight-byline, .insight-related-card span',
  )
    .evaluateAll((elements) => elements.map((element) => {
      const parseColor = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const luminance = (color: number[]) => {
        const channels = color.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foreground = luminance(parseColor(getComputedStyle(element).color));
      const surface = element.closest('.insight-card, .insight-related-card');
      const backgroundColor = surface
        ? getComputedStyle(surface).backgroundColor
        : getComputedStyle(document.body).backgroundColor;
      const background = luminance(parseColor(backgroundColor));
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }));
  expect(contrastRatios.length).toBeGreaterThan(0);
  expect(Math.min(...contrastRatios)).toBeGreaterThanOrEqual(4.5);
  console.log(`Minimum editorial secondary-text contrast: ${Math.min(...contrastRatios).toFixed(2)}:1`);
});
