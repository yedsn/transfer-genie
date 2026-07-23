---
description: 用 NAS 或自建 WebDAV 搭建 Transfer Genie 跨设备传输收件箱，在多台电脑之间发送文本和文件。
---

# 用 NAS WebDAV 做自托管传输收件箱

如果你已经有 NAS、网盘 WebDAV 或自建 WebDAV 服务，Transfer Genie 可以把它变成一个跨设备传输收件箱：多台电脑连接同一个 WebDAV 端点，用聊天流方式发送文本和文件。

## 适合什么场景

| 场景 | 说明 |
| --- | --- |
| 家里或办公室已有 NAS | 不需要再搭一套传输服务，直接复用 NAS 的 WebDAV 能力。 |
| 不想把文件发到聊天平台 | 文件存放在你选择的 WebDAV 存储里。 |
| 多台电脑之间传资料 | Windows、macOS 设备只要配置同一个 WebDAV 端点即可。 |
| 想保留传输上下文 | 文件、文本说明、发送时间、历史记录都在同一条消息流里。 |

## 基本流程

1. 在 NAS 或自建服务中启用 WebDAV。
2. 为 Transfer Genie 准备一个专用目录和账号权限。
3. 在每台设备安装 Transfer Genie。
4. 在设置页填写同一个 WebDAV 地址、用户名和密码。
5. 将该端点设为当前活动端点。
6. 在一台设备发送文本或文件，另一台设备同步后查看。

## 建议的 WebDAV 使用方式

| 建议 | 原因 |
| --- | --- |
| 使用专用目录 | 避免和普通网盘目录混在一起，后续更容易备份和清理。 |
| 使用专用账号或最小权限 | 降低误操作影响范围。 |
| 保持多台设备配置一致 | 同一个端点才能看到同一条消息流。 |
| 先用小文件验证 | 确认地址、权限、上传和下载都正常后再长期使用。 |

## 和直接用 NAS 文件夹有什么区别

| 对比项 | Transfer Genie | 直接打开 NAS 文件夹 |
| --- | --- | --- |
| 操作方式 | 像聊天一样发送和查看 | 以目录和文件路径为中心 |
| 文本传输 | 支持文本、链接、Markdown、命令片段 | 通常需要额外建文本文件 |
| 文件上下文 | 保留发送者、时间、说明和标签 | 主要依赖文件名和目录结构 |
| 自动化 | 可通过本机 HTTP API 投递 | 需要自己写上传逻辑 |

## 继续阅读

- WebDAV 跨设备传文件：[`/use-cases/webdav-file-transfer`](/use-cases/webdav-file-transfer)
- 下载安装：[`/download`](/download)
- 第一次传输：[`/guide/first-sync`](/guide/first-sync)
- 本机 HTTP API：[`/integrations/http-api`](/integrations/http-api)
