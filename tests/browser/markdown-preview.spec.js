import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const endpoint = { id: 'preview-test', name: 'Preview test', url: 'https://example.test/dav', enabled: true };
    const settings = {
      sender_name: 'Preview test',
      refresh_interval_secs: 3600,
      default_editor_format: 'text',
      active_storage_profile_id: endpoint.id,
      webdav_endpoints: [endpoint],
      storage_profiles: [{ ...endpoint, provider_kind: 'webdav', webdav: { url: endpoint.url } }],
      send: { copy_after_send: false },
      telegram: {}, ai: {}, speech_to_text: {}, backup: {},
    };
    const messages = [];
    window.__previewTest = { sends: [] };
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command === 'get_settings') return structuredClone(settings);
          if (command === 'send_text') {
            window.__previewTest.sends.push(args);
            const message = {
              filename: `preview-${messages.length}.md`, endpoint_id: endpoint.id,
              sender: settings.sender_name, timestamp_ms: Date.now(), kind: 'text',
              content: args.text, format: args.format, size: args.text.length, marked_tag_ids: [],
            };
            messages.unshift(message);
            return { filename: message.filename, markedTagIds: [] };
          }
          if (command === 'list_messages_window') return { messages, has_more_before: false, has_more_after: false };
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
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.transferGenieSendActiveDraft);
  await expect(page.locator('#active-endpoint')).toHaveValue('preview-test');
  await page.evaluate(() => window.transferGenieComposerStore.clearWorkspaceConfirmed());
});

function editorFor(page, id) {
  return page.locator(`.cw-editor[data-draft-id="${id}"]`);
}

async function expectPreview(page, id, heading) {
  const editor = editorFor(page, id);
  await expect(editor.locator('.cw-md-wrap')).toHaveAttribute('data-markdown-ready', 'true');
  await expect(editor.locator('.editormd-preview')).toBeVisible();
  await expect(editor.locator('.editormd-preview-container h1')).toHaveText(heading);
}

async function editMarkdown(page, id, text) {
  await editorFor(page, id).locator('.CodeMirror').evaluate((element, text) => element.CodeMirror.setValue(text), text);
  await expect.poll(() => page.evaluate((id) => window.transferGenieComposerStore.getDraft(id)?.text, id)).toBe(text);
}

async function createDrafts(page) {
  return page.evaluate(() => {
    const store = window.transferGenieComposerStore;
    const sourceId = store.getActiveDraft().id;
    const paneId = store.state.activePaneId;
    store.setDraftText(sourceId, '# Source');
    store.setDraftFormat(sourceId, 'markdown');
    const otherId = store.addDraft(paneId);
    store.setDraftText(otherId, '# Other');
    store.setDraftFormat(otherId, 'markdown');
    store.switchDraft(paneId, sourceId);
    return { sourceId, otherId, paneId };
  });
}

for (const closeSent of [false, true]) {
  test(`other tabs render after sending and ${closeSent ? 'closing' : 'keeping'} the source draft`, async ({ page }) => {
    const { sourceId, otherId } = await createDrafts(page);
    await expectPreview(page, sourceId, 'Source');
    await editMarkdown(page, sourceId, '# Sent');
    await expectPreview(page, sourceId, 'Sent');
    await page.locator('#send-text').click();
    await expect.poll(() => page.evaluate(() => window.__previewTest.sends.length)).toBe(1);
    await expect(page.locator('.cw-sent-dialog')).toBeVisible();
    await page.locator(closeSent ? '.cw-sent-confirm' : '.cw-sent-cancel').click();
    await page.locator(`.cw-tab[data-tab-id="${otherId}"]`).click();
    await expectPreview(page, otherId, 'Other');
    await editMarkdown(page, otherId, '# Other updated');
    await expectPreview(page, otherId, 'Other updated');
    expect(await page.evaluate((id) => window.transferGenieComposerStore.getDraft(id)?.text, sourceId)).toBe(closeSent ? undefined : '# Sent');
  });
}

test('switching tabs after a preview update renders existing content immediately', async ({ page }) => {
  const { sourceId, otherId } = await createDrafts(page);
  await expectPreview(page, sourceId, 'Source');
  await editMarkdown(page, sourceId, '# Updated');
  await expectPreview(page, sourceId, 'Updated');
  for (const [id, heading] of [[otherId, 'Other'], [sourceId, 'Updated'], [otherId, 'Other']]) {
    await page.locator(`.cw-tab[data-tab-id="${id}"]`).click();
    await expectPreview(page, id, heading);
  }
});

test('split-pane editors update independently and keep separate preview toggles', async ({ page }) => {
  const { sourceId } = await createDrafts(page);
  await expectPreview(page, sourceId, 'Source');
  await page.getByTitle('横向分栏').click();
  const secondId = await page.evaluate(() => {
    const store = window.transferGenieComposerStore;
    const id = store.addDraft(store.state.panes[1].id);
    store.setDraftText(id, '# Second pane');
    store.setDraftFormat(id, 'markdown');
    return id;
  });
  await expectPreview(page, secondId, 'Second pane');
  await editMarkdown(page, sourceId, '# First edited');
  await editMarkdown(page, secondId, '# Second edited');
  await expectPreview(page, sourceId, 'First edited');
  await expectPreview(page, secondId, 'Second edited');
  await editorFor(page, sourceId).getByTitle('关闭实时预览', { exact: true }).click();
  await expect(editorFor(page, sourceId).locator('.editormd-preview')).toBeHidden();
  await editMarkdown(page, secondId, '# Still live');
  await expectPreview(page, secondId, 'Still live');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(editorFor(page, sourceId).locator('.editormd-preview')).toBeHidden();
  await expectPreview(page, secondId, 'Still live');
});
