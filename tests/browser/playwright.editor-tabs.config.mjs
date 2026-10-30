import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'editor-tab-sortable.spec.js',
  outputDir: '../../target/playwright/editor-tabs',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:7120',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:7120',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
