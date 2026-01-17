# 任务：添加图片缩略图与增强预览

1.  **Backend: Add dependencies**
    -   Modify `Cargo.toml` to add the `image` crate (e.g., version `0.24`).
2.  **Backend: Thumbnail Logic**
    -   In `src/webdav.rs` or `src/utils.rs`, implement a helper `generate_thumbnail(data: &[u8]) -> Result<Vec<u8>, String>`.
    -   Update `send_file` and `send_file_data` in `src/main.rs`:
        -   Detect if the file is an image (by extension or mime type).
        -   If image, call `generate_thumbnail`.
        -   Upload the thumbnail to `files/.thumbs/<filename>`.
3.  **Backend: Get Thumbnail Command**
    -   Implement `get_thumbnail` command in `src/main.rs`.
    -   It should check a local cache directory (e.g., `app_data/thumbnails`).
    -   If not found, try to download from WebDAV `files/.thumbs/<filename>`.
    -   Return the local path.
4.  **Frontend: Message List Thumbnails**
    -   Modify `frontend/main.js`:
        -   In `renderMessages`, identify image messages.
        -   Call `invoke('get_thumbnail', ...)` for them.
        -   Update the message card DOM to display the thumbnail instead of the generic file icon.
        -   Add CSS for message thumbnails (`frontend/styles.css`).
5.  **Frontend: Fullscreen Preview**
    -   Modify `openMessagePreview` in `frontend/main.js`:
        -   If the message is an image and we have a local path (either original or we can download it), display it.
        -   For the "original image" requirement:
            -   Ideally, `openMessagePreview` should show the original.
            -   If original not downloaded, show a "Download to Preview" button or auto-download to temp? Auto-download to temp seems best for "Preview".
            -   Let's implement `preview_image_file` command that downloads to temp if needed and returns path.
    -   Update `renderSelectedFiles` in `frontend/main.js` to add `dblclick` event listener to open the preview.
6.  **Verification**
    -   Test uploading an image -> Verify `.thumbs` creation on server (simulated).
    -   Test message list -> Verify thumbnail appears.
    -   Test preview -> Verify full image appears.
