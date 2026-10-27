import { expect, test } from '@playwright/test';

test('workspace exposes public destinations at desktop, intermediate and mobile widths', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Enter local test workspace' }).click();
  await expect(page).toHaveURL(/\/today$/);
  const destinations = [
    ['Insights', '/insights'],
    ['Providers & products', '/catalogue'],
    ['Public events', '/discover/events'],
    ['About', '/about'],
  ] as const;
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/today');
    const navigation = page.getByRole('navigation', { name: 'Explore Commonwork', exact: true });
    await expect(navigation).toBeVisible();
    for (const [name, href] of destinations) {
      const link = navigation.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
      const bounds = await link.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `workspace at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await navigation.getByRole('link', { name: 'Insights', exact: true }).focus();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/insights$/);
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Public navigation', exact: true })).toBeVisible();
  }
});
