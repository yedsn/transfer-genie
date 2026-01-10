# app-shell Specification

## Purpose
TBD - created by archiving change add-message-controls. Update Purpose after archive.
## Requirements
### Requirement: 托盘常驻与菜单
应用 SHALL 在运行期间常驻系统托盘，点击托盘图标时显示主窗口，并提供“显示窗口/退出”菜单。

#### Scenario: 点击托盘图标显示窗口
- **WHEN** 用户点击托盘图标
- **THEN** 主窗口显示并获得焦点。

#### Scenario: 托盘菜单动作
- **WHEN** 用户选择“显示窗口”
- **THEN** 主窗口显示并获得焦点。
- **WHEN** 用户选择“退出”
- **THEN** 应用退出。

### Requirement: 全局快捷键切换
应用 SHALL 注册全局快捷键 `Alt+T`，用于切换主窗口显示/隐藏。

#### Scenario: 快捷键切换显示
- **WHEN** 用户按下 Alt+T
- **THEN** 应用切换主窗口的显示/隐藏状态。

