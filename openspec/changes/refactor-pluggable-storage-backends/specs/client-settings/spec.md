# Spec Delta

## MODIFIED Requirements

### Requirement: WebDAV connection settings
客户端 SHALL 将现有 WebDAV 端点作为 WebDAV 类型存储空间进行配置和持久化，包含名称、URL、认证凭据与启用状态。旧版 WebDAV 配置 MUST 在升级后保持可用。
客户端 SHALL 仅允许启用的 WebDAV 存储空间被设置为当前活动空间，并在认证或连接失败时显示错误状态。

#### Scenario: Save multiple WebDAV endpoints
- **WHEN** 用户新增或编辑多个 WebDAV 存储空间并保存
- **THEN** 空间列表与认证信息被持久化并在重启后可用

#### Scenario: Update WebDAV endpoint name
- **WHEN** 用户为 WebDAV 存储空间设置或修改名称并保存
- **THEN** 名称在列表与切换入口中展示

#### Scenario: Select active WebDAV endpoint
- **WHEN** 用户选择某个已启用 WebDAV 存储空间
- **THEN** 后续同步与上传使用该空间

#### Scenario: Disable active WebDAV endpoint
- **WHEN** 用户禁用当前活动 WebDAV 存储空间
- **THEN** 客户端清除活动空间并提示选择另一个已启用空间

#### Scenario: Upgrade legacy WebDAV endpoints
- **WHEN** 应用读取旧版 webdav_endpoints 与 active_webdav_id 配置
- **THEN** 配置无损转换为 WebDAV 存储空间
- **AND** 原活动端点、凭据和启用状态得到保留

## ADDED Requirements

### Requirement: Supabase connection and account settings
客户端 SHALL 在设置中提供 Supabase API 根地址、公开 Key、分层连接测试、邮箱密码登录、退出和当前账号状态。Schema 与 bucket SHALL 由应用版本管理，普通设置界面只展示其用途和就绪状态。

#### Scenario: Test incomplete Supabase environment
- **WHEN** 用户测试一个网络与 Key 可用但业务结构尚未部署的 Supabase 空间
- **THEN** 客户端明确显示缺少 Schema、RPC、RLS、Realtime 或 bucket 的层级
- **AND** 不得把首页可达误报为接入完成

#### Scenario: Sign in with ordinary user
- **WHEN** 用户使用有效 Supabase Auth 邮箱和密码登录
- **THEN** 设置页显示脱敏账号和会话状态
- **AND** 客户端不要求数据库密码或管理密钥

### Requirement: Provider-aware cleanup
客户端 SHALL 允许用户选择仅清理本地数据或同时清理当前存储空间的远端数据。远端清理 MUST 调用当前 Provider 的删除语义，不得影响其他存储空间。

#### Scenario: Clean Supabase space remotely
- **WHEN** 用户在 Supabase 空间选择清理本地和远端数据并确认
- **THEN** 匹配消息以删除墓碑同步到该 Supabase 空间
- **AND** 其他 WebDAV 或 Supabase 空间保持不变
