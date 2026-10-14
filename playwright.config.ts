import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/browser',
  use: { baseURL: process.env.TEST_ORIGIN ?? 'http://localhost:8081', locale: 'en-US', trace: 'off' },
});
