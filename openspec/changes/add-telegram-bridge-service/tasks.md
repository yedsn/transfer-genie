## 1. Foundation
- [ ] 1.1 复用或抽取现有 WebDAV、文件名编码、`history.json` 序列化能力，供桥接服务写入兼容消息格式。
- [ ] 1.2 新增桥接服务配置加载能力，覆盖 Bot Token、允许的 chat ID、WebDAV 端点、轮询间隔、临时目录和状态文件路径。
- [ ] 1.3 新增桥接服务状态存储，持久化 Telegram 更新游标、Telegram/WebDAV 消息映射和转发状态。

## 2. Telegram To WebDAV
- [ ] 2.1 通过 Telegram Bot API 长轮询接收更新，并仅接受来自配置 chat ID 的文本和文件消息。
- [ ] 2.2 将 Telegram 文本消息转换为 WebDAV `files/` 中的文本消息文件，并追加兼容的 `history.json` 条目。
- [ ] 2.3 将 Telegram 文件消息下载后上传到 WebDAV `files/`，并追加兼容的 `history.json` 条目。
- [ ] 2.4 在状态存储中记录已导入的 Telegram 消息，避免重复导入和回环。

## 3. WebDAV To Telegram
- [ ] 3.1 扫描 WebDAV `history.json` 与 `files/`，找出尚未转发到 Telegram 的消息。
- [ ] 3.2 将文本消息通过 `sendMessage` 转发，将文件消息通过 `sendDocument` 转发到目标 chat。
- [ ] 3.3 跳过由 Telegram 导入产生的 WebDAV 消息，避免在同一 chat 中回环回发。

## 4. Operations And Validation
- [ ] 4.1 为未授权 chat、超限文件、Telegram/WebDAV 请求失败提供结构化日志和明确错误分类。
- [ ] 4.2 添加自动化测试，覆盖消息兼容性、去重、重启恢复和回环抑制。
- [ ] 4.3 补充服务启动与部署文档，包括配置示例、限制说明和故障排查。
