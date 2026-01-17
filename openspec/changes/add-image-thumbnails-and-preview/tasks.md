# 任务：添加图片缩略图与增强预览

1.  **后端：添加依赖**
    -   修改 `Cargo.toml` 添加 `image` crate（例如版本 `0.24`）。
2.  **后端：缩略图逻辑**
    -   在 `src/webdav.rs` 或 `src/utils.rs` 中，实现辅助函数 `generate_thumbnail(data: &[u8]) -> Result<Vec<u8>, String>`。
    -   更新 `src/main.rs` 中的 `send_file` 和 `send_file_data`：
        -   检测文件是否为图片（通过扩展名或 MIME 类型）。
        -   如果是图片，调用 `generate_thumbnail`。
        -   将缩略图上传至 `files/.thumbs/<filename>`。
3.  **后端：获取缩略图命令**
    -   在 `src/main.rs` 中实现 `get_thumbnail` 命令。
    -   检查本地缓存目录（例如 `app_data/thumbnails`）。
    -   如果未找到，尝试从 WebDAV `files/.thumbs/<filename>` 下载。
    -   返回本地路径。
4.  **前端：消息列表缩略图**
    -   修改 `frontend/main.js`：
        -   在 `renderMessages` 中，识别图片消息。
        -   对它们调用 `invoke('get_thumbnail', ...)`。
        -   更新消��卡片 DOM 以显示缩略图，而不是通用文件图标。
        -   添加 CSS 样式 (`frontend/styles.css`)。
5.  **前端：全屏预览**
    -   修改 `frontend/main.js` 中的 `openMessagePreview`：
        -   如果消息是图片且有本地路径（原图或可下载），则显示它。
        -   针对“原图”需求：
            -   理想情况下，`openMessagePreview` 应显示原图。
            -   如果原图未下载，显示“下载预览”按钮或自动下载到临时目录？自动下载到临时目录似乎更适合“预览”。
            -   实现 `preview_image_file` 命令，需要时下载到临时目录并返回路径。
    -   更新 `frontend/main.js` 中的 `renderSelectedFiles`，添加 `dblclick` 事件监听器以打开预览。
6.  **验证**
    -   测试上传图片 -> 验证服务器上 `.thumbs` 的创建。
    -   测试消息列表 -> 验证缩略图显示。
    -   测试预览 -> 验证显示完整图片。