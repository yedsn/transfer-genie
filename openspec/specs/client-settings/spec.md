# client-settings Specification

## Purpose
TBD - created by archiving change add-webdav-transfer-client. Update Purpose after archive.
## Requirements
### Requirement: WebDAV connection settings
客户端 SHALL 允许用户配置多个 WebDAV 端点（包含名称、URL 与认证凭据），并持久化保存。
客户端 SHALL 支持为每个端点设置启用状态，并仅允许启用的端点被设置为当前活动端点。
客户端 SHALL 使用当前活动端点进行所有同步与上传操作，并在认证或连接失败时显示错误状态。

#### Scenario: Save multiple WebDAV endpoints
- **WHEN** 用户新增或编辑多个 WebDAV 端点并保存
- **THEN** 端点列表与认证信息被持久化并在重启后可用

#### Scenario: Update WebDAV endpoint name
- **WHEN** 用户为 WebDAV 端点设置或修改名称并保存
- **THEN** 端点名称在列表与切换入口中展示

#### Scenario: Select active WebDAV endpoint
- **WHEN** 用户选择某个已启用端点作为当前活动端点
- **THEN** 后续同步与上传使用该端点

#### Scenario: Disable active WebDAV endpoint
- **WHEN** 用户将当前活动端点设为禁用
- **THEN** 客户端清除活动端点并提示用户选择另一个已启用端点

### Requirement: Sender name configuration
客户端 SHALL 在首次启动时生成一个随机发送者名称，并允许用户在设置中修改。
发送者名称 SHALL 用于所有外发消息的元数据。

#### Scenario: Default sender name
- **WHEN** 应用首次启动
- **THEN** 生成随机发送者名称并用于后续发送

#### Scenario: Update sender name
- **WHEN** 用户在设置中修改发送者名称
- **THEN** 后续消息使用新的名称

### Requirement: Refresh interval configuration
客户端 SHALL 允许用户设置刷新间隔（秒），默认 5 秒。
刷新间隔变更 SHALL 在后续同步周期生效。

#### Scenario: Change refresh interval
- **WHEN** 用户将刷新间隔设置为新值
- **THEN** 后续同步周期使用新的间隔

### Requirement: Download directory configuration
客户端 SHALL 提供下载目录设置，默认值为系统下载目录，并允许用户修改。
下载目录为空时客户端 SHALL 使用系统下载目录作为回退值。

#### Scenario: Default download directory
- **WHEN** 用户首次启动应用
- **THEN** 下载目录设置为系统默认下载目录

#### Scenario: Update download directory
- **WHEN** 用户修改下载目录设置并保存
- **THEN** 后续下载使用新的目录

### Requirement: Download conflict handling
客户端下载时若目标目录存在同名文件，客户端 SHALL 提示用户选择覆盖或改名。
选择改名时客户端 SHALL 自动追加序号并保存。

#### Scenario: Resolve filename conflict
- **WHEN** 下载目标目录存在同名文件
- **THEN** 客户端提示“覆盖/改名/取消”
- **AND** 选择改名时使用自动追加序号的文件名保存

### Requirement: 手动清理旧数据
客户端 SHALL 在设置中提供手动清理功能，允许用户选择清理时间范围（全部、7天以前）以及清理范围（仅本地、包含 WebDAV 远端）。清理执行时 SHALL 删除匹配范围的本地消息记录与已下载文件；若包含 WebDAV 远端，则同时删除 WebDAV `files/` 对应文件与 `history.json` 条目。

#### Scenario: 清理全部且仅本地
- **WHEN** 用户选择清理时间范围为“全部”且范围为“仅本地”并确认清理
- **THEN** 本地消息记录与已下载文件被删除
- **AND** 远端 WebDAV 数据保持不变

#### Scenario: 清理 7 天以前且包含 WebDAV
- **WHEN** 用户选择清理时间范围为“7天以前”且范围为“包含 WebDAV 远端”并确认清理
- **THEN** 本地 7 天以前的消息记录与已下载文件被删除
- **AND** WebDAV `files/` 中对应文件与 `history.json` 条目被删除

### Requirement: Configuration import and export
客户端 SHALL 允许用户将当前配置导出为文件，并从配置文件导入设置以覆盖现有配置。导出文件中的敏感字段 MUST 经过基于用户密码的加密处理。导入失败时客户端 SHALL 保持当前配置不变并提示错误。

#### Scenario: Export configuration to file
- **WHEN** 用户在设置页触发导出并选择保存位置，输入导出密码
- **THEN** 系统生成包含当前配置的文件
- **AND** 导出内容中的敏感字段不以明文呈现

#### Scenario: Import configuration successfully
- **WHEN** 用户选择有效的配置文件导入并提供正确的解密密码
- **THEN** 客户端覆盖当前配置并立即生效

#### Scenario: Import configuration failed
- **WHEN** 用户选择无效或损坏的配置文件，或解密失败（包含密码错误）
- **THEN** 客户端提示错误
- **AND** 当前配置保持不变

### Requirement: 全局快捷键配置
设置界面 SHALL 提供全局快捷键配置，默认显示 Alt+T；用户 SHALL 能选择包含修饰键的组合或关闭全局快捷键。保存时 SHALL 校验格式并持久化；导入/导出配置 SHALL 包含该字段并向后兼容旧版本（缺省时使用默认）。

#### Scenario: 显示默认快捷键
- **WHEN** 用户首次打开设置
- **THEN** 全局快捷键显示为 Alt+T 且处于启用状态

#### Scenario: 更新快捷键组合
- **WHEN** 用户选择新的合法组合并保存
- **THEN** 设置保存成功并在后续使用新组合

#### Scenario: 关闭全局快捷键
- **WHEN** 用户关闭全局快捷键后保存
- **THEN** 设置保存成功并标记快捷键为禁用

#### Scenario: 格式校验
- **WHEN** 用户输入不含修饰键或为空的组合
- **THEN** 系统阻止保存并提示需要选择合法组合

### Requirement: WebDAV Data Backup
客户端 SHALL 提供将 WebDAV 数据（包含 `files/` 目录与 `history.json`）备份为本地 ZIP 文件的功能。
备份过程 SHALL 支持大文件（>100MB）处理，避免内存溢出。
备份过程 SHALL 实时反馈进度（扫描中、下载中、压缩中、完成/失败）。

#### Scenario: Backup with progress
- **WHEN** 用户点击“备份 WebDAV”
- **THEN** 客户端弹出文件保存对话框
- **WHEN** 用户选择路径并确认
- **THEN** 客户端开始备份，并显示进度条或当前处理文件
- **AND** 备份完成后提示成功

### Requirement: WebDAV Data Restore
客户端 SHALL 提供从本地 ZIP 文件恢复 WebDAV 数据的功能。
恢复操作 SHALL 在覆盖前请求用户确认。
恢复过程 SHALL 支持大文件处理，并实时反馈进度。
恢复过程 SHALL 清除远程现有 `files/` 数据以确保与备份一致。

#### Scenario: Restore with progress
- **WHEN** 用户点击“恢复 WebDAV”并选择有效的备份文件
- **THEN** 客户端弹出确认对话框警告数据将被覆盖
- **WHEN** 用户确认
- **THEN** 客户端开始恢复，并显示进度条或当前上传文件
- **AND** 恢复完成后提示成功

