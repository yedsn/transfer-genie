# 任务列表

-   [x] 1.0 **后端基础**: 扩展 `webdav` 模块以支持流式操作
    -   [x] 1.1 实现 `download_file_stream`，返回 `impl Stream<Item = Result<Bytes, ...>>` 或类似。
    -   [x] 1.2 ��现 `upload_file_stream`，接受 `Body` 或 `Stream`。
-   [x] 2.0 **后端重构**: `backup_webdav`
    -   [x] 2.1 修改为使用 `std::fs::File` 作为 Zip 输出，而不是内存 Buffer (虽然当前已是 File，但中间过程需优化)。
    -   [x] 2.2 实现“下载到临时文件 -> 写入 Zip -> 删除临时文件”的流程，或者实现流式桥接。
    -   [x] 2.3 添加进度事件发射 (`emit_backup_progress`)。
-   [x] 3.0 **后端重构**: `restore_webdav`
    -   [x] 3.1 修改为使用 `fs::File` 打开 Zip。
    -   [x] 3.2 实现 Zip Entry 到 WebDAV Upload 的流式适配 (Sync Read -> Async Stream)。
    -   [x] 3.3 添加进度事件发射 (`emit_restore_progress`)。
-   [x] 4.0 **前端更新**:
    -   [x] 4.1 在设置页面监听 `webdav-backup-progress` 和 `webdav-restore-progress`。
    -   [x] 4.2 显示进度条或状态文本。
    -   [x] 4.3 优化错误提示。