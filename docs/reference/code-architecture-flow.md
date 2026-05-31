# 代码架构与流程

本文档梳理 Transfer Genie 的代码组织、模块职责和核心数据流，帮助你快速定位和调整代码。

## 项目目录

```text
transfer-genie/
+-- src/                           # Rust 后端
|   +-- main.rs                    # 入口 + Tauri 命令 + AppState + HTTP API + 本地备份
|   +-- webdav.rs                  # WebDAV 底层操作 (list/upload/download/delete/ensure_directory)
|   +-- db.rs                      # SQLite 持久化 (messages / download_history / upload_history / marked_tags / partial_downloads)
|   +-- history.rs                 # 远端历史索引 (manifest 分片 + legacy 单文件)
|   +-- filenames.rs               # 文件名编解码 + 时间桶路径
|   +-- telegram_bridge.rs         # Telegram Bridge 子进程主循环 (poll + 双向转发)
|   +-- telegram_bridge_runtime.rs  # Bridge 进程管理 (spawn/stop/refresh + 状态持久化)
|   +-- integration_runtime.rs     # 集成模块通用接口 (Sync/Bridge trait) + 状态序列化
|   +-- webdav_sync_runtime.rs      # WebDAV Sync 适配器 (status/cancel/refresh)
|   +-- types.rs                   # 全局结构体定义
|   +-- workspace.rs               # Workspace 目录布局 + 变更审计 + 快照管理
+-- src/bin/
|   +-- telegram_bridge.rs         # 独立二进制 (cargo run --bin telegram_bridge)
+-- frontend/                      # 静态前端
|   +-- index.html                 # 页面骨架 + Tab 结构
|   +-- main.js                    # 旧版 DOM 逻辑 (9000+ 行，含所有交互)
|   +-- vue-app.js                 # Vue 响应式桥接层 (store + shell 组件)
|   +-- styles.css                 # 全局样式
|   +-- components/                # Vue 页面组件
|   |   +-- home-page.js           # 首页 Tab
|   |   +-- marked-page.js         # 标记页 Tab
|   |   +-- settings-page.js       # 设置页 Tab
|   |   +-- downloads-page.js      # 传输页 Tab
|   +-- services/tauri-api.js      # invoke 指令封装 (按域分组)
|   +-- utils/
|   |   +-- feed-state.js          # 消息列表状态管理
|   |   +-- feed-view-model.js     # 消息卡片视图模型
|   |   +-- format.js              # 时间 / 字节格式化
|   |   +-- settings-form-runtime.js   # 设置表单运行时
|   |   +-- settings-ops-runtime.js    # 备份/恢复运行时
|   |   +-- settings-runtime-status.js # 状态文本映射
|   +-- lib/                       # 第三方库 (editor.md, marked, jquery, vue)
|   +-- icons/                     # SVG 图标
+-- tests/                         # Node 集成与单元测试
+-- docs/                          # VitePress 文档站
+-- openspec/                      # 规格与变更提案
+-- scripts/                       # 构建与发布脚本
+-- capabilities/                  # Tauri 权限声明
+-- tauri.conf.json                # 窗口、打包、更新配置
```

## AppState — 全局运行时状态

Rust 侧的核心是一个 `AppState` 结构体，通过 Tauri 的 State 注入到所有命令中：

| 字段 | 类型 | 用途 |
|-------|------|---------|
| `settings` | `Mutex<Settings>` | 全局设置，每次修改写回 `settings.json` |
| `sync_status` | `Mutex<SyncStatus>` | 当前同步状态 (running/idle/error) |
| `sync_guard` | `AsyncMutex<()>` | 防止并发同步 |
| `sync_cancel` | `Mutex<Option<oneshot::Sender>>` | 取消当前同步的信道 |
| `sync_loop_signal` | `watch::Sender<u64>` | 自动同步定时时钟 (保存设置时重置) |
| `http` | `Client` | 共享 reqwest HTTP 客户端 |
| `telegram_bridge` | `Mutex<TelegramBridgeManager>` | Bridge 子进程生命周期管理器 |
| `local_http_api` | `Mutex<LocalHttpApiManager>` | 本机 HTTP API 服务管理器 |
| `db_path` | `PathBuf` | `messages.sqlite3` 路径 |
| `files_base_dir` | `PathBuf` | 下载目录根路径 |

## 核心数据流

### 1. WebDAV 同步流程

```text
前端 refresh 按钮
  |
  v
Tauri 命令: refresh()
  |
  v
run_sync(state, source, force)
  |
  +-> load_history_for_sync()  --> WebDAV PROPFIND -> history/index.json -> history/shards/*.json
  |     解析出 HistoryEntry[] + tags
  |
  +-> list_entries(client, endpoint, "files/")  --> WebDAV PROPFIND -> 远端文件清单
  |     合并历史索引与远端文件列表
  |
  +-> 对比本地 DB (messages 表) 与远端列表
  |     +-- 新增消息  -> 下载文件 + 写入 DB
  |     +-- 已有消息  -> 条件下载 (支持断点续传)
  |     +-- 已删除消息 -> 可选清理本地 DB + 文件
  |
  +-> 更新 sync_status + 通知前端
```

关键函数：
- `run_sync` — 入口，处理锁和结果
- `perform_sync` — 实际同步逻辑 (initial / incremental)
- `download_file_stream_with_range` — 支持断点续传的流式下载
- `sync_loop_reset` — 自动同步间隔循环，由 `sync_loop_signal` 控制重置

### 2. 消息发送流程

```text
前端发送按钮
  |
  v
invoke('send_text', { content, sender, format, ... })
  或者
invoke('send_file', { path, sender, ... })
  |
  v
Tauri 命令
  |
  +-- 生成文件名: build_message_filename(sender, originalName, now_ms())
  |     格式: "{timestamp_ms}__{sender_urlencoded}__{nonce_hex}__{originalName}"
  |
  +-- 上传到 WebDAV: webdav::upload_file()
  |     路径: files/{YYYY}/{MM}/{filename}
  |
  +-- 更新远端历史: append_history() 或 save_history()
  |
  +-- 写入本地 DB: upsert_message() + 通知前端
```

**本机 HTTP API 入口**：
- `POST /api/send-text` — 外部程序可推送文本到 Transfer Genie
- `POST /api/send-file` — 外部程序可推送文件
- 两者最终都走相同的 `send_text_impl` / `send_file_impl` 内部路径

### 3. Telegram Bridge 双向转发

```text
+----------------------------------------------------+
|  telegram_bridge.rs (子进程)                      |
|                                                    |
|  主循环 run():                                  |
|    1. fetch_updates()  --> Telegram getUpdates      |
|    2. process_update():                            |
|       +-- 验证 chat_id                           |
|       +-- InboundPayload::Text -> 上传 WebDAV      |
|       +-- InboundPayload::File  -> 下载 +          |
|           上传 WebDAV                              |
|    3. sync_webdav_to_telegram():                   |
|       +-- load_history_with_layout()               |
|       +-- 跳过已发送 / 永久失败的消息          |
|       +-- 文本 -> send_message                     |
|          文件  -> send_document                    |
|                                                    |
|  状态文件: telegram-bridge-state.json            |
+----------------------------------------------------+
       |  通过 runtime.json 配置文件
+----------------------------------------------------+
|  main.rs (主进程)                                |
|                                                    |
|  TelegramBridgeManager:                            |
|    spawn_telegram_bridge_process()                  |
|    - 写 runtime.json (含 WebDAV 端点凭据)        |
|    - 启动子进程 (transfer-genie --telegram-bridge)|
|    - 刷新状态: refresh_telegram_bridge_manager()    |
|                                                    |
|  前端控制:                                      |
|    start_telegram_bridge -> spawn + 监控           |
|    stop_telegram_bridge  -> kill + 清理            |
+----------------------------------------------------+
```

### 4. 本机 HTTP API 服务

```text
前端设置 "启用本机 API"
  |
  v
start_local_http_api()  -> Axum Router 绑定 127.0.0.1:6011
  |
  +-- POST /api/send-text  -> LocalHttpApiSendTextRequest
  |     支持带标签 (markedOptions.marked + tagNames)
  |
  +-- POST /api/send-file  -> multipart 上传
        支持带标签 (markedOptions.marked + tagNames)
```

`LocalHttpApiManager` 持有 shutdown 信号和 `JoinHandle`，启停与设置切换联动。

### 5. 标记系统

```text
消息列表  -> 标记 / 取消标记
  |
  v
Tauri: mark_message / unmark_message
  |
  +-- 更新 DB: messages.marked = true/false
  +-- 更新 DB: messages.marked_tag_ids (JSON 数组)
  +-- 更新 DB: messages.marked_pinned
  |
  +-- 前端刷新: list_marked_messages / list_marked_tags

标签 CRUD:
  create_marked_tag -> DB: marked_tags 表
  delete_marked_tag -> DB: marked_tags 表 + 清理消息引用
  rename_marked_tag -> DB: marked_tags 表
```

### 6. 远端历史索引

两种存储布局，新版优先：

| 布局 | 路径 | 说明 |
|--------|------|-------------|
| Manifest | `history/index.json` + `history/shards/{YYYY-MM}.json` | 按月分片 |
| Legacy   | `history.json` | 单文件平铺 |

`load_history_for_sync` 使用条件下载 (ETag / Last-Modified) + 本地缓存 `workspace/endpoints/{id}/history-cache/` 加速增量同步。

## 前端架构

前端分两层：

1. **main.js** — 原生 DOM 交互层 (9000+ 行)：
   - 所有 `invoke` 调用
   - DOM 事件绑定、Tab 切换、消息列表渲染、搜索、标记操作
   - 通过 `window.transferGenieVue` 的 `syncXxx` 方法桥接数据到 Vue

2. **vue-app.js + components/** — Vue 2 响应式层：
   - `store` 是 `Vue.observable` 全局状态
   - 四个 shell 组件：home-page-shell、marked-page-shell、downloads-page-shell、settings-page-shell
   - 通过 `syncXxx` 系列方法从 main.js 同步状态
   - 通过 `actions` 字典回调到 main.js 的函数

数据流：

```text
Rust Tauri 命令
  |
  v
main.js invoke() 调用
  |
  +-- 更新本地变量 (lastMessages, syncStatus, ...)
  +-> 同步到 Vue: vueBridge.syncHomeFeed(state)
  |     -> Vue store.homeFeed = state
  |     -> Vue 组件自动响应渲染
  |
  +-> 用户操作 -> invoke -> Rust -> 返回 -> 刷新
```

**tauri-api.js** 是前端与 Rust 之间的薄封装层，按域分组：
- `settingsApi` — 设置读写 / 导入导出 / 快照 / 备份状态
- `syncApi` — 同步状态 / 测速 / 端点切换
- `messageApi` — 消息增删查 + 打开/下载
- `markedApi` — 标记消息 / 标签 CRUD
- `transferApi` — 上传下载历史
- `backupApi` — WebDAV 备份恢复 / 清理
- `telegramApi` — Bridge 启停 / 状态 / 发现聊天
- `localHttpApi` — 本机 API 状态
- `appApi` — 版本 / 更新 / 窗口 / 目录打开

## 数据持久化

### SQLite (`messages.sqlite3`)

| 表 | 主键 | 用途 |
|-------|-------------|---------|
| `messages` | `(endpoint_id, filename)` | 消息元数据与内容 |
| `marked_tags` | `(endpoint_id, id)` | 标签目录 |
| `download_history` | `id` (自增) | 下载记录 |
| `upload_history` | `id` (自增) | 上传记录 |
| `partial_downloads` | `(endpoint_id, filename)` | 断点续传中间状态 |

迁移路径：`init_db` 自动处理 `legacy` → `endpoint_id` 分区，然后增量补齐 `file_hash`、`remote_path`、`marked`、`marked_tag_ids`、`marked_pinned`、`format` 等列。

### Workspace 磁盘文件

`WorkspaceLayout` 管理以下目录：

```text
{app_data}/
+-- settings.json                   # 全局设置
+-- messages.sqlite3                 # 消息数据库
+-- workspace/
|   +-- endpoints/{id}/             # 各端点本地缓存
|   |   +-- history-cache/          # 远端历史缓存 + etag 元数据
|   +-- change-log/events.jsonl     # 审计日志 (JSONL)
|   +-- backups/                    # 本地备份记录
|   +-- mirrors/                    # 数据镜像
|   +-- snapshots/                  # 文件变更快照 (最多保留 20 份)
|   +-- runtime/                    # 运行时临时文件
|   +-- plugins/
|       +-- telegram-bridge/       # Bridge 子进程目录
|       |   +-- runtime.json        # 运行时配置 (含 WebDAV 凭据)
|       |   +-- state.json          # Bridge 状态 (last_update_id / outbound_messages)
|       +-- module-status.json      # 模块状态汇总
```

每次写文件通过 `workspace::write_json_with_audit_at` / `write_bytes_with_audit_at` 会自动：
1. 快照旧文件到 `snapshots/{category}/...`
2. 原子写（先写 `.tmp` 再 rename）
3. 追加审计记录到 `change-log/events.jsonl`

## Tauri 命令一览

| 域 | 命令 | 说明 |
|----|------|------|
| 设置 | `get_settings` / `save_settings` | 读写设置 |
| 设置 | `export_settings` / `import_settings` | 加密导出/导入 |
| 设置 | `list_settings_snapshots` / `restore_settings_snapshot` | 设置快照 |
| 设置 | `save_send_hotkey` | 保存发送快捷键 |
| 同步 | `refresh` / `cancel_refresh` / `get_sync_status` | 同步控制 |
| 同步 | `test_webdav_speed` | 端点测速 |
| 同步 | `switch_endpoint` | 切换活跃端点 |
| 消息 | `list_messages` / `list_messages_window` | 分页/游标查询 |
| 消息 | `send_text` / `send_file` / `send_file_data` | 发送消息 |
| 消息 | `delete_messages` / `cleanup_messages` | 删除/清理 |
| 标记 | `mark_message` / `unmark_message` | 标记/取消标记 |
| 标记 | `list_marked_messages` / `set_marked_messages_tags` | 标记消息列表 |
| 标记 | `toggle_marked_message_pin` | 置顶/取消置顶 |
| 标签 | `list_marked_tags` / `create_marked_tag` / `delete_marked_tag` / `rename_marked_tag` | 标签 CRUD |
| 下载 | `download_message_file` / `save_message_file_as` | 下载/另存为 |
| 下载 | `open_message_file` / `get_thumbnail` | 打开/缩略图 |
| 历史 | `list_download_history` / `list_upload_history` | 传输历史 |
| 历史 | `clear_download_history_records` / `clear_upload_history_records` | 清除记录 |
| 备份 | `backup_webdav` / `restore_webdav` | WebDAV 备份恢复 |
| 备份 | `list_local_backup_archives` / `get_auto_backup_status` | 备份归档 |
| Bridge | `start_telegram_bridge` / `stop_telegram_bridge` / `get_telegram_bridge_status` | Bridge 控制 |
| Bridge | `discover_telegram_chats` | 发现 Telegram 聊天 |
| HTTP API | `get_local_http_api_status` | 本机 API 状态 |
| 系统 | `get_app_version` / `check_app_update` / `download_and_install_update` | 版本与更新 |
| 系统 | `restart_app` / `minimize_window` / `open_url` | 窗口控制 |
| 系统 | `open_data_dir` / `open_log_dir` / `open_download_dir` / `choose_download_dir` | 目录打开 |
| 集成 | `list_integration_modules` | 模块状态 |
| 集成 | `save_local_data` | 保存本地文件 |

## 关键设计决策

1. **多端点 WebDAV** — `Settings.webdav_endpoints` 是 `Vec<WebDavEndpoint>`，活跃端点由 `active_webdav_id` 指定。所有 list/download/upload 操作通过 `resolve_active_endpoint` 拿到当前端点。

2. **消息文件名编码** — 格式 `{timestamp_ms}__{sender_urlencoded}__{nonce_hex}__{original_name}`，保证可排序、可解析、全局唯一。远端按 `files/{YYYY}/{MM}/` 分桶存储。

3. **Manifest 历史索引** — 从单调 `history.json` 迁移到 `history/index.json` + `history/shards/{YYYY-MM}.json` 分片格式。`load_history_for_sync` 优先读 Manifest，回退到 Legacy。

4. **断点续传** — 下载记录存在 `partial_downloads` 表，`download_file_stream_with_range` 支持 Range 请求续传。`DownloadTransferMode` 区分 fresh / resumed / restarted。

5. **Bridge 子进程模式** — Telegram Bridge 不是线程而是独立子进程，通过 `runtime.json` 传递配置（含 WebDAV 凭据），通过 `state.json` 维护偏移量。主进程 `TelegramBridgeManager` 监控子进程存活并刷新状态。

6. **设置加密导出** — `export_settings` 使用 PBKDF2 派生密钥 + AES-256-GCM 加密，确保 WebDAV/Telegram 凭据安全。

7. **Vue 桥接模式** — 前端核心逻辑在 `main.js`，Vue 层作为可选渲染壳。`main.js` 通过 `window.transferGenieVue` 的 `sync*` 方法推送数据，Vue 组件通过 `actions` 回调 `main.js` 函数。这允许渐进迁移到 Vue。

## 如何添加新功能

- **新 Tauri 命令**：在 `main.rs` 加 `#[tauri::command]` 函数，然后在 `invoke_handler` 列表注册。
- **新 DB 列**：在 `db.rs` 的 `init_db` 添加迁移逻辑，增加 `has_xxx` 检测 + `ALTER TABLE ADD COLUMN`。
- **新前端 Tab**：在 `index.html` 加 Tab 按钮 + 面板元素，在 `main.js` 加 Tab 切换逻辑，在 `vue-app.js` 加对应 `syncXxx` 方法和 shell 组件。
- **新集成模块**：参照 `integration_runtime.rs` 的 `SyncModuleRuntime` / `BridgeModuleRuntime` trait，在 `main.rs` 注册状态，前端通过 `list_integration_modules` 查询。
