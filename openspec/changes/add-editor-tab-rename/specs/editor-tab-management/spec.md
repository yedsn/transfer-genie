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

命名窗口 SHALL 在名称输入框旁提供 AI 生成按钮。应用 MUST 仅在用户主动点击该按钮后，使用现有 AI 配置和当前草稿内容请求一个简洁的标签名称，并 SHALL 用生成结果替换名称输入框的当前值。生成过程 SHALL NOT 自动保存标签名称。

#### Scenario: Opening the naming window keeps content local
- **WHEN** 用户打开标签命名窗口
- **THEN** 应用 MUST NOT 发起 AI 名称生成请求
- **AND** 应用 MUST NOT 因打开窗口而向 AI 服务发送草稿内容

#### Scenario: Generate a suggestion after explicit request
- **WHEN** 用户为包含内容的草稿点击名称输入框旁的 AI 生成按钮且 AI 已正确配置
- **THEN** AI 图标按钮 SHALL 显示忙碌状态
- **AND** 生成完成后 SHALL 用 AI 名称替换名称输入框的当前值

#### Scenario: Confirm the generated name
- **WHEN** AI 名称已经填入输入框但用户尚未确认
- **THEN** 标签 SHALL 保留原名称
- **AND** 用户 SHALL 能够编辑生成名称后再保存或取消

#### Scenario: Keep manual naming available while generating
- **WHEN** AI 名称建议仍在生成
- **THEN** 用户 SHALL 能够继续编辑并手动确认名称
- **AND** 命名窗口关闭后返回的过期 AI 结果 SHALL NOT 修改标签名称

#### Scenario: AI is unavailable
- **WHEN** 用户点击 AI 生成按钮，但 AI 未启用、配置不完整或名称生成失败
- **THEN** 应用 SHALL 保留名称输入框的原值
- **AND** 用户 SHALL 仍能手动输入并保存名称

#### Scenario: Draft has no content
- **WHEN** 用户为没有非空内容的草稿点击 AI 生成按钮
- **THEN** 应用 SHALL 不发起 AI 名称生成请求
- **AND** 应用 SHALL 保留名称输入框的原值

### Requirement: Configure the AI tab naming prompt

应用 SHALL 在 AI 设置中提供可持久化的标签命名提示词。标签 AI 命名请求 SHALL 使用已保存的提示词模板，并 SHALL 支持 `{{text}}` 和 `{{format}}` 占位符。空白配置 SHALL 回退到应用默认提示词。

#### Scenario: Save a custom tab naming prompt
- **WHEN** 用户在 AI 设置中修改标签命名提示词并保存设置
- **THEN** 应用 SHALL 持久化该提示词
- **AND** 后续标签 AI 命名请求 SHALL 使用该提示词

#### Scenario: Load a legacy configuration
- **WHEN** 应用加载不包含标签命名提示词的旧配置
- **THEN** AI 设置 SHALL 使用应用默认标签命名提示词

#### Scenario: Fall back from a blank prompt
- **WHEN** 用户保存仅包含空白字符的标签命名提示词
- **THEN** 应用 SHALL 将其恢复为默认标签命名提示词

### Requirement: Persist a custom editor tab name

应用 SHALL 将自定义标签名作为现有工作区状态的一部分保存。标签切换、标签拖动、分栏变化和应用重启 SHALL 不清除已保存的自定义名称。

#### Scenario: Restore a renamed tab
- **WHEN** 用户重命名标签后关闭并重新打开应用
- **THEN** 工作区恢复时标签 SHALL 显示已保存的自定义名称

#### Scenario: Move a renamed tab
- **WHEN** 用户将已重命名的标签拖动到另一分栏
- **THEN** 目标分栏中的标签 SHALL 保留自定义名称
