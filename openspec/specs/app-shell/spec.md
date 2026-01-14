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
应用 SHALL 支持可配置的全局快捷键用于显示/隐藏主窗口，默认组合为 `Alt+T`；用户可在设置中更改组合或禁用该快捷键。快捷键组合 SHALL 至少包含一个修饰键（Ctrl/Alt/Shift/Super），无效或系统拒绝注册时 SHALL 提示用户并保持当前状态；禁用时 SHALL 不响应任何组合。

#### Scenario: 默认全局快捷键
- **WHEN** 应用首次启动且未修改设置
- **THEN** 注册 Alt+T 作为全局快捷键用于切换主窗口显示/隐藏

#### Scenario: 修改快捷键后生效
- **WHEN** 用户在设置中保存新的全局快捷键组合
- **THEN** 应用取消旧组合并注册新组合，随后使用新组合切换主窗口

#### Scenario: 禁用全局快捷键
- **WHEN** 用户在设置中关闭全局快捷键并保存
- **THEN** 应用取消注册全局快捷键，按原组合不再切换主窗口

#### Scenario: 注册失败提示
- **WHEN** 用户选择的快捷键组合无法注册（被系统占用或不合法）
- **THEN** 应用保留原状态并向用户提示注册失败原因

