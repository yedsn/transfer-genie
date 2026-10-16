# Proposal

## Why

Telegram Bridge 当前直接读写活动 WebDAV 端点，无法在用户选择 Supabase 存储空间时工作。与此同时，Bridge 的启用与自启动属于单机运行决策，不应因为同一 Supabase 账号在多台设备登录而传播到其他设备。

## What Changes

- 将 Telegram Bridge 从 WebDAV 专用桥接改为跟随当前活动存储空间，支持 WebDAV 与已登录、已绑定的 Supabase 空间。
- Telegram 入站文本和文件通过主程序的 Provider-aware 本地消息入口保存；Supabase 消息先写入 SQLite 与可靠 outbox，附件先保留本地原件再上传私有 Storage。
- Bridge 出站从当前活动空间的本地消息索引读取新消息，并使用稳定来源标识和本地投递状态避免回环、重复导入与重复发送。
- 切换活动存储空间时，运行中的 Bridge 重新绑定到新空间；Supabase 未登录、未绑定或不可访问时阻止启动并显示可恢复错误。
- 明确 Bridge 的启用、自启动和运行状态均为设备本地状态，不写入 Supabase 业务表、Storage、Realtime payload 或其他跨设备同步数据。
- 保持 Bot Token、Chat ID、代理、发送者名称和轮询间隔为现有本机配置，不在本变更中引入跨设备 Telegram 配置同步。
- 更新设置界面和文档，将“跟随当前 WebDAV”改为“跟随当前活动存储空间”，并展示当前绑定的 Provider 与空间。

## Capabilities

### New Capabilities

- `telegram-bridge`: 定义 Telegram 与当前活动存储空间之间的双向桥接、Provider 绑定、去重、本机运行状态和错误恢复行为。

### Modified Capabilities

- `message-feed`: 增加外部桥接消息通过当前 Provider 的本地优先入口保存、携带来源身份并参与可靠同步的要求。
- `client-settings`: 增加 Telegram Bridge 本机配置与设备本地启用/自启动边界，以及 Provider-aware 可用性提示。

## Impact

- Rust：`telegram_bridge.rs`、`telegram_bridge_runtime.rs`、`main.rs`、Provider 解析、本地消息/outbox/附件入口、Bridge 状态持久化与 Supabase Session 使用边界。
- 本地数据：SQLite 消息需要可识别 Telegram 来源与稳定外部 ID；Bridge 投递游标和运行偏好继续保存在设备本地。
- 前端：Telegram Bridge 设置说明、活动空间摘要、启动条件、错误状态和切换空间后的运行反馈。
- Supabase：复用现有普通用户 Auth、RLS、RPC、Realtime 与私有 Storage，不新增管理密钥，也不新增 Bridge 开关的云端字段。
- 兼容性：现有 WebDAV Bridge 行为保留；旧本机配置升级后继续可用。独立 `telegram_bridge` 二进制的兼容范围需在设计中明确。
- 文档与测试：补充 WebDAV/Supabase 双 Provider 流程、离线恢复、切换空间、去重和多设备本地开关验证。
