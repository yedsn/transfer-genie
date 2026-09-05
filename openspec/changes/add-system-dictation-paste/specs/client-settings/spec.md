## ADDED Requirements

### Requirement: System dictation settings
设置界面 SHALL 提供系统级语音听写总开关，允许用户启用或关闭该功能，并配置听写快捷键与听写时的目标行为。系统听写快捷键 SHALL 支持普通组合键以及 `right-alt` / `left-alt` 这类左右 Alt 单键。保存后的设置 SHALL 持久化并在重启后生效。关闭总开关时，全局听写快捷键与胶囊浮层 SHALL 不再响应。

#### Scenario: Enable system dictation shortcut
- **WHEN** 用户在设置中启用系统级听写并保存合法快捷键
- **THEN** 全局听写快捷键可用
- **AND** 后续按键将触发系统级听写而不是主窗口切换

#### Scenario: Disable system dictation shortcut
- **WHEN** 用户在设置中关闭系统级听写并保存
- **THEN** 全局听写快捷键不再响应
- **AND** 胶囊浮层不会出现

#### Scenario: Invalid dictation shortcut rejected
- **WHEN** 用户输入不合法的听写快捷键组合
- **THEN** 系统 SHALL 阻止保存并提示用户快捷键格式无效

#### Scenario: Ordinary speech shortcut removed
- **WHEN** 用户打开语音转文字设置
- **THEN** 设置界面 SHALL NOT 显示普通语音录制快捷键开关或快捷键输入框
- **AND** 主编辑器的语音按钮 SHALL 仍可手动启动普通语音录制

### Requirement: Dictation result stays available locally
设置界面 SHALL 在语音任务历史中继续显示系统级听写产生的本地结果，以便用户查看、复制、重试或重新打开完整音频。

#### Scenario: Dictation result appears in history
- **WHEN** 用户完成一次系统级听写
- **THEN** 设置页中的语音任务历史 SHALL 显示对应任务
- **AND** 任务中 SHALL 保留完整音频与识别文本
