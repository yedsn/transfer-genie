import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    const message = ui.state.messages.at(-1);
    ui.state.messages = [{ ...message, filename: 'accessibility-text-fixture', kind: 'text', body: '大字体正文，仍然可以展开完整内容。'.repeat(30) }];
    ui.state.hasMoreBefore = false;
    ui.state.notice = '';
    ui.state.error = '';
    window.__accessibilityTest = ui;
  });
  const fontSize = (selector) => page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const baseline = await fontSize('.mobile-message-content p');
  assert.equal(baseline, 15);
  const scale = 53 / 17; // UIKit body size at accessibilityExtraExtraExtraLarge.
  await page.evaluate((scale) => {
    document.documentElement.style.setProperty('--mobile-text-scale', String(scale));
    document.documentElement.dataset.mobileAccessibilityText = 'true';
    document.documentElement.dataset.mobileReducedMotion = 'true';
  }, scale);
  assert.ok(Math.abs(await fontSize('.mobile-message-content p') - baseline * scale) < 0.02, 'message text really scales');
  await page.waitForSelector('.mobile-message-expand');
  assert.ok(await page.locator('.mobile-bubble-viewport').evaluate((el) => el.clientHeight) <= 130);
  await page.locator('.mobile-message-expand').click();
  assert.equal(await page.locator('.mobile-message-expand').getAttribute('aria-expanded'), 'true');
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction((height) => Math.abs(document.querySelector('.mobile-shell').getBoundingClientRect().height - height) < 1, viewport.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.mobile-feed-scroll').scrollWidth > document.querySelector('.mobile-feed-scroll').clientWidth), false, 'large text stays within viewport');
    const space = await page.locator('.mobile-space-switcher').boundingBox();
    const search = await page.getByRole('button', { name: '搜索消息', exact: true }).boundingBox();
    assert.ok(space.x + space.width <= search.x, 'Space and search do not overlap');
    for (const label of ['消息', '标记', '我的', '新消息']) {
      const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= viewport.height, label + ' stays reachable');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '新消息', exact: true }).click();
  assert.ok(await fontSize('.mobile-composer-sheet textarea') > 45);
  await page.evaluate(() => {
    window.__accessibilityTest.state.composer.attachments = [{ id: 'motion-fixture', path: '/sandbox/fixture.jpg', originalName: 'fixture.jpg', mediaType: 'image', sizeBytes: 1, previewState: 'loading' }];
  });
  const animation = (selector, pseudo) => page.locator(selector).first().evaluate((el, pseudo) => getComputedStyle(el, pseudo).animationName, pseudo);
  assert.equal(await animation('.mobile-sheet'), 'none');
  assert.equal(await animation('.mobile-attachment-strip > div', '::before'), 'none', 'native reduce motion disables draft loader');
  await page.evaluate(() => { document.documentElement.dataset.mobileReducedMotion = 'false'; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await animation('.mobile-attachment-strip > div', '::before'), 'none', 'media preference also disables draft loader');
  await page.getByRole('button', { name: '关闭新消息', exact: true }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.locator('.mobile-settings-group button').filter({ hasText: '关于 Transfer Genie' }).click();
  assert.ok(Math.abs(await fontSize('.mobile-about-facts > div') - 13 * scale) < 0.02);
  assert.equal(await page.locator('.mobile-sheet').evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await page.getByRole('button', { name: '关闭关于', exact: true }).click();
  await page.getByRole('button', { name: '消息', exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--mobile-text-scale', '1');
    document.documentElement.dataset.mobileAccessibilityText = 'false';
  });
  assert.equal(await fontSize('.mobile-message-content p'), baseline, 'normal system category restores original font size');
  console.log('mobile accessibility browser tests passed: actual font scaling, collapse, layout, reachable controls, native/media reduced motion, preference restoration');
} finally {
  await browser.close();
}
