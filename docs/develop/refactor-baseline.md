# 重构基线与兼容约束

本文档对应 OpenSpec 变更 `refactor-vue-local-plugin-architecture`，用于在重构期间固定当前功能边界、命令面、数据落盘方式与兼容约束。

## 1. 当前前端视图清单

当前桌面端仍以 `frontend/index.html` + `frontend/main.js` 为主入口，已引入 `frontend/vue-app.js` 作为 Vue 2 过渡壳层。

- 首页 `home`
  - 消息流列表
  - 搜索、刷新、滚动加载更多
  - 选择模式、批量删除
  - 文本 / Markdown 发送
  - 文件发送、拖拽上传
  - 标记、预览、下载、打开文件
- 标记页 `marked`
  - 标记消息列表
  - 标记标签筛选、搜索、分页
  - 批量标签、批量删除、置顶
- 下载页 `downloads`
  - 下载任务列表
  - 上传历史 / 下载历史切换
  - 批量删除、重试、另存、打开目录
- 设置页 `settings`
  - WebDAV 端点管理
  - 基础设置、系统设置、HTTP API 设置
  - Telegram Bridge 配置与启停
  - 集成模块概览
  - 配置导入导出
  - 本地设置快照查看与恢复
  - WebDAV 备份与恢复
  - 打开数据目录 / 日志目录

## 2. 当前 Tauri 命令面

以下命令仍是前端兼容边界，Vue 2 迁移期间不应随意改名、删除或改变返回结构。

### 2.1 设置与运行状态

- `get_settings`
- `save_settings`
- `export_settings`
- `import_settings`
- `get_sync_status`
- `get_local_http_api_status`
- `get_telegram_bridge_status`
- `list_integration_modules`
- `get_app_version`
- `check_app_update`
- `download_and_install_update`
- `restart_app`

### 2.2 消息与同步

- `refresh`
- `cancel_refresh`
- `list_messages_window`
- `list_marked_messages`
- `send_text`
- `send_file`
- `send_file_data`
- `delete_messages`
- `cleanup_messages`
- `open_message_file`
- `download_message_file`
- `save_message_file_as`
- `get_thumbnail`

### 2.3 标记能力

- `list_marked_tags`
- `create_marked_tag`
- `rename_marked_tag`
- `delete_marked_tag`
- `mark_message`
- `unmark_message`
- `set_marked_messages_tags`
- `toggle_marked_message_pin`

### 2.4 传输历史与目录操作

- `list_download_history`
- `list_upload_history`
- `delete_download_history`
- `clear_download_history_records`
- `clear_upload_history_records`
- `redownload_download_history`
- `save_download_history_as`
- `open_download_history_dir`
- `open_download_history_file`
- `open_download_dir`
- `open_log_dir`
- `open_data_dir`

### 2.5 WebDAV / Telegram / 本地数据辅助

- `test_webdav_speed`
- `discover_telegram_chats`
- `start_telegram_bridge`
- `stop_telegram_bridge`
- `backup_webdav`
- `restore_webdav`
- `list_settings_snapshots`
- `restore_settings_snapshot`
- `save_local_data`
- `open_url`
- `minimize_window`

## 3. 当前本地数据与运行目录

### 3.1 根级本地数据

应用当前以 app data 根目录 + 新的 `workspace/` 结构并存，兼容读取旧位置。

- `settings.json`
  - 应用设置主文件
- `messages.sqlite`
  - SQLite 消息与状态数据库
- `workspace/change-log/events.jsonl`
  - 追加写入的本地变更事件日志
- `workspace/backups/`
  - 自动备份状态与按端点归档的备份产物
- `workspace/plugins/module-status.json`
  - 内置模块状态汇总

### 3.2 端点级本地数据

每个 WebDAV 端点在 `workspace/endpoints/<endpoint-id>/` 下维护本地数据。

- `files/`
  - 端点镜像文件与业务文件落地目录
- `history-cache/`
  - 历史缓存与索引
- `change-log/`
  - 端点级变更记录
- `mirrors/`
  - 可恢复的本地镜像
- `snapshots/`
  - 历史快照集合

### 3.3 插件化运行目录

当前已开始按内置模块隔离运行态目录。

- `workspace/plugins/webdav-sync/`
  - WebDAV 同步模块状态文件
- `workspace/plugins/telegram-bridge/`
  - Telegram Bridge 运行时状态与配置产物
- `workspace/plugins/<module-id>/status.json`
  - 单模块状态快照

## 4. 当前兼容约束

### 4.1 设置兼容

- `save_settings` / `get_settings` 的字段语义保持不变。
- 旧位置设置文件仍需可读，并迁移到新 workspace 结构时不要求用户手工操作。
- 保存设置后必须继续触发现有副作用：
  - 活动端点切换
  - 刷新定时器重置
  - 本地 HTTP API 重载
  - Telegram Bridge 按原规则自动重启 / 自动启动
  - 集成模块状态刷新

### 4.2 消息历史兼容

- WebDAV 仍是主数据来源，不改变用户同步路径。
- 首页、标记页、下载页继续复用现有命令返回结构。
- 首页滚动加载已改为基于边界窗口的稳定分页，后续改造不得退回 offset 合并模型。
- 删除、搜索、刷新、端点切换后，消息流状态必须保持一致，不能出现重复、缺失或“加载不出来”。

### 4.3 下载与文件兼容

- 已下载文件、本地历史记录和另存逻辑保持现有使用方式。
- 任何本地镜像、快照、备份增强都不能改变用户现有下载目录的含义。
- 文件预览、缩略图、重新下载、打开目录能力保持不变。

### 4.4 WebDAV 同步兼容

- `refresh` / `cancel_refresh` / `get_sync_status` 的调用方式保持不变。
- WebDAV 端点配置、测速、启用禁用、活动端点切换行为保持不变。
- 模块化改造只能改变内部组织方式，不能改变用户配置方式与同步语义。

### 4.5 Telegram Bridge 兼容

- 用户仍通过设置页配置 Bot Token、Chat ID、代理、轮询间隔与自动启动。
- Bridge 仍跟随当前活动 WebDAV 端点。
- 启动、停止、自动发现 Chat ID、状态轮询与自动重启行为保持兼容。
- 插件化后只允许隔离运行目录与生命周期管理，不允许改变消息桥接方向和补发策略。

### 4.6 本地历史 / 快照 / 备份兼容

- 所有新增快照、变更记录、备份均存放本地。
- 历史恢复必须是可回退、可审计的。
- 新增机制不能破坏现有导入导出、备份恢复与消息读写流程。

## 5. 当前阶段结论

- 首页稳定分页、本地 workspace、变更日志、快照保留、定时备份、模块状态持久化已经落地。
- Vue 2 目前已完成应用壳层、集成模块概览、设置快照面板等过渡。
- WebDAV 与 Telegram Bridge 已建立 runtime contract，但核心执行逻辑仍有部分留在 `src/main.rs`，后续需要继续下沉。
