import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate(() => {
    window.__TRANSFER_GENIE_NATIVE_GESTURE_SPY__ = true;
    window.__nativeGestureStates = [];
    window.__nativeCommands = [];
    window.__originalShell = document.querySelector('.mobile-shell');
    window.__originalController = window.__originalShell.__vueParentComponent.setupState.state;
    window.transferGenieApi.mobileIntegration.setNavigationGesturesEnabled = async (enabled, revision) => {
      window.__nativeGestureStates.push({ enabled, revision });
      return { enabled, supported: true };
    };
    window.transferGenieApi.mobileIntegration.navigateNativePage = async (page, action, requestId) => {
      window.__nativeCommands.push({ page, action, requestId });
      if (action === 'close') setTimeout(() => window.dispatchEvent(new CustomEvent('transfer-genie-navigation-returned', { detail: { page, requestId } })), 0);
      return { accepted: true, supported: true };
    };
    window.__nativeCompleteReturn = () => {
      const shown = window.__nativeCommands.filter(item => item.action === 'show').at(-1);
      window.dispatchEvent(new CustomEvent('transfer-genie-navigation-returned', { detail: shown }));
    };
  });
  const originalUrl = page.url();
  const originalHistory = await page.evaluate(() => history.length);
  const assertGate = enabled => page.waitForFunction(value => window.__nativeGestureStates.at(-1)?.enabled === value, enabled);
  const assertSameDocument = async () => {
    assert.equal(page.url(), originalUrl);
    assert.equal(await page.evaluate(() => history.length), originalHistory);
    assert.equal(await page.evaluate(() => document.querySelector('.mobile-shell') === window.__originalShell && window.__originalController === window.__originalShell.__vueParentComponent.setupState.state), true);
    assert.equal(await page.locator('.mobile-onboarding').count(), 0);
  };
  await page.locator('.mobile-message-card').first().click();
  await page.waitForSelector('.mobile-detail-sheet');
  await assertGate(true);
  await assertSameDocument();
  assert.equal(await page.locator('.mobile-sheet-layer').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(await page.evaluate(() => window.__nativeCommands.slice(0, 2).map(item => item.action)), ['prepare', 'show']);
  await page.locator('.mobile-detail-more').click();
  await page.waitForSelector('.mobile-action-sheet');
  await assertGate(false);
  // A stale completion after the gate closed must retain the nested layer.
  await page.evaluate(() => window.__nativeCompleteReturn());
  await page.waitForFunction(() => window.__nativeCommands.at(-1)?.action === 'resume');
  assert.equal(await page.locator('.mobile-action-sheet').isVisible(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await assertGate(true);
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.waitForSelector('.mobile-detail-sheet', { state: 'detached' });
  await page.waitForFunction(() => window.__nativeCommands.at(-1)?.action === 'finish');
  await assertSameDocument();
  await page.getByRole('button', { name: '新消息' }).click();
  await page.waitForSelector('.mobile-composer-sheet');
  const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
  await editor.fill('Same document draft fixture');
  await assertGate(false);
  await page.evaluate(() => window.__nativeCompleteReturn());
  await page.waitForFunction(() => window.__nativeCommands.at(-1)?.action === 'resume');
  assert.equal(await editor.inputValue(), 'Same document draft fixture');
  await page.getByText('草稿已自动保存').waitFor();
  await assertGate(true);
  await editor.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await assertGate(false);
  await editor.evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await assertGate(true);
  await page.getByRole('button', { name: '标记', exact: true }).click();
  await assertGate(false);
  await page.getByRole('button', { name: '关闭编辑标记' }).click();
  await assertGate(true);
  await page.evaluate(() => window.__nativeCompleteReturn());
  await page.waitForSelector('.mobile-composer-sheet', { state: 'detached' });
  await page.waitForFunction(() => window.__nativeCommands.at(-1)?.action === 'finish');
  await page.getByRole('button', { name: '新消息' }).click();
  await page.waitForSelector('.mobile-composer-sheet');
  assert.equal(await editor.inputValue(), 'Same document draft fixture');
  await page.getByRole('button', { name: '关闭新消息' }).click();
  await page.waitForSelector('.mobile-composer-sheet', { state: 'detached' });
  await assertSameDocument();
  console.log('single-document state checks passed: no reload/loading, nested/IME/stale-return gates, retained draft and native close/finish');
} finally {
  await browser.close();
}
