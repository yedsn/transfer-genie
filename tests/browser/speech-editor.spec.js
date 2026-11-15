import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge', viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const endpoint = { id: 'speech-test', name: 'Speech test', url: 'https://example.test/dav', enabled: true };
    const settings = {
      sender_name: 'Speech test', refresh_interval_secs: 3600, default_editor_format: 'text',
      active_storage_profile_id: endpoint.id, webdav_endpoints: [endpoint],
      storage_profiles: [{ ...endpoint, provider_kind: 'webdav', webdav: { url: endpoint.url } }],
      send: { copy_after_send: false }, telegram: {}, ai: {}, backup: {},
      speech_to_text: {
        enabled: true, api_key: 'test-key', resource_id: 'volc.seedasr.sauc.duration',
        endpoint: 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream',
        system_dictation_enabled: true, polish_enabled: false, cue_sound_enabled: false,
      },
    };
    const state = window.__speechEditorTest = { handlers: {}, sends: [], pastes: [], copied: '', refreshed: false, ready: false };
    window.__TAURI__ = {
      core: { invoke: async (command, args) => {
        if (command === 'get_settings') return structuredClone(settings);
        if (command === 'transcribe_speech') {
          await new Promise((resolve) => { state.resolveTranscript = resolve; });
          return { text: '识别结果' };
        }
        if (command === 'send_speech_message') {
          state.sends.push(args.request);
          await new Promise((resolve) => { state.finishSend = resolve; });
          state.ready = true;
          return { filename: 'speech.wav', markedTagIds: [] };
        }
        if (command === 'copy_dictation_text') { state.copied = args.text; return null; }
        if (command === 'paste_dictation_text') { state.pastes.push(args.text); return { focusDetected: true, pasted: true }; }
        if (command === 'list_messages_window') {
          if (state.ready) state.refreshed = true;
          return { messages: [], has_more_before: false, has_more_after: false };
        }
        if (command === 'get_sync_status' || command === 'refresh') return { running: false };
        if (command === 'get_app_version') return '0.0.0-test';
        if (command === 'get_marked_messages' || command === 'list_download_history' || command === 'list_upload_history') return { records: [], total: 0 };
        if (command.startsWith('list_')) return [];
        return null;
      } },
      event: { listen: async (name, handler) => { state.handlers[name] = handler; return () => {}; }, emit: async () => {} },
      dialog: { open: async () => null, save: async () => null },
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      enumerateDevices: async () => [], addEventListener() {},
    } });
    window.AudioContext = class {
      constructor() { this.sampleRate = 16000; this.destination = {}; }
      async resume() {}
      async close() {}
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        const processor = {
          onaudioprocess: null, disconnect() {},
          connect() {
            setTimeout(() => {
              const samples = Float32Array.from({ length: 1600 }, (_, i) => Math.sin(i / 8) * 0.25);
              processor.onaudioprocess?.({ inputBuffer: { numberOfChannels: 1, getChannelData: () => samples } });
            }, 0);
          },
        };
        return processor;
      }
    };
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.transferGenieComposer?.setActiveDraftText && window.__speechEditorTest.handlers['system-dictation-toggle']);
  await expect(page.locator('#active-endpoint')).toHaveValue('speech-test');
  await page.evaluate(() => {
    window.transferGenieComposerStore.clearWorkspaceConfirmed();
    window.transferGenieLegacyFullscreen.set(true);
  });
});

async function record(page, mode) {
  const toggle = async () => {
    if (mode === 'button') await page.locator('#speech-to-text-toggle').click();
    else await page.evaluate(() => window.__speechEditorTest.handlers['system-dictation-toggle']({ payload: null }));
  };
  await toggle();
  await expect(page.locator('#speech-to-text-toggle')).toHaveClass(/is-recording/);
  await toggle();
  await page.waitForFunction(() => window.__speechEditorTest.resolveTranscript);
}

async function completeSend(page) {
  await expect.poll(() => page.evaluate(() => window.__speechEditorTest.sends.length)).toBe(1);
  await page.evaluate(() => window.__speechEditorTest.finishSend());
  await page.waitForFunction(() => window.__speechEditorTest.refreshed);
  await expect(page.locator('html')).toHaveClass(/composer-fullscreen-active/);
  await expect(page.locator('body')).toHaveClass(/composer-fullscreen-active/);
  await expect(page.locator('.cw-sent-dialog')).toHaveCount(0);
}

for (const mode of ['button', 'shortcut']) {
  for (const format of ['text', 'markdown']) {
    for (const end of [1, 3]) {
      test(`${mode} inserts into ${format} at ${end === 1 ? 'caret' : 'selection'} and stays fullscreen`, async ({ page }) => {
        await page.evaluate((format) => {
          const store = window.transferGenieComposerStore;
          const id = store.getActiveDraft().id;
          store.setDraftText(id, '甲乙丙丁');
          store.setDraftFormat(id, format);
        }, format);
        const editor = page.locator('.cw-editor');
        if (format === 'markdown') {
          await expect(editor.locator('.cw-md-wrap')).toHaveAttribute('data-markdown-ready', 'true');
          await editor.locator('.CodeMirror').evaluate((element, end) => {
            const cm = element.CodeMirror;
            cm.focus();
            cm.setSelection({ line: 0, ch: 1 }, { line: 0, ch: end });
          }, end);
        } else {
          await editor.locator('textarea').focus();
          await editor.locator('textarea').evaluate((element, end) => element.setSelectionRange(1, end), end);
        }
        await record(page, mode);
        await page.evaluate(() => window.__speechEditorTest.resolveTranscript());
        const expected = end === 1 ? '甲识别结果乙丙丁' : '甲识别结果丁';
        await expect.poll(() => page.evaluate(() => window.transferGenieComposerStore.getActiveDraft().text)).toBe(expected);
        await completeSend(page);
        expect(await page.evaluate(() => window.transferGenieComposerStore.getActiveDraft().text)).toBe(expected);
        expect(await page.evaluate(() => ({ pastes: window.__speechEditorTest.pastes, copied: window.__speechEditorTest.copied, transcript: window.__speechEditorTest.sends[0].transcript })))
          .toEqual({ pastes: [], copied: '识别结果', transcript: '识别结果' });
        if (format === 'markdown') {
          expect(await editor.locator('.CodeMirror').evaluate((element) => ({ text: element.CodeMirror.getValue(), cursor: element.CodeMirror.getCursor().ch })))
            .toEqual({ text: expected, cursor: 5 });
        } else {
          await expect(editor.locator('textarea')).toBeFocused();
          expect(await editor.locator('textarea').evaluate((element) => ({ text: element.value, cursor: element.selectionStart })))
            .toEqual({ text: expected, cursor: 5 });
        }
      });
    }
  }
}

test('shortcut uses native paste when focus moves out of the editor before output', async ({ page }) => {
  await page.locator('.cw-textarea').fill('保留草稿');
  await record(page, 'shortcut');
  await page.evaluate(() => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.__speechEditorTest.resolveTranscript();
  });
  await completeSend(page);
  expect(await page.evaluate(() => window.__speechEditorTest.pastes)).toEqual(['识别结果']);
  expect(await page.evaluate(() => window.transferGenieComposerStore.getActiveDraft().text)).toBe('保留草稿');
});
