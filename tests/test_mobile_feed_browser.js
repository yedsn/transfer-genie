import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use an existing browser/Playwright installation; all messages are local fixtures.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  assert.equal(await page.locator('.mobile-sync-ribbon').count(), 0);
  assert.equal(await page.locator('.mobile-transfer-summary').count(), 0);
  assert.equal(await page.locator('.mobile-space-switcher .mobile-space-sync').count(), 1);
  await page.evaluate(async () => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    const rows = Array.from({ length: 60 }, (_, i) => ({ filename: 'fixture-' + String(i).padStart(3, '0'), kind: 'text', sender: i % 2 ? 'Jam' : 'Mac', timestamp_ms: 1700000000000 + i * 1000, content: '消息 ' + i + String.fromCharCode(10) + '第二行，保留换行。', marked: i === 57 }));
    window.__feedTest = { ui, rows, calls: [] };
    window.transferGenieApi.message.listWindow = async (input) => {
      window.__feedTest.calls.push(input);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const end = input.beforeFilename ? rows.findIndex((row) => row.filename === input.beforeFilename) : rows.length;
      const start = Math.max(0, end - input.limit);
      return { messages: rows.slice(start, end), hasMoreBefore: start > 0 };
    };
    window.transferGenieApi.message.getMediaPreview = async () => ({ state: 'missing' });
    ui.state.messages = [];
    ui.state.hasMoreBefore = false;
    ui.state.error = '';
    ui.state.notice = '';
    ui.state.transfers = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await ui.controller.refreshMessages();
  });
  const waitBottom = () => page.waitForFunction(() => { const el = document.querySelector('.mobile-feed-scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 2; }, null, { polling: 100 });
  const metrics = () => page.evaluate(() => {
    const el = document.querySelector('.mobile-feed-scroll');
    return { top: el.scrollTop, overflow: el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth, rows: [...el.querySelectorAll('.mobile-message-card')].map((card) => {
      const menu = card.querySelector('.mobile-card-more').getBoundingClientRect();
      return { filename: card.dataset.messageFilename, own: card.classList.contains('is-self'), alignment: getComputedStyle(card).alignItems, fill: getComputedStyle(card.querySelector('.mobile-message-bubble')).backgroundColor, menuWidth: menu.width, menuHeight: menu.height };
    }) };
  });
  await waitBottom();
  let result = await metrics();
  assert.equal(result.rows[0].filename, 'fixture-010');
  assert.equal(result.rows.at(-1).filename, 'fixture-059');
  assert.equal(result.overflow, false);
  for (const row of result.rows) {
    assert.equal(row.alignment, row.own ? 'flex-end' : 'flex-start');
    assert.ok(row.menuWidth >= 44 && row.menuHeight >= 44);
  }
  assert.equal(result.rows.at(-1).fill, 'rgb(223, 245, 213)');
  assert.equal(result.rows.at(-3).fill, 'rgb(255, 245, 237)');
  assert.equal(await page.locator('.mobile-message-content p').last().evaluate((el) => getComputedStyle(el).whiteSpace), 'pre-wrap');
  await page.locator('.mobile-card-more').last().dispatchEvent('click');
  await page.waitForSelector('.mobile-sheet-layer');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.mobile-sheet-layer', { state: 'detached' });
  await page.evaluate(() => {
    const el = document.querySelector('.mobile-feed-scroll');
    el.scrollTop = 40;
    const anchor = [...el.querySelectorAll('.mobile-message-card')].find((card) => card.getBoundingClientRect().bottom > el.getBoundingClientRect().top);
    window.__feedTest.anchor = { filename: anchor.dataset.messageFilename, offset: anchor.getBoundingClientRect().top - el.getBoundingClientRect().top };
    el.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(() => window.__feedTest.ui.state.messages.length === 60 && !window.__feedTest.ui.state.loadingOlder, null, { polling: 100 });
  const anchorDelta = await page.evaluate(() => {
    const el = document.querySelector('.mobile-feed-scroll');
    const saved = window.__feedTest.anchor;
    const card = [...el.querySelectorAll('.mobile-message-card')].find((item) => item.dataset.messageFilename === saved.filename);
    return card.getBoundingClientRect().top - el.getBoundingClientRect().top - saved.offset;
  });
  assert.ok(Math.abs(anchorDelta) < 2, `prepending keeps the visible anchor (delta ${anchorDelta})`);
  assert.equal(await page.evaluate(() => window.__feedTest.calls.filter((input) => input.beforeFilename).length), 1);
  const historyTop = (await metrics()).top;
  const append = () => page.evaluate(async () => {
    const test = window.__feedTest;
    const i = test.rows.length;
    test.rows.push({ filename: 'fixture-' + i, kind: 'text', sender: 'Jam', timestamp_ms: 1700000000000 + i * 1000, content: '新消息' });
    await test.ui.controller.refreshMessages();
  });
  await append();
  assert.ok(Math.abs((await metrics()).top - historyTop) < 2, 'refresh while reading history does not jump');
  assert.equal((await metrics()).rows.length, 61);
  await page.evaluate(() => window.__feedTest.ui.scrollToLatest());
  await waitBottom();
  await append();
  await waitBottom();
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const base = ui.state.messages.at(-1);
    ui.state.messages = [
      { ...base, filename: 'long', body: 'https://example.com/' + 'a'.repeat(250), marked: false },
      { ...base, filename: 'doc', kind: 'file', title: '长文件名'.repeat(18) + '.pdf', originalName: 'report.pdf', body: undefined, meta: 'PDF · 2 MB', cached: true, marked: false },
      { ...base, filename: 'video', kind: 'video', title: 'sample.mov', originalName: 'sample.mov', body: undefined, meta: 'MOV · 4 MB', previewState: 'missing', marked: false, sender: 'Mac' },
    ];
  });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal((await metrics()).overflow, false, 'attachments and long text stay bounded at ' + viewport.width);
  }
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const base = ui.state.messages[0];
    ui.state.hasMoreBefore = false;
    ui.state.messages = [
      { ...base, filename: 'short', kind: 'text', title: '短消息', body: '短消息', sender: 'Mac' },
      { ...base, filename: 'tall', kind: 'text', title: '长消息', body: Array.from({ length: 30 }, (_, i) => '第 ' + i + ' 行正文').join(String.fromCharCode(10)), sender: 'Jam' },
      { ...base, filename: 'long-file', kind: 'file', body: undefined, title: '长文件名称'.repeat(200), originalName: 'report.pdf' },
    ];
  });
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-expand').length === 2, null, { polling: 100 });
  const tall = page.locator('[data-message-filename="tall"]');
  const expand = tall.locator('.mobile-message-expand');
  assert.equal(await page.locator('[data-message-filename="short"] .mobile-message-expand').count(), 0);
  assert.ok(await tall.locator('.mobile-bubble-viewport').evaluate((el) => el.clientHeight) <= 130);
  assert.ok(await page.locator('[data-message-filename="long-file"] .mobile-bubble-viewport').evaluate((el) => el.clientHeight) <= 260);
  assert.equal(await expand.getAttribute('aria-expanded'), 'false');
  await expand.click({ force: true });
  assert.equal(await expand.getAttribute('aria-expanded'), 'true');
  assert.ok(await tall.locator('.mobile-bubble-viewport').evaluate((el) => el.clientHeight) > 130);
  assert.equal(await page.locator('.mobile-sheet-layer').count(), 0, 'expanding must not open details or actions');
  await page.evaluate(async () => {
    const ui = window.__feedTest.ui;
    ui.state.messages = ui.state.messages.map((message) => ({ ...message }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(await expand.getAttribute('aria-expanded'), 'true', 'refresh preserves expansion for the same message');
  await expand.click({ force: true });
  assert.equal(await expand.getAttribute('aria-expanded'), 'false');
  assert.ok(await tall.locator('.mobile-bubble-viewport').evaluate((el) => el.clientHeight) <= 130);
  await page.setViewportSize({ width: 320, height: 568 });
  assert.equal((await metrics()).overflow, false);
  const topbarHeight = await page.locator('.mobile-topbar').evaluate((el) => el.getBoundingClientRect().height);
  await page.evaluate(() => { window.__feedTest.ui.state.syncStatus = { running: true }; });
  assert.equal(await page.locator('.mobile-space-sync').innerText(), '同步中…');
  await page.evaluate(() => { window.__feedTest.ui.state.syncStatus = { running: false, pending_count: 3 }; });
  assert.equal(await page.locator('.mobile-space-sync').innerText(), '3 项待同步');
  await page.evaluate(() => { window.__feedTest.ui.state.syncStatus = { last_error: 'fixture offline' }; });
  assert.equal(await page.locator('.mobile-space-sync').innerText(), '离线 · 本机已保留');
  await page.evaluate(() => { window.__feedTest.ui.state.syncStatus = { conflict_count: 1 }; });
  assert.equal(await page.locator('.mobile-space-sync').innerText(), '同步冲突');
  await page.evaluate(() => { window.__feedTest.ui.state.syncStatus = {}; });
  assert.equal(await page.locator('.mobile-space-sync').innerText(), '已同步');
  assert.equal(await page.locator('.mobile-topbar').evaluate((el) => el.getBoundingClientRect().height), topbarHeight, 'sync state changes must not grow the header');
  const compactStatus = await page.locator('.mobile-space-sync').evaluate((el) => {
    const status = el.getBoundingClientRect();
    const selector = el.closest('.mobile-space-switcher').getBoundingClientRect();
    return { height: status.height, fontSize: parseFloat(getComputedStyle(el).fontSize), inside: status.top >= selector.top && status.bottom <= selector.bottom };
  });
  assert.ok(compactStatus.inside && compactStatus.height <= 16 && compactStatus.fontSize <= 11, 'sync status is one small line inside the Space selector');
  await page.locator('.mobile-tabbar button').filter({ hasText: '我的' }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-profile-status').count(), 0, 'profile must not repeat a standalone sync panel');
  assert.equal(await page.locator('.mobile-inline-sync').count(), 0, 'profile must not repeat the compact sync state');
  await page.locator('.mobile-settings-group button').filter({ hasText: '同步与传输' }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-transfer-summary').count(), 0, 'transfer sheet must not repeat a standalone sync panel');
  assert.equal(await page.locator('.mobile-transfer-sheet').getByRole('button', { name: '立即同步', exact: true }).count(), 1, 'manual sync remains available');
  await page.getByRole('button', { name: '关闭同步与传输', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-settings-group button').filter({ hasText: '关于 Transfer Genie' }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-about-sheet').count(), 1);
  assert.match(await page.locator('.mobile-about-facts').innerText(), /Supabase/);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('transfer-genie-mobile-diagnostic', {
      detail: { platform: 'ios', nativePlugin: true, mainThread: true },
    }));
  });
  assert.match(await page.locator('.mobile-about-facts').innerText(), /ios · native=true · main-thread=true/);
  await page.getByRole('button', { name: '关闭关于', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-settings-group button').filter({ hasText: '发送者名称' }).dispatchEvent('click');
  const sender = page.getByRole('textbox', { name: '发送者名称', exact: true });
  await sender.fill('');
  assert.equal(await page.getByRole('button', { name: '保存名称', exact: true }).isEnabled(), false);
  await sender.fill('  Preview iPhone  ');
  await page.getByRole('button', { name: '保存名称', exact: true }).dispatchEvent('click');
  await page.waitForSelector('.mobile-sender-sheet', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.settings.sender_name), 'Preview iPhone');
  await page.locator('.mobile-tabbar button').filter({ hasText: '消息' }).dispatchEvent('click');
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    ui.state.syncStatus = { conflict_count: 1 };
    ui.state.conflicts = [{ id: 1, entityType: 'message', entityId: 'm1', localPayload: { content: '本机内容' }, remotePayload: { content: '云端内容' }, localRevision: 2, remoteRevision: 3 }];
    ui.controller.loadConflicts = async () => {};
  });
  await page.locator('.mobile-tabbar button').filter({ hasText: '我的' }).dispatchEvent('click');
  await page.locator('.mobile-settings-group button').filter({ hasText: '1 项需要选择保留版本' }).dispatchEvent('click');
  assert.match(await page.locator('.mobile-conflict-list').innerText(), /本机内容/);
  assert.match(await page.locator('.mobile-conflict-list').innerText(), /云端内容/);
  for (const label of ['采用云端', '保留本机']) {
    const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  await page.getByRole('button', { name: '关闭同步冲突', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-tabbar button').filter({ hasText: '消息' }).dispatchEvent('click');
  await page.evaluate(() => {
    window.__feedTest.ui.state.composer.attachments = [{ id: 'draft-preview', clientId: 'draft-preview', path: '/sandbox/report.pdf', originalName: 'report.pdf', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported' }];
  });
  await page.getByRole('button', { name: '新消息', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '消息内容', exact: true }).evaluate((el) => document.activeElement === el), true, 'composer focus enters the editor');
  for (const selector of ['.mobile-main', '.mobile-feed-dock', '.mobile-tabbar']) {
    assert.equal(await page.locator(selector).getAttribute('inert'), '', 'modal background is inert: ' + selector);
    assert.equal(await page.locator(selector).getAttribute('aria-hidden'), 'true', 'modal background is hidden from assistive navigation: ' + selector);
  }
  const focusLoop = await page.evaluate(() => {
    const sheet = document.querySelector('.mobile-composer-sheet');
    const focusable = [...sheet.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    focusable.at(-1).focus();
    return { first: focusable[0].getAttribute('aria-label') || focusable[0].textContent.trim(), last: focusable.at(-1).textContent.trim() };
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()), focusLoop.first, 'Tab wraps inside the modal');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), focusLoop.last, 'Shift+Tab wraps inside the modal');
  const previewButton = page.getByRole('button', { name: '预览附件 report.pdf', exact: true });
  const removeButton = page.getByRole('button', { name: '移除附件', exact: true });
  const targets = await Promise.all([previewButton, removeButton].map((button) => button.boundingBox()));
  for (const box of targets) assert.ok(box.width >= 44 && box.height >= 44);
  assert.ok(targets[0].x + targets[0].width <= targets[1].x, 'preview and remove targets must not overlap');
  await previewButton.dispatchEvent('click');
  assert.equal(await page.locator('.mobile-attachment-strip > div').count(), 1, 'preview must not remove/send the draft');
  await removeButton.dispatchEvent('click');
  assert.equal(await page.locator('.mobile-attachment-strip > div').count(), 0);
  await page.getByRole('button', { name: '关闭新消息', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '新消息');
  assert.equal(await page.getByRole('button', { name: '新消息', exact: true }).evaluate((el) => document.activeElement === el), true, 'closing restores focus to the opener');
  assert.equal(await page.locator('.mobile-main').getAttribute('inert'), null, 'closing removes background inertness');
  await page.evaluate(() => {
    const test = window.__feedTest;
    test.originalSendDraft = test.ui.controller.sendDraft;
    test.ui.state.composer.savedLocally = true;
    test.ui.controller.sendDraft = async () => {
      test.ui.state.composer.sending = true;
      test.ui.state.composer.text = '';
      test.ui.state.composer.savedLocally = true;
      test.ui.state.composer.sending = false;
      return true;
    };
  });
  await page.getByRole('button', { name: '新消息', exact: true }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-composer-sheet .mobile-primary-button').innerText(), '发送', 'reopening the composer must reset previous save feedback');
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true });
  await composer.fill('first dedicated browser draft');
  await page.getByRole('button', { name: '发送', exact: true }).dispatchEvent('click');
  assert.match(await page.locator('.mobile-composer-sheet .mobile-primary-button').innerText(), /已保存到本机/);
  await composer.fill('second dedicated browser draft');
  await page.waitForTimeout(750);
  assert.equal(await composer.inputValue(), 'second dedicated browser draft', 'new editing must survive the previous send close timer');
  assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '发送', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: '关闭新消息', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: '新消息', exact: true }).dispatchEvent('click');
  await composer.fill('reopened dedicated browser draft');
  await page.waitForTimeout(750);
  assert.equal(await composer.inputValue(), 'reopened dedicated browser draft', 'a previous send must not close a newly opened composer');
  await page.evaluate(() => {
    window.__feedTest.ui.controller.sendDraft = window.__feedTest.originalSendDraft;
    window.__feedTest.ui.state.composer.text = '';
  });
  await page.getByRole('button', { name: '关闭新消息', exact: true }).dispatchEvent('click');
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const item = { ...ui.state.messages[0], filename: 'marked-edit', title: '待处理资料', marked: true, tagIds: ['work'], dueDate: '2026-10-28' };
    ui.state.markedMessages = [item];
    ui.state.pendingMarkedMessages = [item];
    ui.state.markedView.messages = [item];
    ui.state.tags = [{ id: 'work', name: '工作' }, { id: 'personal', name: '个人' }];
  });
  await page.locator('.mobile-tabbar button').filter({ hasText: '标记' }).dispatchEvent('click');
  const editMark = page.getByRole('button', { name: '编辑标记 待处理资料', exact: true });
  const editBox = await editMark.boundingBox();
  assert.ok(editBox.width >= 44 && editBox.height >= 44);
  await editMark.dispatchEvent('click');
  assert.equal(await page.getByRole('button', { name: /工作/, pressed: true }).count(), 1);
  await page.locator('.mobile-marked-tag-options button[aria-pressed="false"]', { hasText: '个人' }).dispatchEvent('click');
  await page.getByRole('textbox', { name: '新标签名称', exact: true }).fill('紧急');
  assert.equal(await page.getByRole('button', { name: '添加', exact: true }).isEnabled(), true);
  const due = page.getByLabel('截止日期', { exact: true });
  assert.equal(await due.inputValue(), '2026-10-28');
  await page.getByRole('button', { name: '关闭编辑标记', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-tabbar button').filter({ hasText: '消息' }).dispatchEvent('click');
  // A long press selects without the release click opening details or deselecting the row.
  const lastCard = page.locator('.mobile-message-card').last();
  await lastCard.dispatchEvent('pointerdown');
  await page.waitForSelector('.mobile-selection-toolbar');
  await lastCard.dispatchEvent('pointerup');
  await lastCard.dispatchEvent('click');
  assert.equal(await page.locator('.mobile-message-select[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('.mobile-sheet-layer').count(), 0);
  assert.equal(await page.getByRole('button', { name: '新消息', exact: true }).count(), 0);
  for (const button of await page.locator('.mobile-selection-toolbar button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
  }
  await page.locator('.mobile-message-select[aria-pressed="false"]').first().dispatchEvent('click');
  assert.equal(await page.locator('.mobile-message-select[aria-pressed="true"]').count(), 2);
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    ui.controller.applyMessageSelection = async (messages, action) => {
      window.__feedTest.batch = { action, filenames: messages.map((item) => item.filename) };
      return { succeeded: [messages[0].filename], failed: messages.slice(1).map((item) => item.filename) };
    };
  });
  await page.locator('.mobile-selection-toolbar').getByRole('button', { name: '标记', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-select[aria-pressed="true"]').length === 1);
  assert.equal(await page.evaluate(() => window.__feedTest.batch.action), 'mark');
  assert.equal(await page.evaluate(() => window.__feedTest.batch.filenames.length), 2);
  await page.locator('.mobile-selection-toolbar').getByRole('button', { name: '删除', exact: true }).dispatchEvent('click');
  await page.waitForSelector('.mobile-delete-sheet');
  await page.locator('.mobile-delete-sheet .mobile-sheet-cancel').dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.batch.action), 'mark', 'cancelled deletion must not invoke a mutation');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.mobile-selection-toolbar', { state: 'detached' });
  await page.locator('.mobile-card-more').last().dispatchEvent('click');
  await page.getByRole('button', { name: '多选', exact: false }).dispatchEvent('click');
  await page.waitForSelector('.mobile-selection-toolbar');
  assert.equal(await page.locator('.mobile-message-select[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('.mobile-sheet-layer').count(), 0);
  if (process.env.MOBILE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.MOBILE_SCREENSHOT_PATH, timeout: 10000 });
  await page.keyboard.press('Escape');
  // Exercise the real shell search binding and paged marked view with local fixtures.
  // Single actions keep errors retryable and require confirmation before cloud deletion.
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    window.__feedTest.singleActions = [];
    ui.controller.toggleMark = async () => { ui.state.error = 'fixture mark failure'; return false; };
    ui.controller.copyMessage = async () => { ui.state.error = 'fixture clipboard failure'; return false; };
    ui.controller.deleteMessage = async (message, remote) => {
      window.__feedTest.singleActions.push({ filename: message.filename, remote });
      ui.state.error = 'fixture delete failure';
      return false;
    };
  });
  await page.locator('.mobile-card-more').last().dispatchEvent('click');
  const actionSheet = page.locator('.mobile-action-sheet');
  await actionSheet.getByRole('button', { name: '标记', exact: false }).dispatchEvent('click');
  assert.equal(await actionSheet.count(), 1);
  assert.match(await actionSheet.locator('[role="alert"]').innerText(), /fixture mark failure/);
  await actionSheet.getByRole('button', { name: '复制', exact: false }).dispatchEvent('click');
  assert.match(await actionSheet.locator('[role="alert"]').innerText(), /fixture clipboard failure/);
  const singleDeleteButton = actionSheet.getByRole('button', { name: '删除消息（同步到云端）', exact: false });
  await singleDeleteButton.dispatchEvent('click');
  await page.waitForSelector('.mobile-delete-sheet');
  await page.locator('.mobile-delete-sheet .mobile-sheet-cancel').dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.singleActions.length), 0);
  await singleDeleteButton.dispatchEvent('click');
  await page.locator('.mobile-delete-sheet').getByRole('button', { name: '确认删除', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.singleActions.length), 1);
  assert.match(await page.locator('.mobile-delete-sheet [role="alert"]').innerText(), /fixture delete failure/);
  await page.locator('.mobile-delete-sheet .mobile-sheet-cancel').dispatchEvent('click');
  await page.evaluate(() => { window.__feedTest.ui.state.busy = true; });
  for (const label of ['复制', '标记', '删除消息（同步到云端）']) {
    assert.equal(await actionSheet.getByRole('button', { name: label, exact: false }).isDisabled(), true);
  }
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    ui.state.busy = false;
    ui.controller.toggleMark = async () => { ui.state.error = ''; return true; };
  });
  await actionSheet.getByRole('button', { name: '标记', exact: false }).dispatchEvent('click');
  await page.waitForSelector('.mobile-action-sheet', { state: 'detached' });
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    ui.state.cache.fileCount = 1;
    ui.state.cache.reclaimableBytes = 1024;
    window.__feedTest.cacheWrites = 0;
    ui.controller.clearCache = async () => { window.__feedTest.cacheWrites += 1; return true; };
  });
  await page.getByRole('button', { name: '我的', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-settings-group button').filter({ hasText: '附件缓存' }).dispatchEvent('click');
  await page.locator('.mobile-cache-sheet .mobile-primary-button').dispatchEvent('click');
  assert.equal(await page.getByRole('group', { name: '确认清理缓存' }).count(), 1);
  await page.getByRole('button', { name: '取消清理', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.cacheWrites), 0);
  await page.locator('.mobile-cache-sheet .mobile-primary-button').dispatchEvent('click');
  await page.getByRole('button', { name: '确认清理缓存', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.cacheWrites), 1);
  await page.getByRole('button', { name: '关闭缓存管理', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: '消息', exact: true }).dispatchEvent('click');
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const base = ui.state.messages[0];
    ui.state.messages = Array.from({ length: 125 }, (_, i) => ({ ...base, filename: `find-${i}`, kind: 'text', title: `搜索目标 ${i}`, body: `搜索目标 ${i}`, timestampMs: i, marked: false }));
  });
  await page.getByRole('button', { name: '搜索消息', exact: true }).dispatchEvent('click');
  const searchBox = page.getByRole('searchbox', { name: '搜索文本、文件名', exact: true });
  await searchBox.fill('搜索目标');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-card').length === 50);
  assert.match(await page.locator('.mobile-search-scope').innerText(), /已同步到本机/);
  await page.getByRole('button', { name: '更早的搜索结果', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-card').length === 100);
  await page.getByRole('button', { name: '更早的搜索结果', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-card').length === 125);
  assert.equal(await page.getByRole('button', { name: '更早的搜索结果', exact: true }).count(), 0);
  await page.getByRole('button', { name: '清除', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-card').length === 125 && !document.querySelector('.mobile-search-scope'));
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    ui.state.markedMessages = ui.state.messages.map((message) => ({ ...message, marked: true }));
    ui.state.pendingMarkedMessages = ui.state.markedMessages;
    ui.state.markedTotal = 125;
    ui.state.markedView.messages = ui.state.markedMessages.slice(0, 100);
    ui.state.markedView.offset = 100;
    ui.state.markedView.hasMore = true;
  });
  await page.locator('.mobile-tabbar button').filter({ hasText: '标记' }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-task-list > article').count(), 100);
  await page.getByRole('button', { name: '加载更多标记', exact: true }).dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-task-list > article').length === 125);
  await page.getByRole('button', { name: '消息', exact: true }).dispatchEvent('click');
  console.log('mobile feed browser tests passed: ownership, order, upward anchor, latest-follow, loaded-history refresh, attachment layout, expansion, compact sync status, message multi-selection, search pagination, marked pagination');
} finally {
  await browser.close();
}
