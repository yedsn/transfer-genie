import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });
const storageKey = 'transfer-genie:workspace-state';
const tab = (id, collapsed = false) => ({ id, title: '草稿 ' + id, kind: 'draft', text: '正文 ' + id, format: 'text', collapsed });
async function seed(page, secondPane = false) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(({ storageKey, panes }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      panes, activePaneId: 'left', layout: panes.length > 1 ? 'horizontal' : 'single',
      paneOrder: panes.map((pane) => pane.id),
    }));
  }, { storageKey, panes: [
    { id: 'left', activeTabId: 'A', tabs: ['A', 'B', 'C', 'D'].map((id) => tab(id)) },
    ...(secondPane ? [{ id: 'right', activeTabId: 'X', tabs: [tab('X'), tab('Y', true), tab('Z')] }] : []),
  ] });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.cw-pane[data-pane-id="left"] .cw-tab')).toHaveCount(4);
}
const leftPane = (page) => page.locator('.cw-pane[data-pane-id="left"]');
const ids = (pane) => pane.locator('.cw-tab').evaluateAll((tabs) => tabs.map((element) => element.dataset.tabId));
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
async function collapse(page, id, others = false) {
  await page.locator('.cw-tab[data-tab-id="' + id + '"]').click({ button: 'right' });
  await page.getByRole('button', { name: others ? '收起其他' : '收起当前', exact: true }).click();
}
async function drag(page, source, target, ratio = 0.2) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.cw-tab')?.dataset.tabId, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
  expect(hit).toBe(await source.getAttribute('data-tab-id'));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 3 });
  await expect(page.locator('.cw-tab-sortable-fallback')).toHaveCount(1);
  await page.mouse.move(to.x + to.width * ratio, to.y + to.height / 2, { steps: 16 });
  // 跨栏进入时占位会挤动目标标签，重新对准移动后的目标位置。
  const updated = await target.boundingBox();
  await page.mouse.move(updated.x + updated.width * ratio, updated.y + updated.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('body > .cw-tab-sortable-fallback')).toHaveCount(0);
}

test('collapse preserves drafts, restores individual tabs and survives reload', async ({ page }) => {
  await seed(page);
  const pane = leftPane(page);
  await collapse(page, 'A', true);
  await expect.poll(() => ids(pane)).toEqual(['A']);
  await expect(pane.getByRole('button', { name: '已收起 3 个' })).toBeVisible();
  await pane.locator('.cw-tab').click({ button: 'right' });
  await expect(page.getByRole('button', { name: '收起当前', exact: true })).toBeDisabled();
  await page.locator('.cw-ctx-backdrop').click({ position: { x: 4, y: 4 } });
  await expect.poll(async () => (await saved(page)).panes[0].tabs.filter((t) => t.collapsed).length).toBe(3);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(pane.locator('.cw-tab')).toHaveCount(1);
  await pane.locator('.cw-collapsed-trigger').click();
  const dialog = page.getByRole('dialog', { name: '已收起草稿' });
  await expect(dialog.locator('.cw-collapsed-title')).toHaveText(['草稿 B', '草稿 C', '草稿 D']);
  await dialog.getByRole('button', { name: '草稿 C', exact: true }).click();
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'C');
  await expect(pane.locator('.cw-textarea')).toHaveValue('正文 C');
  await expect.poll(() => ids(pane)).toEqual(['A', 'C']);
  await expect(dialog).toHaveCount(0);
  await pane.locator('.cw-collapsed-trigger').click();
  await dialog.getByRole('button', { name: '全部展开' }).click();
  await expect.poll(() => ids(pane)).toEqual(['A', 'B', 'C', 'D']);
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'C');
  await expect(pane.locator('.cw-collapsed-trigger')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).panes[0].tabs.map((t) => t.text)).toEqual(['正文 A', '正文 B', '正文 C', '正文 D']);
});

test('mouse clicks move individual collapsed drafts out and expand-all restores every remaining draft', async ({ page }) => {
  await seed(page);
  const pane = leftPane(page);
  const dialog = page.getByRole('dialog', { name: '已收起草稿' });
  await collapse(page, 'A', true);

  async function mouseRestore(name) {
    await pane.locator('.cw-collapsed-trigger').click();
    const firstItem = dialog.locator('.cw-collapsed-item').first();
    await expect(firstItem).toBeFocused();
    const action = dialog.getByRole('button', { name, exact: true });
    const box = await action.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(dialog).toBeVisible();
    await expect(firstItem).toBeFocused();
    await page.mouse.up();
    await expect(dialog).toHaveCount(0);
  }

  await mouseRestore('草稿 C');
  await expect.poll(() => ids(pane)).toEqual(['A', 'C']);
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'C');
  await expect(pane.locator('.cw-collapsed-trigger')).toContainText('已收起 2 个');
  await pane.locator('.cw-collapsed-trigger').click();
  await expect(dialog.locator('.cw-collapsed-title')).toHaveText(['草稿 B', '草稿 D']);
  await page.keyboard.press('Escape');
  await mouseRestore('草稿 D');
  await expect.poll(() => ids(pane)).toEqual(['A', 'C', 'D']);
  await mouseRestore('草稿 B');
  await expect.poll(() => ids(pane)).toEqual(['A', 'B', 'C', 'D']);
  await expect(pane.locator('.cw-collapsed-trigger')).toHaveCount(0);

  await collapse(page, 'B', true);
  await mouseRestore('全部展开');
  await expect.poll(() => ids(pane)).toEqual(['A', 'B', 'C', 'D']);
  await expect(pane.locator('.cw-collapsed-trigger')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).panes[0].tabs.every((tab) => !tab.collapsed)).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => ids(pane)).toEqual(['A', 'B', 'C', 'D']);
});

test('active collapse and closing the last visible tab keep an editable draft', async ({ page }) => {
  await seed(page);
  const pane = leftPane(page);
  await collapse(page, 'A');
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'B');
  await expect(pane.locator('.cw-textarea')).toHaveValue('正文 B');
  await collapse(page, 'B', true);
  await pane.locator('.cw-tab-close').click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(pane.locator('.cw-tab')).toHaveCount(1);
  await expect(pane.locator('.cw-tab.is-active')).not.toHaveAttribute('data-tab-id', 'B');
  await expect(pane.locator('.cw-textarea')).not.toHaveValue('正文 B');
  await expect(pane.locator('.cw-collapsed-trigger')).toHaveText(/已收起 2 个/);
});

test('collapsed tabs stay scoped to their pane and visible tabs sort by stable ID', async ({ page }) => {
  await seed(page, true);
  const pane = leftPane(page);
  const right = page.locator('.cw-pane[data-pane-id="right"]');
  await collapse(page, 'B');
  await expect.poll(() => ids(pane)).toEqual(['A', 'C', 'D']);
  await expect.poll(() => ids(right)).toEqual(['X', 'Z']);
  await drag(page, pane.locator('[data-tab-id="D"]'), pane.locator('[data-tab-id="C"]'));
  await expect.poll(() => ids(pane)).toEqual(['A', 'D', 'C']);
  await drag(page, pane.locator('[data-tab-id="A"]'), pane.locator('[data-tab-id="C"]'), 0.9);
  await expect.poll(() => ids(pane)).toEqual(['D', 'C', 'A']);
  await drag(page, pane.locator('[data-tab-id="A"]'), right.locator('[data-tab-id="Z"]'));
  await expect.poll(() => ids(right)).toEqual(['X', 'A', 'Z']);
  await expect.poll(async () => (await saved(page)).panes[1].tabs.map((t) => t.id)).toEqual(['X', 'Y', 'A', 'Z']);
  await expect.poll(async () => (await saved(page)).panes.flatMap((p) => p.tabs).filter((t) => t.collapsed).map((t) => t.id)).toEqual(['B', 'Y']);
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => ids(pane)).toEqual(['D', 'C']);
  await expect.poll(() => ids(right)).toEqual(['X', 'A', 'Z']);
});

test('restore list supports keyboard dismissal and stays outside the pane clipping area', async ({ page }) => {
  await seed(page);
  const pane = leftPane(page);
  await collapse(page, 'A', true);
  const trigger = pane.locator('.cw-collapsed-trigger');
  const dialog = page.getByRole('dialog', { name: '已收起草稿' });
  await trigger.click();
  await expect(dialog.getByRole('button', { name: '草稿 B', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dialog.getByRole('button', { name: '全部展开' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await trigger.click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.x + 20, rect.y + 20);
    return { inViewport: rect.top >= 0 && rect.bottom <= innerHeight, above: element.contains(top), parent: element.parentElement.tagName };
  });
  expect(geometry).toEqual({ inViewport: true, above: true, parent: 'BODY' });
  await page.locator('.cw-info').click();
  await expect(dialog).toHaveCount(0);
});

test('collapsed entry stays visible with many tabs and its list scrolls independently', async ({ page }, testInfo) => {
  await seed(page);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    const pane = state.panes[0];
    pane.tabs = Array.from({ length: 32 }, (_, i) => ({
      id: 'many-' + i, kind: 'draft', title: '较长的草稿名称 ' + i,
      text: '保留正文 ' + i, format: 'text', collapsed: i >= 12,
    }));
    pane.activeTabId = pane.tabs[0].id;
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload({ waitUntil: 'networkidle' });
  const pane = leftPane(page);
  const trigger = pane.locator('.cw-collapsed-trigger');
  await expect(pane.locator('.cw-tab')).toHaveCount(12);
  const before = await trigger.boundingBox();
  await pane.locator('.cw-tab-add').scrollIntoViewIfNeeded();
  await expect(trigger).toBeInViewport();
  const after = await trigger.boundingBox();
  expect(Math.abs(before.x - after.x)).toBeLessThan(1);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '已收起草稿' });
  const list = dialog.locator('.cw-collapsed-list');
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(dialog.getByRole('button', { name: '全部展开' })).toBeInViewport();
  await dialog.getByRole('button', { name: '较长的草稿名称 31', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('collapsed-tabs.png') });
  await dialog.getByRole('button', { name: '较长的草稿名称 31', exact: true }).click();
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'many-31');
  await expect(pane.locator('.cw-tab.is-active')).toBeInViewport();
  await expect(pane.locator('.cw-textarea')).toHaveValue('保留正文 31');
});

test('restoring a collapsed Markdown tab binds the editor to its own content', async ({ page }) => {
  await seed(page);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.panes[0].tabs[1].format = 'markdown';
    state.panes[0].tabs[1].text = '# 收起的 Markdown 正文';
    state.panes[0].tabs[1].collapsed = true;
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload({ waitUntil: 'networkidle' });
  const pane = leftPane(page);
  await pane.locator('.cw-collapsed-trigger').click();
  await page.getByRole('dialog', { name: '已收起草稿' }).getByRole('button', { name: '草稿 B', exact: true }).click();
  await expect(pane.locator('.cw-tab.is-active')).toHaveAttribute('data-tab-id', 'B');
  await expect(pane.locator('[data-markdown-ready="true"]')).toBeVisible();
  await expect(pane.locator('.CodeMirror-code')).toContainText('收起的 Markdown 正文');
  await expect.poll(async () => (await saved(page)).panes[0].tabs[1].text).toBe('# 收起的 Markdown 正文');
});

test('refined dropdown keeps long titles and format markers readable in a small window', async ({ page }, testInfo) => {
  await seed(page);
  const longTitle = '接口联调与同步策略：较长的草稿标题也不会挤压恢复按钮';
  await page.evaluate(({ key, longTitle }) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.panes[0].tabs = [
      { id: 'A', title: '当前编辑', text: '正在整理发布内容…', format: 'text' },
      { id: 'B', title: '发布说明 · v0.6', text: '# 发布说明', format: 'markdown', collapsed: true },
      { id: 'C', title: '本周待办与排查记录', text: '待办', format: 'text', collapsed: true },
      { id: 'D', title: longTitle, text: '# 同步策略', format: 'markdown', collapsed: true },
    ].map((tab) => ({ ...tab, kind: 'draft' }));
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: storageKey, longTitle });
  await page.reload({ waitUntil: 'networkidle' });
  const trigger = leftPane(page).locator('.cw-collapsed-trigger');
  const dialog = page.getByRole('dialog', { name: '已收起草稿' });
  await trigger.click();
  await expect(dialog.locator('.cw-collapsed-heading strong')).toHaveText('已收起的草稿');
  await expect(dialog.locator('.cw-collapsed-format')).toHaveText(['M', 'T', 'M']);
  await expect(dialog.getByRole('button', { name: longTitle, exact: true })).toHaveAttribute('title', longTitle);
  expect(await dialog.locator('.cw-collapsed-title').last().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const focused = dialog.getByRole('button', { name: '本周待办与排查记录', exact: true });
  await page.keyboard.press('ArrowDown');
  await expect(focused).toBeFocused();
  await focused.hover();
  await expect(focused.locator('.cw-collapsed-restore')).toHaveCSS('opacity', '1');
  const menuBox = await dialog.boundingBox();
  const triggerBox = await trigger.boundingBox();
  const top = Math.min(menuBox.y, triggerBox.y) - 16;
  const bottom = Math.max(menuBox.y + menuBox.height, triggerBox.y + triggerBox.height) + 16;
  await page.screenshot({ path: testInfo.outputPath('dropdown-style.png'), clip: {
    x: menuBox.x - 24, y: top, width: menuBox.width + 32, height: bottom - top,
  } });
  await page.setViewportSize({ width: 720, height: 600 });
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(712);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(592);
  await expect(dialog.getByRole('button', { name: '全部展开' })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
