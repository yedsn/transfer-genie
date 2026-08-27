## ADDED Requirements
### Requirement: Marked item due dates
The client SHALL allow a marked message to store an optional day-precision due date. Marked messages without a due date SHALL remain backward compatible and SHALL be treated as immediately unfinished.

#### Scenario: Mark with due date
- **WHEN** the user marks a message and selects a due date
- **THEN** the message stores that date with its marked metadata
- **AND** the date is preserved through local storage and WebDAV history sync

#### Scenario: Existing marked item has no due date
- **GIVEN** an existing marked message has no due date field
- **WHEN** the client loads it
- **THEN** the message is treated as a marked item with no due date

### Requirement: Marked pending filter
The marked list SHALL provide a pending filter that only shows marked messages whose due date is absent, today, or earlier.

#### Scenario: Filter pending marked items
- **GIVEN** the marked list contains marked messages with no due date, a past due date, today's due date, and a future due date
- **WHEN** the user enables the pending filter
- **THEN** the list shows only the no-date, past-date, and today-date marked messages

## MODIFIED Requirements
### Requirement: Message history file
客户端 SHALL 在 WebDAV 根目录维护 `history.json` 或 manifest history 作为消息历史索引，记录每条消息的文件名、发送者、时间戳、大小、类型、原始名称、标记状态、标记标签、置顶状态、处理日期和格式。
客户端在发送消息后 SHALL 追加或更新对应条目。
当用户标记、取消标记或修改标记元数据时，客户端 SHALL 更新 history 中相应条目的标记字段。

#### 场景: Append history on send
- **WHEN** 用户发送任意消息
- **THEN** history 包含对应的消息记录，并且 `marked` 字段为 `false`。

#### 场景: Create history file
- **WHEN** history 不存在且用户发送消息
- **THEN** 客户端创建 history

#### 场景: Load history on sync
- **WHEN** 客户端执行同步
- **THEN** 从 history 读取消息记录并更新本地索引，包括每条消息的标记状态、标签、置顶状态和处理日期。

#### 场景: Update marked status
- **GIVEN** a message exists in history
- **WHEN** the user marks the message
- **THEN** the client SHALL update marked metadata for that message in history.
- **WHEN** the user unmarks the message
- **THEN** the client SHALL update `marked` to `false` and clear marked-only metadata.
