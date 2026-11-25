## ADDED Requirements

### Requirement: First party installable image bot
应用 SHALL 提供遵循通用插件协议的内置图片插件，Windows/macOS 包含对应独立可执行资源，不要求另装 Python/Node；默认采用 oneshot 模式，自动登记且默认停用。

#### Scenario: Install from plugin manager
- **WHEN** 用户在管理页启用已登记的内置图片下载机器人
- **THEN** 注册本机实例并在获准空间中可被 @ 调用，无任务时无需常驻进程

### Requirement: Download originals to the system downloads directory
机器人 SHALL 支持引用的图片原件和 HTTP(S) 图片直链，默认保存到执行设备系统下载目录，可通过插件设置修改；默认仅回传结果，不重新上传下载文件。

#### Scenario: Mobile invokes PC with several image references
- **WHEN** 手机多选图片并调用 PC 机器人
- **THEN** PC 保存各原件到自身下载目录，聊天回复文件名、目标设备及逐项结果

#### Scenario: System download directory cannot be resolved
- **WHEN** 无法取得系统下载目录且用户未配置目录
- **THEN** 提示选择目录，不写入未知默认路径

### Requirement: Validated bounded image processing
机器人 SHALL 验证实际图片内容，限制下载大小、重定向和超时，清洗文件名，不允许输入路径越界，不覆盖已有不同内容文件。

#### Scenario: URL returns HTML disguised as an image
- **WHEN** 直链返回非图片字节
- **THEN** 对应项失败且不留下伪图片文件

#### Scenario: Filename collision
- **WHEN** 下载文件与目录内不同内容的文件同名
- **THEN** 使用不冲突文件名并保留既有文件

#### Scenario: Download exceeds configured bounds
- **WHEN** 响应超过大小或时间限制
- **THEN** 中止该项并清理临时文件，其他项结果仍可报告

### Requirement: Recoverable file publication
机器人 SHALL 记录 task/item 与目标路径和内容哈希，使用临时文件及原子发布；崩溃恢复 SHALL 核实既有文件后恢复完成状态，避免重复保存。

#### Scenario: Crash after file publication before result commit
- **WHEN** 文件已发布但成功状态未提交即进程退出
- **THEN** 恢复根据持久化路径及哈希识别已完成文件，不创建第二份
