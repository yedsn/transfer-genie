## ADDED Requirements

### Requirement: Confirm closing the editor tab after sending

应用 SHALL 在通过编辑器标签发送的本次文本和所选文件全部发送成功后，显示标题为“自动执行倒计时：N 秒”的 5 秒倒计时确认框，标题 SHALL 使用较深的主题色，正文提示发送完毕、即将关闭发送来源标签。应用 SHALL 在发送过程中保留该标签的内容，并使用发送时的标签标识关联倒计时操作。用户点击取消时，应用 SHALL 取消自动关闭，并保留该标签及其当前内容，包括标题和格式；用户点击确认时，应用 SHALL 立即关闭来源标签；用户没有操作时，应用 SHALL 在倒计时结束后关闭来源标签。

#### Scenario: Keep the sent tab
- **WHEN** 用户从编辑器标签发送消息成功并在 5 秒倒计时内点击取消
- **THEN** 来源标签及其当前内容、标题和格式 SHALL 保留
- **AND** 自动关闭倒计时 SHALL 被取消
- **AND** 保留的标签 SHALL 能按现有工作区规则恢复

#### Scenario: Automatically close the sent tab
- **WHEN** 用户从编辑器标签发送消息成功后 5 秒内没有点击取消
- **THEN** 来源标签 SHALL 被关闭
- **AND** 其他标签 SHALL 不受影响

#### Scenario: Close the final editor tab
- **WHEN** 发送成功后的确认或倒计时关闭工作区中的最后一个标签
- **THEN** 应用 SHALL 自动创建一个空白标签
- **AND** 新标签 SHALL 使用当前默认编辑格式

#### Scenario: Switch tabs while sending
- **WHEN** 用户在后台发送期间切换到其他标签
- **THEN** 发送成功后的确认 SHALL 针对发送来源标签
- **AND** 关闭操作 SHALL NOT 误关闭当前选中的其他标签

#### Scenario: Edit the source tab during sending
- **WHEN** 用户在发送期间修改来源标签
- **THEN** 应用 SHALL 明确提示自动关闭会丢弃后续修改，并允许用户在倒计时内选择保留
- **AND** 发送结果 SHALL NOT 覆盖这些修改

#### Scenario: Source tab already closed
- **WHEN** 用户在发送完成前已关闭来源标签
- **THEN** 应用 SHALL NOT 为该标签弹出关闭确认
- **AND** SHALL NOT 关闭其他标签

#### Scenario: Send fails or partially fails
- **WHEN** 本次发送的文本或任一所选文件发送失败
- **THEN** 应用 SHALL NOT 弹出发送成功后的关闭确认
- **AND** 应用 SHALL 保留来源标签的当前内容供用户检查
