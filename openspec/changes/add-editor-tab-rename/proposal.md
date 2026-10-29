# Proposal

## Why

编辑器标签目前只能使用自动生成的标题，用户无法按草稿用途为标签命名，多个相似草稿同时打开时难以快速辨认。需要提供类似 Codex 会话命名的轻量重命名能力，并利用现有 AI 配置帮助用户快速得到简洁、可辨认的名称。

## What Changes

- 在编辑器标签的右键菜单中增加“重命名”。
- 打开命名窗口后，自动根据当前草稿内容请求一个 AI 名称建议，并显示在名称输入框下方。
- 点击 AI 建议即可直接采用该名称；同时保留手动输入、确认和取消能力，并拒绝空白名称。
- AI 未配置、草稿为空或生成失败时，命名窗口仍可正常手动使用，并提供清晰的状态提示。
- 将自定义标签名写入现有工作区状态，使其在切换、拖动和应用重启后保持不变。
- 不修改草稿内容、消息来源或发送行为。

## Capabilities

### New Capabilities

- `editor-tab-management`: 描述编辑器标签的用户自定义命名、交互规则与状态持久化。

### Modified Capabilities

无。

## Impact

- 前端工作区状态、AI 调用与操作：`src-ui/src/workspace/workspace-core.js`、`src-ui/src/workspace/composer-store.ts`、现有 `transferGenieApi.ai.processText` 调用链。
- 编辑器标签交互与样式：`src-ui/src/workspace/ComposerWorkspace.vue`、`src-ui/src/workspace/composer.css`。
- 工作区和草稿测试：`tests/test_workspace.js`、必要的前端构建检查。
- 不新增外部依赖，不新增 AI 后端接口，不影响远端存储协议。
