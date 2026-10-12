# Transfer Genie Supabase

权威初始化迁移位于 `migrations/001_transfer_genie_initial.sql`。客户端只配置 API URL 和公开 anon Key；不要把数据库密码、service-role Key 或 Auth Token 写入仓库、设置导出或日志。

部署顺序：

1. 备份目标 Supabase 的 `transfer_genie` Schema（如尚不存在，也保留一份 Schema-only 部署前记录）。
2. 以数据库 owner/迁移管理员事务执行 `migrations/001_transfer_genie_initial.sql`。
3. 将 `transfer_genie` 追加到 PostgREST 暴露 Schema，不覆盖现有值。
4. 执行 `notify pgrst, 'reload schema';`，确认 `transfer_genie.change_log` publication 和私有 `transfer-genie-files` bucket。
5. 按 `tests/supabase_probe.md` 运行 Rust 探针。

应用内使用、离线行为、附件限制和 WebDAV 导入见 `docs/guide/supabase-storage.md`。

正式迁移位于 [migrations/001_transfer_genie_initial.sql](migrations/001_transfer_genie_initial.sql)。

部署、PostgREST 暴露 Schema、检查与安全说明见 OpenSpec 变更目录中的 Supabase 初始化说明。客户端只使用 API URL、公开 Key 和普通 Auth 用户 Session，不得配置 service-role 或数据库密码。
