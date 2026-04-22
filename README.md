

# Transfer Genie

基于 WebDAV 的跨平台文件与文本传输助手。

## 简介

Transfer Genie（传输小精灵）是一款使用 Tauri + Rust 技术构建的桌面应用程序，通过 WebDAV 协议实现跨平台的文件与文本传输。它提供聊天式消息界面，支持文本和文件发送、自动同步、本地索引管理等功能。

## 功能特性

- **WebDAV 存储**：以 WebDAV 目录作为共享消息存储中心
- **消息列表**：聊天式消息列表，显示发送者、时间、文件大小等信息
- **发送支持**：支持发送文本与文件，兼容拖拽上传和粘贴上传
- **自动同步**：自动同步与刷新，保持数据最新
- **本地索引**：本地 SQLite 数据库索引，加速消息检索
- **多端点管理**：支持多个 WebDAV 端点配置与切换
- **配置迁移**：配置导入/导出功能，方便备份与迁移
- **消息标记**：对重要消息添加标记和自定义标签，支持分类管理与持久化存储
- **传输管理**：上传和下载任务集中管理，支持断点续传和进度追踪
- **Telegram 桥接**：可选的 Telegram 双向桥接服务，支持从 Telegram 收发消息
- **本地 HTTP API**：内置 HTTP 服务，支持外部脚本通过 REST API 发送文本和文件（默认端口 6011）

## 技术栈

- **后端**：Rust + Tauri
- **前端**：HTML + JavaScript + CSS
- **数据库**：SQLite
- **协议**：WebDAV、HTTP

## 目录结构

```
transfer-genie/
├── src/                 # Rust 后端源码
│   ├── main.rs          # 应用入口与 Tauri 命令
│   ├── db.rs            # SQLite 数据库操作
│   ├── types.rs         # 数据类型定义
│   ├── webdav.rs        # WebDAV 客户端
│   ├── filenames.rs     # 文件名解析
│   ├── history.rs       # 历史记录管理
│   └── telegram_bridge.rs # Telegram 桥接
├── frontend/            # 前端页面资源
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标
├── docs/                # 项目文档
├── openspec/            # 规格与变更提案
├── Cargo.toml           # Rust 依赖配置
├── tauri.conf.json      # Tauri 配置
└── build.rs            # 构建脚本
```

## 开发环境配置

请参考 `docs/setup.md` 中的详细说明。

### 安装 Rust

**Windows（推荐使用 winget）**：
```powershell
winget install Rustlang.Rust.MSVC
```

**macOS**：
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 安装 Tauri CLI

```bash
cargo install tauri-cli --locked
```

### 启动开发

在项目根目录运行：

```bash
cargo tauri dev
```

如果出现 `no such command: tauri` 错误，请重开终端后再运行命令。

## 功能使用

### 标记功能

Transfer Genie 支持对重要消息进行标记和分类管理：

**添加标记：**
1. 在发送消息时，点击输入框下方的标记图标启用标记
2. 可以创建自定义标签（如"紧急"、"待办"、"工作"等）对消息分类
3. 发送后消息会自动带上标记和标签

**管理已标记消息：**
- 在"标记"标签页查看所有已标记的消息
- 支持按标签筛选消息
- 支持搜索已标记消息内容
- 批量操作：可以选择多条消息进行批量编辑标签或删除
- 已标记消息会持久化存储，即使清空首页历史也不会丢失

**编辑标记：**
- 在消息列表中右键点击已标记消息可以编辑标签
- 可以随时添加、移除或修改消息的标签

### 传输列表

"传输"标签页集中管理所有上传和下载任务：

**功能特性：**
- **上传任务**：显示通过应用发送的文件上传进度和状态
- **下载任务**：显示从 WebDAV 下载文件的任务列表
- **断点续传**：支持下载中断后恢复，自动检测已下载的部分并继续
- **进度追踪**：实时显示传输进度、速度和剩余时间
- **历史记录**：保存传输历史，方便查看过往的传输任务

**任务管理：**
- 点击"下载"按钮可将文件保存到本地
- 支持批量选择多个传输任务进行操作
- 可以清空已完成的传输记录
- 点击"打开下载目录"快速定位到下载文件夹

**传输模式：**
- 直接下载：首次下载文件
- 断点续传：自动检测并继续未完成的下载
- 重新下载：重新开始下载（覆盖已有文件）

### 发送消息

1. 在首页的文本输入框中输入文字
2. 支持纯文本和 Markdown 格式（点击格式切换按钮）
3. 点击发送按钮或使用快捷键发送
4. 支持拖拽或粘贴文件到输入区域进行文件传输

### WebDAV 端点管理

在设置页面可以：
- 添加多个 WebDAV 端点
- 切换当前活动的端点
- 编辑端点名称和地址
- 测试连接速度

### Telegram 桥接

在设置页面的"Telegram Bridge"区域：
1. 填写 `Bot Token` 和 `Chat ID`
2. 设置轮询间隔
3. 如需要代理，勾选"启用 Telegram 代理"
4. 可勾选"自启动服务"实现开机自启

### 本地 HTTP API

Transfer Genie 内置 HTTP 服务，支持外部脚本和程序调用：

1. 在设置页面勾选"启用 API 接口"
2. 查看显示的监听地址（默认 `127.0.0.1:6011`）
3. 调用接口发送文本或文件：
   - `POST /api/send-text` - 发送文本消息
   - `POST /api/send-file` - 发送文件

详细 API 文档请参考 `docs/HTTP API 说明.md`，包含完整的请求格式、响应说明和示例代码。

## 打包发布

### Windows 打包脚本（推荐）

运行 `scripts\update_local_exe.bat`：
- 可选择是否重新编译
- 自动复制到指定目录
- 自动打开安装目录

自定义安装目录：
```batch
scripts\update_local_exe.bat "C:\你的自定义路径"
```

### 手动打包

1. 确保已安装 Rust 和 Tauri CLI
2. 在项目根目录运行：
```bash
cargo tauri build
```

Windows 编译后的文件位于 `target\release\` 目录。

### GitHub Release 发版

使用发版脚本：
```bash
scripts/release/release_github.sh 0.1.2 --push
```

支持版本类型：patch、minor、major、custom。

## 常见问题

### 关闭窗口后重置
- 相关代码：`frontend/main.js` 中的 `prepareWindowForHide` 函数

## 许可证

本项目采用 **GNU Affero General Public License v3.0** (AGPL-3.0) 许可证。

- ✅ 个人可自由使用、修改、分发
- ✅ 修改后的版本必须开源
- ✅ 即使是网络服务（SaaS）也要开源
- ❌ 禁止闭源商用

商业授权请联系作者。

## 相关链接

- 项目地址：https://gitee.com/hongxiaojian/transfer-genie
- 更新检查：https://gitee.com/hongxiaojian/transfer-genie/releases/download/latest/latest.json