# message-feed Specification

## Purpose
TBD - created by archiving change add-webdav-transfer-client. Update Purpose after archive.
## Requirements
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

#### Scenario: Load history on sync
- **WHEN** 客户端执行同步
- **THEN** 从 `history.json` 读取消息记录并更新本地索引

### Requirement: Local message index and sync
客户端 SHALL 维护本地 SQLite 消息索引，并在启动与配置的周期内刷新。
手动刷新 SHALL 触发一次立即同步。
文件消息 SHALL 在用户触发下载时才从 WebDAV `files/` 目录获取内容并保存到用户选择的目标目录。

#### Scenario: Periodic refresh
- **WHEN** WebDAV 目录出现新的消息文件
- **THEN** 下一次定时同步将其加入本地索引
- **AND** 消息显示在列表中

#### Scenario: Manual refresh
- **WHEN** 用户点击手动刷新
- **THEN** 客户端立即执行同步并更新列表

#### Scenario: Download on demand
- **WHEN** 用户点击文件消息的下载按钮
- **THEN** 客户端从 WebDAV `files/` 目录拉取文件内容并保存到下载目录

### Requirement: Message feed display
客户端 SHALL 提供按时间排序的聊天式列表，并显示发送者名称、时间戳与文件大小。
文本消息 SHALL 显示全文内容并提供复制按钮。
文件消息 SHALL 显示文件名并提供下载按钮及“更多操作”菜单中的另存为动作。

#### Scenario: Copy text message
- **WHEN** 用户点击文本消息的复制按钮
- **THEN** 消息内容被复制到剪贴板

#### Scenario: Download file message
- **WHEN** 用户点击文件消息的下载按钮
- **THEN** 文件保存到配置的下载目录

#### Scenario: Save as file message
- **WHEN** 用户选择文件消息的另存为动作
- **THEN** 系统保存对话框打开并默认填入原始文件名

### Requirement: 聊天式布局与排序
客户端 SHALL 以时间顺序显示消息列表，最新消息位于底部；输入框 SHALL 固定在主内容底部；加载或刷新消息列表后 SHALL 自动滚动到最新消息。

#### Scenario: 初次加载滚动到最新
- **WHEN** 消息列表加载或刷新完成
- **THEN** 列表按时间顺序展示且最新消息在底部
- **AND** 滚动位置显示最新消息。

### Requirement: 消息选择与多选删除
客户端 SHALL 在每条消息的“更多”菜单中提供“删除”动作，并进入可多选的选择模式。选择模式 SHALL 提供“全选”操作，用于一键选中当前列表中的全部消息。

#### Scenario: 进入选择并批量删除
- **WHEN** 用户从某条消息的“更多”菜单选择“删除”
- **THEN** 客户端进入选择模式且该消息默认被选中
- **AND** 用户可以选择其它消息并确认删除

#### Scenario: 选择模式全选
- **WHEN** 用户在选择模式中触发“全选”
- **THEN** 当前列表中的消息全部被选中

### Requirement: 删除范围与效果
客户端 SHALL 在删除确认时提示删除范围（仅本地或本地+远端）。

仅本地删除时，系统 SHALL 删除本地消息记录，并删除文件消息对应的本地已下载文件。

本地+远端删除时，系统 SHALL 删除 WebDAV `files/` 中对应文件，并从远端 `history.json` 移除条目，同时删除本地消息记录与已下载文件。

#### Scenario: 仅本地删除
- **WHEN** 用户确认仅本地删除
- **THEN** 选中的消息从本地列表移除
- **AND** 文件消息对应的本地已下载文件被删除。

#### Scenario: 本地+远端删除
- **WHEN** 用户确认本地+远端删除
- **THEN** 远端 WebDAV 文件与 history 条目被删除
- **AND** 本地消息记录与已下载文件被删除。

#### Scenario: 远端删除失败
- **WHEN** 远端删除失败
- **THEN** 客户端提示错误并保留失败的消息记录。

### Requirement: WebDAV endpoint switching
客户端 SHALL 在首页提供 WebDAV 端点切换入口，仅显示已启用端点。
客户端在切换端点后 SHALL 立即使用新端点执行同步并更新消息列表。

#### Scenario: Switch active endpoint from home
- **WHEN** 用户在首页切换至另一个已启用的 WebDAV 端点
- **THEN** 客户端更新活动端点并触发一次立即同步
- **AND** 消息列表刷新为该端点的内容

