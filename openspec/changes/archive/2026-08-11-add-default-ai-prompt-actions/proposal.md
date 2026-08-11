# Change: Add default AI prompt actions

## Why

当前 AI 助手已支持内置和自定义提示词动作，但默认动作库覆盖面偏窄，主要集中在润色、开发、设计和影视场景。用户希望默认增加翻译、计划、总结、沟通表达、开发辅助和格式整理等常用动作，减少首次使用时手动配置提示词的成本。

## What Changes

- 扩展内置 AI 提示词动作库，新增通用、翻译、沟通、开发和格式类动作。
- 新增动作默认启用，并继续支持用户在设置中查看、收藏、禁用和编辑提示词模板。
- 保持现有 AI Provider、预览替换、安全执行和自定义提示词机制不变。

## Impact

- Affected specs: `client-settings`
- Affected code: `src/types.rs` default AI action definitions, AI action settings UI display, related default/settings tests
