## ADDED Requirements

### Requirement: Telegram bridge service configuration
系统 SHALL 提供一个独立运行的 Telegram 桥接服务，并允许通过配置声明 Telegram Bot Token、目标 WebDAV 端点、允许接入的 Telegram `chat_id`、轮询间隔以及本地状态存储路径。

#### Scenario: Start bridge service with valid configuration
- **GIVEN** 桥接服务配置了有效的 Bot Token、WebDAV 端点和允许的 `chat_id`
- **WHEN** 运维启动桥接服务
- **THEN** 服务 SHALL 建立 Telegram Bot API 长轮询并初始化 WebDAV 连接
- **AND** 服务 SHALL 加载或创建本地桥接状态存储

#### Scenario: Ignore updates from unauthorized chat
- **GIVEN** 桥接服务正在运行
- **WHEN** Telegram Bot API 返回来自未配置 `chat_id` 的更新
- **THEN** 服务 SHALL 忽略该更新
- **AND** 服务 SHALL 记录可审计的拒绝日志

### Requirement: Mirror Telegram messages into WebDAV
桥接服务 SHALL 将来自允许 Telegram chat 的文本消息和文件消息转换为与现有桌面客户端兼容的 WebDAV 消息文件和 `history.json` 条目。

#### Scenario: Mirror inbound text message
- **GIVEN** 允许的 Telegram chat 中收到一条文本消息
- **WHEN** 桥接服务处理该更新
- **THEN** 服务 SHALL 在 WebDAV `files/` 中创建一个 UTF-8 文本消息文件
- **AND** 服务 SHALL 在 `history.json` 中追加对应的消息条目

#### Scenario: Mirror inbound file message
- **GIVEN** 允许的 Telegram chat 中收到一条带文件的消息
- **WHEN** 桥接服务处理该更新
- **THEN** 服务 SHALL 从 Telegram 下载文件字节并上传到 WebDAV `files/`
- **AND** 服务 SHALL 在 `history.json` 中追加与该文件匹配的消息条目

#### Scenario: Ignore unsupported Telegram update types
- **GIVEN** Telegram Bot API 返回的更新不包含纯文本或文件载荷
- **WHEN** 桥接服务处理该更新
- **THEN** 服务 SHALL 不向 WebDAV 写入消息文件
- **AND** 服务 SHALL 记录该更新被跳过

### Requirement: Mirror WebDAV messages into Telegram
桥接服务 SHALL 扫描目标 WebDAV 消息流，并将尚未转发到 Telegram 的消息发送到配置的 Telegram chat。

#### Scenario: Forward WebDAV text message to Telegram
- **GIVEN** WebDAV 消息流中存在一条尚未转发的文本消息
- **WHEN** 桥接服务执行出站扫描
- **THEN** 服务 SHALL 使用 Telegram `sendMessage` 将该文本发送到目标 chat
- **AND** 服务 SHALL 在本地桥接状态中记录该消息已成功转发

#### Scenario: Forward WebDAV file message to Telegram
- **GIVEN** WebDAV 消息流中存在一条尚未转发的文件消息
- **WHEN** 桥接服务执行出站扫描
- **THEN** 服务 SHALL 下载该文件并使用 Telegram `sendDocument` 发送到目标 chat
- **AND** 服务 SHALL 在本地桥接状态中记录该消息已成功转发

### Requirement: Prevent duplicate delivery and echo loops
桥接服务 SHALL 持久化 Telegram 入站与 WebDAV 出站的消息映射，并在服务重启后继续避免重复导入、重复转发和向同一 Telegram chat 的回环回发。

#### Scenario: Do not reimport processed Telegram message after restart
- **GIVEN** 某条 Telegram 消息已被成功导入 WebDAV，且桥接状态已持久化
- **WHEN** 桥接服务重启后再次看到该消息对应的更新
- **THEN** 服务 SHALL 识别其已处理状态
- **AND** 服务 SHALL 不重复写入 WebDAV

#### Scenario: Do not echo Telegram-originated WebDAV message back to Telegram
- **GIVEN** 某条 WebDAV 消息来自 Telegram 入站导入
- **WHEN** 桥接服务执行 WebDAV 出站扫描
- **THEN** 服务 SHALL 识别该消息的 Telegram 来源
- **AND** 服务 SHALL 不将其再次发送回同一 Telegram chat

### Requirement: Surface terminal failures and continue processing
桥接服务 SHALL 对 Telegram 或 WebDAV 的终态失败给出明确记录，并在单条消息失败后继续处理后续消息。

#### Scenario: Oversized file cannot be forwarded to Telegram
- **GIVEN** WebDAV 中存在一条文件大小超过 Telegram Bot API 限制的文件消息
- **WHEN** 桥接服务尝试转发该文件
- **THEN** 服务 SHALL 将该消息标记为终态失败
- **AND** 服务 SHALL 记录失败原因而不是无限重试

#### Scenario: Temporary Telegram API failure during outbound send
- **GIVEN** 桥接服务正在发送一条 WebDAV 消息到 Telegram
- **WHEN** Telegram API 返回可重试错误
- **THEN** 服务 SHALL 保留该消息的未完成状态以供后续重试
- **AND** 服务 SHALL 继续处理其他不受影响的消息
