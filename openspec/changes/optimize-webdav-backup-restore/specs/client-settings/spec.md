# Client Settings Spec Delta

## ADDED Requirements

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
