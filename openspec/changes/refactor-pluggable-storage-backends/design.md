# Design

## Context

当前消息列表已经从本地 SQLite 查询并具备分页与索引；主要瓶颈在 WebDAV 同步需要读取历史索引/分片、合并完整文件集合并轮询变化。现有消息、下载、预览、冲突和运行状态都围绕 `endpoint_id` 与 WebDAV 实现，Supabase 接入必须避免在 Vue 与 Rust 之间形成两套数据和会话状态。目标自托管 Supabase 已通过 Rust `reqwest` 与 `tokio-tungstenite` 真实验证 Auth、Token 刷新、RLS、Realtime 和私有 Storage。

## Goals / Non-Goals

**Goals:**

- SQLite 始终是 UI 查询和离线工作的本地主数据层。
- WebDAV 与 Supabase 通过统一存储空间和 Provider 边界接入，数据互相隔离。
- Supabase 使用个人 Auth 账号、多设备同步、私有附件和可恢复增量协议。
- 服务端写入具备 revision 冲突检查、operation ID 幂等、删除墓碑和严格 RLS。
- Realtime 只降低通知延迟，断线、关闭应用或事件遗漏后仍可补齐。
- 现有 WebDAV 设置和 SQLite 数据可无损升级，并支持显式导入 Supabase。

**Non-Goals:**

- 第一版不支持团队共享空间、角色协作或管理员控制台。
- 第一版不在 WebDAV 与 Supabase 间持续双写，也不自动合并两个空间。
- 第一版不使用 CRDT，不提供多人同时编辑正文。
- 本提案不替换现有本地备份，也不让 Supabase 成为应用启动的强依赖。

## Decisions

### 1. SQLite 为统一本地主数据，Provider 只负责远端同步

列表、搜索、分页、标记筛选和下载状态继续查询 SQLite。所有本地修改在一个事务中同时更新业务表和 outbox，事务提交后立即返回 UI；后台 worker 再处理远端。

备选方案是页面直接查询 Supabase，但这会让首屏延迟和可用性依赖网络，并与 WebDAV 模式形成两套 UI 数据路径，因此不采用。

### 2. Rust 持有 Supabase 会话和所有远端协议

Rust 通过标准 Auth/PostgREST/Storage HTTP API 与 Realtime WebSocket 工作，Vue 只调用 Tauri 命令并展示脱敏状态。refresh token 保存到 Windows Credential Manager/macOS Keychain；普通设置仅保存 API URL、公开 Key和存储空间元数据。

备选方案是在 Vue 使用 Supabase JS，但 SQLite、文件缓存、下载和同步锁已经位于 Rust，会造成 Session、错误恢复和生命周期重复。

### 3. 存储空间标识替代 WebDAV 端点语义

引入 `StorageProfile { id, name, provider_kind, enabled, provider_config }` 和 `active_storage_profile_id`。第一阶段 SQLite 可继续使用物理列 `endpoint_id`，但数据访问层统一把它解释为 storage profile ID，降低迁移风险；后续版本再决定是否改列名。

每个 profile/账号拥有独立 outbox、checkpoint、缓存和附件目录。网络回调携带 profile、actor 和 generation，落盘前再次核对，防止切换后的晚到响应串写。

### 4. Supabase 业务区域使用独立 Schema 与私有 bucket

数据库使用 `transfer_genie` Schema，附件使用 `transfer-genie-files` 私有 bucket。自托管 PostgREST 需要把 `transfer_genie` 追加到 `PGRST_DB_SCHEMAS`；请求通过 `Accept-Profile`/`Content-Profile` 选择该 Schema。

对象路径固定为 `<auth-user-id>/<space-id>/<attachment-id>/<encoded-file-name>`。Storage 策略同时校验第一段用户 ID 与第二段归属空间，数据库只存稳定路径，不存过期签名 URL。

### 5. 服务端 RPC 是业务写入的唯一远端入口

authenticated 用户可以 SELECT 自己的数据，但消息、标签和附件元数据的 INSERT/UPDATE/DELETE 通过版本化 RPC 完成。RPC 验证 `auth.uid()`、空间归属、稳定 operation ID、payload hash 和 base revision；相同 operation/payload 返回原结果，不同 payload 重用 ID 时拒绝。

这比开放表级 upsert 更复杂，但能原子实现幂等、冲突和变更日志，避免存在绕过 revision 协议的写路径。

### 6. 每空间序列化提交并生成无遗漏变更序号

每个空间维护 `space_cursors.next_change_seq`。业务 RPC 对该空间 cursor 行加锁，在同一事务内应用修改、增加 revision、分配 change sequence、写入 `change_log` 和记录 operation 结果。并发写入按空间串行，因此序号顺序与提交可见顺序一致。

客户端通过 `(space_id, change_seq > checkpoint)` 稳定分页，应用一批变化与推进本地 checkpoint 位于同一 SQLite 事务。仅依赖 `updated_at`、数据库全局 sequence 或 Realtime payload 都可能漏掉乱序提交，因此不采用。

### 7. Realtime 只订阅 change_log

`change_log` 加入 `supabase_realtime` publication 并启用 RLS。通知只包含可读变更，客户端收到后调用增量补拉；启动、恢复前台、恢复网络、WebSocket 重连和手动刷新也会补拉。消息主表和附件表不需要全部加入 publication，从而减少订阅面。

### 8. 附件采用“本地原件 → Storage → 元数据 RPC”

文件先复制到 profile/账号隔离的受控本地目录并进入 outbox。上传 Storage 成功后校验大小/摘要，再提交附件元数据；只有元数据确认后才标记云端可用。对象成功而元数据失败时保留本地任务，使用稳定对象路径重试。确定无引用且超过保留期的对象才能清理。

### 9. WebDAV 导入是可恢复复制，不是 Provider 同步

导入批次持久保存来源/目标、稳定 ID 映射、条目进度和错误。消息 ID可由来源 profile ID 与旧 filename 生成确定性 UUID，或首次映射后持久化。核对云端数量、抽样内容、附件大小/摘要前不处理 WebDAV 原件。

## Risks / Trade-offs

- 自定义 Schema 未加入 PostgREST 暴露列表会导致 SQL 已部署但客户端仍报缺表 → 设置测试分层报告 Schema 配置，并在部署说明中要求更新 `PGRST_DB_SCHEMAS`。
- 每空间串行 RPC 限制同一空间峰值写吞吐 → 个人传输场景写入量低，换取可靠游标；附件字节上传不持有数据库锁。
- Storage 与 PostgreSQL 不能跨服务原子提交 → 使用稳定对象路径、附件状态、幂等元数据 RPC 和延迟孤立对象清理。
- 删除墓碑和 operation 去重记录持续增长 → 在明确最大离线期限、设备确认或受控全量重同步后才做保留策略，不在第一版自动清理。
- 系统凭据库暂时不可读可能阻塞同步 → 保留本地数据和 outbox，显示需要解锁/重新登录，不因暂时错误清除 Session。
- WebDAV 代码当前与命令层高度耦合 → 先引入 Provider adapter 并保持现有行为，再逐条迁移发送、下载、删除、预览和备份路径。

## Migration Plan

1. 审核并批准本提案；将提案内 SQL 固化到正式 `supabase/migrations/`。
2. 在目标 Supabase 创建 Schema-only 备份，由数据库 owner/迁移管理员执行初始化 SQL。
3. 将 `transfer_genie` 追加到 PostgREST 暴露 Schema，刷新 schema cache，检查 Realtime publication 和私有 bucket。
4. 使用两名普通 Auth 测试用户验证 RPC CRUD、RLS 越权拒绝、Realtime 提醒及 Storage 上传/下载/删除。
5. 应用先发布 storage profile 与本地 SQLite 迁移，旧 WebDAV 配置自动转换但行为不变。
6. 再启用 Supabase 登录、同步和附件功能；未完成结构检查时禁止上传真实数据。
7. 最后启用 WebDAV 到 Supabase 导入，并以小批数据验证后再迁移大量附件。

回滚时先在客户端禁用 Supabase profile 同步并保留 SQLite/outbox；云端 Schema 与 bucket 不自动删除。若必须回滚数据库，使用部署前备份和单独审查的 down migration，避免误删用户附件。
