# WebDAV 备份与恢复优化设计

## 核心问题

当前 `src/main.rs` 中的 `backup_webdav` 和 `restore_webdav` 使用了全量内存加载的方式：
-   **备份**: `webdav::download_file` 返回 `Vec<u8>`。
-   **恢复**: `fs::read(&path)` 读取整个 Zip 文件到 `Vec<u8>`；`archive.by_index(i)` 读取 Zip Entry 到 `Vec<u8>`。

这在文件较小（如几 MB）时工作良好，但当备份包含大文件（如 100MB+）或总大小较大时，会导致严重的内存压力。

## 解决方案：流式处理

由于 `zip` crate 是同步的（synchronous），而 WebDAV 客户端 (`reqwest`) 是异步的，我们需要一种桥接方案。

### 1. 备份 (Download -> Zip)

**策略**:
由于 `zip` crate 的 `start_file` 和 `write` 都是同步阻塞操作，我们不能直接在 async 运行时中长时间阻塞。
方案是使用 `tokio::task::spawn_blocking` 将 Zip 写入操作放在阻塞线程中。

**流程**:
1.  主线程 (Async) 遍历文件列表。
2.  对每个文件，发起 `reqwest` 流式下载 (`response.bytes_stream()`)。
3.  通过 `mpsc::channel` 将下载的数据块 (Chunks) 发送到一个阻塞任务中。
4.  阻���任务持有 `zip::ZipWriter`，接收数据块并写入 Zip。

或者，为了简化，我们可以不使用 Channel，而是直接在 `spawn_blocking` 内部进行“下载到 writer”的操作？
不，下载是 async 的。
混合 Async/Sync 的常见模式是：
-   创建一个 `Sync` 的 Writer (例如实现了 `std::io::Write` 的适配器)，该适配器内部阻塞地等待 Async 数据，或者反过来。
-   但在 Tauri/Tokio 环境下，更好的方式可能是：
    -   按顺序处理每个文件。
    -   对于每个文件，读取一部分（Chunk），写入 Zip。
    -   由于 `ZipWriter` 需要 `Write` trait，我们可以实现一个简单的 buffer 或者分块写入。
    -   **更简单的方案**: 使用临时文件。
        -   下载文件 -> 临时文件 (Stream to Disk)。
        -   ZipWriter -> 读取临时文件写入 Zip (Stream form Disk)。
        -   删除临时文件。
        -   这样避免了内存问题，但增加了 IO。
    -   **内存优化方案**:
        -   下载 Chunk -> 写入 Zip。
        -   这需要 `reqwest` 的流能被“拉”动，同时 `zip` 写入。
        -   由于 `zip` 是同步的，我们可以在 `spawn_blocking` 里运行 `zip` 写入逻辑，但数据源必须来自 async。
        -   可以使用 `tokio_util::io::SyncIoBridge` (如果有) 或者自己实现一个桥接。

**推荐方案 (简单可靠)**:
为了避免复杂的 Async/Sync 桥接导致的死锁，且考虑到备份不仅是内存问题也是稳定性问题：
1.  **流式下载到临时目录**：将远程文件流式下载到本地临时文件。
2.  **流式写入 Zip**：将临时文件流式写入 Zip（使用 `std::io::copy`）。
3.  **清理**：删除临时文件。
这样虽然是两步 IO，但实现简单，且彻底解决了内存问题。对于超大文件，磁盘空间通常比内存充裕。

### 2. 恢复 (Zip -> Upload)

**策略**:
1.  **流式读取 Zip**: 使用 `fs::File` 打开 Zip 包，而不是 `fs::read`。
2.  **流式上传**: `reqwest` 支持 `Body::wrap_stream`。
3.  **难点**: `zip` crate 的 `ZipArchive` 需要 `Read + Seek`。`fs::File` 满足。
    -   当你调用 `archive.by_index(i)` 得到一个 file reader。
    -   你需要将这个 synchronous reader 转换为 async stream 传给 `reqwest`。
    -   可以使用 `tokio::task::spawn_blocking` 读取 chunk，然后发给 channel，再封装成 Stream。

**具体实现细节**:
-   创建一个 `AsyncStream` 适配器，它在底层使用 `spawn_blocking` 从 `zip::read::ZipFile` 读取数据块。
-   将此 Stream 传给 `reqwest::Body::wrap_stream`。

### 3. 进度反馈

-   定�� Tauri Event: `webdav-backup-progress`, `webdav-restore-progress`.
-   Payload: `{ filename: string, current: number, total: number, state: "scanning" | "downloading" | "zipping" | "uploading" | "finished" | "error" }`
-   在循环处理文件和流传输过程中触发这些事件。

## 任务分解

详见 `tasks.md`。
