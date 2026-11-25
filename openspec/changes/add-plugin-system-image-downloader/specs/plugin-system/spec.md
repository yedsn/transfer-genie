## ADDED Requirements

### Requirement: Installable versioned plugins
桌面客户端 SHALL 支持从目录和 ZIP 安装版本化插件，校验路径、平台、入口、依赖和宿主接口兼容，安装登记能力而不执行插件代码。

#### Scenario: Install a valid plugin
- **WHEN** 用户安装兼容的插件包
- **THEN** 插件出现在管理页，完成配置并启用后注册其受支持能力
- **AND** 安装本身不启动脚本或常驻程序

#### Scenario: Reject an invalid archive
- **WHEN** 包含目录穿越、越界符号链接、重复受保护 id 或不兼容版本
- **THEN** 安装被拒绝且已有插件保持可用

### Requirement: Extensible capability registration
插件 SHALL 以能力列表声明入口，首期宿主 SHALL 支持 bot 能力和批量输入声明；未知能力 SHALL 保留但不激活，不影响已支持能力。

#### Scenario: Plugin declares future capabilities
- **WHEN** 插件同时声明 bot 与未来消息操作能力
- **THEN** 宿主注册兼容的 bot 入口，并显示其余能力暂不支持

### Requirement: Oneshot and service lifecycle
宿主 SHALL 支持任务启动后退出的 oneshot 和握手后持续接收任务的 service，采用版本化结构化协议并管理超时、取消、日志与退出。

#### Scenario: Idle oneshot bot
- **WHEN** 已启用的 oneshot 插件没有任务
- **THEN** 无需运行进程仍显示可用，任务到来时启动并在完成后退出

#### Scenario: Service startup failure
- **WHEN** service 未完成握手或启动崩溃
- **THEN** 不投递任务，显示原因且自动恢复尝试有明确上限

### Requirement: Plugin management and local configuration
设置页 SHALL 提供安装、启用、配置、测试、状态、日志、任务记录和卸载，service 额外提供启停及启动策略；配置与密钥 SHALL 留在安装设备，外部插件权限说明 SHALL 准确。

#### Scenario: Configure image destination
- **WHEN** 用户修改目录选择配置
- **THEN** 后续任务采用新目录，其他设备不接收该本机配置

#### Scenario: Disable or uninstall a running plugin
- **WHEN** 用户停用或卸载正在执行的插件
- **THEN** 宿主停止接收新任务并按取消策略结束托管任务及进程树，按用户选择保留或删除配置和日志

#### Scenario: Missing interpreter on desktop
- **WHEN** 脚本插件需要的解释器不可用
- **THEN** 显示缺失依赖并拒绝调用，不错误显示已就绪

### Requirement: Builtin and external distribution
宿主 SHALL 区分内置与外置来源，内置插件自动登记且只支持启停，外置支持导入与卸载；来源 SHALL 与能力和运行模式独立，内置 id 不得被外置覆盖。

#### Scenario: Application ships the image bot
- **WHEN** 用户首次打开插件管理
- **THEN** 图片插件显示为内置、默认停用，无卸载按钮，配置保存在用户数据目录

#### Scenario: Imported package impersonates a builtin
- **WHEN** 导入包声明 builtIn 或使用内置 id
- **THEN** 宿主不授予内置身份且拒绝冲突安装

### Requirement: Marketplace package installation
客户端 SHALL 支持配置市场索引、浏览、刷新、平台架构匹配、完整 ZIP 下载与 SHA-256 校验，通过同一本地安装器安装外置插件，并记录来源。

#### Scenario: Install compatible market package
- **WHEN** 用户选择适配本机平台和宿主版本的市场插件
- **THEN** 下载包含实际程序的完整包，校验哈希及 manifest 一致性后安装，安装过程不执行代码

#### Scenario: Hash mismatch or incomplete download
- **WHEN** 包下载不完整或哈希与版本清单不符
- **THEN** 拒绝安装并清理暂存，现有版本保持可用

#### Scenario: No marketplace configured or network offline
- **WHEN** 未配置真实索引地址或市场无法访问
- **THEN** 显示来源配置说明或缓存状态，已安装插件与本地导入继续可用

### Requirement: Explicit external plugin updates
外置插件 SHALL 展示兼容更新并由用户触发版本切换，更新失败保留原版本及配置；内置插件 SHALL 随应用更新而非由市场覆盖。

#### Scenario: Update fails validation
- **WHEN** 新包不兼容或未通过验证
- **THEN** 当前插件版本及用户配置保持不变
