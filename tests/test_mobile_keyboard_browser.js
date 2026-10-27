import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate(() => {
    window.__keyboardWindowDescriptors = Object.fromEntries(['innerHeight', 'scrollY'].map((key) => [key, Object.getOwnPropertyDescriptor(window, key)]));
  });
  await page.getByRole('button', { name: '新消息', exact: true }).click();
  async function visibleViewport(height, offsetTop = 0, scale = 1) {
    await page.evaluate(({ height, offsetTop, scale }) => {
      for (const [key, value] of Object.entries({ height, offsetTop, scale })) {
        Object.defineProperty(window.visualViewport, key, { configurable: true, value });
      }
      window.visualViewport.dispatchEvent(new Event('resize'));
      window.visualViewport.dispatchEvent(new Event('scroll'));
    }, { height, offsetTop, scale });
  }
  for (const accessibilityText of [false, true]) {
  await page.evaluate((large) => {
    document.documentElement.style.setProperty("--mobile-text-scale", String(large ? 53 / 17 : 1));
    document.documentElement.dataset.mobileAccessibilityText = String(large);
  }, accessibilityText);
  for (const { width, height, visibleHeight } of [
    { width: 390, height: 844, visibleHeight: 447 },
    { width: 320, height: 568, visibleHeight: 300 },
    { width: 844, height: 390, visibleHeight: 210 },
    { width: 844, height: 390, visibleHeight: 114 },
  ]) {
    await page.setViewportSize({ width, height });
    await visibleViewport(visibleHeight, 12);
    const shell = await page.locator('.mobile-shell').boundingBox();
    assert.equal(shell.height, visibleHeight);
    assert.equal(shell.y, 12);
    assert.equal(await page.locator('.is-keyboard-visible').count(), 1);
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('keyboard-local-fixture');
    const sheet = page.locator('.mobile-composer-sheet');
    assert.equal(await sheet.evaluate((el) => el.scrollWidth > el.clientWidth), false, JSON.stringify({ accessibilityText, width, height, visibleHeight, overflow: await sheet.evaluate(el => [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(child => ({ class: child.className, right: child.getBoundingClientRect().right, width: child.getBoundingClientRect().width })).slice(0, 10)) }));
    if (accessibilityText && width > height) {
      const layout = await sheet.evaluate((el) => {
        const editor = el.querySelector('textarea').getBoundingClientRect();
        const actions = el.querySelector('.mobile-compose-actions').getBoundingClientRect();
        const send = el.querySelector('.mobile-primary-button').getBoundingClientRect();
        const close = el.querySelector('header > button').getBoundingClientRect();
        const content = el.querySelector('.mobile-composer-content').getBoundingClientRect();
        const closeHit = document.elementFromPoint(close.x + close.width / 2, close.y + close.height / 2);
        return { editorRight: editor.right, actionsLeft: actions.left, actionsRight: actions.right, sendTop: send.top, closeLeft: close.left, contentRight: content.right, closeHittable: closeHit?.closest('button') === el.querySelector('header > button') };
      });
      assert.ok(layout.editorRight < layout.actionsLeft && layout.actionsRight <= layout.closeLeft, 'large-text landscape keeps editor and horizontally scrolling actions separate: ' + JSON.stringify(layout));
      assert.ok(layout.contentRight <= layout.closeLeft && layout.closeHittable, 'the content grid must not intercept the separate close control');
    }
    await page.evaluate(({ height, visibleHeight }) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: visibleHeight + 59 });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: height - visibleHeight - 59 });
      window.visualViewport.dispatchEvent(new Event('scroll'));
    }, { height, visibleHeight });
    assert.equal(await page.locator('.is-keyboard-visible').count(), 1, 'picker-return layout scroll must not be mistaken for keyboard dismissal');
    await page.evaluate(() => {
      for (const [key, descriptor] of Object.entries(window.__keyboardWindowDescriptors)) Object.defineProperty(window, key, descriptor);
    });
    await visibleViewport(visibleHeight, 12);
    if (accessibilityText) assert.ok(await page.getByRole("textbox", { name: "消息内容", exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)) > 45, "Keyboard must not shrink accessibility text");
    for (const label of ['照片', '文件', '发送', '关闭新消息']) {
      const action = sheet.getByRole('button', { name: label, exact: label === '发送' || label === '关闭新消息' });
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.y >= shell.y && box.y + box.height <= shell.y + visibleHeight + 1, label + ' remains reachable above keyboard');
    }
    await page.evaluate(() => {
      const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
      ui.state.composer.attachments = ['first', 'second'].map((id) => ({ id, clientId: id, path: '/fixture/' + id + '.txt', originalName: '键盘附件测试-' + id + '.txt', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported' }));
    });
    if (accessibilityText && width > height) {
      const cards = await sheet.locator('.mobile-attachment-strip > div').evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
      assert.ok(cards.every((cardWidth) => cardWidth <= 160), 'long file names must not enlarge the horizontal attachment cards');
    }
    const mark = sheet.locator('.mobile-compose-tools button').filter({ hasText: '标记' });
    const previews = sheet.locator('.mobile-draft-open');
    const removals = sheet.getByRole('button', { name: '移除附件', exact: true });
    for (const action of [sheet.getByRole('button', { name: '发送', exact: true }), previews.nth(0), removals.nth(0), previews.nth(1), removals.nth(1), mark]) {
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.y >= shell.y && box.y + box.height <= shell.y + visibleHeight + 1, 'draft attachments must not push actions below the visible keyboard area: ' + JSON.stringify({ accessibilityText, width, height, visibleHeight, box, label: await action.getAttribute('aria-label') }));
      const hit = await action.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { correct: hit?.closest('button') === el, target: el.getAttribute('aria-label') || el.textContent.trim(), hit: hit?.outerHTML.slice(0, 200), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      });
      assert.ok(hit.correct, 'attachment action must be physically hittable: ' + JSON.stringify({ accessibilityText, width, height, visibleHeight, ...hit }));
    }
    await mark.click();
    assert.equal(await page.locator('.mobile-marked-edit-sheet').count(), 1);
    await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
    assert.equal(await mark.evaluate((el) => el.classList.contains('is-selected')), true);
    await mark.click();
    await page.getByLabel('发送时标记', { exact: true }).uncheck();
    await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
    assert.equal(await mark.evaluate((el) => el.classList.contains('is-selected')), false);
    await removals.nth(1).click();
    assert.equal(await previews.count(), 1);
    assert.match(await previews.first().getAttribute('aria-label'), /first/);
    await removals.first().click();
    assert.equal(await sheet.locator('.mobile-attachment-strip').count(), 0);
    await sheet.getByRole('button', { name: 'Markdown', exact: true }).dispatchEvent('click');
    const markdownTools = sheet.getByRole('toolbar', { name: 'Markdown 格式工具' });
    for (const label of ['粗体', '链接']) {
      const tool = markdownTools.getByRole('button', { name: label, exact: true });
      await tool.scrollIntoViewIfNeeded();
      const box = await tool.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.y >= shell.y && box.y + box.height <= shell.y + visibleHeight + 1, `Markdown ${label} remains reachable above the keyboard`);
      assert.ok(await tool.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }));
    }
    await sheet.getByRole('button', { name: '文字', exact: true }).dispatchEvent('click');
    await visibleViewport(100, 20, 2);
    assert.equal((await page.locator('.mobile-shell').boundingBox()).height, visibleHeight, 'pinch zoom must not be mistaken for a keyboard resize');
  }
  }
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--mobile-text-scale", "1");
    document.documentElement.dataset.mobileAccessibilityText = "false";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await visibleViewport(844);
  assert.equal(await page.locator('.is-keyboard-visible').count(), 0);
  assert.equal((await page.locator('.mobile-shell').boundingBox()).height, 844);
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('');
  await page.getByRole('button', { name: '关闭新消息', exact: true }).click();
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    const base = ui.state.messages.at(-1);
    ui.state.messages = Array.from({ length: 30 }, (_, index) => ({ ...base, filename: 'keyboard-history-' + index, body: '键盘关闭后仍可滚动的历史消息' }));
    ui.state.hasMoreBefore = false;
  });
  const feed = page.locator('.mobile-feed-scroll');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-card').length === 30);
  assert.ok(await feed.evaluate((el) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight));
  console.log('mobile keyboard browser tests passed: visible viewport resize/offset, portrait/narrow/landscape actions, pinch zoom, keyboard dismissal');
} finally {
  await browser.close();
}
