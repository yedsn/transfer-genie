## Context

Transfer Genie 当前已经有以消息为中心的首页，以及 Markdown 编辑能力，其中包括同一文档内的编辑/预览分栏。这次要做的工作区直接落在消息输入框：输入框即工作区，让多条草稿、消息引用、图表素材同时打开，并分布在多个分栏中，活动草稿即发送目标。

实现方式需要适配现有的 Tauri 桌面应用和前端架构。前端本身混合了旧式 DOM 逻辑和 Vue 壳组件，因此工作区模型应该显式、可序列化，而不是从 DOM 状态反推。

## Goals / Non-Goals

**Goals:**

- 用明确的分栏与标签模型来表示可见工作区。
- 支持右上角横向和纵向分栏控制。
- 支持每个分栏独立的标签组。
- 支持文档标签和消息卡片的拖拽停靠。
- 持久化足够的工作区状态，以恢复用户上一次的工作上下文。
- 保持现有消息同步、发送、下载、标记和 Markdown 编辑行为不变。

**Non-Goals:**

- 第一版不实现完整 IDE 式的无限嵌套分栏引擎。
- 不增加协作编辑或多用户同步。
- 不增加文档 diff/merge 流程。
- 不增加白板或自由画布编辑。
- 不改变 WebDAV 消息存储或远端历史格式。

## Decisions

### Decision: Use a serializable workspace state model

工作区 SHALL 由结构化状态模型驱动，而不是由 DOM 派生布局状态。

建议结构：

```text
WorkspaceState
  panes[]
    id
    tabs[]
      id
      kind: document | message | diagram | preview
      title
      sourceRef
      dirty
    activeTabId
  layout
    orientation: single | horizontal | vertical | three-column
    paneOrder[]
```

这样做的原因是：分栏布局、标签移动和恢复状态都需要共享同一个事实来源。只靠 DOM 状态会让拖拽和持久化变得脆弱。

备选方案：每次分栏都直接操作 DOM。这个方案在第一次做按钮时更快，但一旦标签可以在分栏之间移动，就会很难维护。

### Decision: Start with constrained layout modes

第一版 SHOULD 支持单栏、横向双栏、纵向双栏和三列布局。第一版 SHOULD NOT 一开始就支持任意递归嵌套。

原因是：用户要的是接近 VSCode 的工作流，但不需要第一天就实现完整的 VSCode 网格引擎。受限布局已经能覆盖主要流程，同时让状态保存和投放区域更容易控制。

备选方案：一开始就实现通用分栏树。这个方案能支持更多布局，但会在核心工作流还未验证时显著增加测试和边界情况成本。

### Decision: Treat each pane as an independent tab group

每个分栏 SHALL 拥有自己的标签列表和活动标签。标签在分栏之间移动时，应同时移动标签条目并更新焦点。

原因是：这更贴合用户的心智模型。每个可见区域本身就是一个小型工作台。

备选方案：只保留一个全局标签条，然后在不同分栏中渲染不同的选中标签。这样会让拖拽停靠和分栏历史更难理解。

### Decision: Use explicit drag metadata for tabs and messages

被拖拽的对象 SHALL 携带归一化的负载，明确它来自文档标签还是消息卡片。

示例字段：

```text
kind: tab | message
sourceId
sourcePaneId
contentKind
sourceRef
```

随后投放区域再把这些负载转换为三种操作之一：在同栏打开、停靠到右侧、停靠到下方。

原因是：消息卡片和文档标签应该共享停靠逻辑，而不是重复写两套 UI 行为。

### Decision: Persist local workspace state outside remote WebDAV history

工作区布局和已打开标签 SHOULD 存在本地应用状态中，而不是写入 WebDAV 消息历史。

原因是：分栏布局属于本地 UI 偏好。如果把它同步进远端历史，会让用户意外，并且容易在多设备之间产生冲突。

## Risks / Trade-offs

- 拖拽行为可能和文本选择或编辑器拖拽手势冲突 -> 把可拖拽区域限制在标签栏和消息卡片的拖拽把手上，并提供清晰的投放区反馈。
- 持久化状态可能引用已删除消息或缺失的本地文档 -> 启动时校验恢复的标签，并显示可恢复的缺失内容状态。
- 分栏过多会让小窗口上的可用空间不足 -> 第一版限制布局类型，并在低于最小视口尺寸时收起或禁止不支持的分栏操作。
- 现有前端遗留代码会让状态归属不清晰 -> 新增专门的工作区运行时/存储层，并通过适配器整合现有编辑器和消息组件。

## Migration Plan

1. 增加工作区状态，并提供默认单栏布局。
2. 先把现有编辑器和内容渲染到活动分栏，不改变当前行为。
3. 增加分栏按钮和受限布局渲染。
4. 增加每个分栏独立的标签组。
5. 增加标签拖拽停靠。
6. 增加消息拖拽停靠。
7. 增加工作区状态持久化和启动恢复。

回滚方式：如果工作区功能导致不稳定，可以禁用新的工作区控制，回退到现有的单编辑器/消息视图，同时保留底层消息数据。

## Open Questions

- 工作区布局应该存在哪个本地文件里：设置文件、专门的工作区状态文件，还是通过 Tauri 连接的前端本地存储？
- 在分栏中打开的消息应该是只读预览、可编辑 Markdown 草稿，还是根据消息类型两者兼有？
