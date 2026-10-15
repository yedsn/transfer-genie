# Spec Delta

## ADDED Requirements

### Requirement: Device-local Telegram Bridge settings
设置界面 SHALL 提供 Telegram Bridge 的 Bot Token、Chat ID、发送者名称、代理、轮询间隔、自启动、启动、停止和运行状态。Bridge 配置与运行控制 SHALL 属于当前设备；其中自启动、启动/停止和运行状态 MUST NOT 通过 Supabase 账号或空间同步到其他设备。

#### Scenario: Enable auto-start on one Supabase device
- **WHEN** 用户在设备 A 为 Telegram Bridge 打开自启动并保存
- **THEN** 设备 A 重启应用后可以自动启动 Bridge
- **AND** 使用同一 Supabase 账号的设备 B 保持其原有自启动设置

#### Scenario: Start and stop locally
- **WHEN** 用户在当前设备启动或停止 Telegram Bridge
- **THEN** 只有当前设备的 Bridge 运行状态发生变化
- **AND** Supabase 中不创建或修改对应的设置记录

#### Scenario: Display active provider binding
- **WHEN** 用户查看 Telegram Bridge 设置
- **THEN** 界面显示 Bridge 将绑定或正在绑定的活动空间名称与 Provider 类型
- **AND** 文案不再把 Bridge 描述为只能跟随 WebDAV

#### Scenario: Explain unavailable Supabase space
- **WHEN** 当前活动空间是未登录、未完成绑定或不可访问的 Supabase 空间
- **THEN** 设置界面禁用 Bridge 启动操作并显示需要登录、完成绑定或恢复访问的具体提示

#### Scenario: Load legacy local Telegram settings
- **WHEN** 应用升级并读取已有 Telegram Bridge 本机设置
- **THEN** Bot Token、Chat ID、代理、轮询间隔和自启动选择继续可用
- **AND** 旧配置不会因为 Supabase 支持而自动上传到云端

