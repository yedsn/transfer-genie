# Proposal

## Why

移动端目前只能先在 Transfer Genie 内点击“添加附件”，再调用系统相册或文件选择器。用户从照片、文件或其他 App 的系统分享面板发送文件时没有 Transfer Genie 入口，无法把原内容直接带入待发送消息。

## What Changes

- 增加 iOS Share Extension，使 Transfer Genie 出现在图片、视频和文件的系统分享面板中。
- 将分享内容可靠保存到 App Group 共享收件箱，并在主 App 冷启动、前台恢复或收到自定义 URL 时导入。
- 分享内容进入现有移动端 Composer，追加到当前草稿附件并显示明确的导入反馈；用户确认后才执行现有本地优先发送流程。
- 在未登录或尚未选择存储空间时保留待导入文件，待当前存储空间可用后继续导入。
- 增加分享扩展的可访问性、批量导入、重复导入幂等、失败恢复和扩展签名验收要求。

## Capabilities

### New Capabilities

- `mobile-external-share`: 定义 iOS 系统分享入口、共享收件箱生命周期、主 App 导入路由以及分享附件进入 Composer 的用户可见行为。

### Modified Capabilities

None.

## Impact

- iOS 工程：新增 Share Extension target、App Group entitlement、共享收件箱目录和 `transfergenie://` URL scheme。
- 原生桥接：新增分享收件箱扫描与导入命令，主 App 处理 `RunEvent::Opened`，并向移动端界面发送待导入通知。
- 移动端 Composer：导入分享附件、合并到当前草稿、在登录或空间切换后恢复待处理分享批次。
- 构建与发布：XcodeGen 工程、签名配置、archive 校验和真机部署脚本需要覆盖主 App 与 `.appex`。
- 测试：新增 Swift 导入测试、前端状态测试，以及从照片、文件 App 和其他 App 分享到真机的端到端验收。
