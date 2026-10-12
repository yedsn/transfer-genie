# Supabase 存储空间

Transfer Genie 支持 WebDAV 和 Supabase 两种存储空间。它们彼此独立：切换空间不会自动复制、合并或双写数据。Supabase 模式面向同一个人的多台设备，通过数据库加载消息列表、Realtime 提醒补拉变化，并将附件放入私有 Storage。

## 配置

在“设置 → 存储空间 → Supabase 存储空间”填写：

- Supabase API URL，例如 `https://supabase.example.com`。
- 公开 Key（anon Key）。
- 空间名称。

应用不需要 PostgreSQL 密码、service-role Key 或 Studio 管理账号。邮箱和密码只用于 Supabase Auth 登录；密码不会保存，Session 保存在操作系统凭据库。

部署方先执行仓库中的 `supabase/migrations/001_transfer_genie_initial.sql`，并确保：

- PostgREST 在保留现有 Schema 的同时暴露 `transfer_genie`。
- 私有 bucket `transfer-genie-files` 及其 RLS 策略已创建。
- `transfer_genie.change_log` 已加入 Realtime publication。
- 执行 `notify pgrst, 'reload schema';` 刷新 Schema cache。

自托管环境应使用数据库 owner 或迁移管理员执行 SQL，不能给客户端 `anon`/`authenticated` 角色授予建表权限。部署后可按仓库中的 `tests/supabase_probe.md` 运行 Rust 探针，验证 Auth、RPC、RLS、Realtime 和 Storage。

## 本地优先与实时同步

消息列表始终从本机 SQLite 加载。发送、标记、标签和删除先在一个本地事务中保存业务数据与待同步操作，再由后台上传。界面会区分：

- 已保存到本机、等待同步。
- 等待连接恢复。
- 同步中、已同步。
- 需要登录、同步失败、有冲突。

Realtime 只负责尽快唤醒增量补拉，不直接把 WebSocket 内容当作最终数据。应用启动、网络恢复和 Realtime 重连都会根据 checkpoint 补齐遗漏变化。点击首页同步状态可以查看待处理操作或冲突；普通失败可立即重试，冲突可选择采用云端或保留本机版本。

Supabase 正常在线时使用持久 WebSocket，不按固定时间间隔查询业务数据。没有变化时只发送 Realtime 心跳；本机修改会立即唤醒上传，远端变化会立即触发增量补拉。连接中断后程序按 1～30 秒退避重连，并在重新订阅成功后补拉一次断线期间遗漏的变化。设置中的“刷新间隔”仅用于 WebDAV，不控制 Supabase。

## 离线和附件限制

离线时可以浏览已缓存消息，并继续编辑或发送；操作会保留在本机队列。首次登录、新设备首次读取和未缓存附件下载需要联网。

文件会先复制到按存储空间和账号隔离的本地目录，再上传私有 Storage。已缓存附件离线可打开；未下载附件会提示需要联网。对象上传成功但元数据提交失败时，本地原件和稳定重试操作会保留。清理只处理超过宽限期、无引用且没有待上传操作的孤立对象。

## 从 WebDAV 导入

登录 Supabase 后，在设置页点击“从 WebDAV 导入”：

1. 选择 WebDAV 来源。
2. 预览消息数、附件数、总大小、标记和标签。
3. 确认后复制到当前 Supabase 账号。

导入批次和每条进度都保存在 SQLite。消息、附件和 operation ID 由来源 profile 与原始键确定性生成；中断后再次点击会继续同一批次，不会重复创建。来源 WebDAV 始终只读，不会删除或改写原件。

## 账号和空间隔离

同一 Supabase profile 下，不同 Auth 账号的 SQLite 数据、队列、checkpoint、冲突和附件目录相互隔离；服务端 RLS 进一步限制每个用户只能访问自己的空间。退出登录不会删除该账号尚未同步的本地内容，重新登录同一账号后可继续。
