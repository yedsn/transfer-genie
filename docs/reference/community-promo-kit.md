---
description: Transfer Genie 社区发布文案包，包含中文技术社区长文、短动态、英文 Show HN/Reddit 版本和固定链接。
---

# 社区发布文案包

这份文案包用于把 Transfer Genie 发布到技术社区、B 站动态、掘金、V2EX、知乎、少数派、Hacker News 或 Reddit，目标是获取真实访问、外部链接和搜索引擎发现入口。

## 固定链接

| 项目 | 地址 |
| --- | --- |
| 官网 | `https://yedsn.github.io/transfer-genie/` |
| GitHub | `https://github.com/yedsn/transfer-genie` |
| English README | `https://github.com/yedsn/transfer-genie/blob/master/README.en.md` |
| Gitee | `https://gitee.com/hongxiaojian/transfer-genie` |
| 下载 | `https://github.com/yedsn/transfer-genie/releases/latest` |
| FAQ（中英双语） | `https://yedsn.github.io/transfer-genie/faq` |
| 安装指南 | `https://yedsn.github.io/transfer-genie/guide/installation` |
| WebDAV 传文件场景 | `https://yedsn.github.io/transfer-genie/use-cases/webdav-file-transfer` |
| HTTP API | `https://yedsn.github.io/transfer-genie/integrations/http-api` |
| Telegram Bridge | `https://yedsn.github.io/transfer-genie/integrations/telegram-bridge` |
| 对比 AirDrop | `https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-airdrop` |
| 对比 Syncthing | `https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-syncthing` |

## 标题备选

1. 用微信文件助手传开发文件太绕了？我做了个 WebDAV 跨设备传输工具
2. 我把 WebDAV 做成了一个跨设备传输收件箱：Transfer Genie
3. Windows 和 macOS 之间传文字和文件，不一定要靠聊天软件
4. 有 NAS 或 WebDAV 的人，可以试试这种自托管传文件方式
5. Transfer Genie：像聊天一样用 WebDAV 传文字、文件和脚本产物

## 中文长文

你有没有这种时刻：

在 Windows 上写了个命令，想丢到 macOS 上跑一下；在一台电脑上下载了文件，另一台电脑马上要用；脚本生成了日志、截图、构建产物，又不想每次手动拖来拖去。

很多人最后都会绕回熟悉的办法：微信文件助手、Telegram、网盘同步目录、临时 HTTP 服务、U 盘、远程桌面复制粘贴。

这些办法都能用，但它们解决得不够顺手：文本和文件分散在不同地方，历史不好查，自动化不好接，文件还经常进入一个你并不想长期依赖的中心化聊天平台。

所以我做了一个小工具：Transfer Genie。

一句话说，它是一个基于 WebDAV 的跨设备文件传输与文本同步桌面应用。你可以把一个 WebDAV 目录当成自己的传输收件箱，在 Windows 和 macOS 之间像聊天一样发送文本、Markdown 和文件。

## 它解决的核心问题

把“临时传文字、传文件、传脚本结果”这件事，从各种聊天窗口和同步目录里拎出来，放进一个自己可控的 WebDAV 消息流里。

## 为什么开发者会在意

- 如果你有 NAS、WebDAV 网盘或自建存储，可以直接复用已有存储，不需要再注册一个云服务。
- 如果你经常在多台设备之间传命令、链接、配置片段、截图或构建产物，它会比普通剪贴板同步更适合保留历史。
- 如果你想接自动化，它内置本机 HTTP API，可以用脚本直接 `POST /api/send-text` 或 `POST /api/send-file`。
- 如果你习惯用 Telegram 收文件，也可以通过 Telegram Bridge 把 Telegram 会话和 WebDAV 端点连起来。

## 它跟常见替代方案有什么不同

### 1. 它不是普通网盘同步

普通网盘同步更像“同步一个目录”。Transfer Genie 更像“传输消息流”：每条文本和文件都有发送者、时间线、历史记录和标签。

### 2. 它不是聊天软件文件助手

聊天软件适合即时沟通，但文件和文本会沉在聊天记录里，也不一定适合自动化。Transfer Genie 的主数据放在 WebDAV 里，入口是自己的桌面应用和本机 API。

### 3. 它不是只给人手点的工具

它保留了手动发送文本/文件的体验，同时给脚本留了 HTTP API。比如构建完成后把报告发进消息流，定时任务结束后发一条状态，或者把某个本地工具的输出丢到另一台设备上。

## 适合哪些场景

### 场景一：Windows 和 macOS 之间传文件

两台电脑配置同一个 WebDAV 端点，一台发送文件，另一台同步后在消息流里查看和下载。

### 场景二：跨设备传文字、链接和命令片段

临时命令、Markdown、链接、配置片段都可以作为消息发送，比只保留最近一次内容的剪贴板同步更适合回看。

### 场景三：脚本自动发送文件或日志

启动 Transfer Genie 后，本地脚本可以调用 HTTP API，把文本或文件发进同一条 WebDAV 消息流。

### 场景四：Telegram 与 WebDAV 同步

Telegram Bridge 可以把 Telegram 中的新文本和文件同步到 WebDAV，也可以把 WebDAV 中的新消息转发到 Telegram。

## 技术上为什么值得看一眼

- 桌面端基于 Tauri 2 + Rust。
- WebDAV 作为共享存储层，不绑定中心化传输平台。
- 本地历史使用 SQLite。
- 自动化入口是本机 HTTP API，默认监听 `127.0.0.1:6011`。
- 项目开源，协议为 AGPL-3.0-or-later。

## 怎么开始

1. 从 GitHub Releases 下载最新版本。
2. 打开应用，在设置页配置 WebDAV 地址、用户名和密码。
3. 设为当前活动端点。
4. 回到首页发一条文本或一个小文件，确认另一台设备能同步到。

## 项目地址

- 官网：`https://yedsn.github.io/transfer-genie/`
- GitHub：`https://github.com/yedsn/transfer-genie`
- 下载：`https://github.com/yedsn/transfer-genie/releases/latest`

如果你也在用 NAS、WebDAV、自建存储，或者经常在几台电脑之间传临时文件和命令，可以拿自己的真实场景试一下。

## 可选结尾

- 如果你有更顺手的跨设备传输工作流，也欢迎拿来对比，我会继续按真实场景优化。
- 如果你平时靠文件助手、网盘目录和临时脚本混着传东西，可以试试把 WebDAV 变成一个专门的传输收件箱。
- 如果这个工具刚好解决了你的场景，欢迎 star 或提 issue，把你的使用方式发出来。

## 可选动态版

我做了个基于 WebDAV 的跨设备传输工具 Transfer Genie：可以在 Windows/macOS 之间像聊天一样传文字、Markdown 和文件，也能用本机 HTTP API 接脚本，或用 Telegram Bridge 同步 Telegram 与 WebDAV。官网：`https://yedsn.github.io/transfer-genie/`

## 英文 Show HN / Reddit 版本

Title: Show HN: Transfer Genie, a WebDAV-based cross-device text and file transfer app

I built Transfer Genie, a small desktop app that turns a WebDAV folder into a cross-device transfer inbox.

The idea is simple: instead of sending temporary files, links, commands, Markdown notes, or build artifacts through chat apps, you can send them into a WebDAV-backed message stream and access them from another desktop device.

It is built with Tauri 2 + Rust, stores local history with SQLite, and supports:

- Sending text, Markdown, and files through a chat-like desktop UI.
- Using WebDAV as the shared storage layer.
- Local HTTP API endpoints: `POST /api/send-text` and `POST /api/send-file`.
- Telegram Bridge for syncing Telegram messages/files with a WebDAV endpoint.
- Windows and macOS-oriented desktop workflows.

It is useful if you already have a NAS, WebDAV storage, or a self-hosted workflow and want a lightweight alternative to chat-based file transfer.

Website: `https://yedsn.github.io/transfer-genie/`
GitHub: `https://github.com/yedsn/transfer-genie`
English README: `https://github.com/yedsn/transfer-genie/blob/master/README.en.md`
Latest release: `https://github.com/yedsn/transfer-genie/releases/latest`
