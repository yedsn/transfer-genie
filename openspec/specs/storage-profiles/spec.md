# storage-profiles Specification

## Purpose
定义用户如何配置、切换并隔离 WebDAV 与 Supabase 存储空间，以及如何在不持续双写的前提下显式迁移数据。

## Requirements

### Requirement: Pluggable storage profiles
客户端 SHALL 支持多个存储空间，每个空间 MUST 具有稳定标识、名称、启用状态和 Provider 类型。第一版 Provider 类型 MUST 包含 WebDAV 与 Supabase。

#### Scenario: Add different provider profiles
- **WHEN** 用户分别添加 WebDAV 和 Supabase 存储空间
- **THEN** 两个空间均可被独立保存、启用和选择

#### Scenario: Migrate existing WebDAV settings
- **WHEN** 客户端首次加载仅包含旧 WebDAV 端点配置的数据
- **THEN** 每个旧端点被无损转换为 WebDAV 存储空间
- **AND** 原活动端点继续作为活动存储空间

### Requirement: Storage profile isolation
客户端 SHALL 按存储空间和 Supabase 账号隔离本地消息、同步队列、游标、文件及缓存。切换存储空间 MUST NOT 自动复制、合并或双写数据。

#### Scenario: Switch between independent spaces
- **WHEN** 用户从 WebDAV 空间切换到 Supabase 空间
- **THEN** 界面立即显示 Supabase 空间的本地缓存
- **AND** WebDAV 空间的消息与未完成同步任务保留在原空间

#### Scenario: Late callback after switch
- **WHEN** 旧空间的网络请求在切换后才返回
- **THEN** 客户端不得把结果写入新空间的状态或数据

### Requirement: Explicit cross-profile import
客户端 SHALL 通过显式导入流程将 WebDAV 数据复制到 Supabase 空间。导入 MUST 提供预览、稳定 ID、持久进度、幂等重试和结果核对，并 MUST 保留来源数据。

#### Scenario: Preview WebDAV import
- **WHEN** 用户选择 WebDAV 来源和 Supabase 目标并请求预览
- **THEN** 客户端显示消息数、附件数、总大小、标记和标签摘要
- **AND** 尚不修改任一空间

#### Scenario: Resume interrupted import
- **WHEN** 导入在部分记录完成后中断并重新执行
- **THEN** 已确认项目不会重复创建
- **AND** 未完成项目继续处理
- **AND** WebDAV 原件保持不变
