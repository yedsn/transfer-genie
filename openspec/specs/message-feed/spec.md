# message-feed Specification

## Purpose
TBD - created by archiving change add-webdav-transfer-client. Update Purpose after archive.

## Requirements

### Requirement: Message file storage
客户端 SHALL 先将每条外发消息写入当前存储空间的本地 SQLite 索引与可靠同步队列。WebDAV 空间 SHALL 继续把文本和文件保存到对应远端文件布局；Supabase 空间 SHALL 把消息元数据保存到数据库，并把附件原始字节保存到私有 Storage。

#### Scenario: Text message upload
- **WHEN** 用户在 WebDAV 存储空间发送文本
- **THEN** 客户端先在本地保存消息与待同步操作
- **AND** 后台按现有 WebDAV 文本文件协议上传

#### Scenario: Send text to Supabase space
- **WHEN** 用户在 Supabase 存储空间发送文本
- **THEN** 客户端先在本地保存消息与待同步操作
- **AND** 后台通过带 revision 和 operation ID 的服务端事务同步消息

#### Scenario: File message upload
- **WHEN** 用户在当前存储空间发送文件
- **THEN** 客户端先保存本地原件、消息和待同步操作
- **AND** 后台通过当前 Provider 保存原始文件字节

#### Scenario: Send attachment to Supabase space
- **WHEN** 用户在 Supabase 存储空间发送文件
- **THEN** 客户端先保留受控本地原件
- **AND** 后台将对象上传到私有 Storage 并提交附件元数据

### Requirement: Message metadata encoding
客户端 SHALL 将发送者标识与消息时间戳编码进消息文件名，并使用确定且文件名安全的编码，使其他客户端无需服务器元数据即可解析。
编码后的发送者标识 SHALL 来源于用户设置的发送者名称。

#### Scenario: Parse sender and time from filename
- **WHEN** 客户端发现新的消息文件
- **THEN** 能仅从文件名解析出发送者名称与时间戳

#### Scenario: Ignore non-message files
- **WHEN** 客户端发现不符合消息命名格式的文件
- **THEN** 不下载该文件
- **AND** 不在列表中展示

### Requirement: Message history file
客户端 SHALL 在 WebDAV 根目录维护 `history.json` 或 manifest history 作为消息历史索引，记录每条消息的文件名、发送者、时间戳、大小、类型、原始名称、标记状态、标记标签、置顶状态、处理日期和格式。
客户端在发送消息后 SHALL 追加或更新对应条目。
当用户标记、取消标记或修改标记元数据时，客户端 SHALL 更新 history 中相应条目的标记字段。

#### 场景: Append history on send
- **WHEN** 用户发送任意消息
- **THEN** history 包含对应的消息记录，并且 `marked` 字段为 `false`。

#### 场景: Create history file
- **WHEN** history 不存在且用户发送消息
- **THEN** 客户端创建 history

#### 场景: Load history on sync
- **WHEN** 客户端执行同步
- **THEN** 从 history 读取消息记录并更新本地索引，包括每条消息的标记状态、标签、置顶状态和处理日期。

#### 场景: Update marked status
- **GIVEN** a message exists in history
- **WHEN** the user marks the message
- **THEN** the client SHALL update marked metadata for that message in history.
- **WHEN** the user unmarks the message
- **THEN** the client SHALL update `marked` to `false` and clear marked-only metadata.

### Requirement: Local message index and sync
客户端 SHALL 维护按存储空间和账号隔离的本地 SQLite 消息索引。列表、搜索和分页 SHALL 读取本地索引。刷新 SHALL 触发当前 Provider 的立即同步；WebDAV 使用远端历史检查，Supabase 使用增量补拉，文件内容继续按需下载。

#### Scenario: Periodic refresh
- **WHEN** 当前 Provider 的远端出现新消息
- **THEN** 下一次 Provider 同步将其加入本地索引
- **AND** 消息显示在列表中

#### Scenario: Refresh
- **WHEN** 用户点击刷新
- **THEN** 客户端立即执行当前 Provider 同步并更新本地列表

#### Scenario: Download on demand
- **WHEN** 用户点击未缓存文件消息的下载按钮
- **THEN** 客户端通过当前 Provider 获取内容并保存到下载目录

#### Scenario: Open feed while offline
- **WHEN** 用户离线打开已缓存的存储空间
- **THEN** 消息列表从 SQLite 加载并可浏览
- **AND** 不等待远端查询

#### Scenario: Refresh Supabase space
- **WHEN** 用户在 Supabase 空间点击刷新
- **THEN** 客户端立即上传可处理的 outbox 并补拉服务端变化
- **AND** 更新后的列表仍从 SQLite 返回

#### Scenario: Download attachment from provider
- **WHEN** 用户点击未缓存附件的下载按钮
- **THEN** 客户端通过当前 Provider 获取对象并保存到下载目录

### Requirement: Message feed display

客户端 SHALL 提供按时间排序的聊天式列表，并显示发送者名称、时间戳与文件大小。
文本消息 SHALL 显示全文内容并提供复制按钮。
文件消息 SHALL 显示文件名并提供下载按钮及“更多操作”菜单中的另存为动作。
**所有消息 SHALL 直接显示一个用于“标记”或“取消标记”的图标。**

#### 场景: 标记一条消息
- **当** 用户点击消息上的“标记”图标
- **那么** 该消息应被标记
- **并且** 消息上的“标记”图标应高亮显示。

#### 场景: 取消标记一条消息
- **当** 用户点击已标记消息上的“标记”图标
- **那么** 该消息应被取消标记
- **并且** 消息上的“标记”图标应恢复默认状态。

### Requirement: 聊天式布局与排序
客户端 SHALL 以时间顺序显示消息列表，最新消息位于底部；输入框 SHALL 固定在主内容底部；加载或刷新消息列表后 SHALL 自动滚动到最新消息。

#### Scenario: 初次加载滚动到最新
- **WHEN** 消息列表加载或刷新完成
- **THEN** 列表按时间顺序展示且最新消息在底部
- **AND** 滚动位置显示最新消息。

### Requirement: 消息选择与多选删除
客户端 SHALL 在每条消息的“更多”菜单中提供“删除”动作，并进入可多选的选择模式。选择模式 SHALL 提供“全选”操作，用于一键选中当前列表中的全部消息。

#### Scenario: 进入选择并批量删除
- **WHEN** 用户从某条消息的“更多”菜单选择“删除”
- **THEN** 客户端进入选择模式且该消息默认被选中
- **AND** 用户可以选择其它消息并确认删除

#### Scenario: 选择模式全选
- **WHEN** 用户在选择模式中触发“全选”
- **THEN** 当前列表中的消息全部被选中

### Requirement: 删除范围与效果
客户端 SHALL 在删除确认时提示删除范围（仅本地或本地加当前远端空间）。仅本地删除 SHALL 删除本地消息记录及对应缓存。远端删除 SHALL 使用当前 Provider 的删除协议；Supabase 删除 MUST 传播带 revision 的墓碑，WebDAV 删除继续移除远端文件与历史条目。

#### Scenario: 仅本地删除
- **WHEN** 用户确认仅本地删除
- **THEN** 选中消息从当前空间的本地列表移除
- **AND** 对应本地附件缓存被删除
- **AND** 远端数据保持不变

#### Scenario: WebDAV 远端删除
- **WHEN** 用户在 WebDAV 空间确认本地加远端删除
- **THEN** 对应 WebDAV 文件与历史条目被删除
- **AND** 本地消息与缓存被删除

#### Scenario: 本地+远端删除
- **WHEN** 用户确认本地加当前远端空间删除
- **THEN** 客户端使用当前 Provider 的删除协议
- **AND** 本地消息与附件缓存被删除

#### Scenario: Supabase 远端删除
- **WHEN** 用户在 Supabase 空间确认本地加远端删除
- **THEN** 删除操作进入可靠队列并在服务端生成墓碑变化
- **AND** 其他设备补拉后移除该消息

#### Scenario: 远端删除失败
- **WHEN** 当前 Provider 的远端删除失败
- **THEN** 客户端显示真实错误和待同步状态
- **AND** 不得误报远端删除成功

### Requirement: WebDAV endpoint switching
客户端 SHALL 在首页提供存储空间切换入口，并将旧 WebDAV 端点作为 WebDAV 存储空间显示。切换后 SHALL 立即加载目标空间的本地消息，并启动该 Provider 的同步。

#### Scenario: Switch active endpoint from home
- **WHEN** 用户在首页切换至另一个已启用存储空间
- **THEN** 客户端更新活动空间并立即加载该空间的本地列表
- **AND** 触发目标 Provider 的同步或登录提示

### Requirement: Marked item due dates
The client SHALL allow a marked message to store an optional day-precision due date. Marked messages without a due date SHALL remain backward compatible and SHALL be treated as immediately unfinished. The due date SHALL be synchronized through the active storage provider.

#### Scenario: Mark with due date
- **WHEN** the user marks a message and selects a due date
- **THEN** the message stores that date with its marked metadata
- **AND** the date is preserved through local storage and the active provider sync

#### Scenario: Existing marked item has no due date
- **GIVEN** an existing marked message has no due date field
- **WHEN** the client loads it
- **THEN** the message is treated as a marked item with no due date

### Requirement: Marked pending filter
The marked list SHALL provide a pending filter that only shows marked messages whose due date is absent, today, or earlier.

#### Scenario: Filter pending marked items
- **GIVEN** the marked list contains marked messages with no due date, a past due date, today's due date, and a future due date
- **WHEN** the user enables the pending filter
- **THEN** the list shows only the no-date, past-date, and today-date marked messages
