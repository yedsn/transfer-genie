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
    window.transferGenieLegacyFullscreen.set(true);
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
    await expect(page.locator('html')).not.toHaveClass(/composer-fullscreen-active/);
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
    await expect(page.locator('html')).toHaveClass(/composer-fullscreen-active/);
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
  await expect(page.locator('html')).not.toHaveClass(/composer-fullscreen-active/);
  expect(await page.evaluate(() => {
    return ['Enter', 'Escape'].map((key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
  })).toEqual([false, false]);
});

test('mouse confirmation exits fullscreen while countdown completion keeps it active', async ({ page }) => {
  await page.clock.install();
  await promptSentDraft(page);
  await page.locator('.cw-sent-confirm').click();
  await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/composer-fullscreen-active/);

  await promptSentDraft(page);
  await page.clock.runFor(5000);
  await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveClass(/composer-fullscreen-active/);
});

test('the real send flow stays fullscreen until Enter confirms the countdown', async ({ page }) => {
  await page.addInitScript(() => {
    const endpoint = { id: 'fullscreen-test', name: 'Fullscreen test', url: 'https://example.test/dav', enabled: true };
    const settings = {
      sender_name: 'Fullscreen test',
      refresh_interval_secs: 3600,
      default_editor_format: 'text',
      active_storage_profile_id: endpoint.id,
      webdav_endpoints: [endpoint],
      storage_profiles: [{ ...endpoint, provider_kind: 'webdav', webdav: { url: endpoint.url } }],
      send: { copy_after_send: false },
      telegram: {}, ai: {}, speech_to_text: {}, backup: {},
    };
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command === 'get_settings') return structuredClone(settings);
          if (command === 'send_text') return { filename: 'fullscreen-test.txt', markedTagIds: [] };
          if (command === 'list_messages_window') return { messages: [], has_more_before: false, has_more_after: false };
          if (command === 'get_sync_status' || command === 'refresh') return { running: false };
          if (command === 'get_app_version') return '0.0.0-test';
          if (command === 'get_marked_messages' || command === 'list_download_history' || command === 'list_upload_history') return { records: [], total: 0 };
          if (command.startsWith('list_')) return [];
          return null;
        },
      },
      event: { listen: async () => () => {}, emit: async () => {} },
      dialog: { open: async () => null, save: async () => null },
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.transferGenieComposer?.promptCloseSentDraft);
  await page.evaluate(() => {
    const store = window.transferGenieComposerStore;
    store.clearWorkspaceConfirmed();
    store.setDraftText(store.getActiveDraft().id, '全屏发送内容');
    window.transferGenieLegacyFullscreen.set(true);
  });
  await page.locator('#send-text').click();
  await expect(page.locator('.cw-sent-dialog')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/composer-fullscreen-active/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/composer-fullscreen-active/);
});
