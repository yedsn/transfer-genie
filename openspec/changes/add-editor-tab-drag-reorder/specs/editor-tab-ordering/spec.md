## ADDED Requirements

### Requirement: Reorder tabs by dragging

应用 SHALL 允许用户把编辑器标签拖放到同一分栏的另一个标签之前或之后，并 SHALL 按落点更新该分栏内的标签顺序。拖动过程中的插入位置 SHALL 有可见提示，移动 SHALL 保留标签内容、标题、格式、来源和活动状态。

#### Scenario: Move a tab forward within a pane
- **WHEN** 用户把标签 A 拖到同栏标签 C 的右半区
- **THEN** 标签 A SHALL 移动到标签 C 之后
- **AND** 其他标签的相对顺序 SHALL 保持不变

#### Scenario: Move a tab backward within a pane
- **WHEN** 用户把标签 C 拖到同栏标签 A 的左半区
- **THEN** 标签 C SHALL 移动到标签 A 之前
- **AND** 其他标签的相对顺序 SHALL 保持不变

#### Scenario: Show the insertion position
- **WHEN** 标签拖动经过另一个标签的左半区或右半区
- **THEN** 应用 SHALL 像 VS Code 一样让相邻标签实时让位并显示最终插入位置
- **AND** 标签移动、取消或离开标签栏后 SHALL 清除该提示

#### Scenario: Preserve tab content after reordering
- **WHEN** 用户调整一个已有内容或自定义标题的标签顺序
- **THEN** 标签正文、标题、格式和来源 SHALL 保持不变
- **AND** 被移动的标签 SHALL 保持活动状态

### Requirement: Insert dragged tabs across panes

应用 SHALL 允许用户把标签拖到其他分栏的指定标签之前或之后，并 SHALL 按落点把标签插入该分栏。分栏边缘投放仍 SHALL 执行现有拆分停靠规则，分栏中央空白区域投放仍 SHALL 把标签加入目标分栏。

#### Scenario: Insert into another pane at a tab position
- **WHEN** 用户把标签从分栏一拖到分栏二某个标签的右半区
- **THEN** 该标签 SHALL 从分栏一移除
- **AND** 该标签 SHALL 插入到分栏二目标标签之后
- **AND** 该标签 SHALL 成为分栏二的活动标签

#### Scenario: Keep edge docking behavior
- **WHEN** 用户把标签拖到分栏边缘区域而不是标签栏
- **THEN** 应用 SHALL 以半栏矩形预览最终拆分位置
- **AND** 放下后 SHALL 按预览的左右或上下方向拆分

#### Scenario: Split one side without changing its sibling group
- **GIVEN** 工作区包含左右两个分栏
- **WHEN** 用户把标签拖到左侧分栏的下半部分
- **THEN** 左侧分栏 SHALL 拆分为上下两个分栏
- **AND** 右侧分栏 SHALL 保持一个覆盖完整高度的独立分栏
- **AND** 嵌套布局 SHALL 随工作区状态持久化并恢复

#### Scenario: Move into an editor group body
- **WHEN** 用户把标签拖到另一个分栏编辑区的中央区域
- **THEN** 应用 SHALL 以中央矩形预览加入该分栏
- **AND** 放下后该标签 SHALL 成为目标分栏的活动标签

### Requirement: Persist editor tab order

应用 SHALL 将拖动调整后的标签顺序作为现有工作区状态的一部分保存，并在应用重启时恢复。

#### Scenario: Restore reordered tabs
- **WHEN** 用户调整标签顺序后关闭并重新打开应用
- **THEN** 工作区 SHALL 按调整后的顺序恢复标签

### Requirement: Move tabs without duplication

应用 SHALL 将标签拖动统一解释为移动操作，一个标签 ID 在工作区状态与界面中 SHALL 始终最多出现一次。标签拖动源失效或同一次拖动产生重复结束事件时，应用 SHALL 忽略多余操作而不是创建标签副本。

#### Scenario: Move a tab exactly once
- **WHEN** 用户把标签拖到其他标签栏或分栏边缘
- **THEN** 源分栏 SHALL 移除该标签
- **AND** 目标位置 SHALL 只出现一个相同标签

#### Scenario: Ignore a stale tab drag payload
- **WHEN** 标签拖动结束时源标签已不存在
- **THEN** 应用 SHALL 取消该次投放
- **AND** 应用 SHALL NOT 根据拖动负载新建标签副本

#### Scenario: Expand the remaining pane after merging in fullscreen
- **GIVEN** 编辑器处于全屏状态且包含左右两个分栏
- **WHEN** 用户把右栏最后一个标签移动到左栏合并
- **THEN** 工作区 SHALL 收起为单栏
- **AND** 唯一分栏 SHALL 铺满工作区的可用宽度和高度
