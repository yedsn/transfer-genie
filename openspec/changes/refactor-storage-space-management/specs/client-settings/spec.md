# Spec Delta

## MODIFIED Requirements

### Requirement: WebDAV connection settings
客户端 SHALL 在统一的存储空间列表中将 WebDAV 作为一种 Provider 进行配置，包含稳定标识、名称、URL、认证凭据与启用状态。客户端 SHALL 支持多个 WebDAV 空间，并仅允许已启用且配置有效的空间成为当前活动空间。旧版 WebDAV 配置 MUST 在升级后保持可用。

#### Scenario: Save multiple WebDAV endpoints
- **WHEN** 用户新增或编辑多个 WebDAV 存储空间并保存
- **THEN** 每个空间的名称、连接配置和启用状态被独立持久化
- **AND** 应用重启后仍可使用

#### Scenario: Update WebDAV endpoint name
- **WHEN** 用户修改一个 WebDAV 空间的名称并保存
- **THEN** 存储空间列表和切换入口展示更新后的名称
- **AND** 其他 WebDAV 和 Supabase 空间保持不变

#### Scenario: Select active WebDAV endpoint
- **WHEN** 用户选择一个已启用且连接有效的 WebDAV 空间
- **THEN** 后续发送、下载和手动刷新使用该空间

#### Scenario: Disable active WebDAV endpoint
- **WHEN** 用户禁用当前活动 WebDAV 空间
- **THEN** 客户端清除活动空间并提示选择另一个已启用空间

#### Scenario: Upgrade legacy WebDAV endpoints
- **WHEN** 应用读取旧版 `webdav_endpoints` 与 `active_webdav_id` 配置
- **THEN** 每个端点无损转换为 WebDAV 存储空间
- **AND** 原活动端点、名称、凭据和启用状态得到保留

## ADDED Requirements

### Requirement: Per-profile Supabase settings
客户端 SHALL 允许用户创建和保存多个 Supabase 存储空间。每个空间 SHALL 独立配置名称、API 根地址、公开 Key、`space_id` 和启用状态，并独立提供连接检查、邮箱密码登录、退出以及脱敏账号状态。Schema 与 bucket SHALL 由应用版本管理，普通设置只展示其用途和就绪状态。

#### Scenario: Configure multiple Supabase profiles
- **WHEN** 用户新增并保存多个 Supabase 存储空间
- **THEN** 每个空间的连接配置被独立保存
- **AND** 保存其中一个空间不得删除或覆盖其他 Supabase 空间

#### Scenario: Test one Supabase environment
- **WHEN** 用户在某个 Supabase 空间执行连接检查
- **THEN** 客户端只使用该空间的 API 地址和公开 Key
- **AND** 分层报告网络、Auth、Schema、RPC、RLS、Realtime 和 Storage 的就绪状态

#### Scenario: Sign in to one Supabase profile
- **WHEN** 用户在某个空间使用有效邮箱和密码登录
- **THEN** 该空间显示脱敏账号和会话状态
- **AND** 其他空间的登录状态保持不变

### Requirement: Storage profile editor state
新增或编辑存储空间 SHALL 使用独立草稿，只有用户确认保存后才修改持久配置。Supabase 登录密码和临时连接反馈 MUST NOT 写入普通 Settings 或配置导出文件。

#### Scenario: Cancel profile creation
- **WHEN** 用户填写新存储空间后取消编辑
- **THEN** 未保存草稿被丢弃
- **AND** 现有存储空间配置保持不变

#### Scenario: Do not export transient credentials
- **WHEN** 用户导出应用设置
- **THEN** 导出内容不包含 Supabase 登录密码、access token 或 refresh token
- **AND** 持久 Session 仍只保存在系统凭据库中

## REMOVED Requirements

### Requirement: Refresh interval configuration
**Reason**: WebDAV 改为保留明确的手动刷新操作，Supabase 通过 Realtime 通知与 checkpoint 补拉更新；统一的定时刷新间隔会产生不必要请求并混淆两种 Provider 的同步语义。

**Migration**: 升级时忽略已有 `refresh_interval_secs` 的自动调度作用并保留兼容读取；设置页不再要求用户配置自动刷新间隔，用户仍可随时点击刷新。
