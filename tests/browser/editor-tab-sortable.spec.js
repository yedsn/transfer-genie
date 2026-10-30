import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });

async function beginDrag(page, source, target, targetXRatio = 0.5, targetYRatio = 0.5) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width * targetXRatio;
  const endY = targetBox.y + targetBox.height * targetYRatio;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY, { steps: 3 });
  await expect(page.locator('.cw-tab-sortable-fallback')).toHaveCount(1);
  await expect(page.locator('.cw-tab-sortable-fallback')).toHaveCSS('pointer-events', 'none');
  await page.mouse.move(endX, endY, { steps: 16 });
}

async function dragBetween(page, source, target, targetXRatio = 0.5, targetYRatio = 0.5) {
  await beginDrag(page, source, target, targetXRatio, targetYRatio);
  await page.mouse.up();
}

async function expectUniqueTabIds(page) {
  await expect(page.locator('body > .cw-tab-sortable-fallback')).toHaveCount(0);
  await expect.poll(async () => {
    return page.evaluate(() => {
      const domIds = Array.from(document.querySelectorAll('.cw-pane .cw-tab[data-tab-id]')).map((tab) => tab.dataset.tabId);
      const raw = localStorage.getItem('transfer-genie:workspace-state');
      const state = raw ? JSON.parse(raw) : null;
      const stateIds = state?.panes?.flatMap((pane) => pane.tabs.map((tab) => tab.id)) || [];
      return {
        domUnique: new Set(domIds).size === domIds.length,
        stateUnique: new Set(stateIds).size === stateIds.length,
        sameIds: JSON.stringify([...domIds].sort()) === JSON.stringify([...stateIds].sort()),
      };
    });
  }).toEqual({ domUnique: true, stateUnique: true, sameIds: true });
}

test('SortableJS reorders editor tabs and moves them across panes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('transfer-genie:workspace-state'));
  await page.reload({ waitUntil: 'networkidle' });

  const firstPane = page.locator('.cw-pane').first();
  await firstPane.locator('.cw-tab-add').click();
  await firstPane.locator('.cw-tab-add').click();
  await expect(firstPane.locator('.cw-tab')).toHaveCount(3);

  const before = await firstPane.locator('.cw-tab').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.tabId));
  await beginDrag(page, firstPane.locator('.cw-tab').last(), firstPane.locator('.cw-tab').first(), 0.15);
  await expect.poll(() => firstPane.locator('.cw-tab:not(.cw-tab-sortable-fallback)').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.tabId))).toEqual([before[2], before[0], before[1]]);
  await page.mouse.up();
  await expect.poll(() => firstPane.locator('.cw-tab').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.tabId))).toEqual([before[2], before[0], before[1]]);
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.panes?.[0]?.tabs?.map((tab) => tab.id);
  }).toEqual([before[2], before[0], before[1]]);

  await page.getByTitle('横向分栏').click();
  await expect(page.locator('.cw-pane')).toHaveCount(2);
  const panes = page.locator('.cw-pane');
  await expect(panes.first().locator('.cw-tabs-list')).toHaveAttribute('data-sortable-ready', 'true');
  await expect(panes.nth(1).locator('.cw-tabs-list')).toHaveAttribute('data-sortable-ready', 'true');
  const targetPaneId = await panes.nth(1).getAttribute('data-pane-id');
  const movingId = await panes.first().locator('.cw-tab').first().getAttribute('data-tab-id');
  await beginDrag(page, panes.first().locator('.cw-tab').first(), panes.nth(1).locator('.cw-tab').first(), 0.2);
  await expect(panes.nth(1).locator(`.cw-tab[data-tab-id="${movingId}"]`)).toHaveCount(1);
  await page.mouse.up();
  await expect(panes.nth(1).locator(`.cw-tab[data-tab-id="${movingId}"]`)).toHaveCount(1);
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.panes?.some((pane) => pane.id === targetPaneId && pane.tabs.some((tab) => tab.id === movingId));
  }).toBe(true);
  await expectUniqueTabIds(page);

  for (let index = 0; index < 3; index += 1) {
    const current = page.locator(`.cw-tab[data-tab-id="${movingId}"]`);
    const destinationPane = index % 2 === 0 ? panes.first() : panes.nth(1);
    await dragBetween(page, current, destinationPane.locator('.cw-tabs-list'), 0.5);
    await expect(destinationPane.locator(`.cw-tab[data-tab-id="${movingId}"]`)).toHaveCount(1);
    await expectUniqueTabIds(page);
  }

  const centerMovingId = await panes.first().locator('.cw-tab').first().getAttribute('data-tab-id');
  await panes.nth(1).locator('.cw-fmt-tab').filter({ hasText: 'Markdown' }).click();
  await expect(panes.nth(1).locator('.cw-md-wrap.editormd')).toBeVisible();
  await beginDrag(page, panes.first().locator('.cw-tab').first(), panes.nth(1).locator('.cw-editor'), 0.5, 0.5);
  const centerPreview = panes.nth(1).locator('.cw-drop-preview.is-center');
  await expect(centerPreview).toBeVisible();
  await expect.poll(async () => {
    return centerPreview.evaluate((preview) => {
      const rect = preview.getBoundingClientRect();
      const previousPointerEvents = preview.style.pointerEvents;
      preview.style.pointerEvents = 'auto';
      const points = [
        [rect.left + rect.width / 2, rect.top + 8],
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + rect.width / 2, rect.bottom - 8],
      ];
      const isTopLayer = points.every(([x, y]) => document.elementFromPoint(x, y) === preview);
      preview.style.pointerEvents = previousPointerEvents;
      return isTopLayer;
    });
  }).toBe(true);
  await page.mouse.up();
  await expect(panes.nth(1).locator(`.cw-tab[data-tab-id="${centerMovingId}"].is-active`)).toHaveCount(1);
  await expectUniqueTabIds(page);

  const paneCountBeforeSplit = await panes.count();
  const leftPaneId = await panes.first().getAttribute('data-pane-id');
  const rightPaneId = await panes.nth(1).getAttribute('data-pane-id');
  const splitMovingId = await panes.nth(1).locator('.cw-tab').first().getAttribute('data-tab-id');
  await beginDrag(page, panes.nth(1).locator('.cw-tab').first(), panes.first().locator('.cw-editor'), 0.5, 0.96);
  await expect(panes.first().locator('.cw-drop-preview.is-bottom')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.cw-pane')).toHaveCount(paneCountBeforeSplit + 1);
  await expect(page.locator(`.cw-tab[data-tab-id="${splitMovingId}"].is-active`)).toHaveCount(1);
  await expectUniqueTabIds(page);

  const nestedGeometry = await page.evaluate(({ leftPaneId, rightPaneId, splitMovingId }) => {
    const topLeft = document.querySelector(`.cw-pane[data-pane-id="${leftPaneId}"]`);
    const right = document.querySelector(`.cw-pane[data-pane-id="${rightPaneId}"]`);
    const movedTab = document.querySelector(`.cw-tab[data-tab-id="${splitMovingId}"]`);
    const bottomLeft = movedTab?.closest('.cw-pane');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    return { topLeft: rect(topLeft), bottomLeft: rect(bottomLeft), right: rect(right) };
  }, { leftPaneId, rightPaneId, splitMovingId });
  expect(Math.abs(nestedGeometry.topLeft.x - nestedGeometry.bottomLeft.x)).toBeLessThan(2);
  expect(Math.abs(nestedGeometry.topLeft.width - nestedGeometry.bottomLeft.width)).toBeLessThan(2);
  expect(nestedGeometry.bottomLeft.y).toBeGreaterThan(nestedGeometry.topLeft.y + nestedGeometry.topLeft.height);
  expect(nestedGeometry.right.x).toBeGreaterThan(nestedGeometry.topLeft.x + nestedGeometry.topLeft.width);
  expect(Math.abs(nestedGeometry.right.y - nestedGeometry.topLeft.y)).toBeLessThan(2);
  expect(Math.abs((nestedGeometry.right.y + nestedGeometry.right.height) - (nestedGeometry.bottomLeft.y + nestedGeometry.bottomLeft.height))).toBeLessThan(2);

  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.panes?.some((pane) => pane.activeTabId === splitMovingId && pane.tabs.some((tab) => tab.id === splitMovingId));
  }).toBe(true);
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.layoutTree?.direction === 'horizontal'
      && state.layoutTree.children?.[0]?.direction === 'vertical'
      && state.layoutTree.children?.[1]?.paneId === rightPaneId;
  }).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.cw-pane')).toHaveCount(paneCountBeforeSplit + 1);
  await expectUniqueTabIds(page);
  const restoredGeometry = await page.evaluate(({ leftPaneId, rightPaneId, splitMovingId }) => {
    const topLeft = document.querySelector(`.cw-pane[data-pane-id="${leftPaneId}"]`);
    const right = document.querySelector(`.cw-pane[data-pane-id="${rightPaneId}"]`);
    const bottomLeft = document.querySelector(`.cw-tab[data-tab-id="${splitMovingId}"]`)?.closest('.cw-pane');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    return { topLeft: rect(topLeft), bottomLeft: rect(bottomLeft), right: rect(right) };
  }, { leftPaneId, rightPaneId, splitMovingId });
  expect(Math.abs(restoredGeometry.topLeft.x - restoredGeometry.bottomLeft.x)).toBeLessThan(2);
  expect(restoredGeometry.bottomLeft.y).toBeGreaterThan(restoredGeometry.topLeft.y + restoredGeometry.topLeft.height);
  expect(Math.abs(restoredGeometry.right.y - restoredGeometry.topLeft.y)).toBeLessThan(2);
  expect(Math.abs((restoredGeometry.right.y + restoredGeometry.right.height) - (restoredGeometry.bottomLeft.y + restoredGeometry.bottomLeft.height))).toBeLessThan(2);

  expect(pageErrors).toEqual([]);
});

test('fullscreen merge from two columns expands the remaining pane', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('transfer-genie:workspace-state'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/composer-fullscreen-active/);
  await page.getByTitle('横向分栏').click();
  await expect(page.locator('.cw-pane')).toHaveCount(2);

  const workspace = page.locator('.composer-ws-main');
  const panes = page.locator('.cw-pane');
  const rightTabId = await panes.nth(1).locator('.cw-tab').getAttribute('data-tab-id');
  await dragBetween(page, panes.nth(1).locator('.cw-tab'), panes.first().locator('.cw-tabs-list'), 0.8);

  await expect(page.locator('.cw-pane')).toHaveCount(1);
  await expect(page.locator(`.cw-pane .cw-tab[data-tab-id="${rightTabId}"]`)).toHaveCount(1);
  await expectUniqueTabIds(page);
  const geometry = await page.evaluate(() => {
    const workspaceRect = document.querySelector('.composer-ws-main')?.getBoundingClientRect();
    const paneRect = document.querySelector('.cw-pane')?.getBoundingClientRect();
    return workspaceRect && paneRect ? {
      workspace: workspaceRect.toJSON(),
      pane: paneRect.toJSON(),
    } : null;
  });
  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.pane.x - geometry.workspace.x)).toBeLessThan(2);
  expect(Math.abs(geometry.pane.width - geometry.workspace.width)).toBeLessThan(2);
  expect(Math.abs(geometry.pane.y - geometry.workspace.y - 2)).toBeLessThan(1);
  expect(Math.abs((geometry.pane.y + geometry.pane.height) - (geometry.workspace.y + geometry.workspace.height))).toBeLessThan(1);
});
