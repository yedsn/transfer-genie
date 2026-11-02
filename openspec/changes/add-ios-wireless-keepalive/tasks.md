# Tasks

## 1. 安装器容错模式

- [x] 1.1 `ios-wireless-update.sh` 增加 `--attempt`，仅允许与 `--install-latest` 组合，禁止 `--launch`/`--confirm`
- [x] 1.2 设备探测、传输通道、Developer Mode、DDI 等前置条件失败时输出 `attempt-result: skipped <reason>` 并 exit 0
- [x] 1.3 草稿门禁分级：已保存草稿继续阻塞；锁屏无法读取容器时继续安装并记录日志
- [x] 1.4 安装后回读设备已安装版本，与候选包版本比对
- [x] 1.5 成功时输出 `attempt-result: installed <version> <build>`

## 2. 保活脚本

- [x] 2.1 新增 `scripts/ios-keepalive-attempt.sh`，按本地日期记录成功状态，当天成功后直接跳过
- [x] 2.2 缓存缺失、缓存不是今天构建、profile 剩余不足阈值时先重建再安装
- [x] 2.3 缓存被判定过期/不可用时重建并重试一次
- [x] 2.4 构建失败输出到独立日志，进程内互斥锁避免与每日构建互相抢占
- [x] 2.5 每天最多一条 macOS 通知：构建失败 / App 即将失效 / 存在未发送草稿
- [x] 2.6 新增 `npm run ios:keepalive` 入口

## 3. 调度与文档

- [x] 3.1 新增 `scripts/tasktick-ios-keepalive.sh` 包装脚本
- [x] 3.2 在 TaskTick 创建小时级任务（`0 0,10-23 * * *`），cwd 为项目根、超时 3600 秒
- [x] 3.3 在 `docs/develop/ios.md` 补充保活任务的适用条件、触发时间和排查入口
- [x] 3.4 手动执行一次保活任务，确认构建、安装、状态记录与日志符合预期

## 4. 拆分每日续签与小时部署

- [x] 4.1 扩展 build-latest manifest，加入 profile UUID、创建时间、设备 UDID 列表与 artifactId
- [x] 4.2 新增每日续签构建脚本：精确备份当前 Team/Bundle profile、强制换发、验证到期时间并安全回滚
- [x] 4.3 将 ios-keepalive-attempt.sh 收缩为纯安装消费者，不再构建或移动 profile
- [x] 4.4 把安装成功状态迁移为 lastInstalledArtifactId；新 artifactId 即使同日也要重试
- [x] 4.5 新增独立 TaskTick 包装脚本和 npm 命令，更新 iOS 开发文档
- [ ] 4.6 创建并验证 09:00 每日续签构建任务与 10:00–23:00 小时部署任务
- [x] 4.7 禁用旧的 00:00 每日预构建并确认仅保留一条 10:00–23:00 无线保活任务，避免重复运行
- [ ] 4.8 实测每日构建、首次安装、同 artifact 跳过、设备离线 exit 0 与失败回滚路径

