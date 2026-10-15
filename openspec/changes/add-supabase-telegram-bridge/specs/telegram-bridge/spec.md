# Spec Delta

## Purpose

定义 Telegram Bridge 如何把一个 Telegram 会话与当前活动的 WebDAV 或 Supabase 存储空间可靠连接，同时保证来源去重、空间隔离、安全认证和设备本地运行控制。

## ADDED Requirements

### Requirement: Provider-aware bridge binding
桌面应用托管的 Telegram Bridge SHALL 绑定启动时的当前活动存储空间，并 SHALL 支持已启用的 WebDAV 空间以及已登录、已完成绑定且可访问的 Supabase 空间。Bridge 运行期间切换活动空间时，客户端 MUST 停止旧绑定并以新空间建立新的绑定；旧绑定的迟到结果 MUST NOT 写入新空间。

#### Scenario: Start with active WebDAV space
- **WHEN** 当前活动空间是配置完整且已启用的 WebDAV 空间，且 Telegram 配置有效
- **THEN** Bridge 成功启动并与该 WebDAV 空间建立双向桥接

#### Scenario: Start with active Supabase space
- **WHEN** 当前活动空间是已登录、已完成绑定且可访问的 Supabase 空间，且 Telegram 配置有效
- **THEN** Bridge 成功启动并与该 Supabase 空间建立双向桥接
- **AND** 用户不需要提供数据库密码、service-role Key 或额外的 Supabase 凭据

#### Scenario: Reject unavailable Supabase binding
- **WHEN** 当前 Supabase 空间未登录、未完成绑定、Session 已失效或空间不可访问
- **THEN** 客户端拒绝启动 Bridge 并显示对应的可恢复原因
- **AND** 不读取或写入其他存储空间作为回退

#### Scenario: Switch active space while running
- **WHEN** Bridge 正在运行且用户将活动空间切换到另一个可用的 WebDAV 或 Supabase 空间
- **THEN** 客户端停止旧绑定并重新绑定到新空间
- **AND** 切换完成后的 Telegram 入站和出站只作用于新空间

### Requirement: Telegram inbound provider persistence
Bridge SHALL 将允许会话中的 Telegram 文本和受支持文件保存到绑定空间。消息 MUST 携带稳定的 Telegram 来源身份；Supabase 入站消息 MUST 先可靠保存到本地 SQLite，附件 MUST 先保存本地原件，随后通过现有 outbox、服务端事务和私有 Storage 异步同步。

#### Scenario: Import Telegram text into Supabase while online
- **WHEN** Bridge 绑定 Supabase 空间并收到允许会话中的新文本消息
- **THEN** 文本消息先写入该空间和账号作用域下的本地消息索引与 outbox
- **AND** 后台使用现有 Supabase 消息事务同步到远端空间

#### Scenario: Import Telegram file into Supabase while remote is unavailable
- **WHEN** Bridge 已从 Telegram 下载文件但 Supabase 暂时不可连接
- **THEN** 客户端保留文件本地原件、消息记录和待同步操作
- **AND** 网络恢复后通过私有 Storage 与附件元数据事务继续同步

#### Scenario: Import Telegram message into WebDAV
- **WHEN** Bridge 绑定 WebDAV 空间并收到允许会话中的新文本或文件
- **THEN** 消息按现有 WebDAV 文件与历史协议保存到该空间
- **AND** 本地消息索引保留相同的 Telegram 来源身份

#### Scenario: Retry the same Telegram update
- **WHEN** Telegram 再次返回具有相同 chat ID 和 message ID 的更新
- **THEN** Bridge 识别已有稳定来源身份且不创建第二条消息或第二个附件

### Requirement: Telegram outbound delivery and loop prevention
Bridge SHALL 从绑定空间的本地消息索引发现启动后出现的新消息并转发到 Telegram。Telegram 来源消息 MUST NOT 被任何设备上的 Bridge 再次转发到 Telegram。每个出站消息 MUST 具有设备本地的投递记录；Telegram 返回结果不确定时客户端 MUST NOT 自动重复发送可能已经送达的内容。

#### Scenario: Forward new Supabase message
- **WHEN** Bridge 启动后 Supabase 增量同步把一条非 Telegram 来源的新文本或文件加入绑定空间的本地索引
- **THEN** Bridge 将该消息转发到配置的 Telegram 会话
- **AND** 成功结果写入设备本地投递记录

#### Scenario: Do not echo Telegram-origin message
- **WHEN** Telegram 入站消息经 WebDAV 或 Supabase 同步后出现在一个正在运行的 Bridge 设备上
- **THEN** Bridge 根据同步保留的来源身份跳过该消息
- **AND** Telegram 会话中不产生回环副本

#### Scenario: Do not replay historical messages on start
- **WHEN** Bridge 启动或因切换空间而重新绑定
- **THEN** 启动前已经存在于目标空间的历史消息不会批量转发到 Telegram

#### Scenario: Delivery result is unknown
- **WHEN** Telegram 可能已经接收消息但客户端未获得确定响应
- **THEN** Bridge 将该消息标记为投递结果不确定并停止自动重发
- **AND** 状态中保留可诊断的错误信息

### Requirement: Local bridge lifecycle and security boundary
Bridge 的自启动选择、当前运行状态、投递记录、Telegram update 游标和错误状态 SHALL 仅保存在当前设备。它们 MUST NOT 写入 Supabase 业务表、Storage 对象、Realtime 事件或其他账号级同步数据。Supabase access token 与 refresh token MUST 继续由主程序的安全会话边界管理，并 MUST NOT 出现在 Bridge 日志、界面 payload 或可长期读取的普通运行配置中。

#### Scenario: Same Supabase account on another device
- **WHEN** 设备 A 为某个 Supabase 空间启用 Telegram Bridge，而设备 B 登录同一账号和空间
- **THEN** 设备 B 的 Bridge 启用、自启动和运行状态保持其本机原值
- **AND** Supabase 同步不会自动启动设备 B 的 Bridge

#### Scenario: Restart current device with auto-start enabled
- **WHEN** 当前设备已启用 Bridge 自启动且活动空间与认证仍然有效
- **THEN** 应用启动后在当前设备恢复 Bridge
- **AND** 该行为不修改其他设备的 Bridge 状态

#### Scenario: Inspect logs and runtime status
- **WHEN** Bridge 使用 Supabase 空间运行、失败或停止
- **THEN** 日志和状态可以包含脱敏空间、Provider 与错误信息
- **AND** 不包含 Supabase access token、refresh token、service-role Key 或 Telegram Bot Token

### Requirement: Managed and standalone compatibility
桌面应用托管模式 SHALL 提供 WebDAV 与 Supabase 支持。现有独立 `telegram_bridge` 命令 SHALL 继续接受旧版 WebDAV 运行配置并保持 WebDAV 桥接能力；独立模式不要求支持 Supabase 登录或安全 Session 恢复。

#### Scenario: Run legacy standalone WebDAV configuration
- **WHEN** 用户使用现有 WebDAV 配置启动独立 `telegram_bridge` 命令
- **THEN** Bridge 继续按原有 WebDAV 双向同步行为运行
- **AND** 不要求增加 Supabase 字段

