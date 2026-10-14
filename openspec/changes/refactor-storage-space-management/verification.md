# 验收记录

日期：2026-10-13

## 真实远端验收

- 使用本机已授权配置中的两个独立 WebDAV 服务。所有测试内容写入带唯一 run ID 的临时子目录，验收后删除。
- 使用目标自托管 Supabase 项目中的两个随机 `space_id` 作为两个独立 Supabase 存储空间；使用同一普通 Auth 用户的按 profile Session，不使用客户端管理密钥。
- 执行并通过 WebDAV → WebDAV、WebDAV → Supabase、Supabase → WebDAV、Supabase → Supabase 四种组合。
- 每个来源包含一条文本、一份小附件、一份 5 MiB 大附件、一个标签、标记、置顶和到期日。
- 首次传输后核对 WebDAV history/文件和 Supabase 数据库/Storage；Supabase 完成判断包含逐条远端记录、附件大小和 SHA-256 读回核验。
- 四种组合均重复执行一次；项目总数、已应用数和远端记录数保持不变，未产生重复消息或附件。
- 数据传输前后来源 WebDAV history 与标签保持一致；活动 profile ID 保持不变，数据传输未创建 Realtime 常驻连接。
- 单独连接活动 Supabase Realtime，写入临时标签后收到 `change_log` 事件。
- 两个 Supabase profile 的本地消息、outbox、checkpoint 和附件缓存分别以 profile/account 作用域保存；验收后两边 pending outbox 均为 0。
- 验收运行耗时约 194 秒，Rust 忽略测试 `acceptance_real_four_provider_combinations_are_isolated_and_non_destructive` 通过。

## 故障与恢复验收

- `storage_transfer_large_attachment_cache_is_streamed_and_reused`：大附件采用流式临时缓存，中断后复用缓存继续。
- `storage_transfer_webdav_retry_reuses_stable_file_after_history_failure`：文件上传成功但 history 提交失败后，以同一路径继续，不创建重复文件。
- `storage_transfer_detects_source_changes_and_target_differences`：预览后来源变化仍被识别，目标不同内容可进入覆盖流程。
- `storage_transfer_supabase_target_verifies_remote_rows_and_storage_digest`：远端行缺失或 Storage 文件摘要不一致时批次失败，不误报完成。
- `storage_import_batch_resumes_without_duplicate_business_or_outbox_rows`：旧导入批次和中断任务可继续，业务行与 outbox 操作不重复。
- `imported_message_replaces_legacy_filename_for_same_message_id`：目标已存在相同稳定 `message_id` 但旧文件名不同的消息时，传输保留目标 revision、替换本地兼容文件名且不触发唯一约束。
- 传输状态会返回前 20 条失败/冲突项目的来源键和具体错误；进度页显示总体错误，完成页显示可滚动的异常详情及异常总数。
- `supabase_history_page_links_attachment_object_path_to_message`：切换到传输目标 Supabase 后，历史消息关联的附件 Storage 路径会回填到消息；旧缓存缺少路径时下载仍可从附件索引恢复。
- `imported_attachment_waits_for_message_and_repairs_missing_remote_message`：附件操作显式等待消息确认；模拟远端消息缺失后可自动补建消息操作，再以原附件 operation ID 和 Storage 路径继续。
- `supabase_attachment_message_not_found_restores_message_before_retry`：测试 RPC 真实返回 409 `MESSAGE_NOT_FOUND` 后，同一次同步先补写关联消息，再确认原附件元数据；待处理数归零，Storage 对象内容与路径不变。
- `stale_attachment_dependencies_follow_the_resolved_remote_message`：旧附件恢复依赖指向已结算消息冲突时，有效云端消息解除依赖继续上传，云端已删除消息则取消附件任务且不留下永久 pending。
- `batch_conflict_resolution_keeps_profile_and_account_scope_isolated`：当前账号的多条冲突一次采用云端版本，其他账号的冲突保持未解决。
- `batch_use_remote_merges_message_with_legacy_filename_by_message_id`：批量采用云端版本时，相同稳定消息 ID 即使本地与云端兼容文件名不同也合并为一条，保留设备缓存且不触发 SQLite 唯一约束。
- `batch_keep_local_creates_one_retry_per_entity_and_resolves_duplicates`：同一实体存在重复冲突时一次全部标记完成，并只创建一条基于最新远端 revision 的本地重试操作。
- `batch_keep_local_conflicts_pushes_all_entities_in_one_command`：一次“全部保留本地”命令为全部冲突实体生成重试，只触发一次同步，最终 Supabase 收到全部本地版本且 pending/conflict 均归零。
- 设置运行时测试确认冲突入口使用“全部使用云端 / 全部保留本地 / 取消”三按钮弹框，不再使用逐条 `window.prompt`。

## 旧数据升级验收

- 从真实应用目录只读快照 `settings.json` 和 `messages.sqlite` 到临时目录。
- 在副本上运行当前 Settings 规范化和 SQLite 迁移。
- 真实配置中的 5 个存储 profile ID、活动 profile、WebDAV 凭据字段和多个 Provider 配置均保持不变。
- 真实旧 `storage_import_*` 批次升级后可同时由旧 import API 和新 transfer API 读取，并能在副本中调用旧继续接口。
- Rust 忽略测试 `acceptance_real_legacy_settings_and_import_batches_upgrade_on_isolated_copy` 通过；正式应用目录未被写入。

## 清理和安全

- 写入前创建 `transfer_genie` Schema-only 备份并验证非空，SHA-256 为 `62a4d1291a589edc63797619bff2d5a5b12b013f5fce65c0423f4001788d62af`。
- Supabase Storage 临时对象清理后计数为 0；两个精确 UUID 的临时空间删除后计数为 0。
- 两个 WebDAV 临时目录已删除。
- 日志和验收记录未输出 WebDAV 密码、Supabase anon key、access token、refresh token 或数据库密码。

## 完成度审计补充

- `storage_transfer_preview_rebuilds_the_current_source_snapshot`：相同来源和目标重新检查时，以当前来源快照重建项目；新增、变化和删除均不会沿用旧计划状态。
- `storage_transfer_preview_recognizes_message_with_remapped_tags_as_skipped`：跨空间标签 ID 已映射的目标消息可正确识别为相同数据，不误报冲突。
- `storage_transfer_reuses_remote_supabase_tag_by_name`：本地尚无目标标签缓存时，按名称读取 Supabase 远端标签并复用真实 ID，不触发 `tags_active_name_idx` 409。
- `duplicate_tag_reconciliation_supersedes_old_operation_and_rewrites_messages`：Supabase `tag_apply` 返回同名唯一索引 409 后，旧操作会自动标记为已替代，保存远端标签 revision，并改写尚未发送消息的标签引用。
- `cancelling_storage_transfer_supersedes_unsent_outbox_and_removes_staged_rows`：放弃任务后，该批次尚未发送的 Supabase 操作停止执行，仅本地暂存且未确认的数据被清理。
- `storage_transfer_webdav_target_verifies_skipped_remote_file_digest`：WebDAV 跳过项仍会读取真实远端文件；同大小但摘要不同的损坏文件会被判定为失败。
- `resumable_storage_transfer_list_returns_all_unfinished_tasks`：多个待确认或中断任务可同时查询，取消其中一个不会隐藏其他任务。
- 真实浏览器用例确认：每次打开入口固定进入“选择空间”；多个未完成任务逐项展示；运行中关闭后再次打开不会自动跳转进度；完成页和任务卡可继续未完成项目。
- 完整验证通过：`cargo fmt -- --check`、`cargo check`、`cargo test`、`npm run build`、设置运行时测试、真实浏览器 UI smoke、OpenSpec strict validation 和 `git diff --check`。
