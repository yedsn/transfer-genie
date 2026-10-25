# Spec Delta

## Purpose

定义 Transfer Genie iOS 客户端的产品范围、原生系统集成、生命周期恢复与真机稳定性要求，使用户能够在 iPhone 上安全访问同一 Supabase 消息空间。

## ADDED Requirements

### Requirement: Supabase-only iOS product scope
iOS 客户端 SHALL 仅提供 Supabase 存储空间与账号能力，并 MUST NOT 启动或展示 WebDAV、Telegram Bridge、本地 HTTP API、系统托盘、全局快捷键、开机启动、桌面自动更新、桌面听写粘贴或外部媒体子进程。桌面客户端现有能力 MUST 保持不变。

#### Scenario: Open settings on iPhone
- **WHEN** 用户在 iOS 客户端打开设置
- **THEN** 设置界面只显示 Supabase、账号、同步、移动端缓存和应用信息相关配置
- **AND** 不显示 WebDAV 或桌面集成功能

#### Scenario: Desktop behavior remains available
- **WHEN** 用户在桌面客户端升级到包含 iOS 支持的版本
- **THEN** 已有 WebDAV、托盘、快捷键和桌面集成功能仍按原有行为工作

### Requirement: Native mobile file and media integration
iOS 客户端 SHALL 使用系统选择器获取照片、视频和文档，将选中资源复制到应用可控的沙盒位置后再交给本地保存与上传流程。客户端 SHALL 支持系统文件预览与分享，并 MUST 在资源不可读取、仍在 iCloud 下载或权限被拒绝时显示可恢复错误。

#### Scenario: Select a photo or video
- **WHEN** 用户从照片库选择图片或视频
- **THEN** 客户端将资源准备到应用沙盒并显示待发送附件
- **AND** 选择操作不会自动发送附件

#### Scenario: Select a document
- **WHEN** 用户从系统文件选择器选择文档
- **THEN** 客户端获得可持续读取的沙盒副本
- **AND** 后续发送不依赖外部 security-scoped URL 持续有效

#### Scenario: Cloud photo is unavailable
- **WHEN** 选中的照片或视频需要从 iCloud 获取但当前网络不可用
- **THEN** 客户端显示读取失败或等待网络恢复状态
- **AND** 不创建内容不完整的待发送附件

### Requirement: iOS-native preview generation
iOS 客户端 SHALL 为支持的图片生成受限尺寸 JPEG 预览，为系统可解码的视频生成 JPEG 封面，并 SHALL 使用与其他客户端相同的 Supabase `preview.jpg` 对象契约。iOS 预览生成 MUST NOT 依赖 FFmpeg 可执行文件。

#### Scenario: Generate image preview
- **WHEN** 用户在 iPhone 上发送受支持的图片
- **THEN** 客户端生成方向正确的受限尺寸 JPEG 预览
- **AND** 原图与预览作为不同对象进入 Supabase 附件流程

#### Scenario: Generate video poster
- **WHEN** 用户在 iPhone 上发送系统可解码的视频
- **THEN** 客户端从视频时间线生成方向正确的 JPEG 封面
- **AND** 封面生成失败不阻止原视频进入可靠上传流程

#### Scenario: Preview unsupported media
- **WHEN** 附件格式不能由 iOS 生成或显示预览
- **THEN** 客户端显示文件类型卡和文件操作
- **AND** 不因预览失败将原附件标记为发送失败

### Requirement: iOS lifecycle recovery
iOS 客户端 SHALL 在冷启动、登录成功、恢复前台、网络恢复、Realtime 重连和手动刷新时执行权威增量同步。客户端进入后台时 SHALL 持久化当前操作状态，并 MUST NOT 假设 WebSocket 或普通进程任务在后台持续运行。

#### Scenario: Return from background
- **WHEN** 应用从后台恢复到前台
- **THEN** 客户端恢复待处理 outbox 并执行 checkpoint 增量补拉
- **AND** 锁屏或暂停期间发生的远端变化最终出现在本地列表

#### Scenario: Application is terminated during transfer
- **WHEN** 应用在附件上传完成前被系统终止
- **THEN** 已持久化的本地附件和 outbox 操作在下一次启动后仍存在
- **AND** 客户端使用原 operation ID 安全重试

### Requirement: Physical-device stability gate
iOS 客户端 SHALL 在声明可供日常使用前通过物理 iPhone 的开发版与发布版验收。验收 MUST 覆盖会话恢复、离线重试、前后台恢复、网络切换、媒体预览、跨设备预览和重复启动，并 MUST 记录失败场景。

#### Scenario: Release build acceptance
- **WHEN** 候选 iOS 版本准备交付到用户手机
- **THEN** 发布构建可在目标 iPhone 上完成登录、同步、发送、预览和恢复前台流程
- **AND** 不存在只在模拟器或开发构建中验证的关键路径

#### Scenario: Network transition acceptance
- **WHEN** 验收过程中设备在 Wi-Fi、蜂窝网络和离线状态之间切换
- **THEN** 应用不丢失本地操作
- **AND** 网络恢复后能够继续同步或显示明确的可重试失败

### Requirement: Tiered iOS test environments
项目 SHALL 使用 Xcode 官方 iOS Simulator 作为日常开发和自动化测试的主要虚拟环境，MAY 使用 VPhone 作为经过明确授权的补充完整 iOS 环境，并 MUST 使用目标 iPhone 12 `Jam` 作为发布稳定性验收的权威环境。VPhone 的通过结果 MUST NOT 替代 Simulator 或 `Jam` 的必需检查。

#### Scenario: Run routine mobile development
- **WHEN** 开发者验证 Tauri 启动、Vue 布局、Swift 插件契约、SQLite 或 Supabase 基础流程
- **THEN** 测试首先在与 Xcode 匹配的官方 iOS Simulator Runtime 上运行
- **AND** 日常开发不依赖 VPhone 所需的宿主机安全策略变更

#### Scenario: Run optional VPhone regression
- **WHEN** 开发者已明确批准 VPhone 所需的恢复模式安全设置并配置受支持的 VPhone 环境
- **THEN** 项目可以在 VPhone 上补充执行 IPA 安装、完整 WebKit、系统框架、快照和自动化回归测试
- **AND** VPhone 独有失败需要在官方 Simulator 或 `Jam` 上复现后才成为发布阻断项

#### Scenario: Make a release decision
- **WHEN** 候选版本准备交付到用户手机
- **THEN** Keychain、照片与文件选择、真实挂起恢复、网络切换、媒体行为、性能和重复启动必须在 `Jam` 上通过
- **AND** 仅在 Simulator 或 VPhone 上通过不足以声明稳定可用
