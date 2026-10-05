import { expect, test } from '@playwright/test';

test('unauthenticated members are redirected to invite-only sign-in', async ({ page }) => {
  await page.goto('/today');

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Commonwork' })).toBeVisible();
  await expect(page.getByText('Supabase is not configured yet.')).toBeVisible();
});

test('an invalid local test-session cookie does not grant access', async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'commonwork_local_test_session',
      value: 'invalid',
      url: 'http://127.0.0.1:4321',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/today');

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Commonwork' })).toBeVisible();
});

test('local test session can browse MVP pages and be ended', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Enter local test workspace' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText('Local test session')).toBeVisible();
  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'commonwork_local_test_session',
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false });

  const pages = [
    { path: '/competence', heading: 'My competence' },
    { path: '/find', heading: 'Find competence' },
    { path: '/introductions', heading: 'Introductions' },
    { path: '/events', heading: 'Events' },
  ];

  for (const { path, heading } of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'End test session' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign-in page supports dark mode', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
});

test('sign-in layout fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/sign-in');

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(375);
  await expect(page.getByRole('heading', { name: 'Make useful work visible.' })).toBeVisible();
});
