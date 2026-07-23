---
description: Transfer Genie Telegram Bridge 文档，说明如何在 Telegram 会话和 WebDAV 端点之间同步文本与文件。
---

# Telegram Bridge

`Telegram Bridge` 用来在一个 Telegram 会话和一个 WebDAV 端点之间做双向同步。

当前推荐直接使用桌面应用内置的桥接管理功能，不需要单独手工启动 `telegram_bridge`。应用会负责保存配置、生成运行时配置、启动进程、停止进程，以及在切换活动 WebDAV 端点时自动重启 bridge。

## 它能做什么

- Telegram 发给 bot 的文本消息会同步到当前活动 WebDAV 端点
- Telegram 发给 bot 的文件会同步到当前活动 WebDAV 端点
- WebDAV 中新增的文本消息会转发到 Telegram
- WebDAV 中新增的文件会转发到 Telegram
- bridge 会记录本地状态，避免重复导入、重复导出，以及自己发出去又被自己重新同步回来

## 当前行为边界

- 一个 bridge 实例只对应一个 Telegram `Chat ID` 和一个 WebDAV 端点
- 只处理运行期间产生的新消息
- 应用启动时不会把 WebDAV 里旧消息重新补发到 Telegram
- bridge 停止期间新增到 WebDAV 的消息，不会在下次启动时补发到 Telegram
- WebDAV 仍然是应用侧的主数据来源
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
- WebDAV 请求仍按原配置直连

## 服务启动与自动重启

- 已启动时界面只显示“停止服务”
- 未启动时界面只显示“启动服务”
- 可以勾选“自启动服务”
- bridge 始终跟随当前活动 WebDAV 端点
- 切换活动端点时，如果 bridge 正在运行，会自动重启并切到新端点

## 消息转发规则

### Telegram -> WebDAV

- 文本消息会保存为 WebDAV 消息文本
- 文件消息会上传到 WebDAV `files/` 下
- 支持文档、图片、音频、视频等常见消息类型
- Telegram 入站消息会写入历史记录，供应用正常展示

### WebDAV -> Telegram

- 只转发 bridge 启动之后产生的新消息
- 文本消息通过 `sendMessage` 发送
- 文件消息通过 `sendDocument` 发送
- 文本会带上发送者前缀
- 文件会带上 `From xxx` 的说明文字

## 独立运行模式

虽然推荐用桌面应用托管，项目仍然保留独立运行方式，方便调试：

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

这是当前设计行为。bridge 只转发运行期间产生的新 WebDAV 消息，不会在启动时回放旧消息。

### 为什么切换活动端点后 Telegram 不对了？

如果 bridge 正在运行，切换活动端点时应用会自动重启 bridge，并绑定到新的活动端点。
