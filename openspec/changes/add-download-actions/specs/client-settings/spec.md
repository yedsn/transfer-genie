## ADDED Requirements
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