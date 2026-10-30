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
  await page.evaluate(() => Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 9999 }));
  await page.getByRole('button', { name: '新消息' }).click();
  await page.waitForSelector('.mobile-composer-sheet');
  const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '消息内容');
  assert.equal(await editor.evaluate(el => document.activeElement === el), true, 'the opener gesture must focus before UIKit finishes the push');
  await page.waitForFunction(() => window.__nativeCommands.at(-1)?.action === 'show');
  assert.deepEqual(await page.evaluate(() => window.__nativeCommands.filter(item => item.page === 'composer').map(item => item.action)), ['prepare', 'show']);
  await editor.evaluate(el => el.blur());
  await page.evaluate(() => {
    const shown = window.__nativeCommands.at(-1);
    window.dispatchEvent(new CustomEvent('transfer-genie-navigation-shown', { detail: { ...shown, requestId: 'stale' } }));
  });
  assert.equal(await editor.evaluate(el => document.activeElement === el), false, 'stale shown events cannot focus the editor');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-navigation-shown', { detail: window.__nativeCommands.at(-1) })));
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '消息内容');
  const shellHeight = await page.locator('.mobile-shell').evaluate(el => el.style.getPropertyValue('--mobile-viewport-height'));
  assert.equal(shellHeight, await page.evaluate(() => `${document.documentElement.clientHeight}px`), 'native shown must replace stale VisualViewport geometry with the WebView layout height');
  await page.evaluate(() => Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 844 }));
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
  await page.evaluate(() => {
    const shown = window.__nativeCommands.filter(item => item.page === 'composer' && item.action === 'show').at(-1);
    window.dispatchEvent(new CustomEvent('transfer-genie-navigation-shown', { detail: shown }));
  });
  assert.equal(await page.locator('.mobile-compose-editor textarea').evaluate(el => document.activeElement === el), false, 'a duplicate shown event must not steal focus from nested mark settings');
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
  // Real iPhone: the keyboard only appears for focus raised inside the tap task,
  // and the shell must follow UIKit geometry instead of a stale VisualViewport.
  const iosPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await iosPage.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    Object.defineProperty(navigator, 'platform', { configurable: true, get: () => 'iPhone' });
  });
  await iosPage.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await iosPage.waitForSelector('.mobile-message-card');
  await iosPage.evaluate(() => {
    window.__TRANSFER_GENIE_NATIVE_GESTURE_SPY__ = true;
    window.__nativeCommands = [];
    window.__focusOrder = [];
    window.addEventListener('focusin', event => window.__focusOrder.push(event.target?.className || event.target?.getAttribute?.('aria-label') || event.target?.tagName || ''), true);
    window.transferGenieApi.mobileIntegration.setNavigationGesturesEnabled = async () => ({ enabled: true, supported: true });
    window.transferGenieApi.mobileIntegration.navigateNativePage = async (page, action, requestId) => {
      window.__nativeCommands.push({ page, action, requestId });
      return { accepted: true, supported: true };
    };
  });
  await iosPage.getByRole('button', { name: '新消息', exact: true }).click();
  assert.equal(await iosPage.evaluate(() => window.__focusOrder.indexOf('mobile-keyboard-primer')), 1, 'iOS needs an editable focused inside the tap task, before the sheet renders');
  await iosPage.waitForSelector('.mobile-composer-sheet');
  await iosPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '消息内容');
  const iosShellHeight = () => iosPage.locator('.mobile-shell').evaluate(el => el.style.getPropertyValue('--mobile-viewport-height'));
  const iosLayoutHeight = await iosPage.evaluate(() => document.documentElement.clientHeight);
  await iosPage.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 400 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.equal(await iosShellHeight(), `${iosLayoutHeight}px`, 'a stale VisualViewport must not fake the keyboard-sized layout on iOS');
  await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 447 } })));
  assert.equal(await iosShellHeight(), '447px', 'UIKit keyboard geometry drives the keyboard layout');
  assert.equal(await iosPage.locator('.mobile-shell').evaluate(el => el.classList.contains('is-keyboard-visible')), true);
  await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } })));
  assert.equal(await iosShellHeight(), `${iosLayoutHeight}px`);
  assert.equal(await iosPage.locator('.mobile-shell').evaluate(el => el.classList.contains('is-keyboard-visible')), false, 'dismissing the keyboard (⌄) must clear the keyboard layout while the editor keeps focus');
  await iosPage.close();
  console.log('single-document state checks passed: no reload/loading, nested/IME/stale-return gates, retained draft, iOS tap-task focus and UIKit keyboard geometry');
} finally {
  await browser.close();
}
