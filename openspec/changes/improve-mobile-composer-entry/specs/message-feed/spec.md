# Spec Delta

## ADDED Requirements

### Requirement: Mobile composer enters an editable state
移动端 SHALL 在用户从写消息入口打开 Composer 后显示当前格式对应的编辑器，并主动将输入焦点移入编辑器。对于由用户点击触发的打开操作，客户端 MUST 在 iOS 允许的交互时机请求显示软键盘；聚焦失败不得阻止用户手动点击编辑。

#### Scenario: Open a new text message
- **WHEN** 用户点击写消息入口且当前新消息格式为文本
- **THEN** 客户端打开文本编辑器并将输入焦点移入文本输入区
- **AND** 客户端在系统允许时请求显示软键盘

#### Scenario: Open a new Markdown message
- **WHEN** 用户点击写消息入口且当前新消息格式为 Markdown
- **THEN** 客户端打开 Markdown 编辑器并将输入焦点移入可编辑内容区
- **AND** 客户端在系统允许时请求显示软键盘

#### Scenario: System declines automatic keyboard presentation
- **WHEN** iOS 拒绝自动显示软键盘
- **THEN** Composer 仍保持可编辑且底部操作区可用
- **AND** 用户点击编辑器后能够继续输入

### Requirement: Mobile composer action area remains available
移动端 Composer SHALL 在软键盘显示或隐藏时持续显示格式、附件、标记和发送操作区。键盘几何变化 MUST 只缩小可编辑内容的可用空间，不得隐藏操作区或使根页面产生可拖出的空白区域。

#### Scenario: Software keyboard is shown
- **WHEN** 用户在 Composer 中聚焦文本或 Markdown 编辑器并显示软键盘
- **THEN** 底部格式、附件、标记和发送操作仍可见且可操作
- **AND** 编辑区在剩余可见高度内滚动

#### Scenario: Software keyboard is dismissed and reopened
- **WHEN** 用户收起软键盘后再次聚焦编辑器
- **THEN** 底部操作区在两个状态下均保持显示
- **AND** 当前草稿内容、格式、附件与标记设置保持不变

#### Scenario: Accessibility text or landscape reduces available height
- **WHEN** 用户使用较大辅助功能字体或横屏打开软键盘
- **THEN** Composer 保持编辑区与底部操作区各自可访问
- **AND** 操作区不得被挤出可见画布或被系统输入辅助控件遮挡

### Requirement: Composer draft format takes precedence
移动端 SHALL 只在当前存储空间和账号没有可恢复草稿时使用编辑器默认格式创建新消息。可恢复草稿 MUST 使用草稿自身保存的文本或 Markdown 格式，且用户在 Composer 中切换后的格式 SHALL 随草稿持久化。

#### Scenario: New empty draft uses configured default
- **WHEN** 当前账号和存储空间没有可恢复草稿并打开写消息页
- **THEN** Composer 使用设置中的编辑器默认格式

#### Scenario: Restored draft overrides configured default
- **GIVEN** 已保存草稿的格式与当前编辑器默认格式不同
- **WHEN** 用户重新打开该账号和存储空间的写消息页
- **THEN** Composer 使用草稿保存的格式
- **AND** 草稿内容和其他元数据保持不变

#### Scenario: Format switch is restored
- **WHEN** 用户在 Composer 中切换文本或 Markdown 格式并离开页面
- **THEN** 客户端将所选格式作为草稿的一部分保存
- **AND** 再次打开时恢复该格式而不是重新应用默认格式
