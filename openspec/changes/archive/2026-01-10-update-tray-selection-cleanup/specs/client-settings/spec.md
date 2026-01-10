## MODIFIED Requirements
### Requirement: 手动清理旧数据
客户端 SHALL 在设置中提供手动清理功能，允许用户选择清理时间范围（全部、7天以前）以及清理范围（仅本地、包含 WebDAV 远端）。清理执行时 SHALL 删除匹配范围的本地消息记录与已下载文件；若包含 WebDAV 远端，则同时删除 WebDAV `files/` 对应文件与 `history.json` 条目。

#### Scenario: 清理全部且仅本地
- **WHEN** 用户选择清理时间范围为“全部”且范围为“仅本地”并确认清理
- **THEN** 本地消息记录与已下载文件被删除
- **AND** 远端 WebDAV 数据保持不变

#### Scenario: 清理 7 天以前且包含 WebDAV
- **WHEN** 用户选择清理时间范围为“7天以前”且范围为“包含 WebDAV 远端”并确认清理
- **THEN** 本地 7 天以前的消息记录与已下载文件被删除
- **AND** WebDAV `files/` 中对应文件与 `history.json` 条目被删除
