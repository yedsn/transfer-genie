import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.transferGenieComposer?.promptCloseSentDraft);
  await page.evaluate(() => window.transferGenieComposerStore.clearWorkspaceConfirmed());
});

async function promptSentDraft(page) {
  const ids = await page.evaluate(() => {
    const store = window.transferGenieComposerStore;
    const sourceId = store.getActiveDraft().id;
    store.setDraftText(sourceId, '已发送内容');
    store.renameDraft(sourceId, '发送来源');
    const source = store.getDraft(sourceId);
    const otherId = store.addDraft(store.state.activePaneId);
    store.setDraftText(otherId, '其他草稿');
    window.transferGenieComposer.promptCloseSentDraft({ id: sourceId, text: source.text, format: source.format });
    return { sourceId, otherId };
  });
  await expect(page.locator('.cw-sent-backdrop')).toBeFocused();
  return ids;
}

for (const focusCancel of [false, true]) {
  test(`Enter confirms the source tab${focusCancel ? ' even with Cancel focused' : ''}`, async ({ page }) => {
    const { sourceId, otherId } = await promptSentDraft(page);
    if (focusCancel) await page.locator('.cw-sent-cancel').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
    await expect(page.locator(`.cw-tab[data-tab-id="${sourceId}"]`)).toHaveCount(0);
    await expect(page.locator(`.cw-tab[data-tab-id="${otherId}"].is-active`)).toHaveCount(1);
    expect(await page.evaluate((id) => window.transferGenieComposerStore.getDraft(id).text, otherId)).toBe('其他草稿');
  });
}

for (const focusConfirm of [false, true]) {
  test(`Escape cancels the countdown${focusConfirm ? ' even with Confirm focused' : ''}`, async ({ page }) => {
    await page.clock.install();
    const { sourceId } = await promptSentDraft(page);
    await page.evaluate((id) => window.transferGenieComposerStore.setDraftText(id, '发送后修改'), sourceId);
    if (focusConfirm) await page.locator('.cw-sent-confirm').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
    await page.clock.runFor(6000);
    await expect(page.locator(`.cw-tab[data-tab-id="${sourceId}"]`)).toHaveCount(1);
    expect(await page.evaluate((id) => {
      const draft = window.transferGenieComposerStore.getDraft(id);
      return { text: draft.text, title: draft.title };
    }, sourceId)).toEqual({ text: '发送后修改', title: '发送来源' });
  });
}

test('composition and held keys do not confirm; handled keys stay inside the dialog', async ({ page }) => {
  const { sourceId } = await promptSentDraft(page);
  for (const options of [{ key: 'Enter', isComposing: true }, { key: 'Enter', repeat: true }, { key: 'Escape', repeat: true }]) {
    await page.locator('.cw-sent-backdrop').evaluate((element, options) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true }));
    }, options);
    await expect(page.locator('.cw-sent-dialog')).toHaveCount(1);
  }
  const result = await page.evaluate(() => {
    let escaped = false;
    const onKeydown = () => { escaped = true; };
    document.addEventListener('keydown', onKeydown);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.querySelector('.cw-sent-backdrop').dispatchEvent(event);
    document.removeEventListener('keydown', onKeydown);
    return { prevented: event.defaultPrevented, escaped };
  });
  expect(result).toEqual({ prevented: true, escaped: false });
  await expect(page.locator(`.cw-tab[data-tab-id="${sourceId}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => {
    return ['Enter', 'Escape'].map((key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
  })).toEqual([false, false]);
});
