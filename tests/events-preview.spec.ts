import { expect, test } from '@playwright/test';

test('Lisbon preview connects event, review and catalogue without exposing materials', async ({ page }) => {
  await page.goto('/events/lisbon-presentation');

  await expect(page.getByRole('heading', { level: 1, name: 'Commonwork — Lisbon presentation' })).toBeVisible();
  await expect(page.getByText('21 October 2026')).toBeVisible();
  await expect(page.getByText('Lisbon', { exact: true })).toBeVisible();
  await expect(page.getByText('An account on its own does not grant access to this event.')).toBeVisible();
  await expect(page.getByText('Sharing a link or code does not release them.')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Product data is a margin line now, not an IT ticket' }))
    .toHaveAttribute('href', '/insights/product-data-is-a-margin-line');
  await expect(page.getByRole('link', { name: 'Adobe Commerce' }))
    .toHaveAttribute('href', '/intelligence/product/adobe-commerce');

  await expect(page.getByRole('button', { name: /download|open replay/i })).toHaveCount(0);
});

test('Lisbon preview has no horizontal overflow on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/events/lisbon-presentation');

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('event manager and Insights editor routes require an authenticated role', async ({ page }) => {
  await page.goto('/events/manage');
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto('/insights/editor');
  await expect(page).toHaveURL(/\/sign-in/);
});
