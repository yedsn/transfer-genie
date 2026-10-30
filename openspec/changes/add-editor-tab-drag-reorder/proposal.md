# Change: 编辑器标签拖动排序

## Why

编辑器标签虽然已经能拖到分栏边缘进行拆分，但在同一栏内放下时不会改变顺序，拖到其他分栏时也只能追加到末尾。用户无法通过拖动整理标签顺序，与标签栏应有的直接操作方式不一致。

## What Changes

- 支持把标签拖到目标标签的左半区或右半区，分别插入到该标签之前或之后。
- 标签栏排序与跨栏移动 SHALL 使用 SortableJS 提供稳定的命中、占位与跨列表投放。
- 同栏拖动 SHALL 调整标签顺序；跨栏拖动 SHALL 按落点插入到目标分栏的指定位置。
- 拖动经过标签时 SHALL 显示插入位置提示；离开或结束拖动 SHALL 清除提示。
- 拖到分栏边缘仍按现有规则拆分并停靠，拖到分栏中央空白区域仍加入该分栏。
- 排序后的标签顺序与活动标签 SHALL 通过现有工作区状态持久化，不修改草稿正文、标题、格式或来源。
- 标签拖动 SHALL 采用类似 VS Code 的直接操作：拖动中的标签跟随指针、其他标签实时让位，编辑区以中心或半栏矩形预览最终落点。
- 分栏 SHALL 使用可嵌套布局树；拖到任意栏的上、下、左、右边缘只拆分该栏，例如左侧可上下分栏而右侧继续保持整栏。
- 所有标签拖动 SHALL 采用移动语义；源标签失效或拖动事件重复到达时 SHALL 取消多余提交，绝不新建副本。
- 横向、纵向及标签菜单分栏 SHALL 完整复制当前标签，并生成后续修改互不影响的独立标签。
- SortableJS SHALL 以标签唯一 ID 而不是名称或显示内容识别拖动对象，确保同名标签移动正确。
- Markdown 标签跨栏后 SHALL 销毁旧栏编辑器实例并在新栏按正确内容重新初始化，避免复用旧 CodeMirror 缓存。

## Capabilities

### New Capabilities

- `editor-tab-ordering`: 描述编辑器标签通过拖动调整顺序、跨分栏按位置插入以及顺序持久化。

### Modified Capabilities

无。

## Impact

- 工作区纯状态逻辑：`src-ui/src/workspace/workspace-core.js`。
- 工作区响应式操作：`src-ui/src/workspace/composer-store.ts`。
- 标签拖动交互与样式：`src-ui/src/workspace/ComposerWorkspace.vue`、`src-ui/src/workspace/composer.css`。
- 工作区单元测试：`tests/test_workspace.js`。
- 新增前端依赖 `sortablejs`；不修改远端同步协议或消息发送流程。
