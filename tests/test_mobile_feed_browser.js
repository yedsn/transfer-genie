import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use an existing browser/Playwright installation; all messages are local fixtures.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /user-scalable=no/);
  assert.equal(await page.locator('.mobile-shell').evaluate(el => getComputedStyle(el).touchAction), 'pan-x pan-y');
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
  const defaultFormat = page.getByRole('group', { name: '编辑器默认格式' });
  assert.equal(await defaultFormat.getByRole('button', { name: '文本' }).getAttribute('aria-pressed'), 'true');
  await defaultFormat.getByRole('button', { name: 'Markdown' }).click();
  assert.equal(await defaultFormat.getByRole('button', { name: 'Markdown' }).getAttribute('aria-pressed'), 'true');
  await defaultFormat.getByRole('button', { name: '文本' }).click();
  assert.equal(await defaultFormat.getByRole('button', { name: '文本' }).getAttribute('aria-pressed'), 'true');
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
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('导入中的草稿');
  await page.evaluate(() => { window.__feedTest.ui.state.composer.selecting = true; });
  assert.equal(await page.locator('.mobile-compose-metadata').getByRole('status').innerText(), '正在准备所选附件…');
  assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.mobile-compose-tools button').nth(0).isDisabled(), true);
  assert.equal(await page.locator('.mobile-compose-tools button').nth(1).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '关闭新消息', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mobile-composer-sheet').count(), 1, 'Escape cannot close a picker that is copying into the draft');
  await page.evaluate(() => { window.__feedTest.ui.state.composer.selecting = false; });
  assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('textbox', { name: '消息内容', exact: true }).inputValue(), '导入中的草稿');
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('');
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
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('.mobile-message-select[aria-pressed="true"]').length === 1);
  await page.getByRole('button', { name: '关闭编辑标记', exact: true }).dispatchEvent('click');
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
    ui.controller.updateMarkedMetadata = async () => { ui.state.error = 'fixture mark failure'; return false; };
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
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.match(await page.locator('.mobile-marked-edit-sheet [role="alert"]').innerText(), /fixture mark failure/);
  await page.getByRole('button', { name: '关闭编辑标记', exact: true }).dispatchEvent('click');
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
    ui.controller.updateMarkedMetadata = async () => { ui.state.error = ''; return true; };
  });
  await actionSheet.getByRole('button', { name: '标记', exact: false }).dispatchEvent('click');
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.equal(await actionSheet.count(), 1, 'saving returns to the source action sheet');
  await actionSheet.locator('.mobile-sheet-cancel').dispatchEvent('click');
  // Removing cache returns to the retained detail with the fresh backend row.
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const base = ui.state.messages.at(-1);
    ui.state.messages = [{ ...base, filename: 'cache-detail', kind: 'file', title: 'cache-fixture.txt', originalName: 'cache-fixture.txt', body: undefined, cached: true, attachmentState: 'cached' }];
    ui.controller.deleteMessage = async (message, remote) => {
      if (remote) throw new Error('This fixture only removes local cache');
      ui.state.messages = [{ ...message, cached: false, attachmentState: 'idle' }];
      return true;
    };
  });
  await page.locator('[data-message-filename="cache-detail"] .mobile-message-bubble').dispatchEvent('click');
  await page.waitForSelector('.mobile-detail-sheet');
  assert.match(await page.locator('.mobile-attachment-feedback').innerText(), /原件已缓存/);
  await page.locator('.mobile-detail-more').dispatchEvent('click');
  await page.getByRole('button', { name: '仅移除本地附件缓存', exact: false }).dispatchEvent('click');
  await page.waitForSelector('.mobile-action-sheet', { state: 'detached' });
  assert.match(await page.locator('.mobile-attachment-feedback').innerText(), /按需下载/);
  assert.doesNotMatch(await page.locator('.mobile-attachment-feedback').innerText(), /原件已缓存/);
  await page.getByRole('button', { name: '关闭详情', exact: true }).dispatchEvent('click');
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
  for (const [width, height, scale] of [[320, 640, 1], [390, 844, 1], [844, 390, 2.2]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.mobile-shell').evaluate((el, value) => el.style.setProperty('--mobile-text-scale', value), String(scale));
    const cards = await page.locator('.mobile-task-list').evaluate(el => {
      const rows = [...el.children];
      const first = rows[0].getBoundingClientRect();
      const next = rows[1].getBoundingClientRect();
      const style = getComputedStyle(rows[0]);
      return {
        gap: next.top - first.bottom, radius: parseFloat(style.borderRadius),
        border: parseFloat(style.borderBottomWidth), lastBorder: parseFloat(getComputedStyle(rows.at(-1)).borderBottomWidth),
        surface: style.backgroundColor, listSurface: getComputedStyle(el).backgroundColor,
        listBorder: parseFloat(getComputedStyle(el).borderWidth),
        overflow: el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth,
        pin: rows[0].querySelector('.mobile-task-pin').getBoundingClientRect().width,
      };
    });
    assert.ok(cards.gap >= 12, 'marked messages must have visible space between individual cards');
    assert.ok(cards.radius >= 16 && cards.border >= 1, 'each message owns its rounded card border');
    assert.equal(cards.lastBorder, cards.border, 'last card retains its complete border');
    assert.notEqual(cards.surface, 'rgba(0, 0, 0, 0)');
    assert.equal(cards.listSurface, 'rgba(0, 0, 0, 0)', 'list must not join the cards with a shared surface');
    assert.equal(cards.listBorder, 0);
    assert.equal(cards.overflow, false, `marked cards fit ${width}px at text scale ${scale}`);
    assert.ok(cards.pin >= 44, 'card actions retain accessible touch targets');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-shell').evaluate(el => el.style.removeProperty('--mobile-text-scale'));
  await page.screenshot({ path: '/tmp/tg-marked-cards-20261028.png' });
  await page.getByRole('button', { name: '消息', exact: true }).dispatchEvent('click');
  // Rich text, mark dialogs and full-screen details: local fixtures only.
  await page.evaluate(() => {
    const ui = window.__feedTest.ui;
    const text = '# Markdown 标题\n\n**粗体** 与 `code`\n\n[安全链接](https://example.com) [危险链接](javascript:alert(1))\n\n<script>window.__markdownInjected = true</script><img src=x onerror="window.__markdownInjected=true">\n\n' + '完整的多行消息正文，需要保留。\n'.repeat(100);
    const message = { ...ui.state.messages[0], filename: 'markdown-fixture', title: 'Markdown 标题', body: text, format: 'markdown', marked: true, tagIds: ['work', 'personal'], dueDate: '2026-10-29' };
    ui.state.messages = [message];
    ui.state.markedView.messages = [message];
    ui.state.markedView.hasMore = false;
    window.__feedTest.markWrites = [];
    window.__feedTest.createdTags = [];
    window.__feedTest.openedLinks = [];
    ui.controller.updateMarkedMetadata = async (item, ids, date) => {
      window.__feedTest.markWrites.push({ filename: item.filename, ids: [...ids], date });
      ui.state.error = ''; return true;
    };
    ui.controller.toggleMark = async (item) => {
      window.__feedTest.markWrites.push({ unmark: item.filename });
      ui.state.error = ''; return true;
    };
    ui.controller.createMarkedTag = async (name) => {
      window.__feedTest.createdTags.push(name);
      const tag = { id: 'tag-' + name, name }; ui.state.tags.push(tag); return tag;
    };
    window.transferGenieApi.settings.openUrl = async (url) => { window.__feedTest.openedLinks.push(url); };
  });
  const markdown = page.locator('.mobile-message-content .mobile-markdown');
  assert.equal(await markdown.locator('h1').innerText(), 'Markdown 标题');
  assert.equal(await markdown.locator('strong').innerText(), '粗体');
  assert.equal(await markdown.locator('code').innerText(), 'code');
  assert.equal(await markdown.locator('script, img, [onerror]').count(), 0);
  assert.equal(await page.evaluate(() => window.__markdownInjected), undefined);
  await markdown.getByText('安全链接', { exact: true }).dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.openedLinks), ['https://example.com']);
  assert.equal(await page.locator('.mobile-detail-sheet').count(), 0, 'link clicks must not open message details');
  await markdown.getByText('危险链接', { exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.openedLinks.length), 1);
  await markdown.locator('h1').dispatchEvent('click');
  await page.waitForSelector('.mobile-detail-sheet');
  assert.equal(await page.locator('.mobile-detail-copy h1').innerText(), 'Markdown 标题');
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({ height }) => Math.abs(document.querySelector('.mobile-detail-sheet').getBoundingClientRect().height - height) < 2, viewport);
    const geometry = await page.evaluate(() => {
      const sheet = document.querySelector('.mobile-detail-sheet').getBoundingClientRect();
      const scroll = document.querySelector('.mobile-detail-scroll');
      const more = document.querySelector('.mobile-detail-more').getBoundingClientRect();
      const actions = document.querySelector('.mobile-detail-actions').getBoundingClientRect();
      scroll.scrollTop = scroll.scrollHeight;
      return { top: sheet.top, height: sheet.height, scroll: scroll.scrollHeight > scroll.clientHeight, scrolled: scroll.scrollTop > 0, moreWidth: more.width, actionsWidth: actions.width, bottom: more.bottom, viewport: innerHeight };
    });
    assert.equal(geometry.top, 0);
    assert.ok(geometry.scroll && geometry.scrolled);
    assert.ok(Math.abs(geometry.moreWidth - geometry.actionsWidth) < 2);
    assert.ok(geometry.bottom <= geometry.viewport);
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-mobile-accessibility-text', 'true'));
  assert.ok((await page.locator('.mobile-detail-more').boundingBox()).height >= 44);
  await page.evaluate(() => document.documentElement.removeAttribute('data-mobile-accessibility-text'));
  await page.setViewportSize({ width: 390, height: 844 });
  // More is layered on the SAME detail element, preserving its reading position.
  await page.locator('.mobile-detail-sheet').evaluate(el => {
    window.__detailElement = el;
    const scroll = el.querySelector('.mobile-detail-scroll');
    scroll.scrollTop = 280;
    window.__detailReadingPosition = scroll.scrollTop;
  });
  await page.locator('.mobile-detail-more').dispatchEvent('click');
  assert.equal(await page.locator('.mobile-detail-sheet').count(), 1);
  assert.equal(await page.locator('.mobile-detail-sheet').getAttribute('aria-hidden'), 'true');
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el === window.__detailElement && el.inert));
  assert.equal(await page.getByRole('dialog').count(), 1, 'only the top menu is exposed to accessibility');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('.mobile-action-sheet')));
  await page.locator('.mobile-action-sheet .mobile-sheet-cancel').dispatchEvent('click');
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el === window.__detailElement && !el.inert && el.querySelector('.mobile-detail-scroll').scrollTop === window.__detailReadingPosition));
  assert.equal(await page.locator('.mobile-detail-more').evaluate(el => el === document.activeElement), true);
  await page.locator('.mobile-detail-more').dispatchEvent('click');
  await page.locator('.mobile-action-sheet').getByRole('button', { name: '删除消息（同步到云端）', exact: false }).dispatchEvent('click');
  await page.getByRole('button', { name: '取消删除', exact: true }).last().dispatchEvent('click');
  assert.equal(await page.locator('.mobile-detail-sheet').count(), 1);
  assert.equal(await page.locator('.mobile-action-sheet').count(), 1);
  await page.locator('.mobile-detail-overlay-backdrop').dispatchEvent('click');
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el === window.__detailElement));
  await page.locator('.mobile-detail-more').dispatchEvent('click');
  await page.locator('.mobile-action-sheet').evaluate(el => { window.__actionElement = el; });
  await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '取消标记' }).dispatchEvent('click');
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && el.inert));
  assert.equal(await page.getByRole('dialog').count(), 1, 'unmark confirmation is the only accessible dialog');
  await page.getByRole('button', { name: '确认取消标记', exact: true }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '取消标记' }).count(), 0);
  assert.equal(await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '标记' }).count(), 1, 'successful unmark refreshes the retained detail action state');
  const detailMarkButton = page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '标记' });
  await detailMarkButton.focus();
  await detailMarkButton.dispatchEvent('click');
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && el.inert));
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el === window.__detailElement && el.inert));
  assert.equal(await page.getByRole('dialog').count(), 1, 'mark settings alone are accessible above detail and actions');
  assert.ok(await page.evaluate(() => {
    const action = document.querySelector('.mobile-action-sheet');
    const top = document.querySelector('.mobile-marked-edit-sheet');
    const backdrop = document.querySelector('.mobile-mark-overlay-backdrop');
    return Number(getComputedStyle(action).zIndex) < Number(getComputedStyle(backdrop).zIndex) && Number(getComputedStyle(backdrop).zIndex) < Number(getComputedStyle(top).zIndex);
  }));
  await page.getByRole('button', { name: '关闭编辑标记', exact: true }).dispatchEvent('click');
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && !el.inert));
  assert.equal(await detailMarkButton.evaluate(el => el === document.activeElement), true);
  await detailMarkButton.dispatchEvent('click');
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.equal(await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '取消标记' }).count(), 1, 'successful marking refreshes the retained detail action state');
  await page.locator('.mobile-action-sheet .mobile-sheet-cancel').dispatchEvent('click');
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el === window.__detailElement && el.querySelector('.mobile-detail-scroll').scrollTop === window.__detailReadingPosition));
  await page.evaluate(() => { window.__feedTest.markWrites = []; });
  await page.locator('.mobile-detail-more').dispatchEvent('click');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('.mobile-detail-sheet').evaluate(el => el.querySelector('.mobile-detail-scroll').scrollTop === window.__detailReadingPosition));
  await page.getByRole('button', { name: '关闭详情', exact: true }).dispatchEvent('click');
  await page.locator('.mobile-tabbar button').filter({ hasText: '标记' }).dispatchEvent('click');
  assert.equal(await page.locator('.mobile-task-check').count(), 0);
  assert.equal(await page.locator('.mobile-task-pin').count(), 1);
  assert.equal(await page.locator('.mobile-task-body .mobile-markdown h1').innerText(), 'Markdown 标题');
  assert.match(await page.locator('.mobile-task-body small').innerText(), /工作.*个人.*2026-10-29/s);
  const bounded = await page.locator('.mobile-marked-excerpt-viewport').evaluate(el => ({ client: el.clientHeight, full: el.scrollHeight }));
  assert.ok(bounded.client < bounded.full, 'marked rows bound long text while showing more than a title');
  await page.waitForSelector('.mobile-marked-excerpt.is-truncated');
  const fade = await page.locator('.mobile-marked-excerpt-viewport').evaluate(el => getComputedStyle(el).maskImage);
  assert.match(fade, /linear-gradient/);
  assert.match(fade, /36px/);
  assert.equal(await page.locator('.mobile-marked-read-more').textContent(), '查看全文');
  assert.equal(await page.locator('.mobile-marked-read-more svg[aria-hidden="true"]').count(), 1);
  for (const [width, height, scale] of [[320, 640, 1], [390, 844, 1], [844, 390, 2.2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(scale => document.documentElement.style.setProperty('--mobile-text-scale', scale), scale);
    await page.waitForFunction(() => document.querySelector('.mobile-marked-excerpt').classList.contains('is-truncated'));
    const geometry = await page.locator('.mobile-task-list').evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth, preview: el.querySelector('.mobile-marked-excerpt-viewport').clientHeight, pin: el.querySelector('.mobile-task-pin').getBoundingClientRect().width }));
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.preview, 130);
    assert.ok(geometry.pin >= 44);
  }
  await page.evaluate(() => {
    const item = window.__feedTest.ui.state.markedView.messages[0];
    window.__feedTest.longMarkedBody = item.body;
    item.body = '短内容完整显示。'; item.format = 'text';
  });
  await page.waitForFunction(() => !document.querySelector('.mobile-marked-excerpt').classList.contains('is-truncated'));
  assert.equal(await page.locator('.mobile-marked-read-more').count(), 0, 'short content must not fade');
  assert.equal(await page.locator('.mobile-marked-excerpt-viewport').evaluate(el => getComputedStyle(el).maskImage), 'none');
  await page.evaluate(() => {
    window.__feedTest.ui.state.markedView.messages[0].body = '长纯文本内容保留换行。\n'.repeat(40);
  });
  await page.waitForSelector('.mobile-marked-excerpt.is-truncated');
  assert.equal(await page.locator('.mobile-marked-excerpt .mobile-plain-text').evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
  await page.evaluate(() => {
    const item = window.__feedTest.ui.state.markedView.messages[0];
    item.body = window.__feedTest.longMarkedBody; item.format = 'markdown';
    document.documentElement.style.removeProperty('--mobile-text-scale');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-marked-read-more').click();
  assert.equal(await page.locator('.mobile-detail-sheet').count(), 1, 'read-more opens the existing full detail');
  await page.getByRole('button', { name: '关闭详情', exact: true }).dispatchEvent('click');
  await page.screenshot({ path: '/tmp/tg-marked-gradient.png' });
  await page.locator('.mobile-task-pin').dispatchEvent('click');
  assert.equal(await page.locator('.mobile-unmark-sheet').count(), 1);
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), 0);
  await page.getByRole('button', { name: '保留标记', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), 0);
  await page.locator('.mobile-task-pin').dispatchEvent('click');
  await page.getByRole('button', { name: '确认取消标记', exact: true }).dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.markWrites), [{ unmark: 'markdown-fixture' }]);
  await page.getByRole('button', { name: '消息', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: '新消息', exact: true }).dispatchEvent('click');
  const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
  await editor.fill('# 草稿\n\n**保留原文**');
  await page.getByRole('button', { name: 'Markdown', exact: true }).dispatchEvent('click');
  assert.equal(await page.locator('.ProseMirror h1').innerText(), '草稿');
  assert.equal(await page.locator('.ProseMirror strong').innerText(), '保留原文');
  await page.getByRole('button', { name: '文字', exact: true }).dispatchEvent('click');
  assert.equal(await editor.inputValue(), '# 草稿\n\n**保留原文**');
  await page.evaluate(() => {
    window.__feedTest.ui.state.composer.attachments = [{ id: 'mark-draft', clientId: 'mark-draft', path: '/fixture/draft.pdf', originalName: 'draft.pdf', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported' }];
  });
  const composerMarkButton = page.locator('.mobile-compose-tools button').filter({ hasText: '标记' });
  await page.locator('.mobile-composer-sheet').evaluate(el => {
    window.__composerElement = el;
    window.__editorElement = el.querySelector('textarea');
    window.__editorElement.setSelectionRange(3, 7);
  });
  await composerMarkButton.focus();
  assert.equal(await composerMarkButton.getAttribute('title'), '设置标记');
  await composerMarkButton.dispatchEvent('click');
  assert.equal(await page.locator('.mobile-marked-edit-sheet input[type="checkbox"]').count(), 0, 'saving the settings is the only enable action');
  const dateBox = await page.getByLabel('截止日期', { exact: true }).boundingBox();
  const dateSection = await page.locator('.mobile-mark-date-section').boundingBox();
  const dateHeading = await page.locator('.mobile-mark-field-heading').boundingBox();
  assert.equal(dateBox.width, dateSection.width, 'date field occupies its own full-width row');
  assert.ok(dateBox.y >= dateHeading.y + dateHeading.height);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const dateGeometry = await page.locator('.mobile-marked-edit-sheet').evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth, width: el.querySelector('.mobile-mark-date-section').getBoundingClientRect().width, input: el.querySelector('#mobile-marked-due').getBoundingClientRect().width }));
    assert.equal(dateGeometry.overflow, false, 'mark settings must not overflow on narrow or landscape screens');
    assert.equal(dateGeometry.input, dateGeometry.width, 'date remains full width at every viewport');
  }
  assert.ok(await page.locator('.mobile-composer-sheet').evaluate(el => el === window.__composerElement && el.inert && el.querySelector('textarea') === window.__editorElement));
  assert.equal(await page.locator('.mobile-composer-sheet').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.mobile-attachment-strip strong').innerText(), 'draft.pdf');
  assert.equal(await page.getByRole('dialog').count(), 1, 'composer underlay is hidden from accessibility');
  if (process.env.MOBILE_MODAL_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_MODAL_SCREENSHOT });
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('.mobile-marked-edit-sheet')));
  await page.getByRole('textbox', { name: '新标签名称', exact: true }).fill('不保存标签');
  await page.getByRole('button', { name: '添加', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.createdTags.length), 0);
  await page.getByRole('button', { name: '关闭编辑标记', exact: true }).dispatchEvent('click');
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), false);
  assert.equal(await page.evaluate(() => window.__feedTest.createdTags.length), 0);
  assert.equal(await editor.inputValue(), '# 草稿\n\n**保留原文**');
  assert.ok(await page.locator('.mobile-composer-sheet').evaluate(el => el === window.__composerElement && !el.inert && el.querySelector('textarea') === window.__editorElement && window.__editorElement.selectionStart === 3 && window.__editorElement.selectionEnd === 7));
  assert.equal(await composerMarkButton.evaluate(el => el === document.activeElement), true);
  await composerMarkButton.dispatchEvent('click');
  await page.locator('.mobile-marked-tag-options button').filter({ hasText: '工作' }).dispatchEvent('click');
  await page.getByRole('textbox', { name: '新标签名称', exact: true }).fill('紧急发送');
  await page.getByRole('button', { name: '添加', exact: true }).dispatchEvent('click');
  await page.getByLabel('截止日期', { exact: true }).fill('2026-10-30');
  await page.getByRole('heading', { name: '标记设置', exact: true }).click();
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.createdTags), ['紧急发送']);
  assert.deepEqual(await page.evaluate(() => window.__feedTest.ui.state.composer.tagIds), ['work', 'tag-紧急发送']);
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), true, 'saving automatically marks without a checkbox');
  assert.equal(await composerMarkButton.getAttribute('title'), '已标记，编辑标记设置');
  assert.equal(await composerMarkButton.locator('svg').evaluate(el => getComputedStyle(el).fill), 'rgb(247, 200, 74)', 'saved mark uses the filled yellow star state');
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.dueDate), '2026-10-30');
  assert.match(await page.locator('.mobile-composer-mark-summary').innerText(), /工作.*紧急发送.*2026-10-30/s);
  if (process.env.MOBILE_COMPOSER_MARK_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_COMPOSER_MARK_SCREENSHOT });
  assert.ok(await page.locator('.mobile-composer-sheet').evaluate(el => el === window.__composerElement));
  assert.equal(await page.locator('.mobile-attachment-strip strong').innerText(), 'draft.pdf');
  await page.locator('.mobile-compose-tools button').filter({ hasText: '标记' }).dispatchEvent('click');
  await page.getByLabel('截止日期', { exact: true }).fill('2026-11-01');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.dueDate), '2026-10-30', 'cancel preserves saved composer metadata');
  await page.getByRole('button', { name: 'Markdown', exact: true }).dispatchEvent('click');
  await page.locator('.ProseMirror').evaluate(el => { window.__composerPreviewElement = el; });
  await composerMarkButton.dispatchEvent('click');
  assert.ok(await page.locator('.ProseMirror').evaluate(el => el === window.__composerPreviewElement));
  await page.getByRole('button', { name: '清除截止日期', exact: true }).click();
  assert.equal(await page.getByLabel('截止日期', { exact: true }).inputValue(), '');
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.dueDate), '2026-10-30', 'clearing only changes settings until saved');
  await page.getByLabel('截止日期', { exact: true }).fill('2026-10-30');
  await page.getByLabel('截止日期', { exact: true }).blur();
  if (process.env.MOBILE_MARK_SCREENSHOT) await page.screenshot({ path: process.env.MOBILE_MARK_SCREENSHOT });
  await page.getByRole('button', { name: '取消标记', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), true);
  await page.getByRole('button', { name: '保留标记', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), true);
  assert.ok(await page.locator('.ProseMirror').evaluate(el => el === window.__composerPreviewElement));
  await composerMarkButton.dispatchEvent('click');
  await page.getByRole('button', { name: '取消标记', exact: true }).click();
  await page.getByRole('button', { name: '确认取消标记', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), false);
  assert.equal(await composerMarkButton.getAttribute('title'), '设置标记');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.ui.state.composer.tagIds), []);
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.dueDate), '');
  assert.ok(await page.locator('.ProseMirror').evaluate(el => el === window.__composerPreviewElement));
  assert.equal(await page.locator('.mobile-attachment-strip strong').innerText(), 'draft.pdf');
  await composerMarkButton.dispatchEvent('click');
  await page.getByRole('button', { name: '保存标记', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__feedTest.ui.state.composer.marked), true, 'saving no tags or date still means marked');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.ui.state.composer.tagIds), []);
  await composerMarkButton.dispatchEvent('click');
  await page.locator('.mobile-mark-overlay-backdrop').click({ position: { x: 10, y: 10 } });
  assert.ok(await page.locator('.ProseMirror').evaluate(el => el === window.__composerPreviewElement));
  assert.equal(await page.getByRole('button', { name: '预览', exact: true }).count(), 0, 'the live editor needs no separate preview mode');
  await page.getByRole('button', { name: '关闭新消息', exact: true }).dispatchEvent('click');
  await page.evaluate(() => { window.__feedTest.ui.state.composer.attachments = []; });
  // An unmarked message opens settings without writing; save carries detailed metadata.
  await page.evaluate(() => { window.__feedTest.ui.state.messages[0].marked = false; });
  await page.locator('.mobile-card-more').dispatchEvent('click');
  await page.locator('.mobile-action-sheet').evaluate(el => { window.__actionElement = el; });
  await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '标记' }).dispatchEvent('click');
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && el.inert));
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), 1);
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.markWrites[1]), { filename: 'markdown-fixture', ids: ['work', 'personal'], date: '2026-10-29' });
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && !el.inert));
  // The new explicit removal in saved settings must retain its source and retry on failure.
  await page.locator('.mobile-action-row').filter({ hasText: '编辑标签与截止日期' }).click();
  const removeSaved = page.getByRole('button', { name: '取消标记', exact: true });
  assert.ok(await removeSaved.isVisible());
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), 2, 'opening saved settings does not write');
  await removeSaved.click();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && el.inert));
  await page.getByRole('button', { name: '保留标记', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), 2, 'cancelling saved-settings removal does not write');
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && !el.inert));
  await page.locator('.mobile-action-row').filter({ hasText: '编辑标签与截止日期' }).click();
  await removeSaved.click();
  await page.evaluate(() => {
    window.__feedTest.ui.controller.toggleMark = async () => { window.__feedTest.ui.state.error = 'fixture unmark failed'; return false; };
  });
  await page.getByRole('button', { name: '确认取消标记', exact: true }).click();
  assert.match(await page.locator('.mobile-unmark-sheet [role="alert"]').innerText(), /fixture unmark failed/);
  assert.equal(await page.evaluate(() => window.__feedTest.ui.selectedMessage.marked), true, 'failed unmark retains the saved state');
  await page.evaluate(() => {
    window.__feedTest.ui.controller.toggleMark = async item => { window.__feedTest.markWrites.push({ unmark: item.filename }); window.__feedTest.ui.state.error = ''; return true; };
  });
  await page.getByRole('button', { name: '确认取消标记', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__feedTest.markWrites.at(-1)), { unmark: 'markdown-fixture' });
  assert.equal(await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '取消标记' }).count(), 0);
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && !el.inert));
  // Partial creation and repeated save retain confirmed IDs and do not apply a mark early.
  await page.evaluate(() => {
    const test = window.__feedTest;
    test.retryCalls = [];
    test.markWritesBeforeRetry = test.markWrites.length;
    test.ui.controller.createMarkedTag = async name => {
      test.retryCalls.push(name);
      if (name === '重试标签二' && test.retryCalls.filter(item => item === name).length === 1) {
        test.ui.state.error = 'fixture tag creation failed';
        return null;
      }
      if (name === '重试标签一') await new Promise(resolve => { test.releaseTag = resolve; });
      const tag = { id: 'stable-' + name, name };
      test.ui.state.tags.push(tag);
      test.ui.state.error = '';
      return tag;
    };
  });
  await page.locator('.mobile-action-sheet .mobile-action-grid button').filter({ hasText: '标记' }).click();
  for (const name of ['重试标签一', '重试标签二']) {
    await page.getByRole('textbox', { name: '新标签名称', exact: true }).fill(name);
    await page.getByRole('button', { name: '添加', exact: true }).click();
  }
  const saveRetry = page.getByRole('button', { name: '保存标记', exact: true });
  await saveRetry.dispatchEvent('click');
  await page.waitForFunction(() => typeof window.__feedTest.releaseTag === 'function');
  assert.equal(await page.getByRole('button', { name: '正在保存…', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mobile-marked-edit-sheet').count(), 1, 'cannot dismiss during an in-flight save');
  await page.locator('.mobile-marked-edit-sheet .mobile-primary-button').dispatchEvent('click');
  assert.deepEqual(await page.evaluate(() => window.__feedTest.retryCalls), ['重试标签一']);
  await page.evaluate(() => window.__feedTest.releaseTag());
  assert.match(await page.locator('.mobile-marked-edit-sheet [role="alert"]').innerText(), /fixture tag creation failed/);
  assert.equal(await page.evaluate(() => window.__feedTest.markWrites.length), await page.evaluate(() => window.__feedTest.markWritesBeforeRetry));
  await saveRetry.click();
  assert.deepEqual(await page.evaluate(() => window.__feedTest.retryCalls), ['重试标签一', '重试标签二', '重试标签二']);
  const retryWrite = await page.evaluate(() => window.__feedTest.markWrites.at(-1));
  assert.ok(retryWrite.ids.includes('stable-重试标签一') && retryWrite.ids.includes('stable-重试标签二'));
  assert.ok(await page.locator('.mobile-action-sheet').evaluate(el => el === window.__actionElement && !el.inert));
  console.log('mobile feed browser tests passed: existing feed/search/paging regressions; safe Markdown, editing/preview, bounded marked rows, unmark confirmation, no-write cancellation, detailed draft/message marks, full-screen details and full-width actions');
} finally {
  await browser.close();
}
