## ADDED Requirements

### Requirement: Non-destructive editor tab collapse

应用 SHALL 在编辑器草稿标签右键菜单提供“收起当前”和“收起其他”。收起 SHALL 仅隐藏本栏标签栏中的对应条目，MUST NOT 删除草稿或修改名称、正文、格式、来源和数组顺序。每个非空分栏 MUST 保留至少一个可见标签，活动标签 MUST 可见。

#### Scenario: Collapse the active tab
- **WHEN** 用户收起当前正在编辑的标签且本栏还有其他可见标签
- **THEN** 该标签隐藏且内容保持不变，编辑器切换到右侧最近的可见标签，没有右侧可见标签时切换到左侧最近的可见标签

#### Scenario: Keep only the selected tab visible
- **WHEN** 用户对本栏某个标签选择“收起其他”
- **THEN** 本栏其他标签收起，目标标签可见且激活，其他分栏保持不变

#### Scenario: Prevent collapsing the last visible tab
- **WHEN** 本栏仅剩一个可见标签
- **THEN** “收起当前”不可用且状态操作不得将其收起

### Requirement: Restore collapsed editor tabs

应用 SHALL 在每栏右侧显示“已收起 N 个”入口，且仅在本栏存在收起标签时显示。列表 SHALL 按原始标签顺序展示收起标签，支持单个恢复并激活，以及全部展开并保留当前活动标签。入口 MUST 不被横向滚动标签挤出视口，列表 MUST 不被编辑器边界裁剪，支持点击外部和 Escape 关闭。

#### Scenario: Restore one tab
- **WHEN** 用户从收起列表选择一个草稿
- **THEN** 该标签在原位置恢复并成为活动标签，列表关闭，计数更新

#### Scenario: Restore all tabs
- **WHEN** 用户选择“全部展开”
- **THEN** 本栏全部标签恢复原有相对顺序，当前活动标签不变，其他分栏不变

### Requirement: Preserve visibility across workspace operations

收起状态 SHALL 随现有本地工作区保存与恢复，不影响远端消息。旧工作区没有收起字段时 SHALL 全部可见。关闭或移走最后一个可见标签后若本栏仍有草稿 SHALL 自动恢复一个。可见标签排序与跨栏移动 SHALL 使用稳定标签 ID，MUST NOT 混淆隐藏标签的索引或丢失草稿。

#### Scenario: Restart with collapsed tabs
- **WHEN** 用户收起若干标签后重新打开应用
- **THEN** 收起状态、草稿内容、完整顺序和活动标签均恢复

#### Scenario: Close the only visible tab
- **WHEN** 用户关闭本栏最后一个可见标签且本栏存在收起草稿
- **THEN** 系统恢复并激活一个收起草稿，不丢弃剩余草稿

#### Scenario: Sort visible tabs around collapsed tabs
- **WHEN** 用户在存在收起标签的分栏排序或跨栏移动可见标签
- **THEN** 仅被拖动标签按实际投放位置移动，收起标签保持内容与彼此的相对顺序，源栏与目标栏的活动标签可见
