import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
assert.ok(process.env.MOBILE_TEST_VIDEO, 'Provide a dedicated MP4 via MOBILE_TEST_VIDEO');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.waitForSelector('.mobile-message-card');
  await page.evaluate((video) => {
    const ui = document.querySelector('.mobile-shell').__vueParentComponent.setupState;
    window.__mediaTest = { ui, video, plays: 0, previews: 0 };
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;
    canvas.getContext('2d').fillRect(0, 0, 320, 180);
    const previewUrl = canvas.toDataURL('image/jpeg');
    const base = { sender: 'Mac', source: 'Mac', time: '12:00', timestampMs: 1, marked: false, tagIds: [], cached: true, attachmentState: 'cached', previewState: 'ready', previewUrl };
    ui.state.messages = [
      { ...base, filename: 'photo.jpg', originalName: 'photo.jpg', title: 'photo.jpg', kind: 'image' },
      { ...base, filename: 'clip.mp4', originalName: 'clip.mp4', title: 'clip.mp4', kind: 'video' },
    ];
    ui.state.markedView.messages = ui.state.messages.map(message => ({ ...message, marked: true }));
    ui.state.markedTotal = 2;
    ui.controller.prepareVideo = async () => { window.__mediaTest.plays++; return 'data:video/mp4;base64,' + video; };
    ui.controller.previewMessage = async () => { window.__mediaTest.previews++; };
  }, fs.readFileSync(process.env.MOBILE_TEST_VIDEO).toString('base64'));
  await page.waitForFunction(() => document.querySelectorAll('.mobile-media-preview img').length === 2 && [...document.querySelectorAll('.mobile-media-preview img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await page.evaluate(() => window.__mediaTest.plays), 0);
  await page.locator('[data-message-filename="photo.jpg"]').click();
  await page.waitForFunction(() => document.querySelector('.mobile-detail-preview img')?.naturalWidth > 0);
  await page.getByRole('button', { name: '查看', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__mediaTest.previews), 1);
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.locator('[data-message-filename="clip.mp4"]').click();
  assert.equal(await page.locator('.mobile-detail-preview img').count(), 1);
  await page.getByRole('button', { name: '播放视频', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.mobile-detail-preview video')?.currentTime > 0.1);
  await page.getByText('已播放 1 秒', { exact: true }).waitFor();
  assert.equal(await page.locator('.mobile-detail-sheet').count(), 1);
  const player = await page.locator('.mobile-detail-preview video').elementHandle();
  assert.ok(await player.evaluate(el => el.controls && el.playsInline && !!el.poster));
  await page.screenshot({ path: '/tmp/tg-inline-media-20261028.png' });
  await page.locator('.mobile-detail-more').click();
  assert.equal(await player.evaluate(el => el.paused), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mobile-detail-preview video').count(), 1);
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  assert.equal(await page.locator('.mobile-detail-preview video').count(), 0);

  // A closed detail must not be resurrected by a late download, or attach it to another message.
  await page.evaluate(() => {
    window.__mediaTest.ui.controller.prepareVideo = () => new Promise(resolve => { window.__mediaTest.resolveVideo = resolve; });
  });
  await page.locator('[data-message-filename="clip.mp4"]').click();
  await page.getByRole('button', { name: '播放视频', exact: true }).click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.locator('[data-message-filename="photo.jpg"]').click();
  await page.evaluate(() => { window.__mediaTest.resolveVideo('data:video/mp4;base64,unused'); });
  await page.waitForFunction(() => document.querySelector('.mobile-detail-preview img')?.naturalWidth > 0);
  assert.equal(await page.locator('.mobile-detail-preview video').count(), 0, 'late video must not replace an image detail');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();

  // Marked media must be decoded too, not just represented by filenames or play symbols.
  await page.getByRole('button', { name: '标记', exact: true }).click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.mobile-marked-media img')];
    return images.length === 2 && images.every(img => img.complete && img.naturalWidth > 0);
  });
  assert.equal(await page.locator('.mobile-marked-media span[aria-label="视频"]').count(), 1);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.locator('.mobile-marked-page').evaluate(el => el.scrollWidth > el.clientWidth), false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-task-body').filter({ hasText: 'clip.mp4' }).click();
  await page.evaluate(() => {
    window.__mediaTest.ui.controller.prepareVideo = async () => 'data:video/mp4;base64,' + window.__mediaTest.video;
  });
  await page.getByRole('button', { name: '播放视频', exact: true }).click();
  await page.waitForSelector('.mobile-detail-preview video');
  await page.locator('.mobile-detail-preview video').evaluate(el => el.dispatchEvent(new Event('error')));
  await page.getByText('此视频无法在详情中播放，可尝试系统播放器或分享导出', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '系统播放器', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '系统播放器', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__mediaTest.previews), 2, 'unsupported inline video retains the native fallback');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  console.log('mobile media browser passed: decoded feed/marked/detail thumbnails, image view, inline MP4 playback, paused/retained player, late-download isolation, bounded marked media and native fallback');
} finally { await browser.close(); }
