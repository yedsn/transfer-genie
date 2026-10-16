# Spec Delta

## ADDED Requirements

### Requirement: External bridge message ingestion
客户端 SHALL 为受信任的本机集成提供指定目标存储空间的消息写入入口。该入口 MUST 使用目标 Provider 的正常持久化语义，并 MUST 保存稳定的来源类型、来源通道和来源消息 ID，使消息在本地索引、WebDAV 历史或 Supabase 同步后仍可识别其外部来源。

#### Scenario: Ingest external text into Supabase
- **WHEN** Telegram Bridge 向已绑定的 Supabase 空间写入带稳定来源身份的文本
- **THEN** 客户端在同一 SQLite 事务中保存消息与 outbox 操作
- **AND** 远端提交成功前界面和 Bridge 状态不得误报已经同步

#### Scenario: Ingest external file into Supabase
- **WHEN** Telegram Bridge 向已绑定的 Supabase 空间写入带稳定来源身份的文件
- **THEN** 客户端先保存本地原件、消息、附件记录和待同步操作
- **AND** 后台通过私有 Storage 与附件事务完成同步

#### Scenario: Preserve source metadata across providers
- **WHEN** 外部来源消息通过 WebDAV 历史或 Supabase 增量同步到另一台设备
- **THEN** 另一台设备读取到相同的来源类型、来源通道和来源消息 ID
- **AND** 不支持来源字段的旧消息仍按普通消息兼容读取

#### Scenario: Reject write after target binding changes
- **WHEN** 集成写入尚未完成时目标存储空间或账号作用域已经切换
- **THEN** 客户端拒绝把迟到结果写入新的活动空间
- **AND** 原目标中已可靠保存的本地工作保持可恢复

