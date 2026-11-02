# Design

## Context

现有实现把“按需构建/续签”和“无线安装”放在同一个小时级脚本中，并用本地日期判断当天是否已经成功。实际验证发现：同一版本可以因为 profile 重新签发而产生新的签名包；此时版本号和日期都不能可靠表示手机是否安装了最新产物。构建只依赖 Mac、Xcode 账号和钥匙串，安装还依赖 iPhone 在线、同一 Wi-Fi、配对与开发者通道，因此两者的调度条件和失败语义不同。

实测确认：当前旧 Team 虽然已登录且可正常复用现有 profile 打包，但移走当前 Team 与 Bundle ID 对应的 profile 后，Apple 拒绝重新注册 `com.transfergenie`，因此 Xcode CLI 不能稳定换发新的 7 天 profile。codesign 首次访问私钥需要用户在钥匙串对话框中选择“始终允许”。

## Goals / Non-Goals

**Goals:**

- 让每日构建任务独立完成原 Team 的 Release 构建、签名核验与原子发布；profile 换发只有在 Apple 端允许时才执行。
- 让小时安装任务只消费最新成功产物，不构建、不修改 profile。
- 用稳定的 artifactId 协调两个任务，即使版本号不变也能识别新签名包。
- 任何续签失败都保留旧 profile 和上一份成功包；任何设备离线都不把安装任务标红。

**Non-Goals:**

- 不保证 Mac 睡眠时补跑错过的 TaskTick 轮次。
- 不绕过 Apple Personal Team 的签名政策，不代替付费 TestFlight 分发。
- 不自动删除 Xcode 账号、证书或其他项目的 provisioning profile。

## Decisions

### 每日构建与小时安装使用两个独立任务

每日任务在 09:00 运行；小时任务在 10:00–23:00 运行。构建任务失败应明确报错并通知，因为它需要人工处理；安装任务遇到设备离线、锁屏或网络不可用时 exit 0，等待下一小时。

备选方案是单任务每小时同时构建和安装，但会重复消耗构建时间、把设备可用性与签名问题混为一谈，也无法清晰判断今天的新包是否已部署。

### 每日构建与 profile 换发

普通定时构建仅匹配本机 `.env` 中的 Team 与固定 Bundle ID 对应的 profile，复用它完成构建并核对 Team、Bundle ID、目标设备 UDID、profile 到期时间和 strict codesign。`ios-daily-renew-build.sh` 仍保留为人工尝试入口：只有 Apple 允许重新注册并换发 profile 时才会移动旧 profile；失败必须恢复旧 profile 和上一份成功缓存。

不直接删除 profile，因为签发或构建失败时需要可恢复；不清理其他 Team 或其他 Bundle ID 的 profile。

### artifactId 是部署交接信号

构建 manifest 增加 profileUuid、profileCreatedAt、deviceUdids 和 artifactId。artifactId 由 profile UUID 与 executable UUID 组合，表示实际签名产物，而不是源码版本。

安装状态保存 lastInstalledArtifactId。小时任务只有在 manifest.artifactId 与状态不同的情况下连接手机并安装，成功后写入该 artifactId。这样同一天多次签发、版本号不变、跨天未安装等场景都能正确处理。

### 发布和状态写入必须原子化

每日任务先在 staging 目录完成构建与验证，再替换 latest 缓存。安装状态通过临时文件后 rename 更新。构建失败不会污染 latest，安装失败不会更新 lastInstalledArtifactId。

### 旧 profile 备份有限保留

成功续签后保留最近 3 组旧 profile 备份，用于人工回滚；超过数量的备份按时间清理。构建中断时 trap 自动恢复本轮刚移走的 profile。

## Risks / Trade-offs

- [Mac 在 09:00 睡眠，TaskTick 不补跑] → 小时安装任务不自行构建；发送“无新产物”静默状态。需要时手动运行每日构建脚本。
- [钥匙串仍要求交互授权] → 已实测并选择“始终允许”；每日任务日志仍应识别 codesign/钥匙串阻塞并超时失败。
- [Xcode 登录会话过期] → 构建任务非零退出并每天最多通知一次，上一份缓存保持可用。
- [每日强制签发可能触发 Apple 限制] → 一天仅一次，不在小时任务中续签；失败后有冷却且不反复删除 profile。
- [同一 Bundle ID 被多个 Personal Team 使用] → 只按本机 .env Team 精确匹配，不触碰其他 Team 的 profile。

## Migration Plan

1. 扩展 build-latest manifest，加入 artifactId 与 profile 元数据。
2. 新增每日续签构建脚本，把当前保活脚本里的续签代码迁出。
3. 将小时脚本改为纯安装消费者，并把状态从“当天成功”迁移为 artifactId；旧 state 没有 artifactId 时视为尚未安装当前产物。
4. 创建新的 09:00 TaskTick 任务；禁用原 00:00 每日预构建任务。
5. 将现有无线保活任务改为 10:00–23:00；如果 CLI 不能更新，在 UI 中修改或新建替代任务并禁用旧任务。
6. 手动运行每日任务和小时任务，核验续签、manifest、无线安装与重复跳过。

回滚时禁用两个新任务，恢复旧 TaskTick 任务，并从 profile-backups 复制最近可用 profile 回 Xcode 目录；latest 缓存采用原子发布，因此不需回退半成品。

