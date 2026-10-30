import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Local fixtures only: the pull is stubbed, nothing is written to Supabase.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate(() => {
    window.__refreshTest = { pulls: 0, reads: 0 };
    const api = window.transferGenieApi;
    const listWindow = api.message.listWindow.bind(api.message);
    api.message.listWindow = async input => { window.__refreshTest.reads += 1; return listWindow(input); };
    api.sync.refresh = async () => { window.__refreshTest.pulls += 1; return { last_result: '同步完成，新增 2 条' }; };
    api.sync.listPendingOperations = async () => [];
    api.sync.getSyncStatus = async () => ({ pending_count: 0, last_result: '同步完成，新增 2 条' });
    api.marked.getMarkedMessages = async () => ({ messages: [], total: 0 });
    api.marked.listMarkedTags = async () => [];
    api.transfer.listDownloadHistory = async () => ({ records: [] });
  });
  const refresh = page.getByRole('button', { name: '刷新列表', exact: true });
  assert.equal(await refresh.count(), 1, 'the message list header must expose a refresh button');
  await refresh.click();
  await page.locator('.mobile-toast', { hasText: '同步完成，新增 2 条' }).waitFor();
  assert.equal(await page.evaluate(() => window.__refreshTest.pulls), 1, 'the button pulls the remote delta once');
  assert.ok(await page.evaluate(() => window.__refreshTest.reads) > 0, 'refresh re-reads the local window');
  assert.equal(await refresh.isDisabled(), false, 'the button returns to idle after the pull');
  assert.equal(await page.locator('.mobile-message-card').count() > 0, true);
  console.log('mobile refresh browser test passed: header refresh pulls the delta, re-reads messages and reports a toast');
} finally {
  await browser.close();
}
