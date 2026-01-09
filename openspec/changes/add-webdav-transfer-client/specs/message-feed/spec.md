## ADDED Requirements
### Requirement: Message file storage
客户端 SHALL 将每条外发消息存储为 WebDAV 根目录下 `files/` 子目录中的单个文件。
文本消息 MUST 使用 UTF-8 `.txt` 文件；文件消息 MUST 保留原始字节与扩展名。

#### Scenario: Text message upload
- **WHEN** 用户发送文本消息
- **THEN** 客户端向 WebDAV `files/` 目录上传单个 `.txt` 文件
- **AND** 本地消息索引记录发送者、时间戳、大小与内容

#### Scenario: File message upload
- **WHEN** 用户发送文件
- **THEN** 客户端向 WebDAV `files/` 目录上传原始文件字节
- **AND** 保存的文件保留原始扩展名

### Requirement: Message metadata encoding
客户端 SHALL 将发送者标识与消息时间戳编码进消息文件名，并使用确定且文件名安全的编码，使其他客户端无需服务器元数据即可解析。
编码后的发送者标识 SHALL 来源于用户设置的发送者名称。

#### Scenario: Parse sender and time from filename
- **WHEN** 客户端发现新的消息文件
- **THEN** 能仅从文件名解析出发送者名称与时间戳

#### Scenario: Ignore non-message files
- **WHEN** 客户端发现不符合消息命名格式的文件
- **THEN** 不下载该文件
- **AND** 不在列表中展示

### Requirement: Message history file
客户端 SHALL 在 WebDAV 根目录维护 `history.json` 作为消息历史索引，记录每条消息的文件名、发送者、时间戳、大小、类型与原始名称。
客户端在发送消息后 SHALL 追加或更新对应条目。

#### Scenario: Append history on send
- **WHEN** 用户发送任意消息
- **THEN** `history.json` 包含对应的消息记录

#### Scenario: Create history file
- **WHEN** `history.json` 不存在且用户发送消息
- **THEN** 客户端创建 `history.json`

### Requirement: Local message index and sync
客户端 SHALL 维护本地 SQLite 消息索引，并在启动与配置的周期内刷新。
手动刷新 SHALL 触发一次立即同步。
对于文件消息，客户端 SHALL 在同步时自动下载文件内容并保存到本地存储。

#### Scenario: Periodic refresh
- **WHEN** WebDAV 目录出现新的消息文件
- **THEN** 下一次定时同步将其加入本地索引
- **AND** 消息显示在列表中

#### Scenario: Manual refresh
- **WHEN** 用户点击手动刷新
- **THEN** 客户端立即执行同步并更新列表

#### Scenario: Auto-download file message
- **WHEN** 定时同步发现新的文件消息
- **THEN** 客户端自动下载文件内容到本地存储
- **AND** 列表项可访问已下载文件

### Requirement: Message feed display
客户端 SHALL 提供按时间排序的聊天式列表，并显示发送者名称、时间戳与文件大小。
文本消息 SHALL 显示全文内容；文件消息 SHALL 显示文件名。

#### Scenario: Open the feed
- **WHEN** 用户打开应用
- **THEN** 列表基于本地索引渲染
- **AND** 每条消息显示发送者、时间与大小