---
description: 用 Transfer Genie Telegram Bridge 在 Telegram 会话和 WebDAV 端点之间同步文本与文件。
---

# 在 Telegram 和 WebDAV 之间同步文本与文件

Transfer Genie 的 Telegram Bridge 用于把一个 Telegram 会话和一个 WebDAV 端点连接起来。Telegram 中的新文本和文件可以进入 WebDAV 消息流，WebDAV 中的新消息也可以转发到 Telegram。

## 适合什么场景

| 场景 | 说明 |
| --- | --- |
| 把 Telegram 文件沉淀到 WebDAV | Telegram 收到的文件同步进自己的 WebDAV 存储。 |
| 用 Telegram 作为移动端入口 | 手机端先发给 bot，桌面端通过 Transfer Genie 查看。 |
| 将桌面传输消息转发到 Telegram | WebDAV 中的新文本和文件可以继续推送到指定会话。 |
| 统一桥接配置 | 桌面应用负责保存配置、启动、停止和重启 bridge。 |

## 基本流程

1. 在 Telegram 创建或准备一个 bot，并获取 `Bot Token`。
2. 在 Transfer Genie 设置页填写 `Telegram Bot Token`。
3. 使用“自动获取”选择目标 `Chat ID`，或手动填写。
4. 确认当前活动 WebDAV 端点可用。
5. 启动 Telegram Bridge。
6. 在 Telegram 或 Transfer Genie 中发送新消息，观察另一侧是否同步。

## 同步规则

| 方向 | 行为 |
| --- | --- |
| Telegram -> WebDAV | 文本保存为消息文本，文件上传到 WebDAV 文件区，并写入历史记录。 |
| WebDAV -> Telegram | Bridge 启动后产生的新文本和文件会转发到 Telegram。 |
| 旧消息 | Bridge 启动时不会回放 WebDAV 中已有旧消息。 |
| 去重 | Bridge 记录本地状态，避免重复导入或重复导出。 |

## 注意事项

- 一个 bridge 实例对应一个 Telegram `Chat ID` 和一个 WebDAV 端点。
- Telegram 侧使用 Bot API 轮询，不依赖 webhook。
- 如果 Telegram 网络访问受限，可以在设置页配置代理。
- WebDAV 仍然是 Transfer Genie 侧的主数据来源。

## 继续阅读

- Telegram Bridge 完整说明：[`/integrations/telegram-bridge`](/integrations/telegram-bridge)
- 下载安装：[`/guide/installation`](/guide/installation)
