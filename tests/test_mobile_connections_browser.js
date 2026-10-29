import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    const longUrl = 'https://this-is-a-very-long-project-reference-for-mobile-layout.supabase.fixture.invalid';
    ui.state.profiles = [
      { ...ui.state.activeProfile, name: 'Personal Cloud', supabase: { ...ui.state.activeProfile.supabase, api_url: longUrl, anon_key: 'must-never-render', binding_state: 'bound' } },
      { id: 'disabled-fixture', name: 'Archive', provider_kind: 'supabase', enabled: false, supabase: { api_url: 'https://archive.fixture.invalid', anon_key: 'also-hidden', space_id: 'archive-space', binding_state: 'bound' } },
    ];
    ui.state.activeProfile = ui.state.profiles[0];
    ui.state.connectionStates = { 'preview-profile': 'ready', 'disabled-fixture': 'disabled' };
  });

  // Recovery gates keep the complete local connection manager available. The
  // underlying failed page is inert while the full-screen manager is open.
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    ui.state.boot = 'error';
    ui.state.error = 'fixture initialization error';
  });
  await page.getByRole('button', { name: '管理连接' }).click();
  await page.waitForSelector('.mobile-connection-manager');
  assert.equal(await page.locator('.mobile-onboarding').getAttribute('inert'), '');
  assert.equal(await page.locator('.mobile-connection-card').count(), 2);
  await page.getByRole('button', { name: '关闭连接管理' }).click();
  await page.getByText('fixture initialization error').waitFor();
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    ui.state.boot = 'choose-profile';
    ui.state.error = '';
    ui.state.activeProfile = null;
  });
  await page.getByRole('button', { name: '管理连接' }).click();
  await page.waitForSelector('.mobile-connection-manager');
  assert.equal(await page.locator('.mobile-connection-card').count(), 2);
  await page.getByRole('button', { name: '关闭连接管理' }).click();
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    ui.state.boot = 'ready';
    ui.state.activeProfile = ui.state.profiles[0];
  });

  // The connection wizard masks the public Key in the editable DOM and never
  // renders it into connection cards or summaries.
  await page.locator('.mobile-tabbar button').filter({ hasText: '我的' }).dispatchEvent('click');
  await page.getByRole('button', { name: /存储空间/ }).dispatchEvent('click');
  await page.getByRole('button', { name: '＋ 新增连接' }).click();
  await page.waitForSelector('.mobile-connection-wizard');
  const publicKeyInput = page.locator('input[aria-label="Supabase 公开 Key（已遮蔽）"]');
  assert.equal(await publicKeyInput.getAttribute('type'), 'password');
  await publicKeyInput.fill('sb_publishable_should_stay_masked');
  assert.equal(await publicKeyInput.inputValue(), 'sb_publishable_should_stay_masked');
  assert.doesNotMatch(await page.locator('.mobile-connection-wizard').innerText(), /sb_publishable_should_stay_masked/);
  await page.evaluate(() => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    ui.controller.cancelConnectionWizard();
  });

  await page.waitForSelector('.mobile-connection-manager');
  assert.equal(await page.locator('.mobile-connection-card').count(), 2);
  assert.equal(await page.locator('.mobile-connection-card.is-current').count(), 1);
  assert.equal(await page.locator('.mobile-connection-card.is-disabled').count(), 1);
  assert.equal(await page.getByText('当前', { exact: true }).count(), 1);
  assert.equal(await page.getByText('已停用', { exact: true }).count(), 1);
  const bodyText = await page.locator('.mobile-connection-manager').innerText();
  assert.doesNotMatch(bodyText, /must-never-render|also-hidden/);
  assert.match(bodyText, /this-is-a-very-long-project-reference/);
  const metrics = await page.evaluate(() => {
    const manager = document.querySelector('.mobile-connection-manager');
    const card = document.querySelector('.mobile-connection-card');
    const actions = [...document.querySelectorAll('.mobile-connection-actions button')].map(button => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
    return {
      managerHeight: manager.getBoundingClientRect().height,
      shellHeight: document.querySelector('.mobile-shell').getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth || card.scrollWidth > card.clientWidth,
      actions,
    };
  });
  assert.ok(Math.abs(metrics.managerHeight - metrics.shellHeight) < 2, 'manager fills the mobile shell');
  assert.equal(metrics.overflow, false, 'long endpoints do not overflow the viewport');
  for (const action of metrics.actions) assert.ok(action.height >= 44 && action.width >= 44);

  // Nested management returns to the exact context and restores focus.
  const manageButton = page.locator('.mobile-connection-card').first().getByRole('button', { name: '管理' });
  await manageButton.click();
  await page.waitForSelector('.mobile-connection-edit-sheet');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '关闭连接设置');
  const removeButton = page.getByRole('button', { name: '移除连接…' });
  await removeButton.click();
  await page.waitForSelector('#mobile-connection-remove-title');
  assert.equal(await page.locator('.mobile-connection-manager').count(), 0, 'background management layer is not interactive');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '取消移除连接');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.waitForSelector('.mobile-connection-edit-sheet');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '移除连接…');
  await page.getByRole('button', { name: '关闭连接设置' }).click();
  await page.waitForSelector('.mobile-connection-manager');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '管理');
  if (process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH) await page.screenshot({ path: process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH, fullPage: true });
  // Dynamic Type scales text, not the canvas. Exercise real CSS on a small
  // screen, including native keyboard geometry and scroll-to-reach controls.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--mobile-text-scale', '1.6');
    document.documentElement.dataset.mobileAccessibilityText = 'true';
  });
  async function assertBounded(selector) {
    const metrics = await page.locator(selector).evaluate(element => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(metrics.pageOverflow, false);
    assert.ok(metrics.scrollWidth <= metrics.width + 1, `${selector} stays within the narrow viewport`);
  }
  await assertBounded('.mobile-connection-manager');
  await page.locator('.mobile-connection-card').last().getByRole('button', { name: '管理' }).scrollIntoViewIfNeeded();
  if (process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH) await page.screenshot({ path: join(dirname(process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH), 'connections-large-text.png') });
  await page.getByRole('button', { name: '＋ 新增连接' }).click();
  await page.waitForSelector('.mobile-connection-wizard');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: 300 } }));
  });
  await publicKeyInput.fill('sb_publishable_should_stay_masked');
  await publicKeyInput.focus();
  await assertBounded('.mobile-connection-wizard');
  const testConnectionButton = page.getByRole('button', { name: '测试连接并继续' });
  await testConnectionButton.scrollIntoViewIfNeeded();
  const keyboardMetrics = await testConnectionButton.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return { bottom: rect.bottom, top: rect.top, height: rect.height, shellHeight: document.querySelector('.mobile-shell').getBoundingClientRect().height };
  });
  assert.equal(keyboardMetrics.shellHeight, 300);
  assert.ok(keyboardMetrics.top >= 0 && keyboardMetrics.bottom <= 301 && keyboardMetrics.height >= 44, 'step action can be reached above the simulated keyboard');
  if (process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH) await page.screenshot({ path: join(dirname(process.env.MOBILE_CONNECTIONS_SCREENSHOT_PATH), 'connections-large-text-keyboard.png') });
  const cancelWizard = page.getByRole('button', { name: '取消新增' });
  await cancelWizard.scrollIntoViewIfNeeded();
  await publicKeyInput.focus();
  assert.equal(await cancelWizard.evaluate(button => {
    const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    return button.dispatchEvent(event);
  }), false, 'cancel prevents input blur and keyboard reflow before click');
  await cancelWizard.click();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: null } }));
    document.documentElement.style.removeProperty('--mobile-text-scale');
    delete document.documentElement.dataset.mobileAccessibilityText;
  });
  await page.waitForSelector('.mobile-connection-manager');

  // Home quick selection lists saved profiles, disables invalid targets and keeps
  // the full manager as a separate entry point.
  await page.getByRole('button', { name: '关闭连接管理' }).click();
  await page.locator('.mobile-tabbar button').filter({ hasText: '消息' }).click();
  const storageSwitcher = page.locator('.mobile-space-switcher');
  await storageSwitcher.click();
  await page.waitForSelector('.mobile-connections-sheet');
  assert.equal(await page.locator('.mobile-connections-sheet .mobile-space-option').count(), 2);
  assert.equal(await page.locator('.mobile-connections-sheet .mobile-space-option:disabled').count(), 1);
  assert.match(await page.locator('.mobile-connections-sheet').innerText(), /这里只切换已保存连接，不会更换连接内绑定的 Space/);

  // Active-selection confirmation and pending-work abandonment are separate.
  await page.getByRole('button', { name: '关闭连接选择' }).click();
  await page.locator('.mobile-tabbar button').filter({ hasText: '我的' }).click();
  await page.getByRole('button', { name: /存储空间/ }).click();
  await page.locator('.mobile-connection-card').first().getByRole('button', { name: '管理' }).click();
  await page.getByRole('button', { name: '移除连接…' }).click();
  await page.evaluate(() => {
    window.__mobileRemovalCalls = [];
    window.transferGenieApi.settings.removeStorageProfile = async (profileId, options) => {
      window.__mobileRemovalCalls.push({ profileId, options });
      if (!options.abandonWork) throw new Error('该存储空间仍有待上传、冲突或未完成的数据传输任务');
      return window.transferGenieApi.settings.getSettings();
    };
  });
  await page.getByRole('button', { name: '确认移除' }).click();
  await page.getByRole('button', { name: '放弃未完成工作并移除' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__mobileRemovalCalls[0]), {
    profileId: 'preview-profile',
    options: { confirmActiveRemoval: true, abandonWork: false },
  });
  await page.getByRole('button', { name: '放弃未完成工作并移除' }).click();
  assert.deepEqual(await page.evaluate(() => window.__mobileRemovalCalls[1]), {
    profileId: 'preview-profile',
    options: { confirmActiveRemoval: true, abandonWork: true },
  });
  console.log('mobile connections browser passed: recovery access, fullscreen cards, quick selection, nested focus, long URL, 44pt targets, large text, simulated keyboard geometry and no key disclosure');
} finally {
  await browser.close();
}
