---
description: Transfer Genie 常见问题，覆盖 WebDAV 跨设备传文件、Windows macOS 传文字、本机 HTTP API 自动化和 Telegram Bridge 同步。
---

# 常见问题

这页把最常见的搜索问题直接写成答案，方便人和 AI 快速定位 Transfer Genie 是否适合当前场景。

## Transfer Genie 是什么？

Transfer Genie 是一个基于 WebDAV 的跨设备文件传输与文本同步桌面应用。它把一个 WebDAV 目录变成共享收件箱，适合在 Windows、macOS 和自托管存储之间传文本、文件和自动化结果。

## 它适合替代什么？

| 场景 | 说明 |
| --- | --- |
| AirDrop 替代 | 适合 Windows 和 macOS 混用、又想保留历史和自动化的人。 |
| 聊天软件文件助手替代 | 适合不想把临时文件和说明长期留在聊天记录里的人。 |
| 剪贴板同步补充 | 适合需要保留多条文本、链接和命令片段的人。 |
| 目录同步的轻量补充 | 适合传单次文本、文件和脚本结果，而不是持续同步整个目录的人。 |

## 能在 Windows 和 macOS 之间传文字吗？

可以。你可以在一台设备发送文本、链接、Markdown 或命令片段，另一台设备同步后在同一条消息流里看到这些内容。

## 能在 Windows 和 macOS 之间传文件吗？

可以。Transfer Genie 会把文件上传到当前活动 WebDAV 端点，另一台设备同步后即可查看和下载。

## 可以用 NAS WebDAV 传文件吗？

可以。只要 NAS 提供可访问的 WebDAV 地址，你就可以在多台设备上配置同一个端点，把 NAS 变成 Transfer Genie 的自托管传输收件箱。

## 能替代微信文件传输助手吗？

如果你的需求是偶尔在微信登录设备之间临时传一张图，微信文件传输助手更直接。如果你想把文件放在自己的 WebDAV/NAS 里，并且需要 Windows、macOS、历史记录、标签和本机 HTTP API 自动化，Transfer Genie 更适合作为替代方案。

## 能自动发送构建产物或日志吗？

可以。Transfer Genie 内置本机 HTTP API，默认监听 `127.0.0.1:6011`，支持：

- `POST /api/send-text`
- `POST /api/send-file`

适合脚本、定时任务或本地程序自动投递文本和文件。

## 能把 Telegram 和 WebDAV 连起来吗？

可以。Telegram Bridge 支持把 Telegram 会话中的文本和文件同步到 WebDAV，也可以把 WebDAV 中的新消息转发到 Telegram。

## 需要自己搭服务器吗？

不一定。只要你有一个可用的 WebDAV 端点即可。它可以来自 NAS、网盘服务、自建存储或其他支持 WebDAV 的服务。

## 从哪里开始？

1. 去 [Transfer Genie 下载](/download) 找最新下载入口。
2. 去 [下载安装](/guide/installation) 看平台安装说明。
3. 去 [第一次传输](/guide/first-sync) 完成一次真实发送。
4. 如果你要接脚本，看 [本机 HTTP API](/integrations/http-api)。
5. 如果你要接 Telegram，看 [Telegram Bridge](/integrations/telegram-bridge)。

## 继续阅读

- WebDAV 跨设备传文件：[`/use-cases/webdav-file-transfer`](/use-cases/webdav-file-transfer)
- NAS WebDAV 传输：[`/use-cases/nas-webdav-transfer`](/use-cases/nas-webdav-transfer)
- 跨设备文本同步：[`/use-cases/cross-device-text-sync`](/use-cases/cross-device-text-sync)
- 对比 AirDrop：[`/compare/transfer-genie-vs-airdrop`](/compare/transfer-genie-vs-airdrop)
- 对比微信文件传输助手：[`/compare/transfer-genie-vs-wechat-file-transfer`](/compare/transfer-genie-vs-wechat-file-transfer)
- 对比 Syncthing：[`/compare/transfer-genie-vs-syncthing`](/compare/transfer-genie-vs-syncthing)

## English quick answers

### What is Transfer Genie?

Transfer Genie is a WebDAV-based desktop app for cross-device file transfer and text sync.

### Can it transfer files between Windows and macOS?

Yes. It uploads files to a WebDAV endpoint and lets another device sync and download them.

### Can it use NAS WebDAV for file transfer?

Yes. If your NAS exposes a WebDAV endpoint, Transfer Genie can use it as the shared transfer inbox.

### Is it a WeChat File Transfer alternative?

It can be, especially when you want files to stay in your own WebDAV or NAS storage and need desktop history, tags, and local HTTP API automation.

### Can it automate sending build artifacts or logs?

Yes. Use the local HTTP API to post text or files from scripts and scheduled jobs.

### Can it bridge Telegram and WebDAV?

Yes. Telegram Bridge syncs Telegram messages and files with a WebDAV endpoint.
