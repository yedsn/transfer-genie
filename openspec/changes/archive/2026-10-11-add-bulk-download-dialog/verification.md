# Verification

## Automated verification

- `cargo test`：通过；Rust 查询、状态解析、下载核心和既有测试均通过。
- `node tests/test_bulk_download_runtime.js`：通过。
- `node tests/test_speech_to_text_ui_smoke.js`：通过；覆盖弹窗、五种视图、分页、跨页选择、刷选、框选、全选、队列和失败继续。
- `npm run build`：通过。
- `openspec validate add-bulk-download-dialog --strict`：通过。
- 项目没有统一的 Node 测试命令。额外遍历 `tests/test_*.js` 时，既有 `tests/test_feed_state.js` 仍引用已删除的 `frontend/feed-state.js`，该旧测试基础设施问题与本变更无关。

## Desktop manual verification

### Environment

- Date: 2026-10-10 (Asia/Shanghai)
- Application: Transfer Genie v0.4.39, Tauri debug window
- Launch command: `npm run tauri -- dev --no-watch`
- Active endpoint: `Seafile` (`endpoint-acb931406972dd4d`)
- Download directory: `D:\Downloads`
- Real indexed resources: 280 total; image 22, audio 255, video 3, ordinary file 0; five pages at 60 items per page.

### Steps and results

1. Opened the bulk-download dialog from the homepage `下载` button. The large modal opened without page navigation, showed newest-first resources, category counts, search, format filter, page-size control, pagination, view menu, download-directory action and fixed footer.
2. Switched through `平铺`, `详细信息`, `列表`, `小图标` and `大图标` in the real desktop window. All five layouts rendered and retained the current filter/page context.
3. Long-pressed the first audio tile for approximately 450 ms and dragged across the adjacent tile. Both resources became selected; the footer reported `已选择 2 项 · 1.4 MB` and `预计新下载 2`.
4. Navigated from page 1 to page 2. The footer still reported the same two selected resources, confirming cross-page selection retention.
5. In a grid view, dragged a marquee from content-area whitespace across rendered cards. Intersecting items received the preview border and the previously selected count remained unchanged.
6. Opened the audio category, selected the 768 KB speech source audio `speech-1791554606457.wav`, and submitted it. The modal closed and the transfer page reported the task as `已完成`.
7. Confirmed the downloaded file exists at `D:\Downloads\20261009_speech-1791554606457.wav`, size 786,476 bytes. This verifies source-audio reuse of the existing naming, task-state, history and download-directory flow.
8. Opened the image category and confirmed 22 real image records and downloaded-state rendering. Opened the video category and confirmed three real records: `IMG_7786.MOV`, `IMG_7787.MP4`, and `telegram-1674.mp4`; the last record showed `已下载`.
9. Temporarily switched through every other configured endpoint to look for ordinary-file data. `Seafile（BK100-zerotier）` contained zero indexed resources; `Seafile（BK100-WG）` contained 38 resources (image 2, audio 35, video 1, ordinary file 0); `Seafile（BK100-Local）` contained zero indexed resources. Restored the original `Seafile` endpoint after the read-only check.

### Evidence

- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\bulk-dialog-desktop-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-view-details-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-view-list.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-view-small-icons.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-view-large-icons.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-brush-page1-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-cross-page-selection-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-marquee-video-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-one-audio-selected.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-download-tasks.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-video-category-actual.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\desktop-alt-endpoint-dialog.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\endpoint-index-1-dialog.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\endpoint-index-2-dialog.png`
- `C:\Users\yedsn\.codex\visualizations\2026\10\09\01a120e3-76be-7870-930c-56a9b7e6a189\endpoint-index-3-dialog.png`

## Remaining manual-verification gap

The available real desktop data did not contain any ordinary-file resource. All four configured endpoints were checked: the active endpoint reported `文件 0`; two alternate endpoints contained zero indexed resources; the remaining alternate endpoint contained 38 media resources but also reported `文件 0`. Therefore the image, audio and video branches, the five views, cross-page brush selection, grid marquee selection, task page and actual download directory were manually verified, but the ordinary-file branch could not be exercised against real endpoint data without uploading or altering the user's remote data. Task 5.3 remains unchecked until a real ordinary-file record is available and the same selection/download steps can be repeated for it.
