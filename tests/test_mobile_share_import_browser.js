import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.addInitScript(() => {
    window.__TRANSFER_GENIE_SHARE_IMPORT_SPY__ = true;
    window.__shareBatches = [];
    window.__shareCalls = [];
    window.__shareBlankComposerObserved = false;

    window.__addShareBatch = (name = 'report.pdf') => {
      const batchId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      window.__shareBatches.push({
        batchId,
        createdAtMs: Date.now(),
        files: [{
          fileId,
          importName: `01-${name}`,
          originalName: name,
          contentType: 'application/pdf',
          sizeBytes: 12,
        }],
      });
      return batchId;
    };

    const inspectComposer = () => {
      const shell = document.querySelector('.mobile-shell');
      const state = shell?.__vueParentComponent?.setupState?.state;
      if (!state || !document.querySelector('.mobile-composer-sheet')) return;
      if (!state.shareImport.importing && state.composer.attachments.length === 0) {
        window.__shareBlankComposerObserved = true;
      }
    };
    new MutationObserver(inspectComposer).observe(document, { childList: true, subtree: true });

    let apiValue;
    Object.defineProperty(window, 'transferGenieApi', {
      configurable: true,
      enumerable: true,
      get() { return apiValue; },
      set(value) {
        if (value) {
          value.event.listen = async (eventName, handler) => {
            if (eventName === 'transfer-genie-share-import') window.__shareImportListener = handler;
            return () => {};
          };
          value.mobileIntegration.listSharedImports = async () => {
            window.__shareCalls.push(['list']);
            return { batches: structuredClone(window.__shareBatches) };
          };
          value.mobileIntegration.stageSharedImports = async (batchIds) => {
            window.__shareCalls.push(['stage', [...batchIds]]);
            return {
              batches: window.__shareBatches
                .filter((batch) => batchIds.includes(batch.batchId))
                .map((batch) => ({
                  batchId: batch.batchId,
                  createdAtMs: batch.createdAtMs,
                  complete: true,
                  failures: [],
                  files: batch.files.map((file) => ({
                    ...file,
                    path: `/fixture/MobileImports/${batch.batchId}/${file.importName}`,
                  })),
                })),
            };
          };
          value.mobileIntegration.acknowledgeSharedImports = async (batchIds) => {
            window.__shareCalls.push(['ack', [...batchIds]]);
            window.__shareBatches = window.__shareBatches.filter((batch) => !batchIds.includes(batch.batchId));
            return { acknowledgedBatchIds: [...batchIds] };
          };
          value.message.sendFile = async () => { window.__shareCalls.push(['sendFile']); };
          value.message.sendText = async () => { window.__shareCalls.push(['sendText']); };
        }
        apiValue = value;
      },
    });
    window.__addShareBatch('cold-start.pdf');
  });

  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-composer-sheet');
  await page.waitForFunction(() => {
    const state = document.querySelector('.mobile-shell')?.__vueParentComponent?.setupState?.state;
    return state?.composer.attachments.length === 1 && window.__shareBatches.length === 0;
  });
  assert.equal(await page.evaluate(() => window.__shareBlankComposerObserved), false, 'cold start must not expose an empty composer');
  assert.equal(
    await page.evaluate(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments[0].originalName),
    'cold-start.pdf',
  );
  assert.deepEqual(
    await page.evaluate(() => window.__shareCalls.filter(([name]) => ['stage', 'ack'].includes(name)).map(([name]) => name)),
    ['stage', 'ack'],
  );

  const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
  await editor.fill('existing draft text');
  await page.evaluate(() => window.__addShareBatch('warm-share.pdf'));
  await page.evaluate(() => window.__shareImportListener?.());
  await page.waitForFunction(() => {
    const state = document.querySelector('.mobile-shell')?.__vueParentComponent?.setupState?.state;
    return state?.composer.attachments.length === 2 && window.__shareBatches.length === 0;
  });
  assert.equal(await editor.inputValue(), 'existing draft text', 'warm share must preserve current draft text');
  assert.equal(await page.locator('.mobile-composer-sheet').count(), 1, 'warm share must reuse the open Composer');

  await page.evaluate(() => window.__shareImportListener?.());
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.attachments.length),
    2,
    'duplicate URL delivery must not duplicate attachments',
  );

  await page.getByRole('button', { name: '关闭新消息' }).click();
  await page.waitForSelector('.mobile-composer-sheet', { state: 'detached' });
  await page.evaluate(() => {
    const state = document.querySelector('.mobile-shell').__vueParentComponent.setupState.state;
    state.composer.persistenceReady = false;
    state.boot = 'signed-out';
    window.__shareCalls = [];
    window.__addShareBatch('after-login.pdf');
    window.__shareImportListener?.();
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.mobile-composer-sheet').count(), 0, 'signed-out share must wait for readiness');
  assert.equal(await page.evaluate(() => window.__shareBatches.length), 1, 'signed-out share must remain in the inbox');
  assert.equal(await page.evaluate(() => window.__shareCalls.some(([name]) => name === 'list')), false);

  await page.evaluate(() => {
    const state = document.querySelector('.mobile-shell').__vueParentComponent.setupState.state;
    state.composer.persistenceReady = true;
    state.boot = 'ready';
  });
  await page.waitForSelector('.mobile-composer-sheet');
  await page.waitForFunction(() => {
    const state = document.querySelector('.mobile-shell')?.__vueParentComponent?.setupState?.state;
    return state?.composer.attachments.length === 3 && window.__shareBatches.length === 0;
  });
  assert.equal(await page.evaluate(() => window.__shareCalls.some(([name]) => name.startsWith('send'))), false, 'share import never sends automatically');
  console.log('mobile share browser routing passed: cold start, warm Composer, duplicate delivery, signed-out resume, no automatic send');
} finally {
  await browser.close();
}
