# app-shell Specification

## Purpose
TBD - created by archiving change add-message-controls. Update Purpose after archive.
## Requirements
### Requirement: 托盘常驻与菜单
应用 SHALL 在运行期间常驻系统托盘，点击托盘图标时显示主窗口，并提供“显示窗口”“禁用快捷键/启用快捷键”“退出”菜单项；快捷键菜单项 SHALL 反映当前状态。

#### Scenario: 点击托盘图标显示窗口
- **WHEN** 用户点击托盘图标
- **THEN** 主窗口显示并获得焦点

#### Scenario: 托盘菜单动作
- **WHEN** 用户选择“显示窗口”
- **THEN** 主窗口显示并获得焦点
- **WHEN** 用户选择“退出”
- **THEN** 应用退出
- **WHEN** 用户选择“禁用快捷键”
- **THEN** 应用停用全局快捷键并在菜单中显示“启用快捷键”
- **WHEN** 用户选择“启用快捷键”
- **THEN** 应用启用全局快捷键并在菜单中显示“禁用快捷键”

### Requirement: 全局快捷键切换
应用 SHALL 注册全局快捷键 `Alt+T` 用于切换主窗口显示/隐藏，默认启用。应用 SHALL 支持禁用与重新启用该快捷键；禁用时不响应 `Alt+T`，重新启用时恢复注册。

#### Scenario: 快捷键切换显示
- **WHEN** 全局快捷键处于启用状态且用户按下 Alt+T
- **THEN** 应用切换主窗口显示/隐藏

#### Scenario: 禁用快捷键后不响应
- **WHEN** 用户禁用全局快捷键并按下 Alt+T
- **THEN** 应用不切换主窗口显示/隐藏

