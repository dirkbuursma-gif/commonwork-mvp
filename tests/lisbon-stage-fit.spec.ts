import { expect, test } from '@playwright/test';
import { stageIndexFromHash } from '../src/lib/playbook/stage-controller';

test('stage hash selection is bounded and handles malformed input', () => {
  const ids = ['opening','decision-before-visit','tools-by-job'];
  expect(stageIndexFromHash('#tools-by-job', ids)).toBe(2);
  expect(stageIndexFromHash('#decision-before-visit', ids)).toBe(1);
  expect(stageIndexFromHash('#missing', ids)).toBe(0);
  expect(stageIndexFromHash('#%E0%A4%A', ids)).toBe(0);
  expect(stageIndexFromHash('', ids)).toBe(0);
});

const url = process.env.LISBON_PRESENTATION_URL;
const state = process.env.LISBON_STORAGE_STATE;
test.describe('approved-attendee stage viewport checks', () => {
  test.skip(!url || !state, 'Requires an approved-attendee Preview URL and private Playwright storage-state file; no login bypass is used.');
  test.use({ storageState: state ?? { cookies: [], origins: [] } });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    test(`nine slides fit and controlled navigation resets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(url!);
      const root = page.locator('[data-lr-mode="presentation"]');
      await expect(root).toHaveAttribute('data-lr-enhanced', 'true');
      await page.evaluate(() => document.fonts.ready);
      const main = root.locator('.lr-main');
      const dots = root.locator('[data-lr-dot]');
      await expect(dots).toHaveCount(9);
      for (let index = 0; index < 9; index++) {
        await dots.nth(index).click();
        const slide = root.locator('[data-lr-slide]').nth(index);
        await expect(slide).toBeVisible();
        await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeLessThanOrEqual(1);
        await expect.poll(() => main.evaluate((el) => Math.max(el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth))).toBeLessThanOrEqual(3);
        const heading = await slide.locator('h1').boundingBox();
        const header = await root.locator('.lr-header').boundingBox();
        expect(heading).not.toBeNull(); expect(header).not.toBeNull();
        expect(heading!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
        await expect(root.locator('[data-lr-fit-status]')).toBeHidden();
      }
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.keyboard.press('Home');
      await expect(root.locator('[data-lr-slide]').nth(0)).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(root.locator('[data-lr-slide]').nth(1)).toBeVisible();
      await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeLessThanOrEqual(1);
      const deepLink = new URL(url!); deepLink.hash = 'tools-by-job';
      await page.goto(deepLink.toString());
      await expect(root.locator('[data-lr-slide]').nth(7)).toBeVisible();
      await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeLessThanOrEqual(1);
    });
  }
});
