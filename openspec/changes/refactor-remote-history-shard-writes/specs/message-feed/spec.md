## MODIFIED Requirements

### Requirement: Message history file
客户端 SHALL 在 WebDAV 根目录维护远端消息历史索引，用于记录每条消息的文件名、发送者、时间戳、大小、类型、原始名称、远端路径和标记状态。
客户端 MUST 优先使用 manifest 历史布局：`history/index.json` 记录分片引用，`history/shards/{YYYY-MM}.json` 记录对应时间分片内的消息条目，`history/tags.json` 记录标记标签目录。
客户端 MUST 保持对遗留 `history.json` 的读取兼容，并在需要写入遗留历史时转换或重建为 manifest 历史布局。
客户端在发送消息后 SHALL 追加或更新对应历史条目。
当用户标记、取消标记、调整标签、置顶、删除或清理消息时，客户端 SHALL 更新远端历史中的相应条目。
对于 manifest 历史布局，客户端 SHALL 将消息级别更新限制在受影响的分片以及必要的 `history/index.json` 或 `history/tags.json`，并且 MUST NOT 因单条消息或单个分片变化而重写未受影响的分片。

#### Scenario: 发送后追加历史
- **WHEN** 用户发送任意消息
- **THEN** manifest 历史中包含对应的消息记录
- **AND** 新消息的 `marked` 字段为 `false`
- **AND** 客户端只写入该消息所属的历史分片和必要的索引文件。

#### Scenario: 创建 manifest 历史
- **WHEN** 远端历史不存在且用户发送消息
- **THEN** 客户端创建 `history/index.json`
- **AND** 客户端创建包含该消息的 `history/shards/{YYYY-MM}.json` 分片。

#### Scenario: 同步时加载 manifest 历史
- **WHEN** 客户端执行同步且远端存在 manifest 历史
- **THEN** 客户端从 `history/index.json` 与被引用的 shard 文件读取消息记录并更新本地索引
- **AND** 同步结果包括每条消息的标记状态。

#### Scenario: 同步时加载遗留历史
- **WHEN** 客户端执行同步且远端只存在遗留 `history.json`
- **THEN** 客户端从 `history.json` 读取消息记录并更新本地索引，包括每条消息的标记状态。

#### Scenario: 在单个分片内更新标记状态
- **GIVEN** 某条消息存在于一个 manifest 历史分片中
- **WHEN** 用户标记或取消标记该消息
- **THEN** 客户端 SHALL 在该分片内更新消息的标记字段
- **AND** 客户端 SHALL NOT 上传无关分片文件。

#### Scenario: 只更新标签目录
- **WHEN** 用户创建或重命名标记标签且没有改变消息标签归属
- **THEN** 客户端 SHALL 更新 `history/tags.json`
- **AND** 客户端 SHALL NOT 上传消息分片文件。

#### Scenario: 按受影响分片移除历史条目
- **WHEN** 用户确认对选中消息执行远端删除或清理
- **THEN** 客户端 SHALL 从 manifest 历史中移除这些条目
- **AND** 客户端 SHALL 只上传包含被移除条目的分片以及必要的索引更新。
