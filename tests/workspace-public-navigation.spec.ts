import { expect, test } from '@playwright/test';

const destinations = [['Insights', '/insights'], ['Providers & products', '/catalogue'], ['Events', '/discover/events'], ['About', '/about']] as const;

test('members keep the workspace shell while exploring public pages at every width', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Enter local test workspace' }).click();
  await expect(page).toHaveURL(/\/today$/);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [, path] of destinations) {
      await page.goto(path);
      const navigation = page.getByRole('navigation', { name: 'Public navigation', exact: true });
      await expect(navigation).toBeVisible();
      if (width <= 1050) await navigation.getByText('Explore Commonwork', { exact: true }).click();
      for (const [name, href] of destinations) {
        const link = navigation.getByRole('link', { name, exact: true });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', href);
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      const workspace = page.getByRole('navigation', { name: 'Workspace', exact: true }).filter({ visible: true });
      await expect(workspace).toHaveCount(1);
      await expect(workspace.getByRole('link', { name: 'Today', exact: true })).toBeVisible();
      await expect(workspace.getByRole('link', { name: 'My events', exact: true })).toBeVisible();
      await expect(workspace.getByRole('link', { name: 'Providers & products', exact: true })).toHaveCount(0);
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(dimensions.content, `${path} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test('desktop sidebar collapse persists between workspace and public pages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Enter local test workspace' }).click();
  await page.getByRole('button', { name: 'Toggle workspace sidebar' }).click();
  await expect(page.locator('#workspace-sidebar')).toBeHidden();
  await page.goto('/catalogue');
  await expect(page.locator('#workspace-sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Toggle workspace sidebar' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Toggle workspace sidebar' }).click();
  await expect(page.locator('#workspace-sidebar')).toBeVisible();
});

test('signed-out public discovery stays available without workspace controls', async ({ page }) => {
  for (const [, path] of destinations) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Public navigation', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  }
});
