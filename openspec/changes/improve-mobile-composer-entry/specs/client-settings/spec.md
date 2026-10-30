# Spec Delta

## ADDED Requirements

### Requirement: Editor default format configuration
客户端 SHALL 在移动端设置页提供“编辑器默认格式”设置，允许用户选择文本或 Markdown，并与桌面端共享同一持久化设置。保存成功后的选择 SHALL 用于后续没有可恢复草稿的新消息。

#### Scenario: Display the current default format
- **WHEN** 用户打开移动端设置页
- **THEN** 客户端显示当前已保存的文本或 Markdown 默认格式

#### Scenario: Save Markdown as the default format
- **WHEN** 用户选择 Markdown 并保存成功
- **THEN** 设置页显示 Markdown 为当前默认格式
- **AND** 后续没有可恢复草稿的新消息以 Markdown 打开

#### Scenario: Save text as the default format
- **WHEN** 用户选择文本并保存成功
- **THEN** 设置页显示文本为当前默认格式
- **AND** 后续没有可恢复草稿的新消息以文本打开

#### Scenario: Default format save fails
- **WHEN** 编辑器默认格式保存失败
- **THEN** 客户端保留保存前的持久化值
- **AND** 通过移动端全局提示告知用户保存失败
