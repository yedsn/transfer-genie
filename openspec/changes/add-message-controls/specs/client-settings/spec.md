## ADDED Requirements
### Requirement: 手动清理旧数据
客户端 SHALL 在设置中提供手动清理功能，清理 30 天以前的本地与远端消息数据，并移除对应 history 记录。

#### Scenario: 清理 30 天前数据
- **WHEN** 用户在设置中触发清理
- **THEN** 30 天前的本地消息记录与已下载文件被删除
- **AND** 对应的远端 WebDAV 文件与 history 条目被删除。