## 1. 历史变更基础能力

- [x] 1.1 在 `src/history.rs` 增加 manifest 索引加载 helper，使其能在不下载所有分片的情况下返回 shard refs。
- [x] 1.2 增加按 shard key/path 加载、规范化、去重、排序和序列化单个 manifest 分片的 helper。
- [x] 1.3 增加根据分片条目重新计算单个 `HistoryShardRef` 的 helper，包括 count 和时间戳边界。
- [x] 1.4 增加按分片作用域的 append/upsert API，只写受影响分片，并且仅在 shard ref 变化时更新 `history/index.json`。
- [x] 1.5 增加按 filename 删除的分片级 API，只写包含被删除条目的分片，并更新或移除空分片 ref。
- [x] 1.6 增加分片级元数据更新 API，用于标记/取消标记、标签分配和置顶变更。
- [x] 1.7 增加 tags-only 写入 API，用于不修改消息条目的标签创建/重命名操作。
- [x] 1.8 保留现有全量 `save_history` 路径，用于遗留历史转换、修复、恢复和全量重建流程。

## 2. 缓存与兼容处理

- [x] 2.1 保留遗留 `history.json` 读取行为，并在写入需要迁移时转换为 manifest 布局。
- [x] 2.2 检测缺失或损坏的 manifest 分片引用；若修复失败，应回退到全量 manifest 重建并给出清晰错误路径。
- [x] 2.3 局部写入后，对受影响分片、`history/index.json` 和 `history/tags.json` 的本地 history-cache 元数据执行失效化或刷新。
- [x] 2.4 确保局部写入继续保留现有规范化逻辑，包括 `remote_path`、`format`、排序后的 tag ids 和去重 filename。

## 3. 主应用调用点

- [x] 3.1 将文本/文件发送持久化替换为分片级 append/upsert 历史写入。
- [x] 3.2 将标记/取消标记和置顶切换流程替换为分片级元数据更新。
- [x] 3.3 将批量标记标签分配替换为按分片分组的局部更新。
- [x] 3.4 将创建/重命名标记标签流程替换为 tags-only 写入。
- [x] 3.5 将删除标签流程替换为 tags-only 写入，并且只对引用了被删除标签的条目所在分片执行清理。
- [x] 3.6 将远端删除和清理历史移除逻辑替换为按 filename 的分片级删除写入。
- [x] 3.7 更新同步修复逻辑：缺失历史条目通过 append/upsert 写入发现条目，不重写无关分片。

## 4. Telegram Bridge 调用点

- [x] 4.1 将 Telegram 入站文本/文件历史追加调用替换为分片级 append/upsert 写入。
- [x] 4.2 更新 WebDAV 到 Telegram 的历史派生修复逻辑，使新派生条目尽可能通过分片级 mutation 写入。
- [x] 4.3 对遇到遗留或不一致远端历史的 Bridge 流程，保留全量重建回退路径。

## 5. 测试与验证

- [x] 5.1 增加单元测试，覆盖 shard key 选择、shard ref 重算、空分片移除、时间戳变化导致条目跨分片移动。
- [x] 5.2 增加 history mutation 测试，证明 append/upsert 只写受影响 shard path 和必要的 index/tag path。
- [x] 5.3 增加测试，证明标记/取消标记、置顶、标签分配不会上传无关分片。
- [x] 5.4 增加测试，证明标签创建/重命名只写 `history/tags.json`。
- [x] 5.5 增加测试，证明遗留 `history.json` 仍可读取，并在写入时转换为 manifest。
- [x] 5.6 运行 `cargo test` 以及本次变更新增的 history/sync 聚焦测试。
