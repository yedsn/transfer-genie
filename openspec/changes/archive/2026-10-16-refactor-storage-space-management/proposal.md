# Proposal

## Why

当前设置页仍以“多个 WebDAV 端点 + 单个 Supabase 表单”组织配置，无法安全地管理和切换多个 Supabase；现有“从 WebDAV 导入”也把来源与目标类型写死，不能满足多个独立存储空间之间按需传输数据的需求。需要把已经存在的多 Provider 数据模型完整落实到统一的存储空间管理界面和通用数据传输流程中。

## What Changes

- 将设置页中的 WebDAV 端点和单个 Supabase 表单统一为“存储空间列表”，支持新增、编辑、启用、切换和安全移除存储空间。
- 新增存储空间时先选择 WebDAV 或 Supabase，并允许保存多个 WebDAV、多个 Supabase，以及同一 Supabase 项目下不同账号或 `space_id` 的独立配置。
- 每个 Supabase 存储空间独立展示连接状态、登录账号并执行登录、退出和连接检查，不再共享单例表单状态。
- 将“从 WebDAV 导入”重构为“存储空间数据传输”，允许在任意两个不同的 WebDAV 或 Supabase 存储空间之间显式传输消息、附件、标签和标记元数据。
- 数据传输提供来源刷新、传输预览、持久化进度、稳定 ID、断点继续、幂等重试、冲突与失败明细以及完成核验；传输采用非破坏性复制语义，保留来源数据、不清空目标，也不建立持续双向同步。
- Supabase 同步冲突改为批量处理：用户只选择一次“全部使用云端”或“全部保留本地”，客户端处理当前空间和账号下的全部未解决冲突并汇报结果。
- 只有当前活动 Supabase 保持 Realtime 连接；WebDAV 保留手动刷新，不恢复定时刷新。
- 兼容现有配置，已有 WebDAV 和 Supabase 配置无损进入统一列表。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `storage-profiles`: 将现有 WebDAV → Supabase 显式导入扩展并重命名为通用的“存储空间数据传输”，同时完善多 Provider 空间的统一管理、安全切换和来源/目标隔离。
- `client-settings`: 将 WebDAV 专用端点设置和单一 Supabase 设置改为统一的多存储空间管理，并规定各空间独立的配置、凭据和状态交互。

## Impact

- 基于已归档 change `refactor-pluggable-storage-backends` 的 `StorageProfile`、按 profile 隔离的 Supabase Session、本地 SQLite/outbox/checkpoint 以及现有 WebDAV → Supabase 导入批次实现。
- 前端主要影响 `src-ui/index.html`、`src-ui/src/legacy-main.js`、`src-ui/src/store.ts`、设置表单运行时和相关样式。
- Rust 后端主要影响 `src/main.rs`、`src/storage_provider.rs`、`src/db.rs`、`src/credential_store.rs`、WebDAV/Supabase 同步与附件传输逻辑。
- Tauri 命令从特定的 WebDAV → Supabase 导入语义升级为 Provider 无关的数据传输预览、启动、继续、状态查询和结果核验接口。
- 不新增外部服务依赖，不改变 WebDAV 与 Supabase 彼此独立、不持续双写的原则。
