## ADDED Requirements
### Requirement: Message fullscreen preview
客户端 SHALL 在消息列表中提供全屏预览层；双击任意消息 SHALL 打开全屏预览并展示消息全文/附件信息、发送者与时间戳；预览层 SHALL 提供显式关闭控制并支持快捷关闭。

#### Scenario: Double-click opens fullscreen preview
- **WHEN** 用户在消息列表中双击一条消息
- **THEN** 应弹出覆盖全屏的预览层，显示该消息的全文或文件名称/预览信息
- **AND** 预览层包含发送者与时间戳信息，背景被遮罩且原列表保持滚动位置

#### Scenario: Close fullscreen preview
- **WHEN** 用户在预览层点击关闭控件、点击遮罩区域或按 Esc
- **THEN** 预览层关闭并返回列表视图
- **AND** 原消息列表的选中与滚动状态保持不变
