import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto((process.env.MOBILE_PREVIEW_URL || "http://127.0.0.1:7120") + "/?mobile-preview=1");
  await page.waitForSelector(".mobile-message-card");
  async function touch(selector, type, points) {
    return page.locator(selector).evaluate((element, { type, points }) => {
      const touches = points.map(([x, y], id) => new Touch({ identifier: id, target: element, clientX: x, clientY: y }));
      element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches }));
    }, { type, points });
  }
  async function swipe(selector, start = [385, 300], end = [235, 300], finish = "touchend") {
    await touch(selector, "touchstart", [start]);
    await touch(selector, "touchmove", [end]);
    await touch(selector, finish, []);
  }
  const detail = ".mobile-detail-sheet";
  const composer = ".mobile-composer-sheet";
  await page.locator(".mobile-message-card").first().click();
  await page.waitForSelector(detail);
  await touch(detail, "touchstart", [[385, 300]]);
  await touch(detail, "touchmove", [[345, 300]]);
  assert.equal(await page.locator(detail).evaluate(el => el.style.getPropertyValue("--swipe-offset")), "-40px");
  await touch(detail, "touchcancel", []);
  assert.equal(await page.locator(detail).evaluate(el => el.style.getPropertyValue("--swipe-offset")), "0px");
  await swipe(detail, [385, 300], [370, 300]);
  await swipe(detail, [385, 300], [385, 450]);
  await swipe(detail, [350, 300], [200, 300]);
  await swipe(detail, [380, 300], [390, 300]);
  await touch(detail, "touchstart", [[385, 300]]);
  await touch(detail, "touchstart", [[385, 300], [380, 350]]);
  await touch(detail, "touchmove", [[200, 300]]);
  await touch(detail, "touchend", []);
  assert.equal(await page.locator(detail).count(), 1, "non-return gestures preserve detail");
  await page.locator(".mobile-detail-more").click();
  await page.waitForSelector(".mobile-action-sheet");
  await swipe(".mobile-action-sheet");
  assert.equal(await page.locator(".mobile-action-sheet").count(), 1, "nested actions are not dismissed by the underlying gesture");
  await page.getByRole("button", { name: "删除消息（同步到云端）" }).click();
  await page.waitForSelector(".mobile-delete-sheet");
  await swipe(".mobile-delete-sheet");
  assert.equal(await page.locator(".mobile-delete-sheet").count(), 1, "delete confirmation cannot be bypassed");
  await page.getByRole("button", { name: "取消删除" }).first().click();
  await page.waitForSelector(".mobile-action-sheet");
  await page.keyboard.press("Escape");
  await page.waitForSelector(detail);
  await swipe(detail);
  await page.waitForSelector(detail, { state: "detached" });
  await page.getByRole("button", { name: "新消息" }).click();
  await page.waitForSelector(composer);
  await page.locator(composer + " textarea").fill("swipe draft fixture");
  await page.getByRole("button", { name: "标记", exact: true }).click();
  await page.waitForSelector(".mobile-marked-edit-sheet");
  await swipe(".mobile-marked-edit-sheet");
  assert.equal(await page.locator(".mobile-marked-edit-sheet").count(), 1, "nested mark settings cannot close their composer");
  await page.getByRole("button", { name: "关闭编辑标记" }).click();
  await page.locator(composer + " textarea").evaluate(el => el.setSelectionRange(0, 5));
  await swipe(composer + " textarea");
  assert.equal(await page.locator(composer).count(), 1, "selected text is not a return gesture");
  await page.locator(composer + " textarea").evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.state.composer.selecting = true; });
  await swipe(composer);
  await page.getByRole("alert").getByText("请等待当前操作完成后再返回").waitFor();
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.state.composer.selecting = false; app.state.composer.sending = true; });
  await swipe(composer);
  assert.equal(await page.locator(composer).count(), 1, "send cannot be interrupted by swipe");
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.state.composer.sending = false; app.state.composer.persistenceReady = false; });
  await swipe(composer);
  await page.getByRole("alert").getByText("草稿尚未准备好，请稍后重试").waitFor();
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.state.composer.persistenceReady = true; window.dispatchEvent(new CustomEvent("transfer-genie-keyboard-geometry", { detail: { visibleHeight: 400 } })); });
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.controller.persistComposerDraftForSwipe = async () => false; });
  await swipe(composer);
  await page.getByRole("alert").getByText("草稿保存未完成，请重试").waitFor();
  assert.equal(await page.getByRole("alert").isVisible(), true, "save error stays visible with keyboard");
  assert.equal(await page.locator(composer + " textarea").inputValue(), "swipe draft fixture");
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent("transfer-genie-keyboard-geometry", { detail: { visibleHeight: null } })); });
  await page.evaluate(() => { const app = document.querySelector(".mobile-shell").__vueParentComponent.setupState; app.controller.persistComposerDraftForSwipe = async () => true; });
  await swipe(composer);
  await page.waitForSelector(composer, { state: "detached" });
  await page.getByRole("button", { name: "新消息" }).click();
  assert.equal(await page.locator(composer + " textarea").inputValue(), "swipe draft fixture");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await touch(composer, "touchstart", [[385, 300]]);
  await touch(composer, "touchmove", [[320, 300]]);
  assert.equal(await page.locator(composer).evaluate(el => getComputedStyle(el).transform), "none");
  await touch(composer, "touchcancel", []);
  await page.getByRole("button", { name: "关闭新消息" }).click();
  console.log("mobile swipe browser checks passed");
} finally {
  await browser.close();
}
