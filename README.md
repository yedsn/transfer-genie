# Transfer Genie

<p align="center">
  <img src="icons/icon.png" alt="Transfer Genie" width="160">
</p>

<p align="center"><strong>一个基于 WebDAV 的跨平台文件与文本传输助手。</strong></p>
<p align="center">像聊天一样在多台设备之间传文字、传文件、做同步，也能接入本机 HTTP API 和 Telegram Bridge。</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust" alt="Rust 2021">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Storage-WebDAV-2F6FED" alt="WebDAV">
  <img src="https://img.shields.io/badge/API-Local_HTTP-0A7B83" alt="Local HTTP API">
  <img src="https://img.shields.io/badge/Bridge-Telegram-26A5E4?logo=telegram" alt="Telegram Bridge">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-8A2BE2" alt="AGPL-3.0">
</p>

<p align="center">
  <a href="https://gitee.com/hongxiaojian/transfer-genie">Gitee</a>
  ·
  <a href="https://github.com/yedsn/transfer-genie">GitHub</a>
  ·
  <a href="docs/setup.md">开发环境</a>
  ·
  <a href="docs/HTTP API 说明.md">HTTP API</a>
  ·
  <a href="docs/Telegram Bridge 说明.md">Telegram Bridge</a>
</p>

<p align="center">
  <a href="#快速开始">立即开始</a>
  ·
  <a href="#文档导航">看文档</a>
  ·
  <a href="#http-api-速览">做自动化</a>
  ·
  <a href="#telegram-bridge-速览">接 Telegram</a>
</p>

---

## 一句话介绍

Transfer Genie（传输小精灵）使用 **Tauri + Rust + WebDAV** 构建，目标是把“跨设备传输”做成一种低心智负担的日常体验：

- 用一个 WebDAV 目录作为共享消息中心
- 在桌面端以聊天流方式查看文本和文件
- 支持自动同步、按需下载、本地索引、标记分类
- 既适合手工使用，也适合通过 HTTP API 或 Telegram Bridge 做自动化

如果你想要的是一个：

- 不依赖中心化 IM 平台的轻量传输工具
- 既能发文本，也能发文件，还能保留历史记录的桌面应用
- 能被脚本调用、能接入 Bot、能跑在自己存储之上的传输工作流

那么 Transfer Genie 就是为这个场景设计的。


## 为什么值得用

| 方向 | 你得到什么 |
|------|-------------|
| 自托管传输 | 直接复用已有 WebDAV 存储，不依赖中心化消息平台 |
| 像聊天一样操作 | 文本、文件、历史记录、发送者、时间线都在一个消息流里 |
| 可自动化扩展 | 本机 HTTP API + Telegram Bridge，适合接脚本和机器人 |
| 工程化友好 | Tauri + Rust + SQLite，便于继续开发、构建和发布 |

## 界面预览

<table>
  <tr>
    <td align="center" width="50%">
      <strong>消息流首页</strong><br>
      聊天式查看文本、文件、发送者与时间线<br><br>
      <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-25-44.png"/>
    </td>
    <td align="center" width="50%">
      <strong>传输任务面板</strong><br>
      统一查看上传、下载、断点续传与进度状态<br><br>
      <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-21.png" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>标记与筛选</strong><br>
      适合展示标签、已标记消息和批量处理流程<br><br>
      <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-04.png"/>
    </td>
    <td align="center" width="50%">
      <strong>设置中心</strong><br>
      适合展示 WebDAV、HTTP API、Telegram Bridge 等配置入口<br><br>
      <img src="https://picbed.hxj.life/images/2026/05/04/PixPin_2026-05-04_13-33-56.png" />
    </td>
  </tr>
</table>

## 核心工作流

### WebDAV 消息流

1. 在设置页配置一个可用的 WebDAV 端点
2. 指定当前活动端点
3. 在首页发送文本或文件
4. 应用将内容上传到 WebDAV，并写入历史索引
5. 其他设备同步后即可在消息流中看到同样内容

### 本机 HTTP API 自动化

1. 启动 Transfer Genie
2. 在设置页启用 API 接口
3. 确认监听地址（默认 `127.0.0.1:6011`）
4. 通过脚本调用 `POST /api/send-text` 或 `POST /api/send-file`
5. 消息进入同一条 WebDAV 消息流

### Telegram Bridge 同步

1. 在设置页配置 `Bot Token`、`Chat ID`、轮询间隔等参数
2. 启动 Telegram Bridge
3. Telegram 发来的文本/文件同步到 WebDAV
4. WebDAV 中新产生的消息也可继续转发到 Telegram

## 快速开始

> 当前 README 重点覆盖“从源码运行 / 本地开发”的路径。若你准备做自动化或桥接集成，可直接跳到下方文档导航。

### 推荐阅读顺序

- 只想先跑起来：看 `1` 和 `2`
- 想自己构建程序：继续看 `3` 和 `4`
- 想做自动化：跳到“HTTP API 速览”
- 想做 Bot / IM 桥接：跳到“Telegram Bridge 速览”

### 1. 准备环境

请先阅读：[`docs/setup.md`](docs/setup.md)

快速摘要：

- 安装 Rust / Cargo
- 安装 Tauri CLI：`cargo install tauri-cli --locked`
- Windows 需要 VS Build Tools 与 WebView2 Runtime
- macOS 需要 Xcode Command Line Tools

### 2. 启动开发模式

在项目根目录运行：

```bash
cargo tauri dev
```

如果提示找不到 `tauri` 命令，请重新执行：

```bash
cargo install tauri-cli --locked
```

并重开终端后再试。

### 3. 构建发布包

```bash
cargo tauri build
```

构建产物默认位于：

- Windows：`target/release/bundle/`
- macOS：`target/release/bundle/`


## HTTP API 速览

Transfer Genie 内置本机 HTTP 服务，适合给脚本、自动化工具或其他本地程序调用。

- 默认地址：`127.0.0.1`
- 默认端口：`6011`
- 接口：
  - `POST /api/send-text`
  - `POST /api/send-file`
- 前提条件：
  - 应用正在运行
  - 设置页已启用 API 接口
  - 当前存在活动 WebDAV 端点

发送文本示例：

```bash
curl -X POST "http://127.0.0.1:6011/api/send-text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello from curl",
    "format": "text"
  }'
```

完整说明见：[`docs/HTTP API 说明.md`](docs/HTTP API 说明.md)

## Telegram Bridge 速览

Telegram Bridge 用于在一个 Telegram 会话与一个 WebDAV 端点之间做双向同步。

你可以在桌面应用设置页中直接完成：

- `Telegram Bot Token` 配置
- `Chat ID` 自动获取
- 轮询间隔配置
- 代理配置
- bridge 启停与自启动

推荐优先使用桌面端内置的桥接管理，而不是手工单独运行 `telegram_bridge`。

完整说明见：[`docs/Telegram Bridge 说明.md`](docs/Telegram Bridge 说明.md)

## 项目结构

```text
transfer-genie/
├── src/                 # Rust 后端与 Tauri 命令
├── frontend/            # 当前桌面应用前端资源
├── docs/                # 使用说明、桥接说明、自动更新与发布文档
├── scripts/             # 打包与发布辅助脚本
├── capabilities/        # Tauri 权限配置
├── icons/               # 应用图标与资源
├── openspec/            # 规格与变更提案
├── Cargo.toml           # Rust 依赖与版本信息
└── tauri.conf.json      # Tauri 应用配置
```

## License

本项目采用 **GNU Affero General Public License v3.0** (`AGPL-3.0-or-later`) 许可证。

- 允许个人学习、使用、修改和分发
- 修改后的版本需要继续开源
- 即使以网络服务形式提供，也需遵循 AGPL 要求
- 如有商业授权诉求，请联系项目维护者进一步沟通

## 项目链接

- Gitee：<https://gitee.com/hongxiaojian/transfer-genie>
- GitHub：<https://github.com/yedsn/transfer-genie>
