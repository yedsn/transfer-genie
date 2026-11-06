import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120';
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  await page.addInitScript(() => {
    const profile = id => ({ id, name: id.toUpperCase(), provider_kind: 'supabase', enabled: id !== 'disabled', supabase: { api_url: 'https://fixture.invalid', space_id: id, binding_state: 'bound' } });
    const settings = { active_storage_profile_id: 'a', storage_profiles: [profile('a'), profile('b'), profile('disabled')] };
    let resolveOld;
    const old = new Promise(resolve => { resolveOld = resolve; });
    window.__releaseOld = () => resolveOld({ signedIn: true, userId: 'a' });
    window.__TAURI__ = { core: { addPluginListener: async () => ({ unregister() {} }), invoke: async (command, input) => {
      if (command === 'get_platform_capabilities') return { ios: true };
      if (command === 'get_settings') return structuredClone(settings);
      if (command === 'supabase_current_user') return input.profileId === 'a' ? old : { signedIn: true, userId: 'b' };
      if (command === 'activate_storage_profile') { settings.active_storage_profile_id = input.input.profileId; return structuredClone(settings); }
      if (command === 'get_mobile_composer_draft') return { text: '', attachments: [], tagIds: [] };
      if (command === 'list_messages_window') return { messages: [], hasMoreBefore: false };
      if (command === 'list_marked_messages') return { messages: [], total: 0 };
      if (command === 'get_sync_status') return { pending_count: 0 };
      if (command === 'list_download_history') return { records: [] };
      if (command === 'get_mobile_cache_summary') return {};
      if (command === 'get_app_version') return 'fixture';
      return [];
    } }, event: { listen: async () => () => {} } };
  });
  await page.goto(origin);
  await page.getByRole('button', { name: '切换存储空间', exact: true }).waitFor();
  for (const button of await page.locator('.mobile-loading-gate button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  await page.getByRole('button', { name: '管理存储空间', exact: true }).click();
  await page.waitForSelector('.mobile-connection-manager');
  await page.evaluate(() => window.__releaseOld());
  assert.equal(await page.locator('.mobile-connection-manager').count(), 1);
  await page.getByRole('button', { name: '关闭连接管理' }).click();
  await page.getByRole('heading', { name: '选择 Supabase 配置' }).waitFor();
  assert.equal(await page.locator('.mobile-loading-gate').count(), 0);
  assert.equal(await page.locator('.mobile-onboarding .mobile-space-option:disabled').count(), 1);
  await page.locator('.mobile-onboarding .mobile-space-option').nth(1).click();
  await page.waitForSelector('.mobile-tabbar');
  assert.equal(await page.locator('.mobile-onboarding').count(), 0);

  // A fresh page keeps the native request pending to exercise the real 10s timer.
  await page.reload();
  await page.getByRole('heading', { name: '存储空间连不上' }).waitFor({ timeout: 15000 });
  await page.getByText('连接超时，请检查网络或切换存储空间', { exact: true }).waitFor();
  assert.equal(await page.locator('.mobile-loading-gate').count(), 0);
  mkdirSync('test-results/mobile-startup-recovery', { recursive: true });
  await page.screenshot({ path: 'test-results/mobile-startup-recovery/timeout.png' });
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('button', { name: '切换存储空间', exact: true }).click();
  await page.getByRole('heading', { name: '选择 Supabase 配置' }).waitFor();
  await page.evaluate(() => window.__releaseOld());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.mobile-tabbar').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('mobile startup browser recovery passed: wait actions, manager, late success, switch B, disabled target, real timeout, retry');
} finally { await browser.close(); }
