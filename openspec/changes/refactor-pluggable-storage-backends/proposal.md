# Proposal

## Why

Transfer Genie 当前用 WebDAV 文件和历史清单模拟远端数据库，随着消息与附件增长，同步需要检查、解析并合并大量历史分片，实时性也只能依赖轮询。需要在保留本地 SQLite 与现有 WebDAV 能力的同时，引入以 Supabase 数据库、Realtime 和 Storage 为基础的个人多设备存储空间。

## What Changes

- 将“WebDAV 端点”提升为可选择 Provider 的通用存储空间，第一版支持 WebDAV 和 Supabase；两种空间的数据、队列、缓存和附件相互独立，不持续双写。
- 保留 SQLite 作为统一本地主数据层，所有页面继续从本地读取；业务修改与待同步操作在同一事务提交，网络恢复后异步同步。
- 新增 Supabase 邮箱密码登录、会话续期、个人数据 RLS、PostgreSQL 消息模型、私有 Storage 附件和 Realtime 变化提醒。
- 新增基于稳定 UUID、服务端 revision、删除墓碑、幂等 operation ID 和变更日志的同步协议，Realtime 仅唤醒补拉，断线后仍可恢复遗漏变化。
- 新增 WebDAV 到 Supabase 的显式导入流程；导入可预览、重试、继续并保留 WebDAV 原件，不自动把旧空间数据写入新空间。
- **BREAKING**：内部配置与代码语义从 active_webdav_id/endpoint_id 迁移到存储空间标识；现有配置和 SQLite 数据必须自动兼容迁移，用户可见 WebDAV 行为保持不变。

## Capabilities

### New Capabilities

- `storage-profiles`: WebDAV 与 Supabase 存储空间的配置、切换、隔离和显式数据导入。
- `local-first-sync`: SQLite 本地优先写入、持久 outbox、版本冲突、删除传播、增量补拉和同步状态。
- `supabase-storage`: Supabase Auth、个人数据权限、数据库同步、Realtime 提醒和私有附件 Storage。

### Modified Capabilities

- `client-settings`: 将 WebDAV 专用连接设置扩展为多 Provider 存储空间及 Supabase 连接/登录设置。
- `message-feed`: 消息保存、同步、下载、删除和空间切换行为从 WebDAV 专用语义扩展为当前存储空间语义。

## Impact

- 后端：src/types.rs、src/db.rs、src/main.rs、现有 WebDAV/history/runtime 模块，以及新的存储 Provider、Supabase Auth/REST/Realtime/Storage 与同步模块。
- 前端：设置页、首页存储空间选择、登录状态、同步状态、冲突入口、导入向导和附件状态。
- 本地数据：SQLite 增加稳定消息 ID、存储空间、outbox、checkpoint、revision、删除墓碑和附件同步状态；旧 endpoint_id 数据需无损迁移。
- 云端：新增版本化 Supabase SQL、独立 transfer_genie Schema、私有 transfer-genie-files bucket、RLS、RPC 和 Realtime publication。
- 安全：客户端只持有公开 Key 与普通用户 Session；refresh token 进入系统凭据库，不在普通设置、日志或客户端包中保存管理密钥。
- 运维：自托管 Supabase 必须暴露 transfer_genie Schema；初始化 SQL 由数据库 owner/迁移管理员执行，并在部署后真实验证 Auth、CRUD、RLS、Realtime 和 Storage。
