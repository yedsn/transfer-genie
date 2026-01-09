## MODIFIED Requirements
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