## ADDED Requirements

### Requirement: AI Text Action Settings

设置界面 SHALL 提供 AI 文本处理配置区块，允许用户启用或关闭 AI 功能，配置 OpenAI-compatible Provider 的 Base URL、API Key、模型、温度和超时时间，并管理内置或自定义的提示词动作。AI 功能默认 SHALL 关闭。配置导入和导出 SHALL 包含 AI 设置，并且 API Key MUST 按敏感字段处理。

#### Scenario: 显示默认 AI 设置
- **WHEN** 用户首次打开设置且尚未保存过 AI 配置
- **THEN** AI 功能显示为关闭
- **AND** Provider 类型默认为 OpenAI-compatible
- **AND** 内置提示词动作可查看

#### Scenario: 保存 AI Provider 设置
- **WHEN** 用户启用 AI 功能，填写 Base URL、API Key、模型并保存设置
- **THEN** 设置保存成功
- **AND** 后续 AI 文本动作使用该 Provider 配置

#### Scenario: 管理提示词动作
- **WHEN** 用户修改 AI 文本动作的名称、启用状态、系统提示词或用户提示词模板并保存
- **THEN** 修改后的动作配置被持久化
- **AND** 后续执行该动作时使用新的提示词配置

#### Scenario: 导出 AI 设置时保护密钥
- **WHEN** 用户导出配置文件并提供导出密码
- **THEN** 导出内容包含 AI Provider 与提示词动作配置
- **AND** AI API Key 不以明文呈现

#### Scenario: 导入 AI 设置
- **WHEN** 用户导入包含 AI 设置的有效配置文件
- **THEN** 客户端恢复 AI Provider 与提示词动作配置
- **AND** 导入后的 AI 设置在后续执行 AI 文本动作时生效
