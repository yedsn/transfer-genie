# Spec Delta

## MODIFIED Requirements

### Requirement: Local message index and sync
客户端 SHALL 维护按存储空间和账号隔离的本地 SQLite 消息索引。列表、搜索和分页 SHALL 读取本地索引。刷新 SHALL 触发当前 Provider 的立即同步；WebDAV 使用远端历史检查。Supabase 进入空间或刷新列表时 SHALL 主动获取远端最近一页消息快照并写入本地索引，滚动到列表顶部时 SHALL 按 `(timestamp_ms, message_id)` 稳定边界继续获取更早消息。Supabase Realtime 与 change log SHALL 只负责增量补拉，不得替代历史初始化或历史分页；附件内容继续按需下载。

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

#### Scenario: Load latest Supabase history on entry
- **WHEN** 用户在线进入已登录的 Supabase 存储空间
- **THEN** 客户端获取远端最近一页消息、相关标签和附件元数据并写入 SQLite
- **AND** 页面从更新后的 SQLite 返回最近一页消息

#### Scenario: Load older Supabase history at top
- **WHEN** 用户滚动到 Supabase 消息列表顶部且远端仍有更早消息
- **THEN** 客户端按稳定历史边界获取更早一页并写入 SQLite
- **AND** 相同时间戳的消息按 message ID 分页且不重复、不遗漏

#### Scenario: Refresh Supabase space
- **WHEN** 用户在 Supabase 空间点击刷新
- **THEN** 客户端立即上传可处理的 outbox、补拉服务端变化并刷新最近消息快照
- **AND** 更新后的列表仍从 SQLite 返回

#### Scenario: Realtime does not replace history loading
- **WHEN** 新设备的 SQLite 为空但 Supabase 已存在没有可用 change log 的旧消息
- **THEN** 客户端仍通过最近页历史快照加载这些消息
- **AND** 历史分页不得推进增量同步 checkpoint

#### Scenario: Download attachment from provider
- **WHEN** 用户点击未缓存附件的下载按钮
- **THEN** 客户端通过当前 Provider 获取对象并保存到下载目录
