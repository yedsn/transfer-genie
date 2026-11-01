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

