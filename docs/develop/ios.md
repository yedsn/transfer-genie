# iOS 开发环境

本文档用于在官方 Xcode Simulator 和真实 iPhone 上构建、运行 Transfer Genie。iOS 客户端只使用 Supabase；WebDAV、托盘、快捷键、本机 HTTP API、Telegram Bridge、自动更新和 FFmpeg 等桌面能力不会进入 iOS 运行路径。

## 已验证环境

| 项目 | 当前基线 |
| --- | --- |
| Xcode | 26.4（Build 17E192） |
| iOS SDK / Simulator Runtime | 26.4 |
| 最低 iOS 版本 | 16.0 |
| Tauri CLI | 2.11.3（Cargo 与 npm CLI 一致） |
| 开发团队 | `LW6QTNHNV4` |
| 官方模拟器 | `Transfer Genie - iPhone 12` |
| Bundle ID | `com.transfergenie` |

## 1. 检查工具链

```bash
xcodebuild -version
cargo tauri --version
npx tauri --version
rustup target list --installed | rg apple-ios
xcrun simctl list runtimes
```

项目的 iOS Cargo 包装脚本使用独立的 `.cargo-ios` 目录和官方 crates.io sparse 索引，避免用户全局 Cargo 镜像影响 iOS 依赖解析：

```bash
./scripts/ios-cargo.sh metadata --format-version 1 --no-deps
```

如需复用另一个空间更充足的缓存目录，可以覆盖：

```bash
TRANSFER_GENIE_IOS_CARGO_HOME=/path/to/cargo-home ./scripts/ios-cargo.sh check
```

## 2. 初始化或重新生成 Xcode 工程

首次初始化：

```bash
CARGO_HOME="$PWD/.cargo-ios" npx tauri ios init --ci
```

生成结果位于 `gen/apple/transfer-genie.xcodeproj`。确认 scheme：

```bash
xcodebuild -list -project gen/apple/transfer-genie.xcodeproj
```

`tauri.ios.conf.json` 已配置最低系统版本、开发团队和 iOS bundle 范围；`Info.ios.plist` 会向生成工程合并麦克风及开发服务器所需的本地网络用途说明。修改这些输入后，应重新执行初始化命令。

## 3. 官方 Simulator 日常开发

查看并启动模拟器：

```bash
xcrun simctl list devices available
xcrun simctl boot "Transfer Genie - iPhone 12" 2>/dev/null || true
open -a Simulator
```

启动 Tauri iOS 开发模式：

```bash
CARGO_HOME="$PWD/.cargo-ios" \
  npx tauri ios dev "Transfer Genie - iPhone 12"
```

不要在常规交互开发时添加 `--no-watch`：该选项会在部署后结束命令，并同时停止由 Tauri 启动的 Vite 服务。应用随后会显示无法访问 `127.0.0.1:7120` 的错误页。

若 App 已安装、只需恢复前端调试服务，可执行：

```bash
npm run dev
xcrun simctl launch booted com.transfergenie
```

常用诊断：

```bash
xcrun simctl get_app_container booted com.transfergenie app
xcrun simctl io booted screenshot /tmp/transfer-genie-ios.png
xcrun simctl spawn booted log stream \
  --style compact \
  --predicate 'process == "Transfer Genie"'
```

## 4. 真机开发与签名

1. 用数据线连接并解锁 iPhone，在手机上选择“信任此电脑”。
2. 在 iPhone 的“设置 → 隐私与安全性 → 开发者模式”中启用开发者模式并按提示重启。
3. 确认 Xcode 已登录 Apple ID，并在 Signing & Capabilities 中选择团队 `LW6QTNHNV4`、启用 Automatically manage signing。
4. 检查 CoreDevice 状态：

```bash
xcrun devicectl list devices
```

真机需要使用 Mac 的局域网地址作为 Vite 开发地址。先查询当前地址，然后显式传给 Tauri：

```bash
ipconfig getifaddr en0
CARGO_HOME="$PWD/.cargo-ios" \
  npx tauri ios dev "Jam" --host "$(ipconfig getifaddr en0)"
```

如果 Mac 使用有线网络或其他网卡，请把 `en0` 换成实际接口。Vite 会读取 `TAURI_DEV_HOST`，监听该地址并让 HMR 使用同一主机。首次启动时允许 iPhone 的“本地网络”权限，并确认 Mac 防火墙允许 Node/Vite 接收入站连接。

当前 `Jam`（iPhone 12）若显示 `unavailable`，先完成解锁、重新插线、信任和开发者模式检查，再继续真机验收。

## 5. 编译与回归检查

```bash
npm run build
./scripts/ios-cargo.sh check --target aarch64-apple-ios
cargo check
cargo test
```

Simulator 的 Rust 架构是 Apple Silicon `aarch64-apple-ios-sim`；真实设备使用 `aarch64-apple-ios`。当前测试基线中，`media_preview::tests::ffmpeg_candidates_cover_windows_and_macos_bundle_layouts` 在 macOS 上仍有一个既有的 Windows 路径断言失败；它不是 iOS 构建失败，但在修复前不能把完整 `cargo test` 记为全绿。

## 6. 常见问题

### 页面提示无法访问 `127.0.0.1:7120`

- 先执行 `curl http://127.0.0.1:7120/`，确认 Vite 正在运行。
- 若刚使用过 `--no-watch`，重新运行 `npm run dev` 并重启 App。
- 真机不能使用 Mac 的 `127.0.0.1`；必须用 `--host <Mac 局域网地址>`。
- 真机首次访问时允许本地网络权限；若曾拒绝，在“设置 → 隐私与安全性 → 本地网络”中重新打开。

### Cargo 访问阿里云镜像超时

使用 `./scripts/ios-cargo.sh ...`，或为 Tauri CLI 显式设置 `CARGO_HOME="$PWD/.cargo-ios"`。不要修改用户的全局 `~/.cargo/config.toml`。

### Xcode 找不到 Rust 或依赖

从同一个已加载 Rust 环境的终端运行 `npx tauri ios dev`；同时确认 `rustup target list --installed` 包含所需 iOS target。

### 修改配置后生成工程没有变化

重新执行 `CARGO_HOME="$PWD/.cargo-ios" npx tauri ios init --ci`。如 Xcode 仍读取旧产物，再清理对应 DerivedData 后构建；不要删除用户的其他 Xcode 缓存。

## 7. 测试环境定位

- 官方 Xcode Simulator：日常 Tauri、Vue、Rust 和 Swift 插件开发的主环境。
- VPhone：可选第二环境，用于完整 iOS/IPA 和补充自动化，不作为发布结论。VM 库位于外置 `VPhone` APFS 卷。
- `Jam` iPhone 12：签名、Keychain、照片/iCloud、文件权限、真实后台生命周期、蜂窝网络和最终稳定性验收的唯一权威设备。
