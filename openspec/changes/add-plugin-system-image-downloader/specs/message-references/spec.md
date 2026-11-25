## ADDED Requirements

### Requirement: Multiple message references
桌面和移动客户端 SHALL 支持同一存储空间内单条及多选引用，最多 50 条，按原消息顺序去重；输入区 SHALL 支持预览、展开、逐项移除及取消，发送后持久化引用列表。

#### Scenario: Reference several images
- **WHEN** 用户选择三条图片消息并点击引用
- **THEN** 输入区显示三条引用，发送后消息保留各自稳定标识和摘要

#### Scenario: Change storage space
- **WHEN** 输入草稿含引用时切换存储空间
- **THEN** 引用留在原空间草稿，不混入另一空间的发送内容

### Requirement: Reference navigation and unavailable sources
引用 SHALL 保存原记录标识与显示快照，支持定位原消息；旧消息无引用字段 SHALL 正常显示。

#### Scenario: Referenced source is deleted
- **WHEN** 原消息已删除
- **THEN** 引用仍显示摘要及不可用状态，不能定位到其他消息

#### Scenario: Load legacy WebDAV messages
- **WHEN** 加载无 message_id 或引用字段的旧消息
- **THEN** 原显示行为保持兼容，并可用空间内稳定文件标识引用该消息

### Requirement: Structured reference input
机器人任务 SHALL 接收有序引用列表及发送时文本快照和附件版本标识，宿主 SHALL 在验证空间权限后提供原件，不以预览图或摘要代替输入。

#### Scenario: Referenced image used by a plugin
- **WHEN** 用户引用图片并调用机器人
- **THEN** 宿主按需取得匹配版本的原件并交给目标机器插件，且不暴露 Provider 凭据

#### Scenario: Original attachment is unavailable
- **WHEN** 引用版本已无法下载
- **THEN** 对应任务项失败并说明原因，不替换为变更后的附件
