# Transfer Genie Supabase

权威初始化迁移位于 `migrations/001_transfer_genie_initial.sql`。客户端只配置 API URL 和公开 anon Key；不要把数据库密码、service-role Key 或 Auth Token 写入仓库、设置导出或日志。

部署顺序：

1. 备份目标 Supabase 的 `transfer_genie` Schema（如尚不存在，也保留一份 Schema-only 部署前记录）。
2. 新部署以数据库 owner/迁移管理员事务执行 `migrations/001_transfer_genie_initial.sql`，再按编号执行 `002_message_source_identity.sql` 和 `003_space_create_idempotency.sql`；已有部署只继续执行尚未记录的编号迁移。
3. 将 `transfer_genie` 追加到 PostgREST 暴露 Schema，不覆盖现有值。
4. 执行 `notify pgrst, 'reload schema';`，确认 `transfer_genie.change_log` publication 和私有 `transfer-genie-files` bucket。
5. 按 `tests/supabase_probe.md` 运行 Rust 探针。

应用内使用、离线行为、附件限制和 WebDAV 导入见 `docs/guide/supabase-storage.md`。

正式迁移位于 `migrations/`。`002_message_source_identity.sql` 为消息增加可空的
`source_kind`、`source_channel_id`、`source_message_id`，并在同一账号和 Space 内对完整来源三元组建立唯一索引。
旧消息保持三个字段均为 `NULL`；Telegram Bridge 使用 `telegram`、chat ID 和 message ID。
这些字段属于消息来源元数据，可以随消息同步；Bridge 的启用、自启动、运行状态、游标和投递账本仍只保存在本机，不得加入 Supabase 表、RPC 或 Storage。

`003_space_create_idempotency.sql` 将显式创建 Space 改为携带 `operation_id` 和预生成的
`space_id`。相同账号以相同参数重试会返回同一 Space；复用 operation ID 但修改参数会被拒绝。
它会移除旧的双参数 `space_upsert(uuid,text)`，已部署环境必须执行该迁移后才能使用新版客户端创建 Space。

部署、PostgREST 暴露 Schema、检查与安全说明见 OpenSpec 变更目录中的 Supabase 初始化说明。客户端只使用 API URL、公开 Key 和普通 Auth 用户 Session，不得配置 service-role 或数据库密码。
