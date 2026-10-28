# iOS 开发环境

本文档用于在官方 Xcode Simulator 和真实 iPhone 上构建、运行 Transfer Genie。iOS 客户端只使用 Supabase；WebDAV、托盘、快捷键、本机 HTTP API、Telegram Bridge、自动更新和 FFmpeg 等桌面能力不会进入 iOS 运行路径。

## 已验证环境

| 项目 | 当前基线 |
| --- | --- |
| Xcode | 26.4（Build 17E192） |
| iOS SDK / Simulator Runtime | 26.4 |
| 最低 iOS 版本 | 16.0 |
| Tauri CLI | 2.11.3（Cargo 与 npm CLI 一致） |
| 真机 / VPhone 开发团队 | `9RV293JR6V`（当前已安装包） |
| 官方 Simulator 模拟签名组 | `LW6QTNHNV4.com.transfergenie`（保留已有登录） |
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
3. 确认 Xcode 已登录 Apple ID，并在 Signing & Capabilities 中选择当前真机团队 `9RV293JR6V`、启用 Automatically manage signing。证书显示名括号中的标识不等于当前包的 `TeamIdentifier`，以实际签名与 provisioning profile 为准。
4. 检查 CoreDevice 状态：

```bash
xcrun devicectl list devices
```

真机需要使用 Mac 的局域网地址作为 Vite 开发地址。先查询当前地址，然后显式传给 Tauri：

```bash
ipconfig getifaddr en0
APPLE_DEVELOPMENT_TEAM=9RV293JR6V CARGO_HOME="$PWD/.cargo-ios" \
  npx tauri ios dev "Jam" --host "$(ipconfig getifaddr en0)"
```

如果 Mac 使用有线网络或其他网卡，请把 `en0` 换成实际接口。Vite 会读取 `TAURI_DEV_HOST`，监听该地址并让 HMR 使用同一主机。首次启动时允许 iPhone 的“本地网络”权限，并确认 Mac 防火墙允许 Node/Vite 接收入站连接。

当前 `Jam`（iPhone 17 Pro Max）若显示 `unavailable`，先完成解锁、重新插线、信任和开发者模式检查，再继续真机验收。

`available (paired)` 不保证正在通过 USB 连接。测试 runner 在执行方法前退出时，可先只读检查实际链路：

```bash
xcrun devicectl device info details --device Jam
xcrun devicectl device info lockState --device Jam
ioreg -p IOUSB -l -w 0 | rg -i 'iPhone|USB Serial Number'
```

设备详情中的 `connectionProperties.transportType` 若是 `localNetwork`，表示正在使用局域网；只有 VPhone Research VM 出现在 IOUSB 列表，不能证明 Jam 已有线连接。2026-10-28 两次测试 runner 在连接建立前退出74，局域网隧道随后出现资源分配错误；当时没有检测到 Jam USB 设备。有线重连是下一项诊断，不把它直接认定为唯一根因，也不通过重启手机、重配账号或修改安全设置来绕过。

### 真机 UI 测试 runner

`tests/ios-ui` 工程默认面向 Simulator，关闭签名。用于真机时必须显式启用签名并生成 Info.plist，否则 Apple 内置 XCTest runner 身份可能保留，安装时报 `0xe8008018`；此时测试方法尚未执行，不计业务功能失败。保留工程默认值，通过一次性参数构建：

```bash
TG_PHYSICAL_TEST_DIR=$(mktemp -d /Volumes/VPhone/installers/tg-physical-ui.XXXXXX)
xcodebuild build-for-testing \
  -project tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj \
  -scheme TransferGenieSimulatorUITests \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$TG_PHYSICAL_TEST_DIR" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=9RV293JR6V \
  PRODUCT_BUNDLE_IDENTIFIER=com.transfergenie.tests.physical-ui \
  GENERATE_INFOPLIST_FILE=YES -allowProvisioningUpdates

codesign --verify --deep --strict --verbose=2 \
  "$TG_PHYSICAL_TEST_DIR/Build/Products/Debug-iphoneos/TransferGenieSimulatorUITests-Runner.app"
```

2026-10-28 已验证该构建及严格签名检查通过；构建通过不等于测试通过。执行前确认目标 iPhone 已解锁，使用生成的 `.xctestrun` 运行，并添加 `-collect-test-diagnostics never` 避免失败时自动收集诊断触发 Mac 管理员 `Password:` 提示。该提示不是手机密码；不要在聊天中提供密码。

```bash
rg --files "$TG_PHYSICAL_TEST_DIR/Build/Products" -g '*.xctestrun'
# 将上一步确认的唯一文件路径替换到 -xctestrun，不使用模糊匹配执行。
xcodebuild test-without-building \
  -xctestrun <上一步的完整路径> \
  -destination 'platform=iOS,id=00008150-00194D300A50C01C' \
  -destination-timeout 30 -parallel-testing-enabled NO \
  -collect-test-diagnostics never \
  -only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/testComposerDraftIsEmptyBeforeUpgrade
```

本次真机 runner 已安装并启动，但在启用 UI 自动化时超时，测试正文仍未执行。随后只读复核确认 Jam 已解锁、开发者模式开启、DDI 可用、连接为 `wired` 且 USB 列表存在对应设备，因此不能把此超时归因于锁屏或局域网连接。导出的 `testmanagerd.log` 与 runner session log 进一步确认测试进程授权已成功、初始化在 `enabling automation mode` 等待60秒后失败；没有证据证明缺少授权提示。

需要进一步检查时，先从已有 xcresult 导出诊断，避免重复收集全设备日志：

```bash
xcrun xcresulttool export diagnostics \
  --path <失败的完整xcresult路径> \
  --output-path <本次诊断输出目录>
```

后续在 Jam 已解锁时复测，短时定向日志得到 `testmanagerd(AutomationMode): Writer daemon requires authentication to enable automation mode.`，随后仍在初始化60秒后超时。测试进程的会话授权和自动化模式的手机端身份验证是两步，前者成功不代表后者已完成。需要机主在手机上完成系统要求的验证；不要把密码发到聊天中，也不通过命令绕过或修改该安全要求。日志不能证明提示当前在哪个页面，若看不到提示，应先由机主反馈手机当前画面再继续。验证可能在原测试的60秒窗口之后才到达：2026-10-28实测首次会话超时后日志才显示serialized authorization与自动化模式成功启用，紧接着重跑即正常进入UI测试。

复测前也须保持手机解锁；另一轮在 Xcode preflight 阶段遇到 `Unlock Jam to Continue`，取消后未执行测试正文。不自动修改锁屏或其他设备安全设置，也不在草稿保护通过前覆盖业务 App。

业务 App 覆盖安装或终止前，先单独执行 `testComposerDraftIsEmptyBeforeUpgrade`，只有实际通过且没有 skipped 才能继续；若发现编辑中状态或非空草稿，保留当前进程与内容。

## 5. 编译与回归检查

```bash
npm run build
./scripts/ios-cargo.sh check --target aarch64-apple-ios
cargo check
cargo test
```

需要生成可覆盖安装、并验证 Keychain 会话恢复的 Simulator archive 时，使用保留 Xcode 模拟签名信息的构建：

```bash
APPLE_DEVELOPMENT_TEAM=LW6QTNHNV4 CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true \
  npx tauri ios build --debug --target aarch64-sim \
  --archive-only --ci --export-method debugging

xcrun simctl install "Transfer Genie - iPhone 12" \
  "gen/apple/build/transfer-genie_iOS.xcarchive/Products/Applications/Transfer Genie.app"
xcrun simctl launch --terminate-running-process \
  "Transfer Genie - iPhone 12" com.transfergenie
```

不要为需要验证 Keychain 的包添加 `--no-sign`。Xcode 26 的 Simulator entitlement 位于 Mach-O 的 `__TEXT,__entitlements`，而不是 `codesign -d --entitlements` 显示的签名字典；可以这样确认应用标识已嵌入：

```bash
strings "gen/apple/build/transfer-genie_iOS.xcarchive/Products/Applications/Transfer Genie.app/Transfer Genie" \
  | rg 'application-identifier|LW6QTNHNV4.com.transfergenie'
```

Simulator 的 Rust 架构是 Apple Silicon `aarch64-apple-ios-sim`；真实设备使用 `aarch64-apple-ios`。当前 macOS 基线的完整 `cargo test` 已通过；真实 WebDAV + Supabase 联合验收和本机数据副本升级测试仍按测试说明显式忽略，因为它们需要单独授权的外部环境。

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

重新生成后还要确认 `gen/apple/transfer-genie_iOS/transfer-genie_iOS.entitlements` 保留应用标识和默认 Keychain access group；否则 Simulator 会在读取 Supabase Session 时报告 `A required entitlement isn't present`。

## 7. 测试环境定位

- 官方 Xcode Simulator：日常 Tauri、Vue、Rust 和 Swift 插件开发的主环境。
- VPhone：可选第二环境，用于完整 iOS/IPA 和补充自动化，不作为发布结论。VM 库位于外置 `VPhone` APFS 卷。
- `Jam` iPhone 17 Pro Max：签名、Keychain、照片/iCloud、文件权限、真实后台生命周期、蜂窝网络和最终稳定性验收的唯一权威设备。

## 8. VPhone 可选环境

VPhone 只用于补充完整 iOS、IPA 安装、快照和自动化检查。它不会替代官方 Simulator，也不能替代 `Jam` 上的签名、Keychain、照片/iCloud、真实挂起、蜂窝网络、性能与发布验收。启用 VPhone 所需的 Recovery 安全策略必须由 Mac 所有者明确批准。

当前主机使用保留 SIP 的最小放宽方式：

```bash
csrutil status
# 预期：Filesystem Protections enabled，Debugging Restrictions disabled
```

对应的 Recovery 命令是：

```bash
csrutil enable --without debug
csrutil allow-research-guests enable
```

不再使用 VPhone 时，在 Recovery 中恢复默认调试限制并关闭 Research Guests：

```bash
csrutil enable
csrutil allow-research-guests disable
```

重启 macOS 后使用 `csrutil status` 复核。不要把 `csrutil disable` 作为常规方案，也不要自动修改 NVRAM 或 boot-args。

VPhone Launchpad 与 Core Bundle 必须使用相同的主次版本系列。当前使用 notarized Launchpad 2.13.0 和已验证的 Core Bundle 2.13.2；旧的 `VPhone.bundle` 2.2.5 不作为项目基线。检查命令：

```bash
VPHONE_CLI=/Applications/vphone-launchpad.app/Contents/MacOS/vphone-launchpad-cli
"$VPHONE_CLI" status
"$VPHONE_CLI" bundle list
"$VPHONE_CLI" vm list
```

`status` 应显示 `hostReady: true`、helper 为 `ready`、`bundleReady: true`。每次 Core Bundle 更新都会改变 `vphone-vm` 签名哈希；若日志显示 AMFI 阻止启动，重新运行：

```bash
"$VPHONE_CLI" bundle verify 2.13.2
```

该操作可能触发管理员授权。不要循环执行；若授权窗口不可见，可在普通 Terminal 中运行同一命令。

项目专用库位于独立的 200 GB APFS 卷：

```text
/Volumes/VPhone/ipsws       固件与下载缓存
/Volumes/VPhone/machines    模板、虚拟机磁盘与快照
/Volumes/VPhone/installers  Launchpad/Core Bundle 安装包
```

启动已有虚拟机：

```bash
"$VPHONE_CLI" vm start Transfer-Genie-iOS-26 \
  --root /Volumes/VPhone/machines --wait --timeout 900
"$VPHONE_CLI" guest unlock Transfer-Genie-iOS-26 \
  --root /Volumes/VPhone/machines
xcrun devicectl list devices
```

停止时使用：

```bash
"$VPHONE_CLI" vm stop Transfer-Genie-iOS-26 \
  --root /Volumes/VPhone/machines
```

若 `--wait` 超时，先读取现有 VM 日志，不要删除或重建磁盘：

```bash
"$VPHONE_CLI" vm log Transfer-Genie-iOS-26 \
  --root /Volumes/VPhone/machines --lines 200
```

### VPhone 补充 smoke suite

VPhone 回归脚本明确标记为 `SUPPLEMENTAL_ONLY_NOT_JAM_ACCEPTANCE`。默认运行不会写入 Supabase；它检查宿主机与 Core Bundle、guest/CoreDevice、Developer Mode、重复 installd IPA 安装、冷启动、进程终止与重启、当前移动 UI、截图、脱敏日志和新增 crash。若 guest 已经登录，还会验证进程终止后的登录恢复：

```bash
brew install ideviceinstaller
npm run test:vphone -- \
  --app "/Volumes/VPhone/installers/Transfer Genie VPhone.app"
```

产物默认写入 `/Volumes/VPhone/installers/vphone-smoke/<timestamp>/`。其中包含 `report.json`、移动 UI 截图、CoreDevice 结果和脱敏后的应用日志。由 `.app` 临时生成的 IPA 会在运行结束后删除，避免重复测试持续占用外置盘。脚本不会打印 Supabase 凭据、Session 或消息正文。

真实 Supabase 文本发送必须显式允许写入，并使用唯一测试内容；已知远端测试消息可用于验证手动同步后的 pull：

```bash
VPHONE_ALLOW_SUPABASE_WRITES=1 npm run test:vphone -- \
  --require-auth \
  --send-text "TG-VPHONE-SMOKE-$(date +%Y%m%d-%H%M%S)" \
  --expect-remote-text "已由另一客户端创建的专用测试消息"
```

附件预览、Quick Look 和系统分享使用已知测试附件的可见文件名定位，不删除附件：

```bash
npm run test:vphone -- \
  --require-auth \
  --attachment-text "TG-VPHONE-PROBE.pdf"
```

快照恢复会回滚整个 VPhone guest，只有已经存在专用快照、且明确允许回滚时才执行：

```bash
VPHONE_ALLOW_SNAPSHOT_REVERT=1 npm run test:vphone -- \
  --snapshot-reset "transfer-genie-clean"
```

VPhone 独有失败必须在官方 Simulator 或 `Jam` 上复现后才能成为发布阻断项；上述任何通过结果都不能勾销 `Jam` 上的发布签名、Keychain、PhotosPicker/iCloud、安全范围文件、真实挂起、Wi-Fi/蜂窝切换、媒体性能或最终稳定性验收。

## 9. 真机直装与 TestFlight

### 开发签名直装

前提：`Jam` 已解锁并信任 Mac、已启用开发者模式，Xcode 登录的 Apple ID 对当前真机团队 `9RV293JR6V` 有开发证书和 `com.transfergenie` provisioning profile，工程启用 Automatically manage signing。官方 Simulator 保留登录时使用的 `LW6QTNHNV4` 模拟签名组不能直接作为真机团队依据。

```bash
xcrun devicectl list devices
APPLE_DEVELOPMENT_TEAM=9RV293JR6V CARGO_HOME="$PWD/.cargo-ios" \
  npx tauri ios build --debug --target aarch64 \
  --ci --export-method debugging
```

成功后使用生成的 debugging IPA，或在 Xcode 的 Devices and Simulators 中选择 archive 的 `.app`/IPA 安装到 `Jam`。直装包的 provisioning profile 到期或设备未列入 profile 后将无法启动，需要重新签名安装。

覆盖安装前必须检查当前草稿，确认没有未保存的文字或附件；无法确认时停止，不先终止进程或卸载。核对 archive 的 `Info.plist` 中 `DTPlatformName=iphoneos`，再检查 strict codesign、`TeamIdentifier`、Keychain access group 与 profile 的设备列表。Simulator 与真机构建共用 archive 输出路径，后一次构建会替换前一次包，不能只凭路径或版本号判断平台。原位更新保留沙盒，不卸载应用。

日常可以在 VS Code 的“运行和调试”中选择 `iOS: 无线静默更新 Jam`，或在终端执行：

```bash
npm run ios:update:jam
```

默认流程不会打开系统“设置”，也不会在安装完成后主动启动 App 或抢占手机前台。如果希望更新后立即打开 Transfer Genie，可以选择 `iOS: 无线更新并打开 Jam`，或执行：

```bash
npm run ios:update:jam:launch
```

脚本要求 Mac 与 `Jam` 位于同一可用 Bonjour/IPv6 的局域网，手机已配对、解锁并开启 Developer Mode。它会从当前源码重新构建签名真机 archive，先等待现有的 350ms 草稿自动保存稳定，再连续两次通过 CoreDevice 无线复制 SQLite/WAL 并执行只读完整性与空草稿检查；随后核对 `iphoneos` 平台、strict codesign、Team、profile 有效期和设备 UDID。只有门禁通过才会原位覆盖安装，最后再次确认数据库完整。脚本不卸载 App、不清空容器，发现任何草稿或无法验证时都会停止。

当前免费 Personal Team 的本地 development provisioning profile 通常只有约 7 天有效期。到期后 App 可能无法启动，需要再次运行上述命令，让 Xcode 自动签发/选用新的 profile 并覆盖安装；不需要每次修改应用版本号。脚本每次都会显示本次 profile 的准确到期时间，并在剩余不足 48 小时时提示。付费 Apple Developer Program 的开发 profile 周期通常更长；TestFlight build 的测试有效期为 90 天，正式 App Store 安装不受这类本地开发签名 7 天限制。

### Release / TestFlight

TestFlight 需要付费 Apple Developer Program、有效 Distribution 证书、App Store Connect 中已创建的 `com.transfergenie` 应用记录，以及每次递增的 build number：

```bash
APPLE_DEVELOPMENT_TEAM=9RV293JR6V CARGO_HOME="$PWD/.cargo-ios" \
  npx tauri ios build --target aarch64 --ci \
  --build-number 1 --export-method app-store-connect
```

也可以使用 `--export-method release-testing` 生成供 TestFlight/发布测试使用的导出。上传前在 Xcode Organizer 验证签名与 archive；上传后在 App Store Connect 完成出口合规、测试信息和测试人员配置。不要把 Supabase service-role key、密码或 refresh token 写入构建配置。

### 支持范围与回滚

- 最低系统版本为 iOS 16.0，当前正式验收设备为运行 iOS 27.0 的 iPhone 17 Pro Max `Jam`。官方日常 Simulator 仍保留 iPhone 12 / iOS 26.4 配置。
- 图片使用 ImageIO，系统可解码音视频使用 AVFoundation/AVPlayer，PDF、文本和系统支持的 Office 文档使用 Quick Look。MKV、部分 WebM、旧编码或损坏媒体可能只能显示文件卡并通过系统分享导出。
- 同步以本地 SQLite/outbox 为准；Realtime 只在前台作为唤醒信号。进入后台后普通传输可能暂停，回到前台或下次冷启动后恢复，首版不承诺后台持续传输。
- 回滚应用版本时，先保留现有本机数据并确认待同步数量为 0。优先覆盖安装上一个已签名版本；不要卸载应用，因为卸载会删除应用沙盒和本机缓存。若旧版本数据库不兼容，停止回滚并从当前版本同步完成后再处理。
- TestFlight 回滚通过停止当前 build 测试并重新启用上一个仍有效的 build；直装回滚使用上一个 archive 重新签名覆盖安装。
