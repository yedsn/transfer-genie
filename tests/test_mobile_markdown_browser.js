import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto((process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:7120') + '/?mobile-preview=1');
  await page.getByRole('button', { name: '新消息', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '消息内容', exact: true });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const tools = page.getByRole('toolbar', { name: 'Markdown 格式工具', exact: true });
  assert.equal(await tools.getByRole('button').count(), 8);
  const select = async (start, end = start) => editor.evaluate((el, range) => { el.focus(); el.setSelectionRange(...range); }, [start, end]);
  for (const [label, source, start, end, expected] of [
    ['粗体', 'first second', 6, 12, 'first **second**'],
    ['斜体', 'first second', 6, 12, 'first *second*'],
    ['代码', 'first second', 6, 12, 'first `second`'],
    ['链接', 'first second', 6, 12, 'first [second](https://)'],
    ['标题', 'first\nsecond', 6, 12, 'first\n## second'],
    ['无序列表', 'first\nsecond', 0, 12, '- first\n- second'],
    ['有序列表', 'first\nsecond', 0, 12, '1. first\n2. second'],
    ['引用', 'first\nsecond', 0, 12, '> first\n> second'],
  ]) {
    await editor.fill(source);
    await select(start, end);
    await tools.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await editor.inputValue(), expected);
    assert.ok(await editor.evaluate(el => el === document.activeElement));
    assert.equal(await page.evaluate(() => document.querySelector('.mobile-shell').__vueParentComponent.setupState.state.composer.text), expected);
  }
  await editor.fill('word');
  await select(0, 4);
  await tools.getByRole('button', { name: '链接', exact: true }).click();
  await page.keyboard.type('https://example.com');
  assert.equal(await editor.inputValue(), '[word](https://example.com)', 'link tool selects the URL for direct replacement');
  await editor.fill('first\nsecond');
  await select(0, 12);
  await tools.getByRole('button', { name: '代码', exact: true }).click();
  assert.equal(await editor.inputValue(), '```\nfirst\nsecond\n```');
  await editor.fill('word');
  await select(0, 4);
  await tools.getByRole('button', { name: '粗体', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  assert.equal(await editor.inputValue(), 'word', 'format actions participate in browser undo');
  await editor.fill('');
  await tools.getByRole('button', { name: '粗体', exact: true }).click();
  await page.keyboard.type('hello');
  assert.equal(await editor.inputValue(), '**hello**', 'empty selection inserts between markers');
  await editor.fill('# Preview\n\n**bold**\n' + 'long paragraph\n'.repeat(35));
  await select(12, 16);
  await editor.evaluate(el => { el.scrollTop = 120; window.__markdownScroll = el.scrollTop; window.__markdownSource = el.value; });
  await page.getByRole('button', { name: '预览', exact: true }).click();
  assert.equal(await page.locator('.mobile-compose-preview h1').innerText(), 'Preview');
  assert.equal(await tools.count(), 0);
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.ok(await editor.evaluate(el => el === document.activeElement && el.value === window.__markdownSource && el.scrollTop === window.__markdownScroll && el.selectionStart === 12 && el.selectionEnd === 16));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.locator('.mobile-composer-sheet').evaluate(el => el.scrollWidth > el.clientWidth), false);
    for (const button of await tools.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.fill('# 今天的想法\n\n让文字更容易整理。');
  await page.locator('.mobile-draft-save-status').filter({ hasText: '草稿已自动保存' }).waitFor();
  if (process.env.MARKDOWN_EDITOR_SCREENSHOT) await page.screenshot({ path: process.env.MARKDOWN_EDITOR_SCREENSHOT });
  await page.getByRole('button', { name: '文字', exact: true }).click();
  assert.equal(await tools.count(), 0);
  assert.equal(await editor.inputValue(), '# 今天的想法\n\n让文字更容易整理。');
  console.log('mobile Markdown interaction passed: 8 tools, selections/caret, native undo, source/scroll/selection preview return, bounded touch targets and plain-text preservation');
} finally { await browser.close(); }
