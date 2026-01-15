## MODIFIED Requirements

### Requirement: Message history file
客户端 SHALL 在 WebDAV 根目录维护 `history.json` 作为消息历史索引，记录每条消息的文件名、发送者、时间戳、大小、类型、原始名称和 **标记状态**。
客户端在发送消息后 SHALL 追加或更新对应条目。
当用户标记或取消标记消息时，客户端 SHALL 更新 `history.json` 中相应条目的 `marked` 字段。

#### 场景: Append history on send
- **WHEN** 用户发送任意消息
- **THEN** `history.json` 包含对应的消息记录，并且 `marked` 字段为 `false`。

#### 场景: Create history file
- **WHEN** `history.json` 不存在且用户发送消息
- **THEN** 客户端创建 `history.json`

#### 场景: Load history on sync
- **WHEN** 客户端执行同步
- **THEN** 从 `history.json` 读取消息记录并更新本地索引，包括每条消息的标记状态。

#### 场景: Update marked status
- **GIVEN** a message exists in `history.json`
- **WHEN** the user marks the message
- **THEN** the client SHALL update the `marked` field for that message to `true` in `history.json`.
- **WHEN** the user unmarks the message
- **THEN** the client SHALL update the `marked` field for that message to `false` in `history.json`.

### Requirement: Message feed display

客户端 SHALL 提供按时间排序的聊天式列表，并显示发送者名称、时间戳与文件大小。
文本消息 SHALL 显示全文内容并提供复制按钮。
文件消息 SHALL 显示文件名并提供下载按钮及“更多操作”菜单中的另存为动作。
**所有消息 SHALL 直接显示一个用于“标记”或“取消标记”的图标。**

#### 场景: 标记一条消息
- **当** 用户点击消息上的“标记”图标
- **那么** 该消息应被标记
- **并且** 消息上的“标记”图标应高亮显示。

#### 场景: 取消标记一条消息
- **当** 用户点击已标记消息上的“标记”图标
- **那么** 该消息应被取消标记
- **并且** 消息上的“标记”图标应恢复默认状态。