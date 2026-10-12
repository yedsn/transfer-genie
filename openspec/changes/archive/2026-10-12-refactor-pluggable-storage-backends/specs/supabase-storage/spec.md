# Spec Delta

## Purpose

定义 Supabase 个人账号多设备空间的登录、数据库权限、实时变化提醒和私有附件存储行为，确保客户端无需管理密钥即可安全工作。

## ADDED Requirements

### Requirement: Supabase personal authentication
Supabase 存储空间 SHALL 使用 Supabase Auth 普通用户 Session，同一账号可在多台设备同步个人数据。客户端 MUST NOT 包含 service-role 或 secret Key；持久会话 MUST 存入操作系统凭据库而非普通设置或日志。

#### Scenario: Sign in and restart
- **WHEN** 用户用有效邮箱和密码登录后重启应用
- **THEN** 客户端使用安全保存的 refresh token 恢复同一账号会话
- **AND** 不要求重新输入密码

#### Scenario: Session is revoked
- **WHEN** refresh token 被明确撤销或账号被禁用
- **THEN** 客户端停止云端同步并提示重新登录
- **AND** 原账号的本地待同步数据保持隔离

### Requirement: Personal data RLS
Supabase 业务表、RPC 和 Storage 对象 SHALL 以 Auth 用户为归属执行 RLS。普通用户 MUST 只能读写自己的空间、消息、标签、附件和变更记录，并 MUST 不能通过伪造 owner ID、空间 ID 或对象路径访问他人数据。

#### Scenario: Cross-user database access
- **WHEN** 用户 B 指定用户 A 的记录 ID 发起查询或修改
- **THEN** 服务端不返回或修改用户 A 的数据

#### Scenario: Cross-user object access
- **WHEN** 用户 B 请求用户 A 的私有 Storage 对象路径
- **THEN** Storage 拒绝读取、覆盖和删除

### Requirement: Authoritative server operations
Supabase 消息、标签和附件元数据修改 SHALL 通过校验身份、operation ID、payload hash 和 base revision 的服务端事务执行。相同 operation ID 与相同 payload MUST 返回原结果；相同 ID 与不同 payload MUST 被拒绝。

#### Scenario: Retry committed operation
- **WHEN** 客户端以相同 operation ID 和 payload 重试已提交操作
- **THEN** 服务端返回首次提交结果
- **AND** 不增加第二条业务变化

#### Scenario: Reuse operation ID with changed payload
- **WHEN** 客户端用已使用的 operation ID 提交不同 payload hash
- **THEN** 服务端拒绝该请求

### Requirement: Supabase Realtime wake-up
Supabase 模式 SHALL 通过持久 WebSocket 订阅当前用户可读的变更日志 Realtime 事件。事件到达时客户端 SHALL 触发权威增量补拉，而不是直接把 WebSocket payload 当作唯一持久状态。正常在线期间 MUST NOT 使用固定时间间隔轮询业务变化；连接中断时 SHALL 退避重连，并在重新订阅成功后执行一次 checkpoint 补拉。

#### Scenario: Receive change on another device
- **WHEN** 同一账号的设备 A 提交消息变化
- **THEN** 设备 B 收到 Realtime 提醒并执行增量补拉
- **AND** SQLite 更新后消息列表刷新

#### Scenario: Realtime connection remains idle
- **WHEN** Supabase 空间在线且一段时间内没有本机或远端业务变化
- **THEN** 客户端仅维持 WebSocket 心跳
- **AND** 不按固定时间间隔执行数据库补拉

#### Scenario: Reconnect after network interruption
- **WHEN** Realtime 连接因网络中断而关闭
- **THEN** 客户端使用有上限的退避策略重新连接
- **AND** 重新订阅成功后立即按 checkpoint 补拉断线期间的变化

### Requirement: Private attachment lifecycle
附件 SHALL 先可靠保存到本机，再上传到独立私有 bucket。对象路径 MUST 包含用户、空间和附件稳定 ID；数据库只保存稳定对象路径。上传确认前附件不得标记为云端可用。

#### Scenario: Object upload succeeds but metadata commit fails
- **WHEN** Storage 对象上传成功但附件元数据事务失败
- **THEN** 客户端保留本地原件与重试任务
- **AND** 重试可复用或清理孤立对象而不覆盖他人文件

#### Scenario: Open attachment offline
- **WHEN** 用户离线打开附件
- **THEN** 已缓存附件可以打开
- **AND** 未下载附件明确提示需要联网
