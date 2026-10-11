# Spec Delta

## MODIFIED Requirements

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
