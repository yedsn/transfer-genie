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

  const paneCountBeforeSplit = await panes.count();
  const splitMovingId = await panes.nth(1).locator('.cw-tab').first().getAttribute('data-tab-id');
  await beginDrag(page, panes.nth(1).locator('.cw-tab').first(), panes.first().locator('.cw-editor'), 0.96, 0.5);
  await expect(panes.first().locator('.cw-drop-preview.is-right')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.cw-pane')).toHaveCount(paneCountBeforeSplit + 1);
  await expect(page.locator(`.cw-tab[data-tab-id="${splitMovingId}"].is-active`)).toHaveCount(1);

  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.panes?.some((pane) => pane.activeTabId === splitMovingId && pane.tabs.some((tab) => tab.id === splitMovingId));
  }).toBe(true);

  expect(pageErrors).toEqual([]);
});
