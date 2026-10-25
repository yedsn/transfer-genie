# Spec Delta

## ADDED Requirements

### Requirement: Touch-first message interaction
iOS 消息流 SHALL 使用单击打开明确操作或详情，并 SHALL 使用长按或显式菜单进入选择模式。关键操作 MUST NOT 依赖 hover、鼠标右键、桌面双击、拖拽文件或矩形框选，交互控件 SHALL 适合触摸操作。

#### Scenario: Open message details on iPhone
- **WHEN** 用户单击支持详情的消息卡
- **THEN** 客户端打开对应详情或预览
- **AND** 不要求双击或 hover

#### Scenario: Enter selection mode by touch
- **WHEN** 用户长按消息或选择显式的多选菜单项
- **THEN** 客户端进入选择模式并选中目标消息

### Requirement: Mobile-safe composer layout
iOS 输入与消息界面 SHALL 适配顶部和底部安全区以及软件键盘。键盘出现时输入框 MUST 保持可见，消息列表 MUST 保持可滚动，且发送、附件与取消操作 MUST 可达。

#### Scenario: Compose while keyboard is visible
- **WHEN** 用户在带 Home Indicator 的 iPhone 上打开键盘输入消息
- **THEN** 输入框和发送操作位于键盘上方且可见
- **AND** 最新消息区域不会被不可恢复地遮挡

#### Scenario: Rotate or resize mobile view
- **WHEN** iOS 视图尺寸或方向发生变化
- **THEN** 消息流、输入区和预览层重新适配可用区域

### Requirement: Mobile attachment preview and sharing
iOS 消息流 SHALL 为图片显示云端或本地 JPEG 预览，为视频显示封面和播放入口，为音频显示播放入口，并为文档与未知文件显示类型卡。完整文件 SHALL 按需下载到沙盒，并通过系统预览或分享动作打开；不支持的格式 SHALL 安全降级。

#### Scenario: Display cross-device preview
- **WHEN** iOS 拉取到包含 `preview_object_path` 的图片或视频附件
- **THEN** 客户端仅下载预览对象并在消息流显示
- **AND** 不因列表渲染下载完整原附件

#### Scenario: Preview a supported document
- **WHEN** 用户打开已经缓存且系统支持的 PDF、Office、图片或文本文件
- **THEN** 客户端使用系统预览展示文件

#### Scenario: Open unsupported file type
- **WHEN** 系统不能直接预览或播放附件
- **THEN** 客户端显示文件信息和分享操作
- **AND** 不崩溃或无限等待预览结果

### Requirement: Historical preview completion on explicit demand
iOS 客户端 SHALL 对缺少云端预览的历史附件提供安全降级。历史图片可在原件被明确打开后生成并发布预览；历史视频 MUST NOT 因列表进入可视区域而自动下载完整原件，只有用户明确打开后才能补全封面。

#### Scenario: Historical video appears in feed
- **WHEN** 历史视频没有 `preview_object_path` 且消息进入列表可视区域
- **THEN** 客户端显示视频类型卡
- **AND** 不自动下载完整视频

#### Scenario: User opens a historical video
- **WHEN** 用户明确打开没有预览的历史视频
- **THEN** 客户端按需下载并播放原件
- **AND** 可以在下载完成后生成并发布共享封面
