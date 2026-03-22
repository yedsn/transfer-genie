# Telegram Bridge 说明

`Telegram Bridge` 用来在一个 Telegram 会话和一个 WebDAV 端点之间做双向同步。

当前推荐直接使用桌面应用内置的桥接管理功能，不需要单独手工启动 `telegram_bridge`。应用会负责保存配置、生成运行时配置、启动进程、停止进程，以及在切换活动 WebDAV 端点时自动重启 bridge。

## 一、它能做什么

- Telegram 发给 bot 的文本消息会同步到当前活动 WebDAV 端点
- Telegram 发给 bot 的文件会同步到当前活动 WebDAV 端点
- WebDAV 中新增的文本消息会转发到 Telegram
- WebDAV 中新增的文件会转发到 Telegram
- bridge 会记录本地状态，避免重复导入、重复导出，以及自己发出去又被自己重新同步回来

## 二、当前行为边界

- 一个 bridge 实例只对应一个 Telegram `Chat ID` 和一个 WebDAV 端点
- bridge 只处理“运行期间产生的新消息”
- 应用启动时不会把 WebDAV 里旧消息重新补发到 Telegram
- bridge 停止期间新增到 WebDAV 的消息，不会在下次启动时补发到 Telegram
- WebDAV 仍然是应用侧的主数据来源
- Telegram 侧使用 Bot API 轮询，不依赖 webhook

这也是为什么现在首页刷新已经可以恢复，不需要再为了避免误转发旧消息而禁用刷新。

## 三、桌面应用内的推荐用法

在设置页的 `Telegram Bridge` 区域完成配置。

需要填写或可选配置如下：

- `Telegram Bot Token`
- `Telegram Chat ID`
- `Telegram 发送者名称`
- `启用 Telegram 代理`
- `Telegram 代理地址`
- `轮询间隔`
- `自启动服务`

同时在基础设置中还有一个独立的：

- `发送者名称`

两者含义不同：

- `发送者名称`：当前设备在 WebDAV / 应用内发送消息时使用的名称
- `Telegram 发送者名称`：仅用于“本机发往 Telegram”时显示的名称

也就是说：

- 你在桌面端发消息到 WebDAV，消息发送者仍然是“设备发送者名称”
- bridge 把这条本机消息转发到 Telegram 时，如果配置了 `Telegram 发送者名称`，则 Telegram 中显示这个名称
- 其他设备发来的消息不会被替换发送者名称，仍保持原始发送者

## 四、Chat ID 自动获取

如果不知道 `Chat ID`，可以直接在设置页点击“自动获取”。

使用步骤：

1. 先给 bot 私聊发一条新消息，或在目标群/频道里发一条新消息
2. 回到设置页点击“自动获取”
3. 应用会读取最近的 Telegram 更新并列出可用聊天
4. 选择目标聊天后会自动填入 `Chat ID`

补充行为：

- 如果 `Telegram 发送者名称` 为空，自动获取时会尝试用 Telegram 用户名自动填入
- 如果你已经手工填写了 `Telegram 发送者名称`，自动获取不会覆盖它

## 五、代理支持

如果 Telegram Bot API 访问需要代理，可以启用 `Telegram 代理`。

当前约定：

- 默认地址为 `http://127.0.0.1:7890`
- 也支持类似 `socks5://127.0.0.1:1080`
- 代理只作用于 Telegram 请求
- WebDAV 请求仍然按原配置直连，不会跟着走 Telegram 代理

## 六、服务启动与自动重启

设置页可以直接启动或停止 bridge。

行为说明：

- 已启动时界面只显示“停止服务”
- 未启动时界面只显示“启动服务”
- 可以勾选“自启动服务”，让桌面应用启动后自动拉起 bridge
- bridge 始终跟随当前活动 WebDAV 端点
- 切换活动端点时，如果 bridge 正在运行，会自动重启并切到新端点

## 七、消息转发规则

### Telegram -> WebDAV

- 文本消息会保存为 WebDAV 消息文本
- 文件消息会上传到 WebDAV `files/` 下
- 支持常见 Telegram 文件型消息，如文档、图片、音频、视频等
- Telegram 入站消息会写入历史记录，供应用正常展示

### WebDAV -> Telegram

- 只转发 bridge 启动之后产生的新消息
- 文本消息通过 `sendMessage` 发送
- 文件消息通过 `sendDocument` 发送
- 文本会带上发送者前缀
- 文件会带上 `From xxx` 的说明文字

如果当前消息来自本机，并且配置了 `Telegram 发送者名称`，则这里的 `xxx` 会使用 Telegram 专用名称；否则使用原始发送者名称。

## 八、限制说明

- Telegram 入站文件大小受当前 Bot API `getFile` 下载能力限制
- WebDAV -> Telegram 的文件发送受 Telegram `sendDocument` 限制
- 过大的文件会被标记为永久失败，避免无限重试
- 临时网络错误、Telegram 请求失败、WebDAV 请求失败会进入可重试状态，后续轮询时继续尝试

## 九、独立运行模式

虽然推荐用桌面应用托管，项目仍然保留独立运行方式，方便调试。

启动方式：

```powershell
cargo run --bin telegram_bridge -- .\telegram-bridge.json
```

也可以通过环境变量指定配置文件：

```powershell
$env:TRANSFER_GENIE_TELEGRAM_BRIDGE_CONFIG="E:\path\to\telegram-bridge.json"
cargo run --bin telegram_bridge
```

## 十、独立模式配置示例

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

字段说明：

- `device_sender_name`：本机在 WebDAV 中使用的发送者名称
- `telegram_sender_name`：本机消息转发到 Telegram 时使用的名称
- `telegram_bot_token`：Telegram bot token
- `allowed_chat_id`：允许同步的目标聊天 ID
- `proxy_url`：Telegram 请求代理地址，可留空
- `poll_interval_secs`：轮询间隔，最小为 1 秒
- `state_path`：bridge 本地状态文件
- `temp_dir`：临时文件目录
- `webdav`：目标 WebDAV 端点配置

## 十一、状态文件与去重

bridge 会在本地保存状态文件，主要用于：

- 记录最新处理到的 Telegram `update_id`
- 记录已经导入的 Telegram 消息
- 记录已经发往 Telegram 的 WebDAV 消息
- 防止重启后重复同步

如果你删除状态文件：

- 旧去重信息会丢失
- 后续可能出现重复同步

所以独立部署时，建议同时备份配置文件和状态文件。

## 十二、常见问题

### 1. 为什么自动获取不到 Chat ID？

先确认以下几点：

- 已填写正确的 `Bot Token`
- bot 已收到一条新的私聊消息，或目标群/频道里有新的消息
- 如果网络受限，已开启 Telegram 代理

### 2. 为什么旧消息没有自动发到 Telegram？

这是当前设计行为。bridge 只转发运行期间产生的新 WebDAV 消息，不会在启动时回放旧消息。

### 3. 为什么切换活动端点后 Telegram 不对了？

如果 bridge 正在运行，切换活动端点时应用会自动重启 bridge，并绑定到新的活动端点。

### 4. Telegram 发送者名称为什么没有生效？

它只会影响“本机发出的消息转发到 Telegram”这一条链路，不会修改：

- WebDAV 里的原始发送者
- 其他设备发出的消息
- Telegram -> WebDAV 导入消息时的发送者

## 十三、故障排查

常见日志或状态含义：

- `telegram_poll_failed`：Telegram 轮询失败，优先检查 token、代理、网络
- `telegram_inbound_failed`：Telegram 入站同步到 WebDAV 失败，检查 WebDAV 地址、账号、写权限
- `webdav_outbound_retryable_failure`：导出到 Telegram 时遇到临时错误，后续会重试
- `webdav_outbound_permanent_failure`：导出到 Telegram 时遇到永久错误，例如文件过大

如果你是通过桌面应用管理 bridge，还可以在设置页直接查看：

- 当前运行状态
- 最近错误