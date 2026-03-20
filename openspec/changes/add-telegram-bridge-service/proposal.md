# Change: Add Telegram Bridge Service

## Why
当前产品以 WebDAV 作为消息真相源，桌面端直接读写 `files/` 与 `history.json`。如果希望通过 Telegram 机器人收发文本和文件，还需要一个常驻组件负责把 Telegram Bot API 与现有 WebDAV 消息模型双向打通，否则桌面端离线时无法持续接收 Telegram 消息，也无法把 WebDAV 中的新消息推送到 Telegram。

## What Changes
- 新增一个独立的 Telegram 桥接服务，使用 Telegram Bot API 长轮询并连接一个已配置的 WebDAV 端点。
- 将来自指定 Telegram 会话的文本和文件镜像为兼容现有格式的 WebDAV 消息文件与 `history.json` 条目。
- 将 WebDAV 中尚未转发到 Telegram 的消息转发到指定 Telegram 会话。
- 为桥接服务增加本地持久化状态，用于更新游标、消息映射、去重和回环抑制。
- 约束桥接服务的安全与运行边界，包括 Bot Token 管理、允许的 chat ID、Telegram 大小限制、失败重试和可观测性。

## Impact
- Affected specs: `telegram-bridge`
- Affected code: 新增桥接服务入口/配置/状态存储；复用或抽取 WebDAV、文件名、history 兼容逻辑；新增部署文档
- Assumptions:
  - MVP 每个桥接服务实例只绑定一个 WebDAV 端点和一个 Telegram chat
  - MVP 使用长轮询，不要求公网 webhook 或 HTTPS 回调
  - MVP 只保证纯文本和文件双向同步，不处理 Telegram 富文本格式、消息编辑、撤回、文件 caption 对齐
