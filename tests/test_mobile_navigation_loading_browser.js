import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120';

try {
  for (const scenario of ['detail', 'text', 'markdown', 'error', 'cold-start', 'invalid-route']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ scenario }) => {
        const format = scenario === 'markdown' ? 'markdown' : 'text';
        const profile = { id: 'loading-test', name: 'Offline fixture', provider_kind: 'supabase', enabled: true, supabase: { space_id: 'loading-space', binding_state: 'bound' } };
        sessionStorage.setItem('transfer-genie:native-composer-format', format);
        sessionStorage.setItem('transfer-genie:native-detail-message', JSON.stringify({
          filename: 'loading-fixture', kind: 'text', title: 'Instant detail', body: 'Content before initialization', format: 'text', source: 'Fixture', time: 'Now', originalName: 'fixture', tagIds: [],
        }));
        let releaseSettings;
        const settingsReady = new Promise(resolve => { releaseSettings = resolve; });
        window.__releaseSettings = releaseSettings;
        window.__writes = [];
        window.__TAURI__ = {
          core: {
            addPluginListener: async () => ({ unregister() {} }),
            invoke: async (command, input) => {
              if (command === 'get_settings') {
                await settingsReady;
                if (scenario === 'error') throw new Error('fixture initialization unavailable');
                return { active_storage_profile_id: profile.id, storage_profiles: [profile] };
              }
              if (command === 'get_platform_capabilities') return { ios: true };
              if (command === 'supabase_current_user') return { signedIn: true, userId: 'fixture-user' };
              if (command === 'get_mobile_composer_draft') return { text: format === 'markdown' ? '# Restored heading' : 'Restored draft', format, attachments: [], tagIds: [], updatedAtMs: 1 };
              if (command === 'save_mobile_composer_draft') { window.__writes.push(input); return { updatedAtMs: 2 }; }
              if (command === 'list_messages_window') return { messages: [], hasMoreBefore: false };
              if (command === 'list_marked_messages') return { messages: [], total: 0 };
              if (command === 'get_sync_status') return { pending_count: 0 };
              if (command === 'list_download_history') return { records: [] };
              if (command === 'get_mobile_cache_summary') return { fileCount: 0, protectedTasks: 0, reclaimableBytes: 0 };
              if (command === 'get_app_version') return 'fixture';
              if (command.startsWith('plugin:mobile-integration|')) return { supported: true, enabled: Boolean(input?.payload?.enabled) };
              return [];
            },
          },
          event: { listen: async () => () => {} },
        };
        window.__loadingFrames = [];
        const sample = () => {
          const loader = document.getElementById('app-boot-screen');
          const gate = document.querySelector('.mobile-onboarding');
          if (loader && getComputedStyle(loader).display !== 'none' || gate) window.__loadingFrames.push(performance.now());
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, { scenario });

      // Hold the entry module to inspect HTML before Vue has mounted, then hold
      // the native settings bridge separately to inspect the actual first page.
      let releaseEntry;
      const entryReady = new Promise(resolve => { releaseEntry = resolve; });
      await page.route('**/src/main.ts', async route => { await entryReady; await route.continue(); });
      const route = scenario === 'detail' || scenario === 'error' ? 'detail'
        : scenario === 'cold-start' ? '' : scenario === 'invalid-route' ? 'unknown' : 'composer';
      await page.goto(origin + '/' + (route ? '?tg-mobile-page=' + route : ''), { waitUntil: 'commit' });
      await page.waitForSelector('#app-boot-screen', { state: 'attached' });
      const internal = route === 'detail' || route === 'composer';
      assert.equal(await page.locator('#app-boot-screen').isVisible(), !internal, scenario + ': entry HTML must distinguish internal navigation from cold start');
      releaseEntry();

      if (!internal) {
        await page.waitForSelector('.mobile-onboarding');
        await page.evaluate(() => window.__releaseSettings());
        continue;
      }
      const sheet = page.locator(route === 'detail' ? '.mobile-detail-sheet' : '.mobile-composer-sheet');
      await sheet.waitFor();
      assert.equal(await page.locator('.mobile-sheet-layer').evaluate(el => getComputedStyle(el).animationName), 'none', 'internal page must not fade in after navigation');
      assert.equal(await page.locator('.mobile-onboarding').count(), 0);
      assert.equal(await page.evaluate(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.boot), 'loading');
      if (route === 'detail') {
        assert.equal(await page.locator('.mobile-detail-copy').innerText(), 'Content before initialization');
      } else {
        const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
        await editor.waitFor();
        if (scenario === 'markdown') {
          assert.equal(await editor.getAttribute('contenteditable'), 'false');
          await page.getByRole('toolbar', { name: 'Markdown 格式工具' }).waitFor();
        } else assert.equal(await editor.isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: '文字', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Markdown', exact: true }).isDisabled(), true);
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await page.evaluate(() => window.__loadingFrames), [], scenario + ': no loading frame, even while initialization is pending');
      await page.evaluate(() => window.__releaseSettings());
      if (scenario === 'error') {
        await page.getByRole('alert').filter({ hasText: 'fixture initialization unavailable' }).waitFor();
        assert.equal(await sheet.isVisible(), true, 'initialization errors remain inline in the detail page');
      } else {
        await page.waitForFunction(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.boot === 'ready');
        if (scenario === 'markdown') await page.locator('.ProseMirror h1').filter({ hasText: 'Restored heading' }).waitFor();
        if (scenario === 'text') assert.equal(await page.getByRole('textbox', { name: '消息内容', exact: true }).inputValue(), 'Restored draft');
      }
      assert.deepEqual(await page.evaluate(() => window.__writes), [], 'rendering/restoration must not save over the existing draft');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log('mobile navigation first-frame checks passed: delayed entry/init, detail snapshot, text/Markdown restore, inline errors, cold-start retained');
} finally {
  await browser.close();
}
