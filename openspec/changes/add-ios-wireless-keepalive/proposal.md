# Proposal

## Why

免费 Personal Team 的 iOS development provisioning profile 通常只有 7 天有效期。到期后手机上的 App 直接无法启动，必须重新用 Xcode 构建并覆盖安装。每天 00:00 的预构建只解决了“包是新的”，但如果那天 Mac 没开机、构建失败、或手机不在同一 Wi-Fi，用户很容易在 7 天内漏掉一次重装，实测今天就出现过构建因缺少 `sortablejs` 依赖而失败却没有任何提示的情况。

用户希望：白天每小时自动尝试一次无线安装，当天任意一次成功即可，之后当天不再打扰；失败不要显示成任务错误。

## What Changes

- 新增 `scripts/ios-keepalive-attempt.sh`（`npm run ios:keepalive`）：每次运行先判断“今天是否已成功安装”，未成功则按需重建签名缓存，再通过 Wi-Fi 覆盖安装。
- 新增 `scripts/tasktick-ios-keepalive.sh` 包装脚本，供 TaskTick 以固定 PATH、固定工作目录调度。
- `scripts/ios-wireless-update.sh` 新增 `--attempt` 无人值守模式：所有前置条件失败统一输出 `[ios-wifi] attempt-result: skipped <reason>` 并 exit 0；不启动 App；锁屏导致草稿门禁无法读取时继续安装，已保存草稿仍阻塞安装。
- 安装后回读设备上的已安装版本，只有与候选包版本一致才算成功，并写入按日期记录的 `state.json`。
- 只在真正需要人工介入时每天最多发一条 macOS 通知（构建失败、App 即将失效、存在未发送草稿）。
- 明确记录一条实测结论：重装同一个包不会延长 7 天有效期，Xcode 在本地 profile 仍有效时会复用；CLI 换发新 profile 依赖 Xcode 已登录 Apple ID，而当前机器账号列表为空。保活因此定位为“自愈 + 快速送达 + 到期提醒”，不承诺在无账号状态下自动续签。

## Capabilities

### New Capabilities

- `ios-device-deployment`：无人值守的 iOS 开发签名保活部署规则。

### Modified Capabilities

无。

## Impact

- 仅影响 `scripts/`、`package.json`、`docs/develop/ios.md` 与 TaskTick 配置，不涉及 Rust/前端运行时代码。
- 现有 `ios:update`、`ios:build-latest`、`ios:wireless-install-latest` 行为保持不变；`--attempt` 是新增的独立模式。
- TaskTick 每小时任务需要 Mac 开机、外置盘已挂载、手机与 Mac 在同一局域网且已配对；条件不满足时静默跳过。
- 重装不会延长 7 天，续期仍然依赖重新构建；因此保活脚本必须在缓存过期前重建。

