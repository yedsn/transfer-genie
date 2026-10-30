# Proposal

## Why

移动端写消息页目前会在键盘出现时隐藏底部操作区，并且进入页面后不总能聚焦编辑器、唤起键盘，导致每次写消息都要额外点击且关键操作偶发不可见。桌面端已有“编辑器默认格式”，但实际只通过前端本地存储保留；需要补齐共享设置的持久化链路，让移动端复用，同时保证已有草稿的格式不会被默认值覆盖。

## What Changes

- 移动端从“写消息”入口进入 Composer 后立即进入编辑状态，并在 iOS 允许的用户手势链路内聚焦当前编辑器、请求显示软键盘。
- 底部格式、附件、标记和发送操作区在键盘显示或隐藏时都保持可见；键盘只压缩可编辑内容区域。
- 移动端设置页新增“编辑器默认格式”，可选择“文本”或“Markdown”，并复用现有 `default_editor_format` 设置字段。
- 默认格式只用于没有可恢复草稿的新消息；已有草稿继续以草稿自身保存的格式打开。
- 为文本、Markdown、草稿恢复和键盘布局补充自动化回归覆盖，并在官方 iOS Simulator 验证真实键盘交互。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `message-feed`: 明确移动端 Composer 的进入编辑状态、草稿格式优先级和键盘打开时底部操作区常驻行为。
- `client-settings`: 让移动端可查看和修改现有编辑器默认格式设置。

## Impact

- 主要影响 `src-ui/src/mobile/MobileShell.vue`、`src-ui/src/mobile/mobile-controller.ts`、移动端 Composer 样式和 Markdown 编辑器聚焦逻辑。
- 为 Rust 设置模型补齐可选的 `default_editor_format` 字段、iOS 合并白名单和设置导入导出；旧配置缺省时保留桌面端本地偏好的回退路径，不新增数据库字段或迁移。
- 可能需要对现有 iOS 原生导航桥接增加最小的页面显示后聚焦时序配合，但不引入新的第三方依赖。
- 更新移动端浏览器测试、草稿持久化测试及 iOS Simulator UI 测试。
