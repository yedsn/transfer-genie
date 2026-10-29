# Spec Delta

## Purpose

定义编辑器标签的自定义命名与 AI 名称建议能力，使用户能够快速辨认多个草稿，并在工作区状态变化及应用重启后保留采用的名称。

## ADDED Requirements

### Requirement: Rename an editor tab

应用 SHALL 允许用户从编辑器标签的上下文菜单打开命名窗口。命名窗口 SHALL 使用当前显示名称作为输入框初始值，并 SHALL 允许用户确认或取消编辑。

#### Scenario: Confirm a new tab name
- **WHEN** 用户从标签上下文菜单选择“重命名”，在命名窗口中输入非空白名称并确认
- **THEN** 标签 SHALL 显示新名称
- **AND** 草稿内容与来源 SHALL 保持不变

#### Scenario: Cancel tab renaming
- **WHEN** 用户在重命名过程中取消编辑
- **THEN** 标签 SHALL 保留重命名前的名称

#### Scenario: Reject a blank tab name
- **WHEN** 用户输入仅包含空白字符的名称并尝试确认
- **THEN** 应用 SHALL 不保存空白名称
- **AND** 标签 SHALL 保留重命名前的名称

### Requirement: Generate an AI tab name suggestion

当命名窗口打开且当前草稿包含非空内容时，应用 SHALL 自动使用现有 AI 配置请求一个简洁的标签名称，并 SHALL 将结果作为可选择的建议显示在名称输入框下方。生成过程 SHALL NOT 阻止用户手动输入或保存名称。

#### Scenario: Generate a suggestion when the naming window opens
- **WHEN** 用户为包含内容的草稿打开命名窗口且 AI 已正确配置
- **THEN** 命名窗口 SHALL 自动显示生成中状态
- **AND** 生成完成后 SHALL 在名称输入框下方显示一个 AI 名称建议

#### Scenario: Adopt the generated suggestion
- **WHEN** 用户点击已生成的 AI 名称建议
- **THEN** 应用 SHALL 将该建议直接保存为标签名称
- **AND** 命名窗口 SHALL 关闭

#### Scenario: Keep manual naming available while generating
- **WHEN** AI 名称建议仍在生成
- **THEN** 用户 SHALL 能够继续编辑并手动确认名称
- **AND** 命名窗口关闭后返回的过期 AI 结果 SHALL NOT 修改标签名称

#### Scenario: AI is unavailable
- **WHEN** AI 未启用、配置不完整或名称生成失败
- **THEN** 命名窗口 SHALL 显示非阻塞的不可用或失败提示
- **AND** 用户 SHALL 仍能手动输入并保存名称

#### Scenario: Draft has no content
- **WHEN** 用户为没有非空内容的草稿打开命名窗口
- **THEN** 应用 SHALL 不发起 AI 名称生成请求
- **AND** 命名窗口 SHALL 提示需要草稿内容才能生成建议
- **AND** 用户 SHALL 仍能手动输入并保存名称

### Requirement: Persist a custom editor tab name

应用 SHALL 将自定义标签名作为现有工作区状态的一部分保存。标签切换、标签拖动、分栏变化和应用重启 SHALL 不清除已保存的自定义名称。

#### Scenario: Restore a renamed tab
- **WHEN** 用户重命名标签后关闭并重新打开应用
- **THEN** 工作区恢复时标签 SHALL 显示已保存的自定义名称

#### Scenario: Move a renamed tab
- **WHEN** 用户将已重命名的标签拖动到另一分栏
- **THEN** 目标分栏中的标签 SHALL 保留自定义名称
