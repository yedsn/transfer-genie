# Change: 全局快捷键可配置

## Why
- 现有全局快捷键固定为 Alt+T，用户希望在设置中自定义或禁用，以适应个人习惯与冲突场景。

## What Changes
- 在设置页新增全局快捷键配置，默认保持 Alt+T，可选择其他组合或禁用。
- 应用内全局快捷键注册/反注册逻辑使用持久化配置，修改后即时生效。

## Impact
- Affected specs: app-shell, client-settings
- Affected code: 全局快捷键注册逻辑、设置模型持久化、设置界面交互
