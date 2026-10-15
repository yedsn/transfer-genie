---
description: 用 Transfer Genie Telegram Bridge 在 Telegram 会话和 WebDAV 或 Supabase 存储空间之间同步文本与文件。
---

# 在 Telegram 和存储空间之间同步文本与文件

Transfer Genie 的 Telegram Bridge 用于把一个 Telegram 会话和当前活动的 WebDAV 或 Supabase 存储空间连接起来。Telegram 中的新文本和文件可以进入消息流，当前空间中的新消息也可以转发到 Telegram。

## 适合什么场景

| 场景 | 说明 |
| --- | --- |
| 把 Telegram 文件沉淀到存储空间 | Telegram 收到的文件同步进自己的 WebDAV 或 Supabase 空间。 |
| 用 Telegram 作为移动端入口 | 手机端先发给 bot，桌面端通过 Transfer Genie 查看。 |
| 将桌面传输消息转发到 Telegram | 当前空间中的新文本和文件可以继续推送到指定会话。 |
| 统一桥接配置 | 桌面应用负责保存配置、启动、停止和重启 bridge。 |

## 基本流程

1. 在 Telegram 创建或准备一个 bot，并获取 `Bot Token`。
2. 在 Transfer Genie 设置页填写 `Telegram Bot Token`。
3. 使用“自动获取”选择目标 `Chat ID`，或手动填写。
4. 确认当前活动 WebDAV 可用，或 Supabase 已登录、已绑定且空间可访问。
5. 启动 Telegram Bridge。
6. 在 Telegram 或 Transfer Genie 中发送新消息，观察另一侧是否同步。

## 同步规则

| 方向 | 行为 |
| --- | --- |
| Telegram -> 当前空间 | WebDAV 按文件与历史协议保存；Supabase 先写本机 SQLite/outbox 和本地文件，再异步上传私有 Storage。 |
| 当前空间 -> Telegram | Bridge 启动后进入本地索引的新文本和文件会转发到 Telegram。 |
| 旧消息 | Bridge 启动时不会回放当前空间中已有旧消息。 |
| 去重与回环 | Telegram 来源身份会随消息同步；各设备 Bridge 都会跳过 Telegram 来源消息。 |

## 注意事项

- 一个 bridge 实例对应一个 Telegram `Chat ID` 和一个当前活动存储空间。
- Telegram 侧使用 Bot API 轮询，不依赖 webhook。
- 如果 Telegram 网络访问受限，可以在设置页配置代理。
- 自启动、运行状态、游标和投递记录只属于当前设备，不同步到 Supabase。
- 同一 Supabase 账号的其他设备不会因为本机打开 Bridge 而自动打开。

## 继续阅读

- Telegram Bridge 完整说明：[`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 下载安装：[`/guide/installation`](/guide/installation)
