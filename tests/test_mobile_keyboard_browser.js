import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.getByRole('button', { name: '新消息', exact: true }).click();
  const sheet = page.locator('.mobile-composer-sheet');
  const uiState = fn => page.evaluate(fn);
  async function visibleViewport(height, offsetTop = 0, scale = 1) {
    await page.evaluate(({ height, offsetTop, scale }) => {
      for (const [key, value] of Object.entries({ height, offsetTop, scale })) {
        Object.defineProperty(window.visualViewport, key, { configurable: true, value });
      }
      window.visualViewport.dispatchEvent(new Event('resize'));
      window.visualViewport.dispatchEvent(new Event('scroll'));
    }, { height, offsetTop, scale });
  }
  for (const large of [false, true]) {
    await page.evaluate(large => {
      document.documentElement.style.setProperty('--mobile-text-scale', String(large ? 53 / 17 : 1));
      document.documentElement.dataset.mobileAccessibilityText = String(large);
    }, large);
    for (const { width, height, visibleHeight } of [
      { width: 390, height: 844, visibleHeight: 447 },
      { width: 320, height: 568, visibleHeight: 300 },
      { width: 844, height: 390, visibleHeight: 210 },
      { width: 844, height: 390, visibleHeight: 114 },
    ]) {
      await page.setViewportSize({ width, height });
      await visibleViewport(height);
      await sheet.getByRole('button', { name: '文字', exact: true }).click();
      const plain = sheet.getByRole('textbox', { name: '消息内容', exact: true });
      await plain.fill('keyboard-local-fixture');
      await uiState(() => {
        const state = document.querySelector('.mobile-shell').__vueParentComponent.setupState.state;
        state.composer.attachments = [{ id: 'keyboard-attachment', path: '/fixture/keyboard.txt', originalName: '未发送附件.txt', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported' }];
      });
      for (const format of ['text', 'markdown']) {
        if (format === 'markdown') await sheet.getByRole('button', { name: 'Markdown', exact: true }).click();
        const editor = sheet.getByRole('textbox', { name: '消息内容', exact: true });
        await editor.waitFor();
        await editor.focus();
        const before = await uiState(() => JSON.stringify(document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments));
        await visibleViewport(visibleHeight, 12);
        const shell = await page.locator('.mobile-shell').boundingBox();
        assert.equal(shell.height, visibleHeight);
        assert.equal(shell.y, 12);
        assert.equal(await page.locator('.is-keyboard-visible').count(), 1);
        assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), false, 'send, attachments and mode controls do not follow the keyboard');
        assert.equal(await sheet.evaluate(el => el.scrollWidth > el.clientWidth), false);
        const close = sheet.getByRole('button', { name: '关闭新消息', exact: true });
        const dismiss = sheet.getByRole('button', { name: '收起键盘', exact: true });
        for (const control of [close]) {
          const box = await control.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.y >= shell.y && box.y + box.height <= shell.y + visibleHeight);
        }
        if (large) assert.ok(await editor.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) > 45, 'preserve accessibility text');
        if (format === 'markdown') {
          const tools = sheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
          assert.equal(await tools.getByRole('button').first().getAttribute('aria-label'), '收起键盘', 'dismiss keyboard is the first toolbar icon');
          assert.ok(await dismiss.isVisible());
          const box = await tools.boundingBox();
          assert.equal(box.x, 0); assert.equal(box.width, width);
          assert.equal(box.y + box.height, shell.y + visibleHeight, 'only the formatting toolbar docks to the keyboard');
          const host = sheet.locator('.mobile-rich-editor-host');
          const hostBox = await host.boundingBox();
          assert.ok(hostBox.height > 0 && hostBox.y + hostBox.height <= box.y, 'writing area remains scrollable above tools');
          await host.evaluate(el => { el.scrollTop = el.scrollHeight; });
          assert.deepEqual(await tools.boundingBox(), box);
          for (const label of ['粗体', '链接']) {
            const tool = tools.getByRole('button', { name: label, exact: true });
            await tool.scrollIntoViewIfNeeded();
            assert.ok(await tool.evaluate(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }));
          }
          if (!large && width === 390) await page.screenshot({ path: '/tmp/tg-toolbar-only-keyboard-20261028.png' });
        }
        await visibleViewport(100, 20, 2);
        assert.equal((await page.locator('.mobile-shell').boundingBox()).height, visibleHeight, 'ignore pinch zoom');
        if (format === 'markdown') await dismiss.click();
        else await editor.evaluate(el => el.blur());
        assert.ok(await editor.evaluate(el => !el.contains(document.activeElement)), 'dismiss blurs input without closing composer');
        // Browser fixtures cannot invoke an OS keyboard; model its dismissal after blur.
        await visibleViewport(height);
        assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), true);
        assert.equal(await uiState(() => JSON.stringify(document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments)), before, 'dismiss preserves attachments');
        assert.equal(await uiState(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.text), 'keyboard-local-fixture');
        if (format === 'markdown') {
          const tools = await sheet.getByRole('toolbar', { name: 'Markdown 格式工具' }).boundingBox();
          const actions = await sheet.locator('.mobile-compose-actions').boundingBox();
          assert.ok(tools.y + tools.height <= actions.y, 'toolbar returns above send controls');
        }
        assert.ok(await sheet.getByRole('button', { name: '发送', exact: true }).isVisible());
      }
      await uiState(() => { document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments = []; });
    }
  }

  // The iOS floating input-assistant capsule is not reflected reliably in VisualViewport.
  await page.setViewportSize({ width: 440, height: 956 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--mobile-text-scale', '1');
    document.documentElement.dataset.mobileAccessibilityText = 'false';
  });
  await visibleViewport(620);
  await sheet.getByRole('textbox', { name: '消息内容', exact: true }).focus();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 548 } })));
  const nativeTools = sheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
  const nativeBox = await nativeTools.boundingBox();
  assert.equal(nativeBox.y + nativeBox.height, 548, 'native keyboard geometry keeps the toolbar above the 72pt assistant area');
  assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), false);
  assert.equal(await sheet.getByRole('textbox', { name: '消息内容', exact: true }).getAttribute('contenteditable'), 'true');
  await nativeTools.getByRole('button', { name: '收起键盘', exact: true }).click();
  await visibleViewport(956);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } })));
  await page.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
  assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), true, 'native hide restores send controls');

  const iosContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  try {
    const iosPage = await iosContext.newPage();
    iosPage.setDefaultTimeout(10000);
    await iosPage.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
    await iosPage.waitForSelector('.mobile-message-card');
    await iosPage.getByRole('button', { name: '新消息', exact: true }).click();
    const iosSheet = iosPage.locator('.mobile-composer-sheet');
    const plain = iosSheet.getByRole('textbox', { name: '消息内容', exact: true });
    await plain.waitFor();
    await iosPage.waitForSelector('.mobile-shell.is-keyboard-visible');
    assert.equal(await iosSheet.locator('.mobile-compose-actions').isVisible(), false, 'iOS focus hides actions when WKWebView does not resize VisualViewport');
    await plain.evaluate(el => el.blur());
    await iosPage.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
    await iosSheet.getByRole('button', { name: 'Markdown', exact: true }).click();
    const rich = iosSheet.getByRole('textbox', { name: '消息内容', exact: true });
    await rich.waitFor();
    await iosPage.waitForSelector('.mobile-shell.is-keyboard-visible');
    const toolbar = iosSheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
    assert.equal(await toolbar.getByRole('button').first().getAttribute('aria-label'), '收起键盘');
    await toolbar.getByRole('button', { name: '收起键盘', exact: true }).click();
    await iosPage.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
    assert.equal(await iosSheet.locator('.mobile-compose-actions').isVisible(), true, 'dismiss icon restores the unchanged action area');
  } finally {
    await iosContext.close();
  }
  console.log('mobile keyboard browser tests passed: toolbar-only docking, hidden send/actions, dismiss and draft preservation, plain/Markdown, narrow/landscape/max text');
} finally {
  await browser.close();
}
