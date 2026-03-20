## Context
当前 `transfer-genie` 桌面端直接将消息写入 WebDAV `files/` 目录，并使用 `history.json` 维护消息索引；其他客户端再通过同步逻辑读取这些远端对象并落到本地 SQLite。Telegram 机器人无法直接成为现有桌面端的替代收发端，因为 Telegram 收消息和推消息都需要一个持续在线的执行体。

本变更引入一个独立桥接服务，让 Telegram 作为现有 WebDAV 消息流的一个外部入口和出口，而不是替换现有存储模型。

## Goals / Non-Goals
- Goals:
  - 允许指定 Telegram chat 中的文本和文件自动进入现有 WebDAV 消息流
  - 允许桌面端写入 WebDAV 的消息自动发送到指定 Telegram chat
  - 在不改动桌面端主要交互的前提下落地 MVP
  - 防止消息重复导入、重复转发和 Telegram 内部回环
- Non-Goals:
  - 不在 MVP 中支持 Telegram webhook、公网部署和反向代理要求
  - 不在 MVP 中支持多个 Telegram chat 路由到同一个实例
  - 不在 MVP 中支持消息编辑、撤回、reaction、caption 对齐和 Telegram 富文本格式
  - 不在 MVP 中引入新的远端真相源，WebDAV 仍然是唯一共享存储

## Decisions

### Decision: Keep WebDAV As The Source Of Truth
桥接服务不直接改桌面端数据库，也不让 Telegram 成为新的主存储。所有入站 Telegram 消息都会被转换成现有 WebDAV `files/` 文件和 `history.json` 条目，桌面端仍按现有同步机制消费这些远端数据。

Why:
- 对现有桌面端侵入最小
- 兼容当前多端同步与历史记录逻辑
- 出问题时排查边界清晰，桥接服务只是适配层

### Decision: Use A Standalone Long-Polling Service
MVP 采用独立进程 + Telegram Bot API 长轮询，不使用 webhook。

Why:
- 不要求公网 HTTPS 或固定域名
- 更适合本项目当前桌面工具定位和本地部署方式
- 开发复杂度显著低于 webhook 模式

Trade-off:
- 长轮询会引入固定轮询延迟
- 服务端重启后需要依赖本地状态恢复 offset

### Decision: Persist Bridge State Separately From `history.json`
桥接服务维护独立状态文件或 SQLite，用于保存以下最小信息：
- `last_update_id`
- `imported_telegram_messages[(chat_id, telegram_message_id)] -> webdav_filename`
- `exported_webdav_messages[webdav_filename] -> telegram_message_id/status`

Why:
- 不要求桌面端立刻理解 Telegram 专有字段
- 不污染现有 `history.json` 的兼容面
- 更容易实现去重、重试和错误状态记录

Trade-off:
- 需要本地状态备份，否则重建映射成本更高
- 桥接实例水平扩展前需要先解决状态共享

### Decision: Bind One Service Instance To One WebDAV Endpoint And One Telegram Chat
MVP 每个实例只处理一个 WebDAV 端点和一个 Telegram chat，chat 通过显式 `chat_id` 白名单配置。

Why:
- 显著降低路由、权限和冲突复杂度
- 与当前“单个消息流”模型一致
- 后续若要支持多 chat，可通过多实例或显式路由扩展

### Decision: Forward Text As Plain Text And Files As `sendDocument`
WebDAV 到 Telegram 的文本统一用 `sendMessage` 发送原始文本，不设置 `parse_mode`；文件统一先走 `sendDocument`。

Why:
- 避免 Markdown/HTML 转义差异导致内容变形
- `sendDocument` 对文件类型覆盖最广，MVP 更稳

Trade-off:
- 图片在 Telegram 中默认不会以原生相册/预览优化形式发送
- Markdown 富文本不会在 Telegram 中被渲染

### Decision: Mark Telegram-Origin Messages In Bridge State Instead Of Re-Sending Them
当桥接服务将 Telegram 消息导入 WebDAV 后，会在本地状态中记下该 `webdav_filename` 来源于 Telegram。后续 WebDAV 出站扫描时，如果该文件已存在 Telegram 入站映射，则跳过，不再发送回同一个 chat。

Why:
- 避免机器人把自己导入的消息再次发回 Telegram，形成回环
- 不要求修改现有 history 模型即可实现闭环抑制

## Risks / Trade-offs
- Telegram Bot API 文件大小与速率限制会导致部分文件无法转发。
  Mitigation: 将超限视为终态失败并明确记录；对可重试错误执行退避重试。
- 桥接状态损坏可能导致重复导入或重复转发。
  Mitigation: 启动时校验状态文件；对 Telegram 入站使用 `(chat_id, message_id)` 去重，对 WebDAV 出站使用 `filename` 去重。
- WebDAV 与 Telegram 双轮询会带来时延。
  Mitigation: 分离入站轮询与出站扫描间隔，并允许配置。
- Telegram 用户名/显示名不稳定。
  Mitigation: 导入 WebDAV 时使用稳定回退策略，例如 `display_name -> username -> user_id`。

## Migration Plan
本变更不修改现有桌面端数据结构，不需要迁移已有 WebDAV 数据。桥接服务上线后即可开始消费新旧消息流，但只会转发其启动后扫描到且未记录为已导出的消息。

## Open Questions
- 后续是否需要把桥接服务配置整合进桌面端设置，而不是独立配置文件。
- 后续是否需要按文件类型使用 `sendPhoto`、`sendVideo` 等更贴近 Telegram 原生体验的接口。
