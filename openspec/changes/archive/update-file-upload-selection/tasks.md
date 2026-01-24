# 任务：更新文件上传选择机制

1.  **规约变更 (Spec Delta):** 在 `openspec/changes/update-file-upload-selection/specs/message-feed/spec.md` 中创建一个规约变更，以记录新需求。
2.  **前端:**
    -   修改 `frontend/main.js`:
        -   更新 `sendFile` 函数（将被重命名或重新调整用途），以使用 `openDialog({ multiple: true })` 处理多文件选择。
        -   引入一个全局数组 `let selectedFiles = [];` 以保存用户选择的文件的路径。
        -   创建一个函数 `renderSelectedFiles()`，用于在界面中显示 `selectedFiles` 的内容。每当 `selectedFiles` 更改时，都应调用此函数。
        -   渲染的文件列表应出现在文本输入区域下方。每个列表项都应有一个“移除”按钮，点击该按钮可将文件从 `selectedFiles` 数组中移除并重新渲染列表。
        -   修改主消息发送逻辑。当用户点击“发送”时，它应该：
            -   发送输入字段中的文本（如果有）。
            -   遍历 `selectedFiles` 数组，并为每个文件调用 `invoke('send_file', ...)`。
            -   发送后清除 `selectedFiles` 数组和所选文件的界���。
    -   修改 `frontend/index.html`:
        -   在文本输入区域下方添加一个容器元素，以容纳所选文件的列表（例如 `<div id="selected-files-container"></div>`）。
    -   修改 `frontend/styles.css`:
        -   为所选文件容器、单个文件项以及每个文件的“移除”按钮添加样式。
3.  **验证:**
    -   手动测试新功能：
        -   验证是否可以选择多个文件。
        -   验证所选文件是否正确显示。
        -   验证是否可以从选择中移除文件。
        -   验证发送消息是否会上传所有选定的文件。
        -   验证是否仍然可以在没有文件的情况下发送纯文本消息。