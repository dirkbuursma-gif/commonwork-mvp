import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/playwright-local-supabase.mjs',
    url: 'http://127.0.0.1:4322/sign-in',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_TEST_SERVER === '1',
    timeout: 240_000,
  },
});
