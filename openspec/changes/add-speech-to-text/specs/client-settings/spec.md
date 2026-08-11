## ADDED Requirements

### Requirement: Speech-To-Text Provider Settings
设置界面 SHALL 提供语音转文字配置，允许用户启用或关闭该功能，并配置 Volcengine Agent Plan ASR 所需的 API Key、Resource ID、接口地址或接口模式。默认 SHALL 关闭语音转文字，默认 Resource ID SHALL 为 `volc.seedasr.sauc.duration`，默认接口 SHALL 为 `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream`。

#### Scenario: 默认语音转文字设置
- **WHEN** 用户首次打开设置或加载旧版本配置
- **THEN** 语音转文字处于关闭状态
- **AND** Resource ID 与接口地址使用默认值

#### Scenario: 保存语音转文字配置
- **WHEN** 用户填写 API Key 并启用语音转文字后保存设置
- **THEN** 设置被持久化
- **AND** 后续语音识别请求使用该配置

#### Scenario: 缺少必填配置
- **WHEN** 用户启用语音转文字但未填写 API Key、Resource ID 或接口地址
- **THEN** 系统阻止保存或阻止启动录音并提示需要补全配置

### Requirement: Speech Recording Shortcut Settings
设置界面 SHALL 提供独立的语音录制快捷键配置；用户 SHALL 能选择包含修饰键的组合或关闭语音录制快捷键。保存时 SHALL 校验格式并持久化；导入/导出配置 SHALL 包含该字段并向后兼容旧版本。

#### Scenario: 配置语音录制快捷键
- **WHEN** 用户在设置中保存合法的语音录制快捷键组合
- **THEN** 设置保存成功
- **AND** 后续按该组合会切换语音录制状态

#### Scenario: 关闭语音录制快捷键
- **WHEN** 用户关闭语音录制快捷键并保存
- **THEN** 设置保存成功
- **AND** 后续按原组合不再切换语音录制状态

#### Scenario: 语音快捷键格式校验
- **WHEN** 用户输入不含修饰键或为空的语音录制快捷键组合
- **THEN** 系统阻止保存并提示需要选择合法组合

### Requirement: Speech Settings Secret Handling
配置导出 SHALL 将语音转文字 API Key 作为敏感字段加密处理；配置导入 SHALL 能恢复有效的语音转文字设置，并在解密失败时保持当前设置不变。

#### Scenario: 导出语音配置时保护密钥
- **WHEN** 用户导出包含语音转文字 API Key 的配置
- **THEN** 导出文件不以明文呈现 API Key

#### Scenario: 导入语音配置
- **WHEN** 用户导入包含语音转文字设置的有效配置文件并提供正确密码
- **THEN** 语音转文字设置被恢复并在后续录音识别中生效

#### Scenario: 导入失败保持当前配置
- **WHEN** 用户导入语音配置时文件无效或解密失败
- **THEN** 客户端提示错误
- **AND** 当前语音转文字设置保持不变
