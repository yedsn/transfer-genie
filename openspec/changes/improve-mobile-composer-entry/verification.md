# 移动端 Composer 进入状态验证

验证日期：2026-10-30。日常开发在官方 iPhone 12 / iOS 26.4 Simulator；真机通过 Wi-Fi 原位安装验证。

## 真机回归：首帧键盘与操作条位置

现象：真机进入新消息页后键盘不弹出（界面已经是键盘态布局，但没有真实键盘），需再点一次编辑区；键盘出现前底部操作条偏下、按钮超出屏幕；用键盘自带的收起键关闭键盘后样式仍停在键盘态，只有输入辅助栏的“完成”才恢复正常。

原因：

- 聚焦发生在 `await nextTick()` 之后，WKWebView 已丢失点击手势上下文，DOM 焦点成立但 iOS 拒绝弹出软键盘。
- 键盘态用 `visualViewport.height` 推算，原生转场后该值可能仍是上一次键盘的旧值，于是出现“键盘态布局但无键盘”。
- 键盘可见性曾用 `document.activeElement` 兜底；iOS 收起键会隐藏键盘但保留焦点，导致键盘态无法退出。

修复：

- 点击处理内同步创建一个临时 `textarea` 并聚焦（iOS 只认点击任务内的聚焦），Composer 渲染完成后把焦点交给真实编辑器，随即移除临时元素；关闭 Composer 时也会移除，避免键盘或焦点残留。
- iOS 原生壳内布局只采用 UIKit 上报的键盘几何（`transfer-genie-keyboard-geometry`），无键盘时用 `document.documentElement.clientHeight`；`visualViewport` 仅用于非原生预览。
- 键盘可见性只跟随真实键盘几何，不再用焦点推断；收起键（⌄）、完成、转场结束和转屏都会重新测量。

新增自动化：`testComposerExistingDraftOpensWithKeyboardAndStableActions`，覆盖已有草稿直接打开即弹键盘、且照片/文件/标记/发送/关闭按钮均在可见画布内。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | — |
| `node tests/test_mobile_ui_shell.js` | 通过 | — |
| `node tests/test_mobile_keyboard_browser.js` | 通过 | — |
| `node tests/test_mobile_native_navigation_browser.js` | 通过；新增“点击任务内先聚焦临时输入框”“陈旧 VisualViewport 不得伪造键盘布局”“UIKit 几何驱动键盘态与收起”断言 | — |
| `testComposerExistingDraftOpensWithKeyboardAndStableActions` + `testComposerDefaultFormatsAutomaticallyOpenKeyboard` | 2/2 通过 | `/tmp/tg-ios-composer-primer-20261030-1445.xcresult` |
| 真机 Wi-Fi 原位安装（`npm run ios:update`） | 安装成功，覆盖现有 App 并保留数据容器；安装后草稿检查通过 | 安装返回 `bundleID: com.transfergenie` 及新的 Installation URL |

真机侧只完成了安装；锁屏状态下 `devicectl` 会拒绝远程启动（设备未解锁），解锁后手动打开即可。键盘弹出、收起键与操作条位置仍需在解锁后由人工确认。

## 自动化检查

### 消息列表刷新

需求：消息列表缺少手动刷新入口，且启动时只读取本机窗口，云端新增消息可能看不到。

实现：

- 顶部栏新增“刷新列表”按钮（`aria-label="刷新列表"`，避免与“新消息”按钮的可访问名称冲突），刷新中禁用并旋转图标。
- 新增 `controller.pullLatest()`：先执行 `sync.refresh()` 拉取云端增量，再用 `allSettled` 重读消息、标记、同步状态和传输；手动刷新成功后用 toast 显示同步结果，失败走错误提示。
- `initialize()` 完成后若进入 ready 且非预览模式，静默执行一次 `pullLatest({ silent: true })`；失败不打扰用户，只刷新状态胶囊。

验证：

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `node tests/test_mobile_refresh_browser.js`（新增） | 通过；点击后只拉取一次、重读消息、显示 toast、按钮恢复可用 |
| `node tests/test_mobile_feed_browser.js` / `test_mobile_keyboard_browser.js` / `test_mobile_native_navigation_browser.js` / `test_mobile_ui_shell.js` / `test_mobile_wysiwyg_browser.js` | 全部通过 |
| Simulator `testComposerExistingDraftOpensWithKeyboardAndStableActions` | 1/1 通过（`/tmp/tg-ios-refresh-20261030-1450.xcresult`） |

注意：`aria-label` 使用“刷新列表”而不是“刷新消息”，因为后者包含“新消息”子串，会让既有 UI 测试的 `getByRole('button', { name: '新消息' })` 命中两个按钮。

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `node tests/test_mobile_draft_persistence.js` | 通过；覆盖文本/Markdown 草稿、默认格式回退和草稿优先 |
| `node tests/test_mobile_ui_shell.js` | 通过 |
| `node tests/test_mobile_native_navigation_browser.js` | 通过；覆盖原生 shown、过期请求、返回与嵌套弹框焦点 |
| `node tests/test_mobile_keyboard_browser.js` | 通过；覆盖键盘态操作区、横竖屏和大字体布局 |
| `node tests/test_mobile_wysiwyg_browser.js` | 通过 |
| `node tests/test_mobile_feed_browser.js` | 通过 |
| `cargo test --lib settings_ --offline` | 39 通过，1 忽略 |
| `cargo check --bins --offline` | 通过 |
| `openspec validate improve-mobile-composer-entry --strict` | 通过 |
| `git diff --check` | 通过 |

## iOS Simulator 验收

最新正式构建已通过 `npm run ios:simulator:deploy` 覆盖安装到官方 iPhone 12 Simulator，应用正常启动。原生 XCTest 串行执行，避免多个测试进程同时修改 Simulator 构建数据库和方向状态。

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| `testComposerActionsStayAboveSoftwareKeyboardInBothOrientations` | 1/1 通过 | `/tmp/tg-ios-composer-release-20261030/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.30_13-04-22-+0800.xcresult` |
| `testComposerDefaultFormatsAutomaticallyOpenKeyboard` | 1/1 通过 | `/tmp/tg-ios-composer-release-20261030/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.30_13-05-22-+0800.xcresult` |
| `testComposerDraftFormatOverridesDefaultAndSurvivesNativeBack` | 1/1 通过 | `/tmp/tg-ios-composer-entry-20261030/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.30_12-42-05-+0800.xcresult` |
| 最大辅助字体下的原生裁切与点击坐标检查 | 1/1 通过 | `/tmp/tg-ios-composer-debug-20261030/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.30_12-58-18-+0800.xcresult` |

已验证：

- 默认文本和默认 Markdown 在新消息 Composer 中均自动聚焦并显示完整软键盘。
- 底部文字/Markdown、照片、文件、标记和发送操作区在键盘打开时保持可见；横竖屏均不被系统输入辅助栏遮挡。
- 已有文本或 Markdown 草稿使用草稿自身格式，不会被之后的默认设置改写。
- 收起并重新打开键盘、冷启动恢复、系统侧滑返回均保留草稿和编辑状态。
- 最大辅助字体及横屏极短可见高度下，编辑区独立收缩或滚动，操作区仍可访问。

布局截图：`/tmp/tg-composer-landscape-fixed-20261030.png`。

## 边界

- 真机只完成了安装验证；键盘弹出与操作条位置的人工验收待解锁后确认。
- 未提交、未归档 OpenSpec change。
- 未卸载 Simulator 应用，未清理未知草稿。
