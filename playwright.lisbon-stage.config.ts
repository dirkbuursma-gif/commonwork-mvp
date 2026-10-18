import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'lisbon-stage-fit.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
