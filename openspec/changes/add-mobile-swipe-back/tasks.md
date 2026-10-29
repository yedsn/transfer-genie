# Tasks

2026-10-30 用户已确认 UIKit 单 WebView 方案。下面未完成任务不代表已实施；正式 App 的原生侧滑仍需完成集成验收。

## 1. 手势与窗口层级

- [x] 1.1 将顶层详情和编辑器接入 UIKit 原生导航，复用同一个业务 WKWebView；替换旧真实文档 History 路径，保持无前端自制触摸识别或位移动画。
- [x] 1.1a 内部详情和编辑器在首帧直接呈现，抑制入口启动卡片与初始化 gate；详情先显示会话快照，后台补齐预览和控制器状态。
  - 浏览器证据：`tests/test_mobile_navigation_loading_browser.js` 覆盖入口脚本／初始化延迟、详情快照、文字／Markdown 草稿恢复、行内错误及冷启动 loading 保留；内部页面无额外淡入。此证据不等价于 Simulator 或真机原生手势验收。
- [x] 1.1b 接入 UIKit 后重新验证详情和编辑器首帧无 loading，控制器／草稿／列表上下文不重建，快照在完成或取消时正确处理；旧路径的 1.1a 证据不能替代这项验收。
  - 正式单文档状态测试覆盖无重载／无 loading、取消／完成和草稿保留；正式 Tauri Simulator 连续三轮返回通过。返回交接等待 Vue 两帧及 WebKit `afterScreenUpdates` 快照完成后才移除列表快照，30 fps 录屏抽样未出现空白帧。
- [x] 1.2 集中处理显式关闭、页面状态恢复及嵌套弹层，验证系统取消手势、滚动、选区、标记、更多与删除确认不会误关闭底层。
- [x] 1.3 保留关闭按钮和辅助功能入口；验证主窗口、非左缘操作及不安全状态不会播放自制或错误的返回动画。

## 2. 安全退出编辑器

- [x] 2.1 增加明确的草稿快照已持久化状态，只有普通文字、Markdown、附件及标记设置完整落盘后才开放原生返回，并验证空草稿成功清理后也可返回。
- [x] 2.2 在输入法组合、保存失败、未就绪、内容／作用域变更、附件选择和发送中立即禁用原生返回；用故障注入和并发测试覆盖恢复开放与错误提示。

## 3. 集成验收

- [ ] 3.1 运行 Swift 插件测试、相关前端构建和自动化测试，并确认桌面及既有关闭流程未回归。
- [x] 3.2 在正式 Tauri iOS Simulator shell 的实际 WKWebView 和 UIKit 导航中测试左缘原生返回、取消、软键盘、滚动冲突、嵌套弹层与原生持久化后的冷启动草稿恢复；使用隔离测试数据并保护既有草稿。
  - `testNativeEdgeBackOnCurrentMessageWithoutMutation`、`testUIKitPageReturnCancelAndRepeatedHandoff` 与 `testSwipeBackDetailAndDurableComposerDraft` 在 iPhone 12 / iOS 26.4 Simulator 正式 App 中通过；后者清理且只清理本次 UUID 测试草稿。
- [ ] 3.3 Simulator 验证通过后，在用户授权且可用的 iPhone 上复验手势、键盘、系统边缘冲突和草稿恢复；记录设备与测试结果。
