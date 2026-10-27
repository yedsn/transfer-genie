# Spec Delta

## ADDED Requirements

### Requirement: Preserve mobile detail beneath more actions
移动端消息详情中的“更多” SHALL 在现有详情上叠加操作菜单，而不是销毁详情。菜单关闭 MUST 返回同一消息详情并保留正文滚动位置。顶层菜单显示时，下层详情 MUST 不可交互并从辅助功能导航中隐藏。确认删除消息后 MAY 关闭全部相关弹框。

#### Scenario: Return from more actions
- **WHEN** 用户阅读消息详情后打开“更多”并取消、点击遮罩或按 Escape
- **THEN** 同一详情与原阅读位置恢复
- **AND** 标记设置与删除确认的取消路径逐层返回，未确认前不修改消息

### Requirement: Mobile Markdown composition and reading
iOS SHALL offer plain-text and Markdown editing with a rendered preview. Markdown messages SHALL retain their format and original source in the existing send contract, and SHALL render safely in feed, marked rows and details. Message HTML MUST NOT execute scripts or load remote images during passive reading.

#### Scenario: Compose and read Markdown
- **WHEN** the user writes Markdown and selects preview
- **THEN** headings, lists, links, code and tables render without changing the source
- **AND** sending preserves format=markdown and the original content

#### Scenario: Insert formatting while composing
- **WHEN** the user selects text or positions the caret and taps a Markdown formatting action
- **THEN** the action inserts or wraps the appropriate syntax without losing the remaining draft
- **AND** the editor remains usable with the iOS keyboard, while preview and edit retain the original source

### Requirement: Account-scoped durable mobile drafts
iOS composer drafts SHALL be persisted in the local business store by storage Profile, authenticated Supabase user and Space. A draft SHALL retain text, format, mark metadata and stable sandbox attachment identity across composer dismissal, process termination and application restart, and MUST NOT be placed in ordinary WebView local storage. Restoring a draft MUST NOT send it automatically.

#### Scenario: Restore an unsent draft after restart
- **WHEN** the user terminates and reopens the application with an unsent text, Markdown, marking or attachment draft
- **THEN** the matching account and Space restores the draft without sending it
- **AND** the composer gives a quiet restored or automatically-saved status

#### Scenario: Switch account or Space with a draft
- **WHEN** the user changes the active Profile, Auth account or Space
- **THEN** the previous scope is saved before the transition and the destination scope restores only its own draft
- **AND** private draft content and attachment paths from another scope are not exposed

#### Scenario: Restore a missing sandbox attachment
- **WHEN** a persisted attachment path no longer exists after restart
- **THEN** the attachment remains visible with a recoverable unavailable warning
- **AND** the client does not silently send the invalid path or discard the remaining draft

#### Scenario: Complete a draft send
- **WHEN** all text and attachments are committed to the local message/outbox flow
- **THEN** the persisted draft for that scope is cleared
- **AND** a partially failed attachment send retains only the unsent attachments with their stable client IDs for retry

### Requirement: Mobile detailed marking and confirmed removal
iOS composer and message mark actions SHALL open tag and optional due-date settings before applying a mark. Marked rows SHALL show multiline content, all labels and due date, without a left completion checkbox. A pin control SHALL request explicit confirmation before unmarking; cancellation MUST NOT mutate the message.

#### Scenario: Configure a mark
- **WHEN** the user opens mark settings from a draft or message
- **THEN** tags and due date can be selected before confirmation
- **AND** draft settings apply to both text and attachments when sent

#### Scenario: Keep the source dialog beneath mark settings
- **WHEN** the user opens mark settings or unmark confirmation from a composer or message action menu
- **THEN** the existing source dialog remains underneath, preserving draft contents, attachments and reading position
- **AND** only the top dialog is interactive and exposed to accessibility, and closing it restores the source dialog and focus

#### Scenario: Cancel unmark confirmation
- **WHEN** the user taps a marked row pin and cancels confirmation
- **THEN** the mark and metadata remain unchanged locally and remotely

### Requirement: Full-screen bounded mobile detail
iOS message detail SHALL occupy the full visible viewport, respect safe areas, and keep long message content in a bounded scroll region. More actions SHALL occupy a separate full-width row below primary actions.

#### Scenario: Read a long message detail
- **WHEN** the user opens a message longer than the available viewport
- **THEN** the content scrolls while close and more-actions controls remain reachable
- **AND** content does not overflow horizontally

### Requirement: Chat-ordered mobile history
iOS 消息流 SHALL 从上到下按时间由旧到新排列，最新消息位于底部。首次进入空间 SHALL 定位到最新消息，用户向上滚动 SHALL 加载更早消息并保持正在阅读的消息位置。用户正在阅读历史内容时，新消息或同步刷新 MUST NOT 强制滚到底部或丢弃已加载历史。用户发送成功后 SHALL 定位到新发送内容。桌面消息列表行为 MUST 保持不变。

#### Scenario: Open a message space
- **WHEN** 用户首次进入移动端消息页
- **THEN** 最新消息显示在列表底部且进入可视区域
- **AND** 顶部空间、搜索、同步入口保持可达

#### Scenario: Scroll upward for history
- **WHEN** 用户向上滚动到已加载消息的顶部
- **THEN** 更早消息被插入现有消息前方
- **AND** 现有可见消息保持原阅读位置且重复触发不产生并发分页请求

#### Scenario: Receive while reading history
- **WHEN** 用户不在底部且新消息到达或执行同步刷新
- **THEN** 新消息保留在底部且已加载历史继续可读
- **AND** 用户当前阅读位置不被强制改变

### Requirement: Device-aligned mobile conversation bubbles
iOS 消息流 SHALL 参考桌面端使用对话气泡，本机发送的消息靠右，其他设备发送的消息靠左。自身判断 SHALL 沿用桌面规则：发送者为“我”或匹配当前非空的发送者名称；同一 Supabase 账号下其他设备的消息 MUST NOT 全部被视为本机消息。气泡 SHALL 保留发送者、时间、标记和明确操作入口，文本 SHALL 支持换行，附件 SHALL 保留预览与缓存状态。

#### Scenario: Mix device senders in one account
- **WHEN** 当前发送者名称为 Jam，列表含 Jam 与 Mac 发送的消息
- **THEN** Jam 的消息显示在右侧浅绿色气泡中，Mac 的消息显示在左侧浅色气泡中
- **AND** 已标记消息保留橙色标记与气泡提示，左右方向不变

#### Scenario: Read multiline text and attachments
- **WHEN** 用户查看多行文本、长链接或附件消息
- **THEN** 文本换行且不以两行摘要代替正文，内容不造成横向溢出
- **AND** 附件保留缩略图或类型卡以及显式更多操作

### Requirement: Bounded mobile message height
移动端每条消息 SHALL 限制默认内容高度；文本正文使用桌面同样的 130px 阈值，附件内容使用适合缩略图的 260px 阈值。超过阈值 SHALL 显示“展开更多”按钮，点击后完整展开并提供“收起”；未超限消息 MUST NOT 显示展开按钮。展开操作 MUST NOT 触发详情或长按菜单，刷新同一条消息 SHALL 保持展开状态，横竖屏尺寸变化 SHALL 重新判断溢出。

#### Scenario: Expand a long conversation message
- **WHEN** 用户点击长消息的“展开更多”
- **THEN** 正文完整显示，按钮变为“收起”
- **AND** 当前消息保持可阅读位置，不打开详情弹层

### Requirement: Compact mobile sync status
移动消息页 SHALL 将同步状态合并到顶部空间选择器，以一行小字显示已同步、同步中、待同步、离线或冲突。消息页 MUST NOT 为同步状态单独显示大卡片；完整状态、手动同步和传输记录 SHALL 继续通过“我的”页面的同步与传输入口访问。

#### Scenario: Read sync state while browsing messages
- **WHEN** 同步状态发生变化
- **THEN** 空间名称下的小字更新为真实状态
- **AND** 不新增占用消息区域的大状态卡片

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
