---
description: 用 Transfer Genie 把 WebDAV 变成跨设备文件传输收件箱，在 Windows 和 macOS 之间发送文件并保留传输历史。
---

# 用 WebDAV 做跨设备文件传输

Transfer Genie 适合把一个 WebDAV 目录变成跨设备传输收件箱：在一台电脑发送文件，另一台设备同步后从同一条消息流里查看和下载。

## 适合什么场景

| 场景 | 说明 |
| --- | --- |
| Windows 和 macOS 之间传文件 | 不依赖 AirDrop 或微信文件助手，使用同一个 WebDAV 端点中转。 |
| 自托管文件传输 | 复用已有 NAS、网盘或自建 WebDAV 服务，文件不进入中心化聊天平台。 |
| 文件和说明一起传 | 可以在消息流里同时保留发送者、时间、文件名和上下文文本。 |
| 长期可回看 | 历史记录、标签和筛选适合查找之前传过的文件。 |

## 基本流程

1. 在每台设备安装 Transfer Genie。
2. 在设置页配置同一个 WebDAV 地址、用户名和密码。
3. 将该 WebDAV 端点设为当前活动端点。
4. 在首页发送文件。
5. 另一台设备同步后，在消息流中查看文件并下载。

## 为什么用 WebDAV

WebDAV 是很多 NAS、网盘和自建存储都支持的通用协议。Transfer Genie 使用 WebDAV 作为共享存储层，而不是额外要求用户注册一个新的云服务账号。

这种方式的好处是：

- 存储位置由用户自己控制。
- 多台设备只需要配置同一个端点。
- 文件、文本和历史索引可以进入同一条传输流程。
- 后续可以继续接入本机 HTTP API 或 Telegram Bridge。

## 和普通网盘同步有什么区别

| 对比项 | Transfer Genie | 普通网盘同步 |
| --- | --- | --- |
| 操作方式 | 像聊天一样发送和查看 | 主要围绕目录同步 |
| 传输上下文 | 保留发送者、时间、文本说明、标签 | 通常只保留文件路径 |
| 自动化 | 可通过本机 HTTP API 发送文件 | 取决于网盘客户端能力 |
| 使用目标 | 临时传输、消息流、收件箱 | 文件夹备份和同步 |

## 继续阅读

- 下载安装：[`/guide/installation`](/guide/installation)
- 第一次传输：[`/guide/first-sync`](/guide/first-sync)
- 本机 HTTP API：[`/integrations/http-api`](/integrations/http-api)
