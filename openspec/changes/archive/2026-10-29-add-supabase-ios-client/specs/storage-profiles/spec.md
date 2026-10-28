# Spec Delta

## ADDED Requirements

### Requirement: Platform-filtered storage profiles
iOS 客户端 SHALL 仅允许创建、编辑、启用和选择 Supabase 存储空间。加载包含 WebDAV 存储空间的数据时，iOS MUST 将其视为当前平台不可用并保留原数据；平台过滤 MUST NOT 改变桌面客户端支持的 Provider 集合。

#### Scenario: Open a mixed-provider profile set on iOS
- **WHEN** 配置中同时存在 WebDAV 与 Supabase 存储空间
- **THEN** iOS 只允许选择和操作 Supabase 存储空间
- **AND** WebDAV 存储空间不被删除或转换

#### Scenario: No Supabase profile exists
- **WHEN** iOS 启动时配置中只有 WebDAV 存储空间
- **THEN** 客户端提示用户创建或登录 Supabase 存储空间
- **AND** 不尝试使用 WebDAV 空间同步

### Requirement: iOS account and cache isolation
iOS 客户端 SHALL 按 Supabase 存储空间和 Auth 用户隔离 SQLite 消息、outbox、checkpoint、附件、预览与播放缓存。退出或切换账号后 MUST NOT 展示或复用上一账号的私有内容。

#### Scenario: Switch Supabase accounts on iPhone
- **WHEN** 用户退出账号 A 并登录账号 B
- **THEN** 客户端加载账号 B 的隔离消息与缓存范围
- **AND** 账号 A 的私有附件和预览不会显示给账号 B
