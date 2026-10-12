# Supabase 初始化说明

本目录中的 `001_transfer_genie_initial.sql` 是 Transfer Genie 的初始云端结构。它会创建独立 `transfer_genie` Schema、个人空间与消息表、版本化写入 RPC、私有 `transfer-genie-files` bucket、RLS 和 Realtime publication。

## 执行前

1. 确认 SQL Editor 当前连接的是应用将使用的同一个 Supabase 项目。
2. 使用数据库 owner、postgres、supabase_admin 或专用迁移管理员执行；不要使用客户端公开 Key 或 authenticated/anon 数据库角色建表。
3. 正式环境先做数据库 Schema-only 备份。
4. 自托管 Supabase 还要把 `transfer_genie` 追加到 PostgREST 暴露 Schema，同时保留现有值。例如：

   ```text
   PGRST_DB_SCHEMAS=public,graphql_public,timegenie,transfer_genie
   ```

   托管版 Supabase 则在 API 设置中把 `transfer_genie` 加入 Exposed schemas。

## 在管理后台执行

1. 打开 Supabase Studio → SQL Editor。
2. 打开仓库中的 `001_transfer_genie_initial.sql`，完整复制到 SQL Editor。
3. 检查目标项目后点击 Run。脚本位于单个事务中；中途失败会整体回滚。
4. 自托管环境应用 PostgREST 暴露配置并重启或刷新 REST 服务。
5. 等待数秒，再执行下面的只读检查。

## 部署后检查

```sql
select version, applied_at
from transfer_genie.schema_migrations
order by applied_at;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'transfer_genie';

select id, public
from storage.buckets
where id = 'transfer-genie-files';

select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'transfer_genie'
order by routine_name;
```

预期：迁移记录包含 `001_transfer_genie_initial`；Realtime 包含 `transfer_genie.change_log`；bucket 存在且不是 public；可看到 `cloud_status`、`space_upsert`、`message_apply`、`tag_apply`、`attachment_apply` 和 `pull_changes`。

之后必须使用普通 Supabase Auth 测试账号验证登录与 Token 续期、RPC CRUD、跨用户拒绝、Realtime 事件和私有 Storage 上传/读取/删除。仅检查表存在或首页返回 200，不能视为接入完成。

## 常见错误

- `42501 permission denied for schema ...`：当前 SQL 身份不是数据库 owner/迁移管理员。不要给客户端角色授予建表权限。
- `PGRST205` 或 `Could not find the table`：Schema 未加入 API 暴露列表，或 PostgREST cache 尚未刷新。
- Realtime 连接成功但没有事件：确认 `transfer_genie.change_log` 已加入 publication，并以普通用户 Session 订阅该表。
- Storage 403：先调用 `space_upsert` 创建空间，并确保对象路径为 `<user-id>/<space-id>/<attachment-id>/<filename>`。

## 安全约束

- 客户端只配置 API URL 和公开 Key，不配置 service-role/secret Key。
- 用户密码不持久化；refresh token 保存到操作系统凭据库。
- 不把数据库密码、用户 token 或管理 Key 写入设置、日志或导出文件。
- 不给 authenticated 开放业务表写权限；远端业务修改通过版本化 RPC 执行。
