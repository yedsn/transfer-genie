---
description: Transfer Genie Telegram Bridge 文档，说明如何在 Telegram 会话和 WebDAV 或 Supabase 存储空间之间同步文本与文件。
---

# Telegram Bridge

`Telegram Bridge` 用来在一个 Telegram 会话和当前活动的 WebDAV 或 Supabase 存储空间之间做双向同步。

当前推荐直接使用桌面应用内置的桥接管理功能。桌面托管 Bridge 在主进程内运行，不会把 Supabase Session 或 Telegram Bot Token 写入运行时配置；切换活动存储空间时会自动停止旧绑定并重新绑定。

## 它能做什么

- Telegram 发给 bot 的文本和文件会同步到当前活动 WebDAV 或 Supabase 空间
- 当前空间中新增的非 Telegram 来源文本和文件会转发到 Telegram
- bridge 会记录本地状态，避免重复导入、重复导出，以及自己发出去又被自己重新同步回来

## 当前行为边界

- 一个 bridge 实例只对应一个 Telegram `Chat ID` 和一个当前活动存储空间
- 只处理运行期间产生的新消息
- 应用启动时不会把当前空间里的旧消息重新补发到 Telegram
- bridge 停止期间新增到当前空间的消息，不会在下次启动时补发到 Telegram
- Bridge 的自启动、运行状态、游标、错误和投递记录只保存在本机
- Supabase 入站消息先保存本机 SQLite/outbox；网络恢复后继续上传
- 同步保留 Telegram 来源身份，所有设备上的 Bridge 都跳过 Telegram 来源消息，避免回环
- Telegram 侧使用 Bot API 轮询，不依赖 webhook

## 桌面应用内的推荐用法

在设置页的 `Telegram Bridge` 区域完成配置：

- `Telegram Bot Token`
- `Telegram Chat ID`
- `Telegram 发送者名称`
- `启用 Telegram 代理`
- `Telegram 代理地址`
- `轮询间隔`
- `自启动服务`

界面会显示当前绑定的空间名称与 Provider。Supabase 必须同时满足“已登录、已完成绑定、空间可访问”才能启动；未满足时会显示对应原因。自启动是“仅当前设备”的偏好，不会同步到同一 Supabase 账号的其他设备。

基础设置中的 `发送者名称` 与 `Telegram 发送者名称` 含义不同：

- `发送者名称`：当前设备在 WebDAV / 应用内发送消息时使用的名称
- `Telegram 发送者名称`：仅用于“本机发往 Telegram”时显示的名称

## Chat ID 自动获取

如果不知道 `Chat ID`，可直接在设置页点击“自动获取”：

1. 先给 bot 私聊发一条新消息，或在目标群/频道里发一条新消息
2. 回到设置页点击“自动获取”
3. 应用会读取最近的 Telegram 更新并列出可用聊天
4. 选择目标聊天后会自动填入 `Chat ID`

## 代理支持

如果 Telegram Bot API 访问需要代理，可以启用 `Telegram 代理`。

当前约定：

- 默认地址：`http://127.0.0.1:7890`
- 也支持 `socks5://127.0.0.1:1080`
- 代理只作用于 Telegram 请求
- WebDAV 请求仍按原配置直连；Supabase 使用主程序已有的普通用户 Session

## 服务启动与自动重启

- 已启动时界面只显示“停止服务”
- 未启动时界面只显示“启动服务”
- 可以勾选“自启动服务”
- bridge 始终跟随当前活动存储空间
- 切换活动空间时，如果 bridge 正在运行，会自动重启并切到新空间

## 消息转发规则

### Telegram -> 当前活动存储空间

- 文本消息会保存为当前 Provider 的消息记录
- WebDAV 文件写入 `files/`；Supabase 文件先保留本地原件，再通过私有 Storage 异步上传
- 支持文档、图片、音频、视频等常见消息类型
- Telegram 入站消息会写入历史记录，供应用正常展示

### 当前活动存储空间 -> Telegram

- 只转发 bridge 启动之后产生的新消息
- 文本消息通过 `sendMessage` 发送
- 文件消息通过 `sendDocument` 发送
- 文本会带上发送者前缀
- 文件会带上 `From xxx` 的说明文字

## 独立运行模式

虽然推荐用桌面应用托管，项目仍然保留独立运行方式，方便 WebDAV 调试。独立模式不支持 Supabase 登录或 Session 恢复，继续接受旧版 WebDAV 配置：

```powershell
cargo run --bin telegram_bridge -- .\telegram-bridge.json
```

或通过环境变量指定配置文件：

```powershell
$env:TRANSFER_GENIE_TELEGRAM_BRIDGE_CONFIG="E:\path\to\telegram-bridge.json"
cargo run --bin telegram_bridge
```

## 配置示例

```json
{
  "device_sender_name": "My-PC",
  "telegram_sender_name": "My Telegram Alias",
  "telegram_bot_token": "123456:replace-me",
  "allowed_chat_id": null,
  "proxy_url": "http://127.0.0.1:7890",
  "poll_interval_secs": 5,
  "state_path": "./data/telegram-bridge-state.json",
  "temp_dir": "./data/telegram-bridge-tmp",
  "webdav": {
    "id": "main",
    "name": "Main WebDAV",
    "url": "https://example.com/dav/TransferGenie/",
    "username": "user",
    "password": "pass",
    "enabled": true
  }
}
```

## 常见问题

### 为什么自动获取不到 Chat ID？

先确认：

- `Bot Token` 正确
- bot 收到过新的私聊或群消息
- 如果网络受限，已开启 Telegram 代理

### 为什么旧消息没有自动发到 Telegram？

这是当前设计行为。bridge 只转发运行期间进入当前空间的新消息，不会在启动时回放旧消息。

### 为什么 Supabase 空间无法启动？

确认当前空间已完成绑定、当前设备仍保持登录，并且普通用户 Session 可以访问该空间。Bridge 不需要数据库密码或 service-role Key。

### 为什么切换活动空间后 Telegram 不对了？

如果 bridge 正在运行，切换活动空间时应用会自动重启 bridge，并绑定到新的活动空间。
