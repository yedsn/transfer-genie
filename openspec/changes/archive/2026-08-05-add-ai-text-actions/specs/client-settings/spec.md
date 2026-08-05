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
- **WHEN** 用户修改 AI 文本动作的类型、名称、启用状态、收藏状态、系统提示词或用户提示词模板并保存
- **THEN** 修改后的动作配置被持久化
- **AND** 后续执行该动作时使用新的提示词配置

#### Scenario: 收藏提示词动作
- **WHEN** 用户收藏一个启用的提示词动作并保存
- **THEN** 该动作仍保留在原类型分组中
- **AND** 该动作同时出现在执行菜单的收藏子菜单中

#### Scenario: 查看收藏提示词动作
- **WHEN** 设置中存在已收藏的提示词动作
- **THEN** 设置界面的提示词类型列表显示收藏分组
- **AND** 用户选择收藏分组后可以查看已收藏动作

#### Scenario: 按类型分组浏览提示词动作
- **WHEN** 设置中存在多个类型的提示词动作
- **THEN** 设置界面在左侧显示提示词类型列表和启用数量
- **AND** 右侧仅展示当前选中类型下的动作配置
- **AND** 动作配置区域保持固定高度，超出部分可以滚动查看

#### Scenario: 添加自定义提示词动作
- **WHEN** 用户在设置中添加自定义提示词动作，填写动作 ID、类型、名称和提示词模板并保存
- **THEN** 自定义动作被持久化
- **AND** 用户可以在一键润色下拉菜单或右键菜单中选择该动作

#### Scenario: 删除自定义提示词动作
- **WHEN** 用户删除一个自定义提示词动作并保存
- **THEN** 该动作不再出现在提示词动作列表和执行菜单中
- **AND** 如果该动作曾是默认动作，系统选择仍存在的动作作为默认动作

#### Scenario: 启用或禁用提示词动作
- **WHEN** 用户关闭某个内置或自定义提示词动作并保存
- **THEN** 该动作配置仍保留
- **AND** 该动作不出现在一键润色下拉菜单和右键菜单中

#### Scenario: 导出 AI 设置时保护密钥
- **WHEN** 用户导出配置文件并提供导出密码
- **THEN** 导出内容包含 AI Provider 与提示词动作配置
- **AND** AI API Key 不以明文呈现

#### Scenario: 导入 AI 设置
- **WHEN** 用户导入包含 AI 设置的有效配置文件
- **THEN** 客户端恢复 AI Provider 与提示词动作配置
- **AND** 导入后的 AI 设置在后续执行 AI 文本动作时生效
