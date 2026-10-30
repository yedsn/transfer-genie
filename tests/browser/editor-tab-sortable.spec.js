import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });

async function dragBetween(page, source, target, targetXRatio = 0.5) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width * targetXRatio;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY, { steps: 3 });
  await expect(page.locator('.cw-tab-sortable-fallback')).toHaveCount(1);
  await expect(page.locator('.cw-tab-sortable-fallback')).toHaveCSS('pointer-events', 'none');
  await page.mouse.move(endX, endY, { steps: 16 });
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
  await dragBetween(page, firstPane.locator('.cw-tab').last(), firstPane.locator('.cw-tab').first(), 0.15);
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
  await dragBetween(page, panes.first().locator('.cw-tab').first(), panes.nth(1).locator('.cw-tab').first(), 0.2);
  await expect(panes.nth(1).locator(`.cw-tab[data-tab-id="${movingId}"]`)).toHaveCount(1);
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('transfer-genie:workspace-state'));
    const state = raw ? JSON.parse(raw) : null;
    return state?.panes?.some((pane) => pane.id === targetPaneId && pane.tabs.some((tab) => tab.id === movingId));
  }).toBe(true);

  expect(pageErrors).toEqual([]);
});
