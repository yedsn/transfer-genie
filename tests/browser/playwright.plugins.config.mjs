import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'plugins.spec.js', outputDir: '../../target/playwright/plugins',
  timeout: 30_000, use: { baseURL: 'http://127.0.0.1:7120', channel: 'msedge', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:7120', reuseExistingServer: true, timeout: 60_000 },
});
