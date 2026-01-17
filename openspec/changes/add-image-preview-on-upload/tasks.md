# 任务：在上传前添加图片预览

1.  **规约变更 (Spec Delta):** 在 `openspec/changes/feature/add-image-preview-on-upload/specs/message-feed/spec.md` 中创建一个规约变更，以记录新需求。
2.  **前端:**
    -   修改 `frontend/main.js`:
        -   更新 `renderSelectedFiles` 函数以检查所选文件的文件类型。
        -   如果文件是图片，则创建一个 `img` 元素，并使用 `tauri.convertFileSrc()` 为图片预览生成一个可用的 URL。
        -   将 `img` 元素添加到 `.selected-file-item` 中。
    -   修改 `frontend/styles.css`:
        -   为所选文件列表中的图片预览添加样式。
3.  **验证:**
    -   手动测试新功能：
        -   验证选择图片文件时是否显示预览。
        -   验证选择非图片文件时是否不显示预览。
        -   验证图片预览的样式是否正确。
