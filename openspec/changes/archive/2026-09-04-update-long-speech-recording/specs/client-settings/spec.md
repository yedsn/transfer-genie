## ADDED Requirements

### Requirement: Long Speech Recording Task Presentation
设置界面 SHALL 将一次语音录制会话展示为一个语音转文字任务，即使该录音在转写时被拆分为多个内部 ASR 请求。任务 SHALL 使用完整录音、合并后的识别文本、整体状态和整体错误信息进行展示。

#### Scenario: 设置中只显示一个长录音任务
- **WHEN** 用户完成一次长语音录制并转写成功
- **THEN** 设置界面的语音转文字任务列表只新增一条任务
- **AND** 该任务对应完整录音而不是内部转写分片

#### Scenario: 长录音任务重试
- **WHEN** 用户在设置界面对长录音任务触发重试
- **THEN** 应用使用该任务的完整录音重新转写
- **AND** 设置界面仍保留为同一个任务项的状态更新
