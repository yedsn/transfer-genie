# Design

## Context

见 `proposal.md`。当前桌面应用启动一个子进程执行 Telegram Bot API 轮询；子进程接收包含完整 WebDAV 凭据的临时配置，并直接维护 WebDAV 文件、历史和本地 Bridge 状态。这个边界无法安全复用主程序持有的 Supabase Session、SQLite/outbox、Realtime 和附件缓存，也使 Provider 切换逻辑仍依赖旧的 `active_webdav_id`。

主程序已经具有 Provider-aware 发送入口、按 profile 与 Supabase 用户隔离的 SQLite 数据、本地优先 outbox、私有附件上传和增量补拉。正在进行的 `defer-supabase-space-creation` 变更将进一步明确 Supabase profile 的 bound/unbound 生命周期；本变更依赖其统一的已绑定校验，而不复制其向导或迁移工作。

## Goals / Non-Goals

**Goals:**

- 让桌面托管的 Bridge 通过主程序既有消息与同步边界支持 WebDAV 和 Supabase。
- 在异步轮询、文件下载、Provider 切换和 Session 变化期间保持目标空间与账号作用域稳定。
- 让来源身份跨 Provider 同步，从根源上阻止同机和多机 Telegram 回环。
- 保留现有 WebDAV Bridge 使用体验和独立命令兼容性。
- 将运行偏好、游标和投递状态严格留在设备本地。

**Non-Goals:**

- 不把 Telegram 配置或运行开关同步到 Supabase。
- 不提供多个 Bot、多个 Chat ID 或一个 Bridge 同时绑定多个空间。
- 不让独立命令管理 Supabase Auth Session。
- 不改变 Telegram Bot API 的文件大小限制，也不引入 webhook。
- 不把 Bridge 变成跨存储空间复制工具；空间切换仍采用停止并重新绑定语义。

## Decisions

### 1. 桌面托管 Bridge 改为主进程内异步任务

桌面应用不再为托管模式生成包含 Provider 凭据的 `runtime.json` 并启动子进程，而是在主进程内启动可取消的异步 Bridge 任务。Telegram HTTP、update 解析和发送逻辑继续复用现有模块中的纯函数；任务通过受控的内部服务访问 AppState、SQLite、Provider 配置和安全 Session。

这样 Supabase access/refresh token 不需要复制到子进程配置，入站可以直接调用本地优先事务，出站也能读取与界面一致的本地索引。运行管理器从 `Child` 生命周期改为任务句柄、取消信号、generation ID 和状态快照。

备选方案一是让子进程直接实现 Supabase Auth、数据库、Storage 和 outbox，这会复制主程序大量状态机并扩大凭据暴露面。备选方案二是增加私有 loopback HTTP/IPC 协议，仍需额外认证、版本和生命周期管理。因此两者都不采用。

独立 `telegram_bridge` 二进制保留现有 WebDAV 配置和执行路径，作为兼容与调试模式；新 Provider-aware 托管路径不要求独立模式支持 Supabase。

### 2. 每次启动创建不可变的绑定上下文

Bridge 启动时解析当前 `ProviderConfig`，形成包含 profile ID、Provider 类型、Supabase owner scope（如适用）、配置版本和 generation ID 的不可变绑定上下文。所有入站保存、出站查询和状态写入必须显式携带该上下文，而不是在操作结束时重新读取“当前活动空间”。

活动 profile、目标连接字段、Supabase space、Session 用户或绑定状态变化时，运行管理器先取消旧 generation，再启动新 generation。内部写入入口在提交前核对 generation 与目标作用域；旧轮询或旧文件下载的迟到结果返回可恢复错误，不得落入新空间。

备选方案是在每次消息处理时读取当前活动空间，代码改动较少，但会在切换期间把同一个 Telegram update 的下载与写入分配到不同空间，因此不采用。

### 3. 增加 Provider-aware 的集成写入服务

从现有 UI/HTTP 发送实现中提取可复用的领域服务，输入包括固定目标上下文、发送者、时间戳、文本或本地文件、格式以及外部来源身份。Tauri 命令、本机 HTTP API 和 Telegram Bridge 可以复用同一底层持久化路径，但 Bridge 不通过公开 HTTP 端口回调自身。

Supabase 文本在一个 SQLite 事务中保存消息和 message outbox；文件先移动或复制到受控 profile 缓存，再在同一事务中保存消息、附件和对应 outbox。事务提交后才唤醒上传。WebDAV 继续使用现有远端文件/历史协议，同时更新本地索引。

该服务按显式目标写入而不是隐式活动空间写入，避免 Provider 切换和后续更多本机集成重复实现存储分支。

### 4. 来源身份成为可选的消息领域字段

消息增加向后兼容的可选字段：`source_kind`、`source_channel_id` 和 `source_message_id`。Telegram 使用稳定且不包含 Bot Token 的通道身份，以及 Telegram chat ID/message ID。三元组在本地具有唯一性约束或等价的幂等索引。

这些字段需要贯穿 SQLite、WebDAV history/manifest、Supabase messages 表、RPC payload 和增量拉取。WebDAV JSON 与 Supabase 列均使用可空字段，使旧客户端可忽略、新客户端可读取旧消息。所有 Bridge 对 `source_kind = telegram` 的消息执行出站跳过，从而即使两台设备同时运行 Bridge，也不会把 Telegram 入站内容再次发回 Telegram。

备选方案是只在 Bridge `state.json` 保存 Telegram 文件名集合。它只能保护导入设备，无法保护通过 Supabase 或 WebDAV 同步到另一台正在运行 Bridge 的设备，因此不采用。

### 5. 出站统一读取本地索引并使用本地投递账本

托管 Bridge 不再直接扫描 WebDAV history。WebDAV 同步和 Supabase 增量补拉负责把远端变化写入 SQLite；Bridge 按绑定作用域查询启动水位之后的新消息。启动水位使用启动时间与稳定排序键，保持现有“不回放启动前历史”的行为。切换空间会建立新的水位，因此离开期间的消息不会在切回时批量补发。

设备本地投递账本以绑定 profile/owner scope、消息稳定 ID 和 Telegram 通道为键，记录 sending、sent、retryable error、delivery unconfirmed 和 permanent failure。发送前先持久化 reservation；确定失败可重试，结果未知则保持 `delivery_unconfirmed`，不自动重复发送。

直接读取本地索引让 Supabase Realtime/补拉与 Bridge 解耦，也统一了 WebDAV 和 Supabase 的出站选择逻辑。代价是 WebDAV 外部变化必须先经过主程序同步才能转发，这与应用当前 Provider 同步模型一致。

### 6. 设备本地控制继续使用本地 Settings 与 workspace 状态

Bot Token、Chat ID、代理、轮询间隔和自启动继续保存在当前设备的 Settings；运行状态、update 游标、投递账本和错误状态保存在 Telegram Bridge workspace 目录。它们不进入 Supabase schema、RPC、Storage 或 Realtime。配置导出仍属于用户显式的本地文件操作，不视为账号级自动同步。

现有 `telegram.enabled` 不再被当作跨设备或进程运行开关：配置是否完整由字段校验得出，`auto_start` 表示本设备启动偏好，`running` 来自运行管理器。兼容读取旧字段，但状态界面分别展示“配置可用”“本机自启动”“正在运行”。

### 7. Supabase Session 只由主程序持有

启动 Supabase Bridge 时复用目标 profile 的普通用户 Session，并应用 `defer-supabase-space-creation` 提供的 bound-profile guard。Bridge 任务只获得执行所需的受控服务能力，不序列化 refresh token，也不把 access token返回前端或写入日志。Session 刷新沿用主程序现有认证锁；刷新失败时 Bridge 进入需要登录状态并停止 Supabase 业务写入。

## Risks / Trade-offs

- 主进程内任务异常可能影响应用稳定性 → 隔离任务错误、禁止 panic 穿透、保留可取消句柄和完整状态测试。
- WebDAV 出站改读 SQLite 后依赖主同步及时性 → Bridge 启动与轮询周期可请求活动 Provider 刷新，并验证不会并发启动重复同步。
- 来源字段需要同时迁移 SQLite、WebDAV 和 Supabase → 使用可空加法迁移、旧数据默认无来源，并增加新旧客户端兼容验证。
- Telegram Bot API 缺少幂等发送键 → 发送前写本地 reservation，确定失败才重试，结果未知停止自动重发并明确展示。
- 多设备同时开启 Bridge 仍会把普通应用消息分别发送多次 → 本变更保证 Telegram 来源不回环，但不提供账号级单实例锁；设备本地开关意味着用户可独立决定哪些设备运行。
- 本变更依赖 Supabase bound-profile guard → 实现时先完成或复用 `defer-supabase-space-creation` 的相关守卫，避免临时发明另一套绑定判断。

## Migration Plan

1. 增加可空来源字段、SQLite 索引以及 WebDAV/Supabase 的加法迁移，保持旧消息与旧客户端可读。
2. 提取显式目标的 Provider-aware 集成写入服务，并让现有发送路径保持行为不变。
3. 增加基于本地索引的出站查询、投递账本和 generation 绑定校验。
4. 将桌面托管 Bridge 切换到进程内任务；保留独立 WebDAV 二进制路径和旧配置解析。
5. 接入 Supabase bound-profile guard、Session 刷新、outbox/Storage 和 Realtime 后的本地消息通知。
6. 更新设置界面、自动启动、Provider 切换重启、状态展示及文档。
7. 先验证 WebDAV 行为无回归，再验证 Supabase 在线、离线、Session 失效、空间切换和双设备本地开关。

回滚应用版本时，新增数据库列和 Supabase 字段保留但由旧版本忽略；独立 WebDAV 模式仍可使用。若托管任务出现严重问题，可临时禁用 Supabase Bridge 并恢复桌面 WebDAV 子进程路径，不删除来源数据或本地投递账本。
