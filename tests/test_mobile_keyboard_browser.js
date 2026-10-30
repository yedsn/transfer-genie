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
      { width: 844, height: 390, visibleHeight: 110 },
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
        assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), true, 'send, attachments and mode controls remain visible with the keyboard');
        const bottom = sheet.locator('.mobile-compose-bottom');
        const bottomBox = await bottom.boundingBox();
        assert.ok(bottomBox.y >= shell.y && bottomBox.y + bottomBox.height <= shell.y + visibleHeight + 1, 'the bottom action row remains inside the visible canvas: ' + JSON.stringify({ width, visibleHeight, large, format, shell, bottomBox }));
        for (const label of ['照片', '文件', '标记', '发送']) {
          const control = sheet.getByRole('button', { name: label, exact: true });
          await control.scrollIntoViewIfNeeded();
          assert.ok(await control.evaluate(el => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return r.width >= 44 && r.height >= 44 && (hit === el || el.contains(hit));
          }), 'action center is not clipped: ' + label + JSON.stringify({ width, visibleHeight, large, format }));
        }
        assert.equal(await sheet.evaluate(el => el.scrollWidth > el.clientWidth), false, JSON.stringify({ width, height, visibleHeight, large, format }));
        const close = sheet.getByRole('button', { name: '关闭新消息', exact: true });
        const dismiss = sheet.getByRole('button', { name: '收起键盘', exact: true });
        for (const control of [close]) {
          const box = await control.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.y >= shell.y && box.y + box.height <= shell.y + visibleHeight, JSON.stringify({ width, height, visibleHeight, large, format, shell, close: box }));
        }
        if (large) assert.ok(await editor.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) > 45, 'preserve accessibility text');
        if (format === 'markdown') {
          const tools = sheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
          assert.equal(await tools.getByRole('button').first().getAttribute('aria-label'), '收起键盘', 'dismiss keyboard is the first toolbar icon');
          assert.ok(await dismiss.isVisible());
          const box = await tools.boundingBox();
          assert.equal(box.x, 0); assert.ok(box.width <= width);
          const headerBox = await sheet.locator('header').boundingBox();
          assert.ok(box.y >= headerBox.y + headerBox.height && box.y <= headerBox.y + headerBox.height + 8, 'toolbar stays directly below the quiet header');
          const host = sheet.locator('.mobile-rich-editor-host');
          const hostBox = await host.boundingBox();
          assert.ok(hostBox.height > 0 && hostBox.y >= box.y + box.height, 'writing area remains scrollable below the top toolbar');
          assert.ok(hostBox.y + hostBox.height <= shell.y + visibleHeight, 'writing area fits above the keyboard');
          await host.evaluate(el => { el.scrollTop = el.scrollHeight; });
          assert.deepEqual(await tools.boundingBox(), box);
          for (const label of ['粗体', '链接']) {
            const tool = tools.getByRole('button', { name: label, exact: true });
            await tool.scrollIntoViewIfNeeded();
            assert.ok(await tool.evaluate(el => { const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }));
          }
          if (!large && width === 390) await page.screenshot({ path: '/tmp/tg-toolbar-top-keyboard-20261028.png' });
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
          const hostBox = await sheet.locator('.mobile-rich-editor-host').boundingBox();
          assert.ok(tools.y + tools.height <= hostBox.y && hostBox.y + hostBox.height <= actions.y, 'toolbar stays above writing area; send controls return at the bottom');
        }
        assert.ok(await sheet.getByRole('button', { name: '发送', exact: true }).isVisible());
      }
      await uiState(() => { document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments = []; });
    }
  }

  // Native geometry may resize the writing area, but never moves the top toolbar.
  await page.setViewportSize({ width: 440, height: 956 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--mobile-text-scale', '1');
    document.documentElement.dataset.mobileAccessibilityText = 'false';
  });
  await visibleViewport(620);
  await sheet.getByRole('textbox', { name: '消息内容', exact: true }).focus();
  const nativeTools = sheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
  const beforeNativeBox = await nativeTools.boundingBox();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 616 } })));
  const nativeBox = await nativeTools.boundingBox();
  assert.equal(nativeBox.y, beforeNativeBox.y, 'native keyboard geometry does not move the toolbar from the top');
  const nativeHostBox = await sheet.locator('.mobile-rich-editor-host').boundingBox();
  assert.ok(nativeHostBox.y >= nativeBox.y + nativeBox.height && nativeHostBox.y + nativeHostBox.height <= 616, 'native geometry only bounds the writing surface');
  assert.equal(await sheet.locator('.mobile-compose-actions').isVisible(), true);
  assert.equal(await sheet.getByRole('textbox', { name: '消息内容', exact: true }).getAttribute('contenteditable'), 'true');
  await visibleViewport(540, 76);
  const draggedShell = await page.locator('.mobile-shell').boundingBox();
  assert.equal(draggedShell.height, 616, 'drag near the input assistant must not subtract the viewport offset from native height');
  assert.equal(draggedShell.y, 0, 'native keyboard coordinates keep the editor canvas anchored');
  assert.deepEqual(await nativeTools.boundingBox(), nativeBox, 'assistant-region drag does not move or shrink the top toolbar');
  assert.deepEqual(await sheet.locator('.mobile-rich-editor-host').boundingBox(), nativeHostBox, 'assistant-region drag preserves the writing region');
  await nativeTools.getByRole('button', { name: '收起键盘', exact: true }).click();
  await visibleViewport(956);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } })));
  await page.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
  assert.equal((await nativeTools.boundingBox()).y, nativeBox.y, 'keyboard dismissal keeps the toolbar at the same top position');
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
    // iOS has no resize event for WKWebView here; only UIKit knows the keyboard frame.
    await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 600 } })));
    await iosPage.waitForSelector('.mobile-shell.is-keyboard-visible');
    assert.equal(await iosSheet.locator('.mobile-compose-actions').isVisible(), true, 'iOS keyboard geometry keeps actions visible');
    await iosPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await plain.evaluate(el => el.blur());
    await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } })));
    await iosPage.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
    await iosSheet.getByRole('button', { name: 'Markdown', exact: true }).click();
    const rich = iosSheet.getByRole('textbox', { name: '消息内容', exact: true });
    await rich.waitFor();
    await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 600 } })));
    await iosPage.waitForSelector('.mobile-shell.is-keyboard-visible');
    const toolbar = iosSheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
    assert.equal(await toolbar.getByRole('button').first().getAttribute('aria-label'), '收起键盘');
    await toolbar.getByRole('button', { name: '收起键盘', exact: true }).click();
    await iosPage.evaluate(() => window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } })));
    await iosPage.waitForSelector('.mobile-shell:not(.is-keyboard-visible)');
    assert.equal(await iosSheet.locator('.mobile-compose-actions').isVisible(), true, 'dismiss icon restores the unchanged action area');
  } finally {
    await iosContext.close();
  }
  console.log('mobile keyboard browser tests passed: fixed top toolbar, visible send/actions, dismiss and draft preservation, plain/Markdown, narrow/landscape/max text');
} finally {
  await browser.close();
}
