# Transfer Genie

基于 WebDAV 的跨平台文件与文本传输助手（Tauri + Rust）。

## 功能
- WebDAV 目录作为共享消息存储
- 聊天式消息列表（显示发送者、时间、大小）
- 发送文本与文件（支持拖拽、粘贴上传）
- 自动同步与手动刷新
- 本地 SQLite 索引
- 多 WebDAV 端点管理
- 配置导入/导出

## 开发环境
请参考：`docs/setup.md`

## 启动开发

安装 Tauri CLI：

```
cargo install tauri-cli --locked
```

启动开发（在项目根目录）：

```
cargo tauri dev
```

如果出现 `no such command: tauri`：
- 确认已安装 Tauri CLI：`cargo --list | rg tauri`
- 重开终端后再运行命令

## 打包发布

打包前准备：
- 已安装 Rust/Cargo
- 已安装 Tauri CLI：`cargo install tauri-cli --locked`

在项目根目录运行：

```
cargo tauri build
```

说明：
- 需要在对应平台打包（Windows 产出 .exe，macOS 产出 .dmg）

## 目录结构

```
transfer-genie/
├── src/                 # Rust 后端源码
│   ├── main.rs          # 应用入口与 Tauri 命令
│   ├── db.rs            # SQLite 数据库操作
│   ├── types.rs         # 数据类型定义
│   ├── webdav.rs        # WebDAV 客户端
│   └── filenames.rs     # 文件名解析
├── frontend/            # 前端页面
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标
├── docs/                # 项目文档
├── openspec/            # 规格与变更提案
├── Cargo.toml           # Rust 依赖配置
├── tauri.conf.json      # Tauri 配置
└── build.rs             # 构建脚本
```
