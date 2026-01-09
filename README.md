# Transfer Genie

基于 WebDAV 的跨平台文件与文本传输助手（Tauri + Rust）。

## 功能
- WebDAV 目录作为共享消息存储
- 聊天式消息列表（显示发送者、时间、大小）
- 发送文本与文件
- 自动同步与手动刷新
- 本地 SQLite 索引

## 开发环境
请参考：`docs/setup.md`

## 启动开发

安装 Tauri CLI：

```
cargo install tauri-cli --locked
```

启动开发：

```
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

如果出现 `no such command: tauri`：
- 确认已安装 Tauri CLI：`cargo --list | rg tauri`
- 重开终端后再运行命令

## 目录结构
- `src-tauri/` Tauri 后端（Rust）
- `frontend/` 前端页面（HTML/CSS/JS）
- `docs/` 项目文档
- `openspec/` 规格与变更提案