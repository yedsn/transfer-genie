# iOS 附件持久化、恢复与界面状态验证

日期：2026-10-26。范围：任务 4.5 / 4.6 的发送身份、文件快照、前后台传输恢复、完成态和账号隔离，以及 5.4 的附件界面状态；不代表真机稳定性验收完成。

## 已执行检查

| 命令 | 结果 |
| --- | --- |
| `cargo test --lib download` | 27 项通过，0 失败 |
| `cargo test` | 主库 367 项通过、2 项环境验收忽略；Telegram Bridge 二进制 43 项通过；0 失败 |
| `npm run build` | Vue 类型检查与 Vite 生产构建通过 |
| `node tests/test_mobile_ui_shell.js` | 移动 UI shell 检查通过 |
| `node tests/test_platform_capabilities.js` | 平台 Provider 过滤检查通过 |
| `./scripts/ios-cargo.sh check --locked --target aarch64-apple-ios` | 通过；存在既有平台未使用代码警告 |
| `openspec validate add-supabase-ios-client --strict` | 通过 |
| `cargo fmt --all -- --check` / `git diff --check` | 通过 |

iOS 编译最初遇到 crates.io 直连索引超时；独立缓存离线检查缺依赖。最终检查仅对单条命令设置 `HTTP_PROXY` / `HTTPS_PROXY` 为本机 Clash 代理后通过，未更改系统或 Cargo 全局配置。

## 实际观察

- 同一发送请求的重试只保留一条消息、一条附件和两条原 outbox 操作；`sending` 恢复保留原 operation ID。不同内容复用同一 `clientId` 被拒绝，原文件不被覆盖。
- 发送前验证按账号与附件 ID 隔离的沙盒副本，副本大小及 SHA-256 必须与请求内容一致，路径使用安全文件名。
- 本机流式测试服务提供 2 MiB 附件；下载 future 在 450 ms 被取消后，`.part` 文件及 SQLite 记录保留，正式缓存不存在，另一账号查不到进度。重新调用安全重启传输，校验后发布缓存并清除 partial 记录。当前不宣称支持 Supabase HTTP Range 续传。
- 大小或 SHA-256 不符时返回错误，保留可重试 partial，正式缓存和完成下载历史均不存在。
- 下载期间切换账号，旧响应不能发布缓存；partial 仍只归原账号。
- 同 profile 同名消息的 A/B 下载历史可并存；批量列表的历史与 partial 联表均按账号隔离。iOS 只列当前账号记录，其他账号及未知归属旧记录不能通过记录操作入口访问，退出后列表为空。
- 数据库迁移重复执行仍保留旧 WebDAV 下载记录 ID、路径、完成态、partial 字节数和 ETag。旧记录归空作用域，不猜测或重新归属给 Supabase 用户。
- iOS 导出副本按 profile / 账号 / 消息隔离。桌面仍保留全局下载历史与原下载目录行为。

测试使用本机临时目录、SQLite 和本机 HTTP 测试服务；未改动真实 Supabase 数据或用户附件。

## 4.5 阶段的验证边界

- 本轮取消 future 模拟任务中断，不是物理设备上的强制进程终止或 iOS 挂起。
- 4.6 仍需接入并验证后台暂停、前台从持久状态恢复，包含较大上传与下载以及响应未知场景。
- 未进行本轮 Simulator IPA 安装、Swift 重测或真实 Supabase 网络验收；本轮未修改 Swift 插件。
- 官方 `Transfer Genie - iPhone 12` 模拟器处于 Booted；`xcrun devicectl list devices` 中 `Jam` 仍为 unavailable。签名发布、真实照片/iCloud、Wi-Fi/蜂窝、挂起和稳定性验收仍须在 `Jam` 完成。

## 4.6 Phase 1：进入后台暂停，恢复前台重试

用于证明普通 Rust 网络任务被中断后，本机数据和稳定身份仍可恢复，不假设 iOS 允许后台持续传输。

| 检查 | 实际结果 |
| --- | --- |
| `cargo test --lib mobile_` | 6 项通过，覆盖前后台恢复、大附件和快速生命周期切换 |
| `cargo test --lib download` | 28 项通过，包含下载校验和作用域隔离 |
| `cargo test --quiet`（串行最终检查） | 主库 370 项通过、2 项忽略；Bridge 43 项通过；文档测试通过；退出码 0 |
| `cargo test --doc`（串行） | 通过 |
| `./scripts/ios-cargo.sh check --offline --locked --target aarch64-apple-ios` | 通过；保留既有平台未使用代码警告 |
| `npm run build` | Vue 类型检查和 Vite 构建通过 |
| `node tests/test_mobile_ui_shell.js` | 执行真实 TS 控制器的本机 API harness，通过 |
| `node tests/test_platform_capabilities.js` | 通过 |
| `node tests/test_feed_state.js` / `test_feed_view_model.js` / `test_media_runtime.js` / `test_settings_runtime_status.js` / `test_settings_ops_runtime.js` / `test_settings_form_runtime.js` | 6 组桌面前端回归检查均通过；命令中的每个文件均位于 `tests/` |
| `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --no-sign --archive-only --ci` | 最终 Rust + Vue + Swift Simulator archive 构建成功，退出码 0 |
| `openspec validate add-supabase-ios-client --strict` | 通过 |
| `cargo fmt --all -- --check` / `git diff --check` | 通过 |

实际观察：

- 4 MiB 慢速下载在进入后台后停止；正式缓存不存在，`.part` 文件实际字节数、SQLite 进度和 `paused` 历史保留。使用全新 AppState 恢复前台后，从 SQLite 找回用户已经请求的下载，安全重启并校验大小及 SHA-256 后发布缓存。
- 恢复只处理当前 Profile / Auth 用户 / Space、仍存在的权威消息及受控缓存目标。旧 Space 不发起对象请求，另一账号的 partial 保留且不可被当前账号领取；列表中的历史原件不会因此自动下载。
- 4 MiB 上传在测试服务已收到原件、但尚未返回响应时进入后台；客户端保持原 attachment operation 为 pending，保留原件，不提前确认元数据。恢复后使用相同 operation、attachment 和 object 身份重试，最终只有一条附件元数据。
- 快速后台→前台切换使旧生命周期 generation 的任务停止；重复前台通知不会取消同一前台世代的新任务。恢复领取状态使用 sync 锁，不与正在执行的同步争抢。
- 预览和播放所需的 iOS 原件也进入受控持久下载路径。图片/视频缩略生成失败与原件可用性保持独立。
- 移动端上传列表来自当前账号 outbox，下载列表来自作用域历史。收到全部字节但尚未校验或确认时最多显示 99%；只有完成记录才显示 100%。前台恢复失败时也通知 UI 重读本机状态。
- 传输事件不含 Auth 用户，只作为读取作用域持久状态的提示，不直接把事件文件名或完成态展示给当前账号。自动测试覆盖退出后的事件以及其他账号延迟事件均不向当前传输列表插入条目。

本阶段不宣称 HTTP Range 续传或后台 `URLSession` 已实现。既有单次同步 45 秒超时仍存在，真实大文件及弱网耗时必须在 4.7 测量后决定是否调整或提出 Phase 2。

## 5.4：附件界面状态与系统打开降级

沿用已确定的移动端视觉设计，增加真实状态提示和动作边界，不重新设计页面。

- 自动控制器测试覆盖预览 loading → offline → ready、图片显示失败、历史预览缺失；列表及缩略重试均不调用原件下载。
- 缓存标识来自后端 `download_exists`；原件下载前显示准备状态，暂停/失败可重试。重复点击不重复启动下载。
- 缩略补全失败不阻止原件交给系统预览。Swift 返回 `supported=false` 时显示格式不支持与分享导出提示，不误报为已打开。
- 音频类型卡和音视频播放入口使用现有 Quick Look 能力；具体编码是否可播放仍由系统决定，不承诺所有桌面格式。
- 分享取消恢复到缓存状态，不展示传输失败。账号退出后的延迟下载响应不会触发旧账号文件的系统预览。
- 使用真实 `<img>` 的错误事件处理无法显示的预览；详情提供可读的状态和 `aria-live` 提示。

上述行为通过 TS transpile + VM 执行真实控制器与本机替身 API 验证；不是物理设备媒体、手势或 VoiceOver 验收。5.4 仍未勾选，保留代表性真机文件与系统播放验证。

## 5.5：已有 Space 绑定与附件缓存管理

本轮修复已登录后重新选择已配置 Space 时误报重复配置的问题，并完成 iOS 缓存控制的后端安全边界。

| 检查 | 实际结果 |
| --- | --- |
| `cargo test --lib supabase_binding_ -- --nocapture` | 3 项通过；包含已有目的地复用及不同账号待办保护 |
| `cargo test --lib mobile_cache_ -- --nocapture` | 2 项通过；包含清理结果、账号隔离、待办、partial 与 symlink 保护 |
| `cargo test --lib` | 374 项通过、2 项真实环境验收忽略，0 失败 |
| `node tests/test_mobile_ui_shell.js` | 真实 controller harness 通过；覆盖返回已有 Profile ID、缓存摘要/清理及隐藏 `cache_removed` 历史 |
| `npm run build` | Vue 类型检查和 Vite 生产构建通过 |
| `openspec validate add-supabase-ios-client --strict` | 通过 |
| `cargo fmt -- --check` / `git diff --check` | 通过 |
| `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --no-sign --archive-only --ci` | Simulator archive 构建成功 |

实际观察：

- 完成绑定时按规范化 API URL + `space_id` 查找已有 Supabase 目的地；重试或重新登录复用已有 Profile ID，不新增重复 Profile。新的 Session 保存到已有 Profile 的凭据项，前端使用后端返回配置中的真实 Profile ID 激活空间。
- 如果已有 Profile 的原账号不同且仍有未完成 outbox、冲突或数据传输任务，账号替换会被拒绝；原 Session 和临时绑定流程保留，便于处理后重试。
- 缓存清理候选必须是已上传、已有远端 revision 和对象路径、未删除且没有未完成 message/attachment outbox 或 partial 下载的附件。仅扫描当前 Profile + 当前 Auth 用户的 downloads、previews、exports、已上传原件副本、隔离预览与播放缓存。
- 删除前再次验证受控根目录且不跟随符号链接；待上传原件、下载中的 `.part`、其他账号文件与根目录外目标保留。同步、下载、预览生成或媒体播放占用时拒绝清理。
- 清理后仅清空本机路径与完成下载缓存元数据，消息、附件远端身份与可重新下载能力保留。`cache_removed` 历史不显示为活动传输。

新版 archive 已覆盖安装到 `Transfer Genie - iPhone 12` 并成功启动，截图：`/tmp/transfer-genie-binding-fixed.png`。现有设置 Profile 保留。进入 Profile 后显示登录页：上一次登录尚停留在绑定 Space 之前，临时 Session 只存在于进程内存，覆盖安装终止进程后不会成为持久 Keychain Session。需要重新登录一次并完成绑定后，才能继续真实 Simulator Space、消息与缓存 UI 验收。这不是已绑定账号的 Session 持久化失败。

## 5.6：移动可访问性自动化检查

本轮完成不依赖登录的浏览器级验收；VoiceOver 与真机 Dynamic Type 仍保留到 `Jam`。

| 检查 | 实际结果 |
| --- | --- |
| `npm run build` | Vue 类型检查与 Vite 生产构建通过 |
| `node tests/test_mobile_ui_shell.js` | 语义标签、焦点恢复、44pt 点击区域、增强对比度和 reduced-motion 静态检查通过 |
| Playwright，390×844 | 无横向溢出；所有可见 button/input/textarea 点击区域均至少 44×44 CSS px |
| Playwright，844×390 | 无横向溢出；所有可见交互区域均至少 44×44 CSS px |
| Playwright，根字号 24px | 横竖屏均无横向溢出，交互区域没有缩小到 44px 以下 |
| Playwright，`prefers-reduced-motion: reduce` | 移动 shell 没有活动 animation 或 transition |
| Playwright，`prefers-contrast: more` | media query 生效并使用更强边框/文字对比度 |
| Composer 焦点 | 打开后焦点进入 `消息内容` textarea；按 Escape 关闭并恢复到原“发送消息或文件”按钮 |
| 新页面控制台 | 0 error、0 warning |
| `cargo fmt -- --check` / `git diff --check` | 通过 |

实测过程中发现并修复顶部 Space switcher 42pt、传输任务条 39pt 和 Composer 初始焦点落在关闭按钮的问题。另修正旧桌面 SVG 非法多值 `rx` 与缺失 favicon 造成的控制台噪声，不改变业务行为。截图保存在仓库外：`/tmp/transfer-genie-mobile-accessibility-portrait.png`。

任务 5.6 暂不勾选：还需要在 `Jam` 上使用 VoiceOver 顺序浏览、系统 Dynamic Type 和实际触控完成 smoke test。

### 官方 Simulator 实机外壳补充

- 将 `Transfer Genie - iPhone 12` 实际旋转到横屏后，登录卡片切换到紧凑布局；标题、说明、邮箱、密码和登录按钮均完整显示，没有水平裁切。截图：`/tmp/transfer-genie-login-landscape-real.png`（`simctl` 原始截图保留设备方向元数据，便于查看的旋转副本为 `/tmp/transfer-genie-login-landscape-upright2.png`）。
- `accessibility-extra-extra-large` 下的竖屏登录页仍完整可见，随后恢复 `large`；截图：`/tmp/transfer-genie-login-axxxl.png`。
- Simulator UI 自动化点击被 macOS 辅助功能权限阻止，因此本轮没有把实际软键盘截图冒充为已验证；5.1 的真实键盘可达性继续保留到登录后手动/受控检查。
- 对同一最新包执行 20 次 `simctl terminate` + `simctl launch` 冷启动循环，20/20 成功。日志没有 panic、crash、credential restore 或缺 entitlement 错误；仅出现 iOS 26.4 Simulator WebKit Accessibility bundle 的系统级重复类警告。
- 执行 50 次真实前后台切换：每轮用 `simctl launch com.apple.Preferences` 让应用进入后台，再重新 `simctl launch com.transfergenie`。50/50 循环成功，应用仍可见，日志没有 panic、crash、fatal、Keychain entitlement 或重复订阅错误。未登录状态不能证明 Supabase Realtime/outbox/checkpoint 已收敛，因此只记为 Simulator 外壳与原生生命周期稳定性证据。

## Simulator Keychain entitlement 修复

覆盖安装最新 archive 后，启动日志曾出现 `Platform secure storage failure: A required entitlement isn't present`。根因是此前用于纯编译验证的 `--no-sign` Simulator archive 没有携带应用标识；这类包可启动，但不能作为 Keychain 验收包。

- `gen/apple/transfer-genie_iOS/transfer-genie_iOS.entitlements` 现在声明标准 `application-identifier` 和仅限 `$(PRODUCT_BUNDLE_IDENTIFIER)` 的默认 Keychain access group。
- Xcode 26.4 对 Simulator 使用 `*-Simulated.xcent`，把上述值嵌入 Mach-O 的 `__TEXT,__entitlements`；`codesign -d --entitlements` 仍显示空字典，不能据此误判。
- 使用不带 `--no-sign` 的 `--export-method debugging` archive 重建后，`strings` 和 Mach-O section 均能确认 `LW6QTNHNV4.com.transfergenie`，应用正常安装启动。
- 新启动日志不再出现 Supabase credential restore 或缺 entitlement 错误，只剩 Simulator WebKit 自身的 host-network 诊断。

这证明 Simulator 已具备 Keychain 调用前提；仍需用户重新登录一次，然后通过进程终止和 Simulator 重启验证实际 Session 持久恢复。

## 构建过程中的环境问题

- 曾并行运行默认 Cargo 测试和使用独立 `CARGO_HOME` 的 iOS 构建；两者共享 `target/debug`，主库及 Bridge 测试通过后，rustdoc 报 `E0463` 依赖产物不可读取。停止并行构建后，串行 `cargo test --doc` 与完整 `cargo test --quiet` 均退出 0。后续 Rust 验证与 iOS 构建串行执行。
- 普通 `tauri ios build` 已产生 app/archive，但最终移动目录报 `Directory not empty (os error 66)`；未删除原产物。改用 `--archive-only` 已成功退出 0，archive 可用于 `simctl install`。
- 浏览器自动化最初找不到 `/Applications/Google Chrome.app`；机器已有 Playwright Chromium，临时将该现有 runtime 暴露给自动化后完成验收，没有修改项目依赖。

## 仍需真机与真实服务验证

- 本轮网络测试使用本机 SQLite、临时文件和本机 HTTP 服务；未写入真实 Supabase 或修改用户附件。
- 官方 Simulator 已可安装、启动应用并显示 Supabase-only 配置入口，但尚未登录真实 Supabase 完成 6.1 纵向流程。
  - 最终 archive：`gen/apple/build/transfer-genie_iOS.xcarchive`；使用 `xcrun simctl install` 安装其中的 `Products/Applications/Transfer Genie.app`，再用 `xcrun simctl launch --terminate-running-process 6719E14E-8424-49B1-B96D-CB0A609311EA com.transfergenie` 成功启动。截图：`/tmp/transfer-genie-phase1-final-simulator.png`。截图仅证明未配置账号的入口渲染，不证明已登录后的全部附件状态或系统播放能力。
- 模拟 lifecycle / 取消 future 与新建 AppState 不是 iOS 系统强制终止或真实挂起。4.7 / 6.4 仍需文本、图片、短视频、大文件和弱网计时，以及锁屏、切后台、杀进程恢复。
- `xcrun devicectl list devices` 复查仍显示 `Jam` unavailable，并有 `No provider was found` provisioning 提示。真机开发/发布签名、Keychain、Photos/iCloud、文件权限、系统媒体能力、Wi-Fi/蜂窝切换和稳定性验收仍未完成。

## 2026-10-26 Simulator 登录前回归基线

用户表示已完成登录后，重新检查官方 Simulator 的实际界面和 Keychain。应用仍停留在“登录 Supabase”页；配置文件中的 Supabase Profile、API 配置和 `space_id` 均保留，但 Simulator Keychain 中没有 `transfer-genie` 凭据项。因此当前证据表明登录提交没有成功形成 Session，而不是已有 Session 在重启时丢失。未读取、记录或自动填写用户密码。

为排除旧包和 entitlement 干扰，使用以下命令重新生成并覆盖安装最新调试 archive：

```bash
CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true \
  npx tauri ios build --debug --target aarch64-sim \
  --archive-only --ci --export-method debugging

xcrun simctl install 6719E14E-8424-49B1-B96D-CB0A609311EA \
  "gen/apple/build/transfer-genie_iOS.xcarchive/Products/Applications/Transfer Genie.app"
xcrun simctl launch --terminate-running-process \
  6719E14E-8424-49B1-B96D-CB0A609311EA com.transfergenie
```

最新包可正常启动，Mach-O 仍包含 `LW6QTNHNV4.com.transfergenie`，日志没有缺 entitlement、credential restore、panic 或 crash。覆盖安装保留了现有 Profile 与 Space 配置。登录后的 Session 保存、进程终止恢复、Simulator 重启恢复和真实 Supabase 纵向 probe 仍需要用户在该最新包中成功登录一次后继续。

本轮可独立完成的回归结果：

| 检查 | 结果 |
| --- | --- |
| `cargo test` | 主库 374 项通过、2 项授权环境测试忽略；Telegram Bridge 43 项通过；其余目标和 doc tests 通过，0 失败 |
| 12 个独立 Node 前端测试 | feed、media、mobile shell、platform、settings、Vue、workspace 全部通过 |
| `CHROME_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" node tests/test_speech_to_text_ui_smoke.js` | 通过 |
| `npm run build` | Vue 类型检查与 Vite 生产构建通过 |
| `./scripts/ios-cargo.sh check --offline --locked --target aarch64-apple-ios` | 通过；仅有平台未使用代码警告 |
| `xcodebuild -scheme tauri-plugin-mobile-integration -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' test` | Swift 插件 21/21 通过 |
| `openspec validate add-supabase-ios-client --strict` | 通过 |
| `cargo fmt -- --check` / `git diff --check` | 通过 |

`tests/test_desktop_media_e2e.js` 原先是 Windows/WebView2 专用 harness。本轮将进程、FFmpeg 与 WebView 驱动选择跨平台化：Windows 保留 WebView2 CDP；macOS Debug 测试实例在同时设置 `TRANSFER_GENIE_ALLOW_TEST_INSTANCE=1` 与 `TRANSFER_GENIE_E2E_DRIVER_PORT` 时，才在 `127.0.0.1` 暴露临时 JavaScript evaluation 通道。Release、普通 Debug 启动和非测试实例都不会监听该端口。

macOS 真实桌面 WebDAV UI E2E 已通过：

- 隔离应用数据目录与本地内存 WebDAV，不读取或覆盖用户正式配置。
- 两个独立 WebDAV 存储空间完成切换与路径隔离。
- PNG、MP3、WAV、MP4、WebM、MKV 六种 fixture 完成发送；图片与三种视频容器生成预览，endpoint A/B 的预览缓存保持隔离。
- 删除 MP4 本地源文件后，应用从 WebDAV 建立 `remoteCache` 播放缓存；批量下载仍诚实显示 `notDownloaded`。
- 真实 Tauri WKWebView DOM 完成图片详情、MP3/WAV 行内播放器、MP4/WebM 视频层、MKV 不支持格式降级、批量下载视频/音频播放器与选择状态隔离。
- E2E 发现并修复刷新按钮的双刷新竞争，以及 WKWebView 在远程缓存完成后自动播放授权过期时销毁已准备播放器的问题；现在媒体源准备成功后保留控件，自动播放被系统阻止时可再次手动播放。

最终命令：`node tests/test_media_runtime.js && node tests/test_desktop_media_e2e.js`、`npm run build`、`cargo fmt --all -- --check`、`cargo check --features devtools` 与相关 `git diff --check` 均退出 0。任务 6.5 已完成。

项目级 `.cargo/config.toml` 现将 `IPHONEOS_DEPLOYMENT_TARGET` 固定为 `16.0`，与 Swift `Package.swift`、生成的 Xcode 项目和已文档化支持范围一致。修复前，裸 `cargo check --target aarch64-apple-ios` 会由 `swift-rs` 默认使用 `arm64-apple-ios13.0`，对 PhotosPicker、UTType 和 AVFoundation async API 产生错误的 availability 编译失败；修复后同一裸命令退出 0。

另外已向 Simulator 相册导入专用的 `TG-IOS-PROBE-20261026-image.jpg` 与 `TG-IOS-PROBE-20261026-video.mp4`，登录后只使用该前缀的素材和消息做图片/视频选择、预览与上传验收，不删除或改写用户已有消息。

## 2026-10-26 对话气泡与向上历史分页

移动消息页改为桌面同规则的左右对话气泡：发送者为“我”或等于当前非空 `sender_name` 时靠右、浅绿色；其他设备靠左、浅色；已标记气泡沿用橙色提示且方向不变。正文保留换行，不再截成两行；媒体缩略图、文件信息、缓存与更多操作保留。桌面消息组件与样式未修改。

验证命令与结果：

- `node tests/test_mobile_ui_shell.js`：通过，含自身判断、空名称防误判、排序、分页去重、保留历史、删除收敛及离线失败恢复。
- `PLAYWRIGHT_MODULE=/Users/elio/.npm/_npx/e41f203b7505f1fb/node_modules/playwright CHROME_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node tests/test_mobile_feed_browser.js`：通过。仅本地 fixture，不写 Supabase；覆盖左右气泡、绿色/标记橙色、44px 菜单、初始底部、向上分页锚点、新消息跟随/历史阅读不跳、刷新保留历史，以及 320px 窄屏和横屏的长链接/文档/视频宽度。
- `npm run build`：Vue 类型检查及生产构建通过。
- `openspec validate add-supabase-ios-client --strict` 与 `git diff --check`：通过。
- `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging`：通过。使用上述 `simctl install` / `launch --terminate-running-process` 覆盖安装到官方 `Transfer Genie - iPhone 12`，未清空应用数据。

已安装包证据：保存的登录状态恢复、空间正常读取、初始 50 条消息且距列表底部为 0；实际 SQLite 向上分页从 50→100→150→200 条。使用 WKWebView 原生 scroll 事件捕获分页前后同一可见消息，在 150→200 时位置差为 0，无横向溢出。早期在原生 scroll 事件前强行采样出现 -198 的无效测量，改为事件内采样后为 0；没有据此改写实际逻辑。检查只返回布局与数量，没有输出正文、账号凭据或令牌。

该真实消息窗口全部来自其他设备（自身消息数为 0），因此本轮不声称已验证本机发送后的真实右侧消息。自身归类由控制器/浏览器 fixture 覆盖；Simulator 中短暂插入再移除的 DOM 副本确认右侧 `flex-end` 与 `rgb(223,245,213)` 样式，不改发送者、不写本地数据库或云端消息。诊断 DOM/内存状态已清除并解除调试器，应用恢复到底部继续运行。截图 `/tmp/tg-ios-chat-simulator.png` 仅为已登录包的实际左侧历史正文显示。

本轮完成任务 5.7，不表示全部 iOS 功能测试通过。照片/文件选择、发送输入触摸、系统媒体行为与其他未完成验收仍保持原待办状态；未开始 `Jam` 真机测试。

## 2026-10-27 紧凑状态、长消息折叠及功能进展

- 顶部空间选择器下合并一行同步状态，独立的大状态卡已移除；“我的”仍可进入完整同步与传输、手动同步和缓存管理。
- 文本默认折叠为 PC 同样的 130px，附件内容上限 260px。实际高度超限时才显示“展开更多 / 收起”；按钮隔离卡片点击和长按事件，正常刷新保留展开状态，ResizeObserver 适配内容及宽度变化。
- `node tests/test_mobile_ui_shell.js`、`npm run build`、`openspec validate add-supabase-ios-client --strict`、`git diff --check` 通过；现有 Edge + Playwright 浏览器测试增加短消息无按钮、长文本/长文件名限制、展开收起、刷新保持、窄屏和同步状态切换，均通过。
- Signed Simulator archive 继续使用上述 Tauri debugging 命令构建与覆盖安装；原生 XCTest 的 `testCompactStatusAndLongMessageExpansion`、`testSignedInSupabaseShellAndNavigation`、`testSpaceTransferAndCacheSheetsAreReachable` 共 3/3 通过。UI 测试使用 `-derivedDataPath /tmp/tg-compact-collapse-derived-v2`，避免旧 DerivedData 运行过时测试方法；日志 `/tmp/tg-compact-collapse-tests-v2.log`。

整体功能仍在推进，未标记完整目标完成：

- 给输入入口增加明确“新消息”标签后，原生按按钮触摸开启/关闭、软件键盘输入、照片/文档选择器取消都通过。固定坐标取消键盘会误点遮罩关闭弹层，测试改为点弹层标题收键盘后通过。
- `testSendTextAndObserveCloudConvergence` 真实输入专用测试文本，发送、同步与杀进程恢复通过（`/tmp/tg-mobile-flows.log` 中该单项通过，其他旧选择器断言失败不能算整套通过）。
- 原生媒体/文档选择器现在用独立随机目录保留原文件名，修复发送后随机 UUID 名称问题；新增同名隔离、源删除后副本可读测试，Swift 全套 23/23 通过（`/tmp/tg-native-import-tests.log`）。
- `testSelectImageVideoAndSend` 仅选择专用 21:46 测试图片与 2 秒短视频，草稿 2 附件、发送、同步通过（`/tmp/tg-media-send3.log`）。SQLite 复查两条专用附件名称正确、同步状态 synced、remote revision 为 1；未检查完预览对象与跨设备读取，不能据此勾选整个纵向 probe。
- 移动控制器新增 `supabase-realtime-synced` 监听，刷新期间再次到达的通知排队补读，监听释放后不再刷新；运行时测试通过。仍需外部设备/服务变化驱动的实际 UI 更新验证。
- 系统预览/播放、文件选择发送、分享、离线与生命周期稳定性等剩余场景尚未完整验收；按用户要求未开始 `Jam` 真机测试。

## 2026-10-27 顶部同步状态最终回归

- 清理已移除的独立同步卡片样式；“我的 → 同步与传输”只保留入口、传输任务和手动同步操作，不再重复展示状态。本轮没有改动同步业务逻辑。
- `node tests/test_mobile_ui_shell.js`、`npm run build`、`openspec validate add-supabase-ios-client --strict` 与 `git diff --check` 通过。
- 使用上述 Edge/Playwright 命令运行 `tests/test_mobile_feed_browser.js` 通过。新增断言确认状态位于空间选择器内部、仅一行小字、高度不超过 16px，以及状态变化不增高顶部。
- 使用既有带签名的 Tauri debugging 命令重新构建并覆盖安装最新 archive，保留应用数据。构建退出 0，日志 `/tmp/tg-compact-status-build-20261027.log`。
- 原生 UI 测试使用 `-derivedDataPath /tmp/tg-compact-status-derived-20261027-v3`，指定 `testCompactSyncStatusInSpaceSelector` 和 `testSpaceTransferAndCacheSheetsAreReachable`，2/2 通过。确认选择器高度不超过 52pt、没有独立大状态按钮、空间选择及完整同步/缓存入口仍可点击。日志 `/tmp/tg-compact-status-native-20261027.log`。
- 此结果仅覆盖本次紧凑状态展示，不代表全部移动功能完成；整体任务仍为 19/47，未开始真机测试。

## 2026-10-27 设置、草稿预览与标记功能补全

- “我的”页接通发送者名称编辑和“关于 Transfer Genie”弹层。发送者名称使用最新设置快照合并保存，只修改移动端允许字段；空值、重复提交、写入失败及账号切换迟到响应均有控制器测试，保存不会清空消息窗口或未发送草稿。
- 草稿附件增加显式“预览”入口，图片、视频和文档均使用已经复制到沙盒的原件调用系统预览；预览不会发送或移除草稿。发送期间禁用编辑、选择和移除，并由控制器拒绝重复发送；失败附件保留稳定 `clientId` 重试，已本地保存的文本不会在附件重试时重复发送。
- 实测发现裸 `QLPreviewController` 展示图片时没有可靠关闭入口，已改为全屏导航控制器并提供系统“完成”按钮。Swift 插件 23/23 通过（`/tmp/tg-native-preview-done-tests.log`）；安装最新包后，`testDraftImagePreviewAndRemoval` 与 `testAboutAndSenderSettingsAreReachable` 2/2 通过，图片可预览、关闭、返回草稿并移除，日志 `/tmp/tg-mobile-preview-done-native-20261027.log`。
- 标记页增加标签选择、新建标签和截止日期编辑，保存沿用 `mark_message` 的 Supabase 本地优先 outbox，不新增后端路径。控制器验证标签/日期映射及新标签刷新；Edge/Playwright 验证触摸尺寸和弹层交互；已安装 Simulator 的 `testMarkedMetadataEditorIsReachable` 通过，日志 `/tmp/tg-mobile-marked-native-20261027-v2.log`。原生测试只打开并关闭编辑器，没有修改用户现有标记。
- 同步状态为冲突时，“我的”页现在提供冲突列表，显示本机/云端摘要及“采用云端 / 保留本机”，调用已有 `list_sync_conflicts` / `resolve_sync_conflict`。失败的上传 outbox 在同步与传输页显示“重试”，调用已有 `retry_pending_operation`。两条路径均有控制器测试，冲突界面和 44px 操作按钮有浏览器交互测试；真实冲突注入与解决仍需专用虚拟环境场景。
- 本轮 `node tests/test_mobile_ui_shell.js`、Edge/Playwright feed、`npm run build`、`git diff --check`、`openspec validate add-supabase-ios-client --strict` 均通过。未开始 `Jam` 真机测试。
- 包含上述全部入口的最终 Simulator archive 构建并覆盖安装成功，日志 `/tmp/tg-mobile-functional-final-build-20261027.log`；安装后的紧凑状态、关于/发送者设置、标记编辑共 3/3 原生测试通过，日志 `/tmp/tg-mobile-functional-final-native-20261027.log`。应用已重新启动，现有登录和数据保留。

## 2026-10-27 Simulator 纵向 probe 完成

- 文档选择器的多选确认模式需要先勾选文件，再点击右上角“打开”。`testDraftDocumentPreviewAndRemoval` 现覆盖专用 `TG-IOS-PROBE-20261027-document.txt` 的选择、确认导入、草稿 Quick Look、Done 返回、保留草稿及移除附件；日志 `/tmp/tg-mobile-document-native-20261027-v4.log`。Quick Look 没有把文本正文暴露为稳定的 `staticText`，因此验收使用系统预览可见、可关闭、返回同一草稿及截图，不伪造正文 AX 断言。
- iOS 26 的 `UIActivityViewController` 在该尺寸下没有取消按钮，而是底部抽屉下滑关闭。`testSentFixtureShareCanBeCancelled` 用专用已发送图片确认系统活动（Copy/提醒事项）出现，随后下滑关闭，返回同一消息详情且没有分享错误；日志 `/tmp/tg-mobile-share-native-20261027-v2.log`。
- 通用 Quick Look 对专用 MP4 只暴露预览容器，没有可证明的播放控件。原生插件现按 UTType 分流：系统音视频先由 `AVURLAsset.isPlayable` 检查，再交给全屏 `AVPlayerViewController` 并自动播放；图片、PDF、Office、文本继续使用 Quick Look。Swift 插件 24/24 通过，日志 `/tmp/tg-native-player-tests-20261027-v2.log`。
- 最新带签名 Simulator archive 使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 构建并覆盖安装，保留登录和应用数据；日志 `/tmp/tg-mobile-player-build-20261027.log`。
- 安装包原生媒体回归 4/4 通过：草稿图片 Quick Look、草稿文档 Quick Look、已发送图片系统分享取消、已发送 MP4 系统播放器；日志 `/tmp/tg-mobile-native-media-regression-20261027.log`。播放器的最终窄测试还要求系统播放/暂停或播放位置控件存在且可点击，日志 `/tmp/tg-mobile-video-native-20261027-v3.log`。
- `testDocumentSendRemoveCacheAndRedownloadPreview` 从 Files 选择并发送专用文档，等待 Supabase 同步，执行“仅移除本地附件缓存”，确认详情回到“原件按需下载到本机”，再由“系统预览”触发云端下载并在 Quick Look 打开；日志 `/tmp/tg-mobile-document-cloud-20261027-v1.log`。未删除云端消息。
- 当前 Simulator SQLite 只读核验：专用文本消息为 `synced`、revision 1；专用图片、视频和文档的 message 与 attachment revision 都为 1、上传状态 `uploaded`、对象路径存在、对应 outbox 已 `acknowledged`。图片和视频均有稳定预览对象；文档按设计没有预览对象。当前 checkpoint `change_seq=859`，本地存在 431 条其他设备消息，结合已验证的向上分页与刷新证明真实增量补拉已工作。验证输出不记录 owner、Space、对象完整路径或凭据。
- 因此任务 6.1 的 Simulator 纵向 probe 已完成：Vue shell 启动、保存的 Supabase 登录、文本发送/恢复、checkpoint 补拉、图片/视频选择、ImageIO/AVFoundation 预览、原件与 `preview.jpg` 上传、文档上传后删缓存再下载打开均有直接证据。此结论不代表 PDF/Office/不支持格式、真机签名、Photos/iCloud、真实挂起或 `Jam` 稳定性验收完成。

## 2026-10-27 冲突解决与 VPhone 状态复核

- 在官方 Simulator 当前 Profile/账号作用域中插入一条专用、且原先不存在于消息表的远端删除冲突。第一次 UI 测试发现 tombstone payload 带 `deleted_at` 时摘要错误显示实体 ID；修复后，安装包正确显示“该版本已被删除”。
- `testInjectedConflictCanAdoptRemoteDeletion` 在已安装包中通过：“采用云端”后冲突状态为 `resolved_remote`，没有生成 outbox。测试产生的 tombstone 消息、冲突记录随后均从 Simulator SQLite 清理，复核 message/conflict/outbox 计数全部为 0；没有写入 Supabase。
- 该流程还发现自动化选择器会把合并到“存储空间”行的小号“同步冲突”状态误认为独立冲突入口；测试已改为定位“X 项需要选择保留版本”，与最新紧凑 UI 一致。
- VPhone Launchpad 2.13.0 为 Apple notarized，Core Bundle 2.13.2 的 SHA-256 为 `61e0e50ce5ccf94aeb0a0eaf17ff555e08e927244f46a8bde0966d0d63577571`，`policy` 与此前 preflight 均通过。200 GB `/Volumes/VPhone` APFS 容器正常挂载，VM 库、12 GB IPSW 和约 31 GB machine/template 数据均位于该卷。
- 已有 `Transfer-Genie-iOS-26` guest 绑定 2.13.2，但本次启动被 AMFI 拒绝当前 `vphone-vm` 的签名哈希 `a9851e0f2f98af72e70d32f22dac526bc1e508f5`。虚拟机未启动、磁盘未重建。需要在可见 Terminal 中运行 `vphone-launchpad-cli bundle verify 2.13.2` 并完成管理员授权后再继续 Xcode/CoreDevice 和 IPA 测试。
- `docs/develop/ios.md` 已补充 VPhone 的 Recovery 安全设置与回滚、AMFI 重授权、外置库目录、启动/日志命令，以及开发直装、App Store Connect/TestFlight、支持格式、前台同步预期和覆盖安装回滚说明。命令参数已与当前 Tauri 2.11.3 和 VPhone 2.13 CLI 帮助核对。
- Swift 插件新增系统预览格式契约测试，确认当前 Simulator 的 Quick Look 接受 `.pdf`、`.jpg`、`.txt`、`.docx` 路由并拒绝专用未知扩展；插件 XCTest 25/25 通过。结合已安装包中的图片/文本 Quick Look、系统视频播放、分享取消、照片与文件选择器取消，以及前端 `supported=false` 分享降级，任务 2.2、2.4、2.5 的自动化验收已完整。真实 iCloud 照片成功/断网失败仍保留在 2.3 和 `Jam` 验收。

## 2026-10-27 多选、构建回归与紧凑同步状态复核

- 长按 460ms 或“更多 → 多选”进入消息选择；点击消息或 44px 选择按钮切换选择。底部输入条临时替换为取消、标记、取消标记和删除，不新增常驻大区域。批量标记沿用既有接口并保留标签/截止日期；删除需要确认云端同步删除。
- 控制器覆盖去重、重复提交阻止、部分失败保留选择、取消标记及账号 generation 变化中止。浏览器覆盖长按释放不误点、两条选择、失败项保留、44px 操作、取消删除不写入和 Escape 退出。安装包多选测试仅进入/取消，不修改用户真实消息；尚未声明真实 Supabase 批量 mutation E2E 通过。

本地回归：

- `npm run build`：类型检查与生产构建通过。
- `cargo test`：退出码 0；主库 374 passed / 2 ignored，Bridge 43 passed，0 failed。日志 `/tmp/tg-rust-final-regression-20261027.log`。
- `node tests/test_mobile_ui_shell.js` 及 12 组桌面 Node 套件通过；其余套件为 `test_bulk_download_runtime`、`test_composer_drafts`、`test_feed_state`、`test_feed_view_model`、`test_media_runtime`、`test_platform_capabilities`、`test_settings_form_runtime`、`test_settings_ops_runtime`、`test_settings_runtime_status`、`test_vue_app`、`test_workspace`、`test_workspace_integration`（均为 `tests/` 中的 `.js` 文件）。
- `CHROME_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node tests/test_speech_to_text_ui_smoke.js`：通过。
- `PLAYWRIGHT_MODULE=/Users/elio/.npm/_npx/e41f203b7505f1fb/node_modules/playwright CHROME_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node tests/test_mobile_feed_browser.js`：通过。五种同步状态位于空间选择器内部、文字高度不超过 16px、字号不超过 11px，320px 小屏状态变化不增高顶部；无独立同步卡片。

iOS 构建与测试：

- `./scripts/ios-cargo.sh check --offline --locked --target aarch64-apple-ios`：通过，保留既有平台未使用代码警告。
- 在 `plugins/mobile-integration/ios` 执行 `xcodebuild -scheme tauri-plugin-mobile-integration -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' test`：25/25 通过；日志 `/tmp/tg-swift-regression-20261027.log`。
- 同目录执行 `xcodebuild -scheme tauri-plugin-mobile-integration -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`：通过；日志 `/tmp/tg-swift-device-regression-20261027.log`。
- `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging`：退出 0，覆盖安装保留登录与数据；日志 `/tmp/tg-ios-multiselect-build-20261027.log`。
- 安装包 UI 回归使用 `xcodebuild -project tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj -scheme TransferGenieSimulatorUITests -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' -derivedDataPath /tmp/tg-mobile-multiselect-native-20261027 test`，通过 `-only-testing` 限定多选进入/取消、键盘/选择器取消、登录导航和紧凑同步状态共 4 项；4/4 通过，日志 `/tmp/tg-mobile-multiselect-native-20261027.log`。未执行未限定的全套 mutation 测试。
- 再用上述命令限定 `-only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/testCompactSyncStatusInSpaceSelector`：1/1 通过；选择器高度不超过 52pt，仍可打开/关闭存储空间选择，无独立大状态入口。日志 `/tmp/tg-compact-sync-recheck-20261027.log`，实际截图 `/tmp/tg-compact-sync-final-20261027.png`。
- `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64 --no-sign --archive-only --ci`：完整 iPhoneOS archive 构建通过；日志 `/tmp/tg-ios-device-build-20261027.log`。此后 `gen/apple/build/transfer-genie_iOS.xcarchive` 是 unsigned iPhoneOS archive，不能直接用于 `simctl install`；Simulator 已安装包仍是此前 signed Simulator 版本。

桌面隔离检查：

- `npx tauri build --bundles app` 已生成 macOS app，但因缺少 updater 私钥最终失败；临时参数 `npx tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'` 构建退出 0，未修改发布配置。`codesign --verify --deep --strict 'target/release/bundle/macos/Transfer Genie.app'` 通过；仅 ad-hoc 签名，未 notarize。日志 `/tmp/tg-desktop-regression-build-20261027.log`。
- 测试实例使用 `/tmp/tg-desktop-regression-20261027.myCg2r` 独立数据目录、无云端配置、关闭自动更新和自启动、专用 `ctrl+shift+alt+j` 快捷键。显式 `TRANSFER_GENIE_APP_DATA_DIR` 的实例跳过全局 autostart 注册，正常实例行为不变。
- 实际检查 PID 2176 的托盘菜单存在；专用快捷键隐藏/显示主窗口，Cocoa `CGWindowListCopyWindowInfo(.optionAll, ...)` 确认窗口 `isOnscreen` 从 false 到 true。托盘退出调用未使进程结束，因此退出路径不记为通过；核对 PID 与隔离环境变量后仅向该测试进程发送 SIGTERM，退出码 0。临时目录保留，未关闭用户原实例或连接真实账号。
- `tests/test_desktop_media_e2e.js` 已跨平台并在 macOS 真实 Tauri WKWebView 上通过两空间 WebDAV、六种媒体、预览、远程播放和批量下载 UI 验收；6.5 已勾选。

记录更新后的 `git diff --check`、`cargo fmt --all -- --check` 与 `openspec validate add-supabase-ios-client --strict` 均通过。任务 6.6 的编译/自动化证据已完整，当前为 29/47；真机签名安装、iCloud、VoiceOver、网络切换和稳定性任务继续保留。VPhone 仍需要当前二进制的 AMFI 授权，未重建或删除虚拟机；尚未开始 `Jam` 真机验收。

## 2026-10-27 消息搜索与完整标记分页

功能与数据流：

- 搜索由输入框触发，250ms debounce 后调用 `message.searchMessages` → 既有 `list_messages` → 当前 Profile/Auth 用户的 SQLite 索引。搜索不局限于 feed 已加载的 50 条，界面明确标注“搜索当前空间已同步到本机的消息”；不额外查询云端搜索或下载原附件。每次取 51 条、展示 50 条，用第 51 条判断是否有更早结果，避免既有未过滤 total 造成错误分页。结果按聊天时间正序显示。
- 标记页按标签和待处理/全部条件直接调用既有 `list_marked_messages`，每页 100 条；通过“加载更多标记”继续读取，顶部徽标使用真实 total。刷新重读已加载范围。两类结果只存前端临时状态，不增加数据库表、云端接口或同步副本。
- 新关键词、筛选切换和账号 reset 使用请求 generation 废弃迟到响应；重复分页受 loading gate 保护。失败保留可读内容并显示重试，不把未完成请求显示成空结果。清空或关闭搜索恢复原消息窗口。

实际检查：

- `node tests/test_mobile_ui_shell.js` 通过：125 条搜索/标记、51-row lookahead 不跳过边界、重复分页、关键词/标签迟到响应、账号 reset、失败恢复均有真实 TS 控制器执行测试。
- `PLAYWRIGHT_MODULE=/Users/elio/.npm/_npx/e41f203b7505f1fb/node_modules/playwright CHROME_PATH='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' node tests/test_mobile_feed_browser.js` 通过：搜索 50→100→125、标记 100→125、清除以及已有气泡/折叠/多选回归。测试发现加载文案使按钮增高、历史锚点偏移 6px；按钮固定为 44px 并设置内边距后锚点检查恢复通过，没有放宽 2px 断言。
- `npm run build` 类型检查/生产构建通过。
- `cargo test --lib scoped_` 7/7 通过，日志 `/tmp/tg-scoped-search-final-20261027.log`。新增 `scoped_search_and_marked_paging_reach_old_matches_without_crossing_accounts` 用本机 SQLite 建立同 profile 的两个 125-row 账号，证明旧内容匹配、51-row lookahead、100-row 标记分页以及 owner_scope 隔离。未写用户数据库或 Supabase。
- `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 最终退出 0，日志 `/tmp/tg-ios-search-marked-final-build-20261027.log`；核对 iPhoneSimulator platform 后覆盖安装，保留登录和数据。当前 archive 已重新成为 signed Simulator archive，不是上一阶段的 unsigned iPhoneOS archive。
- 安装包测试使用 `xcodebuild -project tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj -scheme TransferGenieSimulatorUITests -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' -derivedDataPath /tmp/tg-ios-search-marked-native-20261027`，以 `-only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/<method>` 限定 `testSearchFindsDedicatedDocumentAndClears`、`testSignedInSupabaseShellAndNavigation`、`testCompactSyncStatusInSpaceSelector` 后执行 `test`。最终 3/3 通过，日志 `/tmp/tg-ios-search-marked-final-native-20261027.log`。
- 初次 native search 找到了专用文档，但“清除”按钮第一次 AX tap 不生效，等待 5 秒仍未清空；根据实际可见 frame 补点能够清空。修复为至少 44×44 的按钮及 pointerdown 防止焦点变化后，最终测试以单次普通 `tap()` 通过，没有保留坐标补点或忽略失败。此前失败日志 `/tmp/tg-ios-search-marked-native-20261027.log`、`/tmp/tg-ios-search-clear-recheck-20261027.log` 仅供定位，不能记为整套通过。

安装包检查只读搜索既有专用文档与导航，不新增或改写消息。125-row 标记加载有 controller/browser/SQLite 证据，但不是当前真实 Supabase 数据集的 125-row UI 验收。VPhone `status` 仍为 `bundleReady=false`、`running=0`，尚待管理员 AMFI 授权；本轮没有修改宿主安全设置或虚拟机磁盘，没有开始 `Jam` 真机测试。新增任务 5.9 后为 30/48，完整目标继续保持未完成。

记录更新后 `git diff --check`、`cargo fmt --all -- --check` 和严格 OpenSpec 校验均通过；补测标记页刷新保留 125 条已加载范围、徽标仍取 total 而非 100 条摘要，同样通过。Simulator 应用已恢复正常启动供继续验收。

## 2026-10-27 紧凑同步状态再次核验

本节仅是 UI 核验；下方的消息操作验收另行记录。

- 当前源码和已安装 Simulator 包均已采用紧凑布局：同步状态全局只在消息页顶部 Space 名称下方显示一行小字；“我的”页及同步与传输弹层不再重复展示状态，也没有独立同步状态卡片。本次未重复修改界面或同步逻辑。
- `node tests/test_mobile_ui_shell.js` 与上述 Edge/Playwright `tests/test_mobile_feed_browser.js` 命令通过，覆盖五类状态文本、单行小字号、选择器内布局及状态变化不增高顶部。
- 在既有 Simulator UDID 上运行 `testCompactSyncStatusInSpaceSelector`，使用 `-derivedDataPath /tmp/tg-ios-compact-sync-recheck-20261027`，1/1 通过；选择器不超过 52pt，空间选择弹层可打开和关闭，没有独立大状态按钮。日志 `/tmp/tg-ios-compact-sync-recheck-20261027.log`。
- 本次再次检查同一 UI 要求：控制器与 Edge/Playwright 浏览器测试、`npm run build` 均通过；已安装 Simulator 包的同一原生测试 1/1 通过（`-derivedDataPath /tmp/tg-ios-compact-status-20261027-current`，日志 `/tmp/tg-ios-compact-status-20261027-current.log`）。界面已经符合要求，因此未重复改动源码或重装应用。
- 最新复核：控制器与 Edge/Playwright 浏览器测试通过；已安装包的 `testCompactSyncStatusInSpaceSelector` 再次 1/1 通过，日志 `/tmp/tg-ios-compact-status-final-20261027.log`。状态仍合并在空间选择器内、选择器不超过 52pt、可打开并关闭空间选择弹层；未重复修改产品源码或同步逻辑。
- `git diff --check` 与 `openspec validate add-supabase-ios-client --strict` 通过。此复核只确认本次 UI 要求，不扩大为全部功能或真机验收通过；整体保持 30/48。

## 2026-10-27 单条消息操作与取消安全性

- 单条标记、删除及复制现在有重复提交保护、布尔成功结果和账号 generation 校验；旧请求的错误、notice 和 finally 不覆盖新操作。标记保留标签/日期，删除必须返回已确认数量。失败保留当前操作弹层并显示错误；切换 Space、退出登录和 Profile 选择等待当前操作结束。创建标签的列表迟到响应也不再进入新账号。
- 安装包原生测试发现两项真实缺陷，未忽略失败：历史刷新在本地标记待上传时重读 revision 1，误产生冲突，虽然上传随后已确认 revision 2；点击系统 JavaScript confirm 的 Cancel 后仍执行删除。前者由数据库已知 revision 判断修复，后者通过单条/批量删除和缓存清理的应用内显式确认修复，没有继续依赖系统 confirm。两次失败日志分别为 /tmp/tg-ios-single-actions-native-20261027.log 和 /tmp/tg-ios-single-actions-native-fixed-20261027.log。
- 新 Rust 回归 pulled_base_revision_during_local_edit_is_not_a_conflict 先失败、修复后通过，证明旧/相同版本不覆盖待上传本地标记，而真正更新的 revision 仍保留冲突和账号隔离。复现日志 /tmp/tg-pull-base-conflict-initial-20261027.log；修复日志 /tmp/tg-pull-base-conflict-fixed-20261027.log。
- 只对专用 TG-IOS-PROBE-20261027-document.txt 处理测试副作用：误生成的冲突 id=2 经 owner/profile/entity、基准 revision 1、已确认 revision 2、空队列核对后标为 resolved_local，没有删除记录或修改用户冲突。取消测试暴露的误删除仅涉及该测试文档；之后从 Files 重新发送了测试副本并完成移除本地缓存、Supabase 下载及 Quick Look，1/1 通过，日志 /tmp/tg-ios-test-document-restore-final-20261027.log。原测试消息 tombstone 保留，不伪造原 ID 恢复。
- node tests/test_mobile_ui_shell.js 和既有 Edge/Playwright tests/test_mobile_feed_browser.js 命令通过：重复提交、失败、未知删除数量、旧账号请求、复制失败、标签列表迟到响应、单条/批量删除确认与取消、清理缓存确认与取消均有覆盖。npm run build 通过，未增加原生剪贴板插件。
- 最终 signed Simulator archive 使用既有 CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging 命令构建，退出 0，日志 /tmp/tg-ios-safe-actions-final-build-20261027.log。DTPlatformName=iphonesimulator、codesign verify 通过后覆盖安装，保留用户登录和数据。
- 最终原生 XCTest 使用既有项目/scheme/Simulator UDID，derivedDataPath=/tmp/tg-ios-safe-actions-final-native-20261027，限定 testCopyDedicatedDocumentName、testDedicatedDocumentMarkAndDeleteCancellation、testDedicatedSelectionDeletionCanBeCancelled、testCacheClearCanBeCancelledWithoutMutation、testCompactSyncStatusInSpaceSelector，5/5 通过。日志 /tmp/tg-ios-safe-actions-final-native-20261027.log。取消单条/批量删除后专用消息仍在；取消缓存清理后可释放数值不变。simctl pbpaste 只比较专用文件名且输出匹配结论，确认真实复制内容。
- 最终 SQLite 只读核验：专用文档有一条未删除记录，marked=0、revision=5、sync_state=synced；当前 unresolved conflict=0、未确认 outbox=0。旧测试 tombstone 不计为有效消息，也没有清空全库。
- 完整 cargo test 与 iOS build 并行时，376 库测试和 43 Bridge 测试通过，但末尾 doctest 出现依赖 crate 找不到；单独 cargo test --doc 通过。停止并行构建后，完整 cargo test 串行重跑退出 0：376+43 通过、2 个外部环境验收测试 ignored，doc 0/0。最终日志 /tmp/tg-single-actions-full-cargo-serial-20261027.log；此前并行失败记录不记为通过。
- git diff --check、cargo fmt --all -- --check 和严格 OpenSpec 验证通过。本轮没有完成全部虚拟环境稳定性或真机验收，任务仍为 30/48。VPhone status 仍为 bundleReady=false、running=0，未改安全策略或虚拟机磁盘；Jam 测试尚未开始。

## 2026-10-27 真实批量操作与重复启动恢复

- 首次真实批量测试暴露输入框状态残留：第一条保存后重新打开，按钮仍是“已保存到本机”，没有恢复“发送”。已修复重新打开/继续编辑时重置反馈，并限制旧成功发送的 650ms 关闭定时器只作用于同一未再编辑的空草稿；关闭/打开其他弹层和卸载会取消旧定时器。没有修改发送 API 或同步协议。浏览器新增连续编辑、快速重开及旧定时器隔离断言，控制器/浏览器测试与 `npm run build` 均通过。
- signed Simulator archive 使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 构建退出 0；`DTPlatformName=iphonesimulator`、`codesign --verify --deep --strict` 通过后覆盖安装，保留登录与数据。日志 `/tmp/tg-ios-batch-composer-fixed-build-20261027.log`。
- 原生 `testDedicatedBatchMarkUnmarkAndConfirmedDeletion` 为每次运行生成随机前缀，只在搜索恰好返回两条相应消息后进入多选/删除。最终前缀 `TG-IOS-BATCH-44F5E445-9214-41CC-92B2-19D51485E4CF` 的 A/B 消息经过发送、批量标记、逐条菜单复核、批量取消标记、逐条复核和显式确认删除；每步等待已同步，最终没有搜索结果。1/1 通过，derivedDataPath `/tmp/tg-ios-batch-native-ax-fixed-20261027`，日志同名 `.log`。SQLite 只读复核两条消息 marked=0、remote_revision=4、sync_state=synced、deleted_at_ms 非空。
- 失败记录保留：`/tmp/tg-ios-batch-native-20261027.log` 是首次输入框状态失败；`/tmp/tg-ios-batch-native-fixed-20261027.log` 是选择控件 AX 分类定位失败，截图证实多选 UI 正常。改为通过明确 label 匹配 `.any` 可访问元素，保留精确消息数及专用前缀检查，不使用坐标猜测或放宽删除范围。
- 这两次失败留下三个专用消息（F13E3328… 的 A，6BBAB92B… 的 A/B），由 `testCleanupDedicatedFailedBatchFixtures` 在精确搜索/数量核对后通过应用内确认删除。没有 SQL 删除、全库清理或用户消息 mutation。五条本轮批量测试消息均为已同步 tombstone（失败样本 revision 2，完整流程样本 revision 4），有效行=0；旧文档专用样本有效行仍为 1。未确认 outbox=0、unresolved conflict=0，checkpoint=884。
- `testTwentyColdStartsRestoreSignedInShell` 20/20、`testFiftyBackgroundForegroundCyclesRestoreShell` 50/50 通过：进程确实退出/进入后台，再恢复前台；每次确认已登录消息页、已同步状态和可触摸的输入入口，最后重新搜索专用文档并清空搜索。与上述清理共 3/3，通过命令为既有 UI 项目/scheme/Simulator UDID，加 `-derivedDataPath /tmp/tg-ios-lifecycle-native-fixed-20261027` 和这三个方法的 `-only-testing` 后执行 `test`；日志 `/tmp/tg-ios-lifecycle-native-fixed-20261027.log`。
- 首次生命周期日志 `/tmp/tg-ios-lifecycle-native-20261027.log` 两项失败均发生在完成循环后的测试断言：清空搜索后应消失的 scope 文案误要求仍存在。修正为文案和清除按钮均不存在，再完整重跑 20/50 次通过；未将初次失败记为通过。
- 清理测试补充已删除样本的幂等分支后，再单独运行 1/1 通过，不产生新的 mutation；日志 `/tmp/tg-ios-cleanup-idempotence-20261027.log`。最终 `git diff --check` 和严格 OpenSpec 校验通过；本轮没有改动 Rust，沿用上一轮串行全套 Rust 验证证据，不宣称本轮重跑。
- 本轮只补充官方 Simulator 实际流程和稳定性证据，不等同于物理 iPhone 的真实挂起、Wi-Fi/蜂窝/offline 转换、过期 Session、低存储、传输中终止或完整发布验收。任务继续 30/48。VPhone `status` 仍为 bundleReady=false、running=0，需要当前 bundle AMFI 授权；未重建 VM 或开始 `Jam` 测试。

## 2026-10-27 HTTP 阻断与上传中进程终止

补充离线保存和真实传输中断证据，不更改产品同步逻辑，不关闭真机验收项。环境仍为官方 iPhone 12 / iOS 26.4 Simulator，UDID `6719E14E-8424-49B1-B96D-CB0A609311EA`，保留已登录应用及原数据。

- `testBlockedHttpPersistsTextAcrossRestartAndRecovers` 1/1 通过，日志 `/tmp/tg-ios-blocked-http-native-20261027.log`。通过 `XCUIApplication.launchEnvironment` 把 HTTP/HTTPS/ALL proxy 指向无监听的 loopback 17991；真实 HTTP 请求失败，专用文本本地保存、终止后重启仍在，恢复正常环境后搜索恰好一条，再通过应用内确认删除。
- `testBlockedHttpAttachmentSurvivesTerminationAndUploads` 最终 1/1 通过，日志 `/tmp/tg-ios-blocked-attachment-native-final-20261027.log`。专用 200 字节文档在 HTTP 阻断期间保存及重启恢复，沙盒副本 SHA-256 与数据库一致；恢复网络后只存在一条消息，可打开 Quick Look，最后确认删除。消息 revision 2 / synced、附件 revision 1 / uploaded 均为 tombstone，原两条操作均 acknowledged，未确认 outbox 与 unresolved conflict 为 0。
- 附件测试早期失败日志 `/tmp/tg-ios-blocked-attachment-native-20261027.log`（Files AX 名称省略扩展，未发送）和 `/tmp/tg-ios-blocked-attachment-native-fixed-20261027.log`（同名搜索输入与消息卡定位冲突）保留。后者实际完成保存/恢复/上传，其专用样本先由 `testRecoveredBlockedAttachmentPreviewAndCleanup` 1/1 通过后清理，日志 `/tmp/tg-ios-blocked-attachment-cleanup-20261027.log`；再执行完整最终版，没有把失败当通过。
- 上述环境只阻断 reqwest HTTP；原始 Realtime WebSocket 不受这些代理变量控制，因此不代表完整断网、Wi-Fi/蜂窝转换或 iCloud 断网验收。每个测试 defer 恢复正常 launch environment，不更改 Mac 网络、Keychain 或业务连接配置。

### 真实上传中断

新增 `tests/ios-ui/slow-http-proxy.mjs`：仅监听 `127.0.0.1:17992`，只允许已安装应用设置内的 Supabase origin，上传限速 256 KiB/s。HTTP 仅转发，HTTPS 仅 CONNECT 隧道；不记录 URL、头、令牌或正文。脚本生成专用 8 MiB 可复用文件；如果同名来源内容不同则拒绝覆盖。只统计该大小 Storage 上传的正文，并提供异步测试读取的只读 `/status`。

启动（路径参数必须指向已核实的安装容器和 Files 来源目录）：

```sh
node tests/ios-ui/slow-http-proxy.mjs '<app-data>/Library/Application Support/com.transfergenie/settings.json' '<Files File Provider Storage directory>'
```

验证命令：

```sh
xcodebuild -project tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj \
  -scheme TransferGenieSimulatorUITests \
  -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' \
  -derivedDataPath /tmp/tg-ios-slow-upload-native-20261027 \
  -only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/testSlowUploadTerminationRestoresSameAttachment test
```

- 最终日志 `/tmp/tg-ios-slow-upload-body-count-final-20261027.log`，1/1 通过，47.665 秒。专用文件 `TG-IOS-SLOW-20261027-upload.bin`，大小 8,388,608，SHA-256 `88c4d44434f0d3b5399653399f0be03aa9c5c00ffe53c47297ac5b11ac5560bc`。
- 实际上传正文 1,112,903 字节后才终止进程，严格小于全部 8 MiB；随后在无监听代理 17991 下重启，附件可见且显示离线。恢复正常 launch environment 后，同一 attachment outbox 操作 `bd4d21f9-31e8-5fac-8c54-19a5530aa6df` acknowledged，attempt_count=2，未产生第二个附件；搜索恰好一条，再应用内确认删除。最终消息 revision 2 / synced 和附件 revision 1 / uploaded 均为 tombstone，未确认 outbox=0、unresolved conflict=0。
- 首次 `/tmp/tg-ios-slow-upload-native-20261027.log` 失败是测试代理只有 HTTPS CONNECT，而配置使用 HTTP；尚未发送样本，不修改产品代码。补齐 HTTP 转发后的 `/tmp/tg-ios-slow-upload-http-fixed-20261027.log` 1/1 通过；再将累计请求字节收紧为该文件上传正文、改异步状态查询，完整重跑最终版通过。前一通过样本同样由应用确认删除，保留 tombstone 与 acknowledged 记录。
- 限速代理在终态后停止，应用由 defer 正常重启。Files 内两份专用来源样本保留用于重跑；没有清理用户文件、全库或同步历史。此场景证明进程终止后的整体安全重传，不声称原生后台传输或断点续传。8 MiB 样本不代替更大文件、真实系统挂起、真实网络转换或 `Jam` 计时。
- Rust 两项 `cargo test --lib mobile_large_` 通过，日志 `/tmp/tg-ios-interrupted-transfer-unit-20261027.log`，覆盖响应未知上传、4 MiB 慢下载与冷态恢复。它们仍是本机集成测试，不是安装包下载中终止测试；后者、过期 Session、低存储和完整真机稳定性尚待补齐。
- 本轮最终 `node --check tests/ios-ui/slow-http-proxy.mjs`、`node tests/test_mobile_ui_shell.js`、`npm run build`、`git diff --check`、`openspec validate add-supabase-ios-client --strict` 均通过。loopback 17992 已无监听，应用正常启动且原登录保留。整体仍 30/48，继续保持目标 active。

## 2026-10-27 下载中进程终止与缓存状态修复

- 将同一 loopback 代理扩展为显式 `upload|download` 模式；download 模式只对返回 8 MiB 的 Storage GET 正文限速到 256 KiB/s，分别统计专用上传和下载正文。仍只允许设置内 Supabase origin，不记录 URL、请求头、令牌或正文。专用来源文件 `TG-IOS-SLOW-20261027-download.bin` 的大小为 8,388,608，SHA-256 为 `88c4d44434f0d3b5399653399f0be03aa9c5c00ffe53c47297ac5b11ac5560bc`。
- 初次 `testSlowDownloadTerminationRecoversVerifiedCache` 日志 `/tmp/tg-ios-slow-download-native-20261027.log`：2,130,906 字节下载正文通过代理后终止进程；离线重启仍显示“原件按需下载到本机”，证明部分文件未误报完成；恢复联网后数据库 download history 为 complete、partial row 清除，沙盒文件大小和 SHA-256 均正确。但重启后的详情仍显示按需下载，原生断言失败，没有把该次运行记为通过。
- 根因是 SQLite `Message` 映射固定令 `download_exists=false`，列表、搜索、标记结果没有根据 iOS 沙盒完整缓存更新它。新增 `with_mobile_attachment_cache_state`：只在 iOS（及测试）中接受当前 profile/Auth 账号根目录内、非 `.part`、普通文件且字节数与消息元数据一致的路径；canonicalize 后越界或符号链接越界、其他账号目录、缺失文件、大小不符均为 false。桌面读取不变。消息窗口、搜索与标记结果都经过同一检查。
- `mobile_attachment_cache_state_requires_complete_current_scope_file` 1/1 通过，日志 `/tmp/tg-mobile-cache-state-focused-20261027.log`，覆盖完整缓存、SQLite 默认 false、其他账号、`.part`、短文件、外部路径、缺失文件、Unix 越界符号链接和删除后状态。`mobile_large_` 2/2 通过，日志 `/tmp/tg-mobile-large-focused-20261027.log`。前一次把两个过滤器放入同一 `cargo test` 命令导致参数错误，未运行测试；随后拆成两条命令通过。
- 使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 重建签名 Simulator archive，退出 0，日志 `/tmp/tg-ios-cache-state-fixed-build-20261027.log`。确认 `DTPlatformName=iphonesimulator`、codesign 验证通过后覆盖安装并保留数据。
- 修复后的 `/tmp/tg-ios-slow-download-fixed-native-20261027.log` 1/1 通过，47.830 秒。测试复用精确单条专用消息、移除完整缓存、经限速代理重新下载，正文超过 2 MiB 且小于 8 MiB 时终止；离线重启仍不声称已缓存，正常联网重启后后台恢复完成，搜索只有一条，详情显示“原件已缓存，可离线打开”。
- 测试结束后宿主只读核验新安装容器：缓存文件恰好 8,388,608 字节，SHA-256 与原件/数据库一致；download history complete、file_size=8,388,608、partial_downloads=0。随后 `testCleanupVerifiedSlowDownloadFixture` 1/1 通过，日志 `/tmp/tg-ios-slow-download-cleanup-20261027.log`，经应用内搜索、确认删除并等待已同步；最终消息 revision 2 / synced 和附件 revision 1 / uploaded 均为 tombstone，未确认 outbox=0、unresolved conflict=0。
- `node tests/test_mobile_ui_shell.js`、Edge/Playwright `tests/test_mobile_feed_browser.js`、`npm run build` 均通过。该验证证明安装包的整体下载重启恢复和缓存状态诚实性，不代表 HTTP Range 断点续传：现实现按设计从零安全重传。真机真实挂起、蜂窝/Wi-Fi、低存储和过期 Session 仍未完成。
- 缓存状态修复后的完整串行 `cargo test` 退出 0：主库 377 项通过、2 项外部环境验收忽略，Telegram Bridge 43 项通过，其余目标与 doc tests 通过，0 失败；日志 `/tmp/tg-cache-state-full-cargo-20261027.log`。

## 2026-10-27 同步状态单行合并

- 按最新 UI 确认，同步状态全局只在消息页顶部 Space 选择器的名称下显示一行紧凑文字；“我的”页的“存储空间”选择行和“同步与传输”弹层均不再重复展示状态。弹层只保留传输任务、空状态和“立即同步”操作。未修改同步状态来源、手动同步或传输逻辑。
- `node tests/test_mobile_ui_shell.js`、Edge/Playwright `tests/test_mobile_feed_browser.js`、`npm run build`、`git diff --check` 与 `openspec validate add-supabase-ios-client --strict` 通过。测试明确拒绝 feed、profile 和 transfer 中的独立状态面板，并继续验证五类紧凑状态文案、单行小字号、选择器内布局及状态变化不增高顶部。
- 使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 重建成功，日志 `/tmp/tg-ios-single-sync-status-build-20261027.log`；archive 的 `DTPlatformName=iphonesimulator` 且 codesign 校验通过，已覆盖安装到官方 iPhone 12 Simulator 并保留登录数据。
- 安装包原生 `testCompactSyncStatusInSpaceSelector` 1/1 通过，0 失败，日志 `/tmp/tg-ios-single-sync-status-native-20261027.log`。测试确认顶部选择器高度不超过 52pt、可打开 Space 选择，并实际进入“同步与传输”验证不再出现“本机与云端已同步”或“正在与 Supabase 同步”的独立摘要。

## 2026-10-27 Simulator 补充稳定性：Session、低存储与重复系统预览

- 过期 Session 测试钩子仅编译到 `target_os=ios`、`target_abi=sim`、debug 构建。`TRANSFER_GENIE_IOS_SIMULATOR_AUTH_TEST=expire-active-session` 只把当前 Profile 已保存 Session 的 `expires_at` 改为过期值，不读取或输出 token；应用随后走真实 Supabase refresh，并将旋转后的 Session 写回 Keychain。`testExpiredSessionRefreshSurvivesColdRestart` 1/1 通过：首次启动恢复已登录和已同步，移除测试环境变量后的下一次冷启动仍恢复登录，专用文档仍可搜索。日志 `/tmp/tg-ios-expired-session-native-20261027.log`；构建日志 `/tmp/tg-ios-expired-session-build-20261027.log`。Rust `restored_supabase_session_refreshes_and_persists_rotated_tokens` 1/1 通过。
- 低存储钩子仅用于 `DEBUG && targetEnvironment(simulator)`；`TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST=no-space` 在选择器沙盒复制边界返回结构化 `COPY_FAILED`，并删除本次新建的空 selection 目录。第一次安装包测试暴露 Composer 没有显示页面级选择错误；已将选择错误同时绑定到当前 Composer、使用 `role=alert`，并在编辑或重新打开草稿时清除旧错误。修复后的 `testLowStorageDocumentImportFailsRecoverably` 1/1 通过：提示“本机存储空间不足”可见、附件数量为 0、发送保持禁用且无空目录残留。日志 `/tmp/tg-ios-low-storage-fixed-native-20261027.log`；构建日志 `/tmp/tg-ios-low-storage-fixed-build-20261027.log`。Swift 插件对应复制失败与清理测试包含在 26 项回归中。
- `testRepeatedPreviewAndPlaybackSessionsRemainResponsive` 使用已同步的专用文本文件和 MP4：Quick Look 打开/关闭 10 次，AVPlayer 打开/关闭 10 次；每次均返回同一详情页，最终关闭搜索后“新消息”可点击且同步状态为已同步。最终 1/1 通过、0 失败、103.392 秒，日志 `/tmp/tg-ios-repeated-preview-final2-native-20261027.log`，xcresult 位于 `/tmp/tg-ios-repeated-preview-final2-20261027/Logs/Test/`。
- 重复测试的两次早期失败均为自动化定位证据，不是产品 presenter 失败：第一次复用了失焦的 search element；第二次视频文件名位于键盘边缘，AX 点击没有命中消息卡，层级中的 `Previous / Next / Done` 实际属于键盘工具栏。最终测试在输入后明确收起键盘，通过唯一视频结果的 44pt“更多操作 → 查看详情”入口进入详情，再点击“播放”，保留真实产品路径且没有放宽系统预览/播放断言。失败日志 `/tmp/tg-ios-repeated-preview-native-20261027.log`、`/tmp/tg-ios-repeated-preview-fixed-native-20261027.log` 和 `/tmp/tg-ios-repeated-preview-final-native-20261027.log` 仅用于定位，不记为通过。
- 这些结果补齐了官方 Simulator 上的过期 Session、低存储和重复预览/播放场景，但任务 6.4 仍不勾选：真实系统挂起、Wi-Fi/蜂窝/离线转换以及开发版和发布版的完整稳定性门槛必须在 `Jam` 上完成。
- 最终回归：完整 `cargo test` 退出 0，主库 377 passed / 2 ignored、Bridge 43 passed、其余目标及 doc tests 通过；Swift 插件 XCTest 26/26 通过，日志 `/tmp/tg-swift-stability-final-20261027.log`；`node tests/test_mobile_ui_shell.js`、Edge/Playwright `tests/test_mobile_feed_browser.js`、`npm run build`、`cargo fmt --all -- --check`、`git diff --check` 和 `openspec validate add-supabase-ios-client --strict` 全部通过。

## 2026-10-27 弹层可访问性与主导航辅助名称

- 修复移动弹层背景仍可通过键盘或辅助浏览访问的问题：弹层存在时 main、dock、tabbar 使用 inert 与 aria-hidden；Tab/Shift+Tab 在弹层内启用的控制项之间循环，关闭恢复 opener。未修改同步、发送、存储或桌面逻辑。
- `node tests/test_mobile_ui_shell.js` 与既有 Edge/Playwright `tests/test_mobile_feed_browser.js` 通过；新增断言实际执行编辑框初始焦点、三处背景 inert/aria-hidden、双向焦点循环及真实 click 关闭后的焦点恢复。前两次静态断言字符串/正则错误已修正；dispatchEvent 不聚焦 opener 的测试改为真实 click，没有放宽焦点断言。
- signed Simulator archive 使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging` 两次构建均退出 0，前端类型检查/生产构建通过；校验 DTPlatformName=iphonesimulator 和 codesign 后覆盖安装，保留登录数据。第二次构建增加三个主导航明确 aria-label，避免标记数字角标改变辅助名称。
- `testLargeAccessibilityTextKeepsPrimaryActionsReachable` 第一次失败：标记角标合并进辅助名称，截图证实视觉导航完整，修复稳定主导航名称。第二次失败：照片/文件按钮辅助名称包含装饰符号，而测试错误使用精确名称；截图证实按钮完整可见，测试改为现有包含名称选择器，没有改布局或使用坐标点击。失败日志 `/tmp/tg-ios-accessibility-focus-20261027.log`、`/tmp/tg-ios-accessibility-focus-fixed-20261027.log` 保留，不计通过。
- 最终测试在 `simctl ui 6719E14E-8424-49B1-B96D-CB0A609311EA content_size accessibility-extra-extra-large` 下 1/1 通过，12.566 秒、0 失败；日志 `/tmp/tg-ios-accessibility-focus-final-20261027.log`。验证三栏导航、Space/search/composer 可达、相关触控高度至少 44pt。随后恢复 content_size=large。第一次恢复脚本误用 zsh 只读 status 变量，后续统一使用 test_exit，最终只读检查已确认 large。
- 四条安装包回归 `testCompactSyncStatusInSpaceSelector`、`testSpaceTransferAndCacheSheetsAreReachable`、`testComposerKeyboardAndPickerCancellation`、`testAboutAndSenderSettingsAreReachable` 通过。命令使用既有 tests/ios-ui 项目/scheme/Simulator ID、derivedDataPath `/tmp/tg-ios-accessibility-focus-final-20261027` 和对应 only-testing 参数；日志 `/tmp/tg-ios-modal-regression-20261027.log`，xcresult `Test-TransferGenieSimulatorUITests-2026.10.27_07-49-33-+0800.xcresult` 的 summary 明确 Passed、4 passed、0 failed、0 skipped。这些测试只导航/取消，不发送或删除消息。
- 5.6 仍不勾选：本轮证据证明当前系统文字类别下的可达性，不证明 px 字体自动随 Dynamic Type 缩放，也不证明物理 iPhone VoiceOver 顺序浏览。Jam 仍 unavailable。VPhone 原 sudo PID 45558 仍存活并停在 Password，未重复开启授权、重建或删除 VM。整体进度仍 31/48，完整目标保持 active。

## 2026-10-27 实际系统文字缩放与减少动态效果

- 修复此前仅设置 Simulator content_size、但移动字体仍固定 px 的实际缺口。现有 Swift 插件通过 UIFont.preferredFont(.body, compatibleWith: 当前类别) / 17 设置 --mobile-text-scale；document-end 主帧脚本、startup diagnostic、文字/减少动态效果通知及恢复前台都更新偏好。不新增 Supabase API，不改 Rust 同步或桌面字体。
- mobile.css 的文字尺寸使用缩放变量；标准 large 下为 1，保留原字号。可访问性类别允许工具、设置文字换行，增加 dock 安全保留区。菜单点号、加号、关闭符号保持固定尺寸；媒体区域和 130px/260px 折叠阈值不整体缩放。native Reduce Motion 和 CSS media preference 都关闭动画/transition，包括草稿、登录与传输 loader 的伪元素。
- Swift 测试在 plugins/mobile-integration/ios 执行 `xcodebuild -scheme tauri-plugin-mobile-integration -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' test`：28/28、0 失败，日志 `/tmp/tg-swift-dynamic-type-20261027.log`。新增真实 WKWebView 测试依次应用 large / accessibilityExtraExtraExtraLarge / large，断言 computed font size 和两个偏好属性，证明字号变更与恢复而非仅记录类别。`generic/platform=iOS CODE_SIGNING_ALLOWED=NO build` 通过，日志 `/tmp/tg-swift-dynamic-type-device-20261027.log`，仅代表 arm64 编译。
- 新增 tests/test_mobile_accessibility_browser.js：使用既有 Edge/Playwright、本机 mobile-preview 与局部 fixture；正文 15px 在最大类别的 53/17 比例下约 46.8px，回归验证 130px 折叠、320/390/844 宽度、Space/search 不重叠、导航/composer 可达、原生属性与媒体偏好禁用草稿动画、恢复默认字号。初次失败发现放大的菜单符号横向溢出，修复符号尺寸后通过；没有放宽横向溢出断言。既有 test_mobile_ui_shell.js、test_mobile_feed_browser.js 和 npm run build 全部通过。
- signed archive 构建使用 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging`，最终日志 `/tmp/tg-ios-dynamic-type-composer-fixed-build-20261027.log`，退出 0。DTPlatformName=iphonesimulator、codesign --verify --deep --strict 通过后覆盖安装，保留已登录容器。
- 最大类别实际安装测试首次 1/2：新增 testAccessibilityCategoryActuallyScalesWebText 通过，平台 13px 标签的实际 AX frame 高度 >35pt；testLargeAccessibilityTextKeepsPrimaryActionsReachable 照片按钮失败。审计重跑明确截图 `/tmp/tg-ios-dynamic-type-composer-audit-attachments/160DFD9E-7FBB-4BBA-9671-E1B467AF3D73.png` 证明 rows=6 的 intrinsic textarea 随字体过高，工具和发送挤出视口。修复可访问性类别的 textarea 高度为 142px/max24dvh，并允许工具换行；未降小正文或跳过按钮断言。失败日志 `/tmp/tg-ios-dynamic-type-final-20261027.log`、`/tmp/tg-ios-dynamic-type-composer-audit-20261027.log` 保留。
- 最终在 simctl content_size=accessibility-extra-extra-extra-large 下两项安装测试 2/2、0 失败，20.025 秒；日志 `/tmp/tg-ios-dynamic-type-composer-fixed-20261027.log`，xcresult `/tmp/tg-ios-dynamic-type-composer-fixed-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_08-21-59-+0800.xcresult`。照片、文件、关闭、新消息、Space/search、三栏导航满足可达与 44pt 检查；截图 `/tmp/tg-ios-dynamic-type-success-attachments/CEDBD61F-03E1-4D22-B751-B62982FB22A6.png` 已检查。
- 随后恢复 content_size=large，四项正常字号安装回归 4/4、0 失败，53.610 秒：compact sync、Space/transfer/cache、keyboard/picker cancellation、about/sender，日志 `/tmp/tg-ios-dynamic-type-normal-regression-20261027.log`。不执行发送、删除、退出或清缓存；simctl 最终只读确认 large。
- 5.6 仍不勾选：真实 iPhone 上的设置变更、VoiceOver/focus 顺序尚未验证；系统 Reduce Motion 在安装包上也尚未通过真实设置切换验证，当前证据为 UIKit script + 浏览器样式。Jam 仍 unavailable；VPhone 原 sudo PID45558 当前仍 live，授权 marker absent，未重开 sudo 或修改 VM。整体 31/48，完整目标继续 active。

## 2026-10-27 运行中的系统偏好变更验证

- 本轮未改产品逻辑，只增加系统设置与原生通知的实际测试。`testSystemPreferenceNotificationsRefreshTheLoadedWebView` 使用真实 WKWebView 和 MobileIntegrationPlugin.load，先写入过期字号/动态效果属性，再分别发出 UIKit 文字、Reduce Motion、foreground 通知，断言 computed 字号和偏好属性恢复当前系统值。插件 `xcodebuild -scheme tauri-plugin-mobile-integration -destination 'platform=iOS Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA' test` 29/29、0 失败；日志 `/tmp/tg-swift-preference-notifications-20261027.log`。
- 新增 `node tests/ios-ui/test_system_text_update.mjs`，仅使用明确官方 Simulator ID。测试在已登录安装包打开关于页面，在同一进程内由 readiness marker 触发真实 simctl content_size 的 large→accessibility-extra-extra-extra-large→large；标签 AX frame 高度从 <25pt→>35pt→<25pt，1/1、0 失败，10.060 秒。脚本 finally 恢复原类别并校验起始 large；日志 `/tmp/tg-ios-running-system-text-20261027.log`，xcresult `/tmp/tg-ios-running-system-text-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_08-38-42-+0800.xcresult` summary Passed1、failed0、skipped0。没有重启应用、发送消息或操作账号。
- `testSystemReduceMotionToggleAndForegroundRecovery` 实际进入 iOS Settings 的辅助功能/动态效果，切换 REDUCE_MOTION 内层 switch；返回 Transfer Genie，打开/关闭 composer 并确认可操作；defer 再次打开 Settings 恢复原值并断言成功，最后返回应用。以 targetEnvironment(simulator) 限制，真机不能执行设置写入。最终 1/1、0 失败、18.566 秒，日志 `/tmp/tg-ios-system-motion-final-20261027.log`，xcresult `/tmp/tg-ios-system-motion-final-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_08-42-19-+0800.xcresult`。最终 defaults read com.apple.Accessibility ReduceMotionEnabled=0，content_size=large。
- 两个前置失败保留：`/tmp/tg-ios-system-preferences-audit-20261027.log` 对后台 Transfer Genie 请求截图导致 snapshot timeout，改用 Settings 自己的 screenshot；`/tmp/tg-ios-system-motion-toggle-20261027.log` 点击外层带标签 Switch 不改变值，实际层级证明内层 switch 才是控件，改为明确 REDUCE_MOTION cell 的第二个 switch。最终没有改坐标、放宽切换断言或跳过测试。
- motion 的安装包证据只证明系统真实切换、恢复与应用前台可操作，不单独证明全部 CSS 动画停止；实际样式证据仍来自既有浏览器测试和插件通知 WKWebView 测试。物理 iPhone VoiceOver、设置切换、完整稳定性和 VPhone 套件仍待验证。Jam unavailable，原 VPhone sudo PID45558 live/marker absent，未重开授权或修改 VM。node test_mobile_ui_shell.js、npm run build、git diff --check 与 strict OpenSpec 校验通过；5.6 未勾选，整体31/48，完整目标 active。

## 2026-10-27 完整软件键盘与横屏输入修复

- 严格审计发现此前 keyboard.exists 只能证明存在键盘元素；模拟器实际启用了硬件键盘，截图仅显示附件栏。新增测试脚本 `node tests/ios-ui/test_software_keyboard.mjs` 在明确官方 Simulator 上临时关闭 Connect Hardware Keyboard，以有界等待确认状态，并在 finally 恢复运行前值。测试不发送消息，已有非空草稿会跳过且脚本拒绝把 skip 算为通过。
- 完整软键盘审计 `/tmp/tg-ios-real-software-keyboard-v4-20261027.log` 复现 Photos 底边 721pt、键盘顶边 553pt 的真实问题；仅 `100dvh` 不足以保证 WKWebView 输入区可达。修复 MobileShell 的 VisualViewport height/offset 与 resize/scroll 更新，fixed shell 仅占可视区域；pinch zoom 不参与键盘识别，监听卸载时清理。弹层 max-height 使用实际可视高度，键盘时减少底部安全区保留，窄屏允许滚动访问操作。
- 第一版横屏安装测试虽通过，但 Xcode screenshot 旋转后仍保留旧 portrait 尺寸，simctl 原始 framebuffer 进一步显示发送按钮裁切。最终采用左输入/右操作的紧凑网格、独立 44pt 关闭和 44pt 发送，测试增加非零宽高至少 44pt 的断言，不把空 AX frame 算为通过。原始截图由 readiness marker 触发 simctl 捕获：`/tmp/tg-software-keyboard-frame-1.png` 和 `/tmp/tg-software-keyboard-frame-3.png`；横屏原始像素以旋转形式保存，完整画面已检查，照片、文件、发送和关闭均在键盘及附件栏上方。未增加 Swift/Rust 业务 API 或修改 Supabase 同步。
- 最终 signed Simulator archive 使用既有 `CARGO_HOME="$PWD/.cargo-ios" CARGO_NET_OFFLINE=true npx tauri ios build --debug --target aarch64-sim --archive-only --ci --export-method debugging`，日志 `/tmp/tg-ios-compact-landscape-keyboard-build-20261027.log` 退出 0；DTPlatformName=iphonesimulator 和 codesign 校验通过，覆盖安装保留登录容器。
- 最终 `KEYBOARD_DERIVED_DATA=/tmp/tg-ios-keyboard-landscape-compact-final-20261027 node tests/ios-ui/test_software_keyboard.mjs`：1/1、0 失败、0 跳过，24.844 秒，实际软键盘包含竖屏与横屏两次检查及原始截图。日志 `/tmp/tg-ios-keyboard-landscape-compact-final-20261027.log`，xcresult `/tmp/tg-ios-keyboard-landscape-compact-final-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_09-09-09-+0800.xcresult`。空草稿发送为 disabled；本测试证明其可见触摸区域，不证明本轮实际发送。
- 新增浏览器 `tests/test_mobile_keyboard_browser.js` 验证 390/320/844 宽度的可视高度/offset、按钮可滚入键盘上方、pinch zoom 忽略、键盘关闭后的历史滚动。既有 feed、accessibility 和静态 suite 通过；accessibility 浏览器等待实际 viewport resize 完成再测布局，避免读取旧高度。四项安装包正常字号回归 compact status、keyboard/picker cancel、Space/transfer/cache、signed-in navigation 4/4、0 失败，日志 `/tmp/tg-ios-keyboard-layout-normal-regression-20261027.log`，53.920 秒。
- 5.1/5.6 仍未勾选：本轮修复和证据只覆盖官方 Simulator，Jam portrait/landscape 键盘、最大字号加软件键盘、VoiceOver 与完整稳定性仍待验收。Jam 当前 unavailable；VPhone 原 sudo PID45558 live 且授权 marker absent，未重复开启 sudo、修改安全策略或重建 VM。整体保持31/48，完整目标 active。
- 最新安装包最大系统字号非键盘回归 2/2、0 失败，20.423 秒：实际字号 AX frame 与 primary-action reachability。日志 `/tmp/tg-ios-keyboard-layout-large-regression-20261027.log`，xcresult `/tmp/tg-ios-keyboard-layout-large-regression-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_09-13-37-+0800.xcresult`。命令以 shell EXIT trap 恢复 content_size=large；这仍不证明最大字号与完整软键盘组合。正常字号、Portrait 和运行前 hardware-keyboard preference 已恢复；strict OpenSpec、静态移动 suite 和 diff check 通过。

## 2026-10-27 最大字号与完整软件键盘组合补测

- 最大文字加键盘的早期安装审计实际复现按钮被遮挡，日志 `/tmp/tg-ios-accessibility-keyboard-audit-20261027.log`。为 composer 内容增加独立滚动区域，保留实际最大文字比例 53/17；键盘打开时压缩视觉标题但保留无障碍标题，横屏固定 44pt 关闭按钮并预留内容右侧空间。正常字号沿用原网格，不改 Supabase/Rust 业务 API。
- 初版手势在关闭按钮边缘执行，录像证明键盘已被关闭，不能算可达性通过。最终测试改用内容区域内触摸滚动，并在每次动作前断言键盘仍存在；不重复点击已聚焦 editor，以免打开系统 Paste/Autofill 菜单。最终 `KEYBOARD_TEXT_SIZE=accessibility-extra-extra-extra-large KEYBOARD_DERIVED_DATA=/tmp/tg-ios-large-keyboard-gesture-proof-20261027 node tests/ios-ui/test_software_keyboard.mjs` 通过 1/1、0 失败、31.850 秒。日志 `/tmp/tg-ios-large-keyboard-gesture-proof-20261027.log`；xcresult 原路径 `Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_09-43-16-+0800.xcresult`。竖屏照片/文件/发送/关闭均在软键盘上方；横屏实际滚动依次访问照片/文件和发送，键盘保持打开。最后 framebuffer 只显示当前滚到的发送区域，不宣称所有操作同时可见。
- 最新安装包紧凑状态、Space/transfer/cache 入口回归 2/2、0 失败、22.719 秒，日志 `/tmp/tg-ios-compact-sync-verify-20261027.log`；xcresult `Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_09-47-12-+0800.xcresult`。静态移动 suite、feed/keyboard/accessibility 浏览器检查、`npm run build` 通过。浏览器键盘检查包含正常/最大字号 × 320/390/844 宽度；它不替代实际触摸或真机。
- 新增正常/最大字号完整键盘下实际打开照片和文档选择器、取消后保持空草稿的测试。发送按钮仍只验证 frame，可见性测试不发送云端数据。脚本支持 `KEYBOARD_PICKER_CANCEL=1`，按 DerivedData 的 `framebuffers/` 保存截图；输出错误会中止子进程并进入偏好恢复流程，不再因日志 ENOSPC 直接退出而遗漏恢复。
- 首次新增测试尚未执行到应用：系统盘只有约116 MiB 空闲，Xcode复制框架与日志写入报 ENOSPC。已只读确认没有仍在运行的 Xcode 子进程，并恢复 content_size=large。后续外置盘构建被有界超时或主动停止，均是 BUILD INTERRUPTED，不计为应用通过/失败；原日志 `/tmp/tg-ios-max-keyboard-picker-cancel-20261027.log`、外置 `/Volumes/ORICO/transfer-genie-test-artifacts/20261027/max-keyboard-picker-final.log` 和 `max-keyboard-picker-retry.log` 保留。
- 本任务的两份旧生命周期/预览测试产物已转存 `/Volumes/ORICO/transfer-genie-test-artifacts/20261027/`，没有删除用户数据。新测试 DerivedData 的跨盘复制遇到稀疏 compilation cache 展开：逻辑约25 GiB，HFS+目标约25 GiB实际占用。源文件仍保留；复制进程收到停止信号但仍处于内核 I/O 等待，禁止对其源/目标做清理、覆盖或重复复制。紧凑/gesture-proof/no-edit-menu 三份后续移动未执行，仍以原位置为准。当前脚本为测试构建传入 `COMPILATION_CACHE_ENABLE_CACHING=NO` 与 `CODE_INDEX_ENABLE_BUILD_ARENA=NO`，仅影响测试构建。
- VPhone CLI 当前 `hostReady=true`、helper ready、`bundleReady=false`、running0；唯一 `Transfer-Genie-iOS-26` guest stopped。原 sudo PID45558 仍 live/marker absent，未重复授权或改变 VM。Jam 仍 unavailable；不开始真机验收。整体31/48，5.1/5.6继续未勾选，完整目标active。
- 后续只读确认原复制 PID34155 已不存在，源目录仍在、目标只复制部分子目录，未清理两者。ORICO 盘为 HFS+，后续冷构建改用 `mktemp -d /Volumes/VPhone/installers/tg-ui-keyboard-20261027.XXXXXX` 的独立 APFS 临时目录；不在 machines 库内、不改 guest 数据。实际目录 `/Volumes/VPhone/installers/tg-ui-keyboard-20261027.hif4HB`，日志 `test.log`，关闭 compilation cache 的命令参数已由 Xcode 输出确认。
- APFS 冷构建进入实际应用测试；竖屏照片和文档选择器能打开、取消且保留空草稿，但横屏快速手势使照片 AX frame 在150/-120之间跳动，随后到240秒工具超时（test.log）。慢手势的真实 framebuffer `/tmp/tg-max-keyboard-live-upright-20261027.png` 显示滚动误触文档选择器，已主动终止卡住测试，不能当成通过（slow-gesture.log）。将触摸移到关闭按钮下方预留空白后，实际安装测试严格失败1/1：照片bottom241pt大于键盘top226pt（reserved-gutter.log；42.386秒）；保留这一反证，早先gesture-proof1/1不证明重复操作稳定。
- 当前源码的横屏最大字号 `.mobile-composer-content` 增加 `margin-right:0`，消除继承负margin对右侧滚动区域的裁切；浏览器新增滚动区与关闭控件边界检查并通过。触摸测试使用下方空白、慢拖动后停留0.4秒，避免按钮点击和惯性；断言未放宽。此CSS修改尚未覆盖安装。两次signed archive尝试均因系统盘链接器ENOSPC失败，外置日志 `gutter-build.log`、`gutter-build-external-tmp.log`；第二次仅TMPDIR重定向仍不足，下一步必须解决Xcode产物输出位置或得到系统盘空间后重建，不能以浏览器通过代替安装验证。原已登录安装包保留。
- CoreSimulator截图服务直接写外置盘报权限错误；脚本现先捕获到唯一小临时图片，再复制到当前测试批次framebuffers，不更改宿主机/虚拟机权限。测试最终恢复content_size=large，Jam仍unavailable，VPhone授权仍等待。最大字号横屏稳定性和原生picker组合是明确未完成项，不开始真机。
- 普通字号完整键盘picker组合也有实际未通过结果：取消照片选择器、重新聚焦editor后发送按钮isHittable=false，18.399秒，`normal-keyboard-picker.log`，xcresult `Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_10-18-45-+0800.xcresult`。尚未区分键盘过渡、可视区滚动或实际遮挡，不放宽断言；普通字号旧的单次键盘布局通过不能覆盖这一返回路径。
- `XCODE_XCCONFIG_FILE` 外置配置尝试仍未重定向Tauri archive中的实际ArchiveIntermediates路径，日志 `gutter-build-external-products.log` 再次链接器ENOSPC，退出1。最终系统盘约122 MiB空闲。没有删除或覆盖已有用户数据/旧安装包，外置尝试文件保留。下一轮应优先验证Tauri/Xcode实际产物路径并定向到外置盘，或经用户授权释放足够系统空间，再安装当前CSS修复并完成正常/最大字号的picker返回回归。当前完整目标未达成、仍active。

## 2026-10-27 VPhone 补充 smoke suite

- 新增 `tests/vphone/test_vphone_smoke.mjs` 与 `npm run test:vphone`。测试固定输出 `SUPPLEMENTAL_ONLY_NOT_JAM_ACCEPTANCE`，不会把 VPhone 结果计作 `Jam` 真机发布验收；日志和报告只保留哈希及脱敏系统日志，不输出 Supabase Session、token 或账号凭据。临时 IPA 在 `/tmp` 生成并由 `finally` 清理，报告目录不再重复保留约 173 MiB 的 IPA。
- 运行环境为 `Transfer-Genie-iOS-26`，库目录 `/Volumes/VPhone/machines`，Core Bundle 2.13.2，iOS 26.6.2，UDID `0000FE01-E51D33A921404F4C`，CoreDevice ID `F630A6DA-08AE-58EE-8085-0D05BCDBBE38`。Launchpad/helper/bundle、Developer Mode、guest RPC 和 CoreDevice/Xcode 可见性均通过。
- 默认重复安装 smoke 通过 14 项：两次 `ideviceinstaller` 真实 installd 安装、两次冷启动、移动 shell、进程终止后的登录恢复、截图、脱敏日志和零新增 crash。报告 `/Volumes/VPhone/installers/vphone-smoke/2026-10-27T03-28-46-611Z/report.json`。最终脚本收尾后再次运行最小认证回归，通过 12 项，报告 `/Volumes/VPhone/installers/vphone-smoke/2026-10-27T04-07-46-856Z/report.json`。
- 完整只读 Supabase/附件场景通过 17 项：专用文本 `TG-VPHONE-SMOKE-20261027033209` 可在 VPhone 手动同步后读取；`TG-IOS-PROBE-20261027-document.txt` 可打开 Quick Look 与系统分享页，分享页期间终止后重新冷启动恢复。报告 `/Volumes/VPhone/installers/vphone-smoke/2026-10-27T03-44-07-110Z/report.json`，截图 `mobile-shell.jpg`、`attachment-quick-look.jpg`、`attachment-share-sheet.jpg`。
- 专用 APFS 快照 `transfer-genie-smoke-20261027` 的 stop/revert/restart、重新 installd 安装、冷启动和登录恢复通过 15 项；报告 `/Volumes/VPhone/installers/vphone-smoke/2026-10-27T03-51-16-007Z/report.json`。快照回滚仅在显式 `VPHONE_ALLOW_SNAPSHOT_REVERT=1` 时运行。
- 跨环境 Supabase 证据：VPhone 发出的专用文本在官方 `Transfer Genie - iPhone 12` Simulator 冷启动后进入其本地 SQLite；只读查询返回 `1|synced|1`，即恰好一条、`sync_state=synced`、`remote_revision=1`。这证明 VPhone→Supabase→官方 Simulator 的 send/pull 收敛，不扩大为真机网络或发布验收。
- 当前 `/Volumes/VPhone/installers/Transfer Genie VPhone.app` 的签名仍为 `Signature=adhoc`、`TeamIdentifier=not set`。因此 7.4 的 development-signed IPA 条件仍未满足；7.5/7.6 只完成补充测试和门禁隔离。`Jam` 在 `xcrun devicectl list devices` 中仍为 unavailable，Keychain、Photos/iCloud、安全作用域文件、真实挂起、Wi-Fi/蜂窝切换、媒体性能、签名发布和最终稳定性任务全部保持未勾选。
- 调试期报告目录内的重复 IPA 已清理，只保留报告、截图和脱敏日志；`/Volumes/VPhone/installers/vphone-smoke` 当前约 2.4 MiB，没有残留 `.ipa`，`/tmp/transfer-genie-vphone-ipa.*` 也无残留。源 `.app` 保留，可随时重新生成测试 IPA。

## 2026-10-27 picker 返回与编辑器自动缩放回归

- 系统盘只读检查已恢复约31 GiB可用，原ENOSPC阻断消失。最新signed Simulator archive已重建、DTPlatformName=iphonesimulator及codesign校验通过并覆盖安装，保留登录和本地数据库。最终构建日志 `/Volumes/VPhone/installers/tg-keyboard-grid-20261027-build.log`。
- 正常字号此前取消照片后按钮从354pt变成378pt、44pt变成48pt；横屏Send落到324pt而键盘顶为226pt。焦点重采样、定时归零滚动和overflow限制的试验均未解决，已撤掉本轮这些复杂试验，只保留composer textarea 16px最小字体，保留用户pinch zoom及原VisualViewport保护。修复后正常字号的两次真实安装回归通过，按钮不再自动缩放，Photos和Files取消后草稿不丢失，Send和Close均在键盘上方且isHittable=true。
- UI测试为每个方向先确认空草稿，再输入单字符x使Send实际启用，绝不点击Send。每个方向完成后终止/冷启动清除仅内存的测试草稿；不触发Supabase写入。最初空草稿isHittable要求及删字符清理不可靠的失败记录保留，最终不放宽启用发送按钮的44pt、键盘边界或isHittable断言。
- 最终普通字号命令 `KEYBOARD_PICKER_CANCEL=1 KEYBOARD_DERIVED_DATA=/Volumes/VPhone/installers/tg-keyboard-font16-20261027 node tests/ios-ui/test_software_keyboard.mjs`，1/1、0失败、0跳过，61.934秒。日志 `/Volumes/VPhone/installers/tg-keyboard-grid-normal-20261027.log`；xcresult `/Volumes/VPhone/installers/tg-keyboard-font16-20261027/Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_13-02-12-+0800.xcresult`。横屏Send在Photos和Files返回后均为(435,68,338,44)、keyboardTop226、enabled=true、hittable=true。
- 最大字号横屏独立问题：内容网格原跨至第三列并拦截Close，现限定前两列并明确composer定位基准。浏览器增加elementFromPoint真实Close命中检查并通过，安装包也证实Close恢复isHittable=true。但Photos返回后Send仍为(71,443,702,87)、keyboardTop226、hittable=false；最大字号完整组合仍失败1/1、63.297秒，日志 `/Volumes/VPhone/installers/tg-keyboard-grid-large-20261027.log`。不能用竖屏成功、初始网格成功或旧gesture-only通过替代此失败路径。
- 最新普通字号回归结束后content_size=large、portrait及运行前硬件键盘偏好已恢复，应用重新冷启动，无测试草稿残留。5.1/5.6继续未勾选；7.5/7.6据实完成后整体33/48，Jam仍unavailable，完整目标active。下一步应收集最大字号picker返回时的实际VisualViewport scale/height/offset与布局状态，修复键盘布局丢失后再进入真机验收。

## 2026-10-27 最大字号键盘与 picker 返回修复

- 新增显式启用的 SimulatorLayoutProbe.swift，仅在 DEBUG && targetEnvironment(simulator) 编译，并要求 TRANSFER_GENIE_IOS_LAYOUT_PROBE=1。只记录布局矩形、字号、视口和滚动位置，不包含正文、账号、token 或任意脚本执行接口；设备和 Release 包不包含探针。JSONL 保留到各次测试目录，原始 framebuffer 在 READY、SEND 或 FAILURE 标记时捕获。
- 实测根因：横屏 Photos 取消后重新聚焦，VisualViewport.height=114、scale=1、offsetTop=197，window.innerHeight 从370变173且scrollY=197。旧 innerHeight - viewportHeight > 100 把仍打开的键盘误判为关闭；检测现计入 layout scrollY，保留 pinch-zoom 忽略规则。失败证据 /Volumes/VPhone/installers/tg-keyboard-layout-probe-20261027.log 和同名目录的 mobile-layout-probe.jsonl。
- 进一步发现 AX 的 isHittable/keyboardTop 通过不等于视觉可见：Send 可在内部滚动区下方被裁切，而系统仍返回完整AX frame。tg-keyboard-visible-bounds-v2-20261027 的表面通过被原始 send-orientation-3.png 反证，不计为修复验收。最新 XCTest 从模拟器专用 geometry label 读取实际 DOM clip bounds；缺失探针或按钮越过滚动容器都失败。
- 纵向共享/独立滚动操作区均出现实际回弹/裁切，严格失败证据保留在 tg-keyboard-dom-bounds-20261027.log、tg-keyboard-independent-scroll-20261027.log 和 tg-keyboard-independent-scroll-v2-20261027.log。最终只对最大无障碍字号、横屏、软件键盘打开组合使用独立的横向操作条，Send优先；文字不缩小，输入区与关闭不随操作条滚动，照片/文件/标记可横向触摸滚动到达。普通字号和桌面布局保持原样。
- 最新签名 Simulator archive 构建成功，codesign strict校验通过，DTPlatformName=iphonesimulator，覆盖安装保留登录/SQLite。日志 /Volumes/VPhone/installers/tg-keyboard-horizontal-actions-20261027-build.log。
- 严格原生命令 KEYBOARD_PICKER_CANCEL=1 KEYBOARD_TEXT_SIZE=accessibility-extra-extra-extra-large KEYBOARD_DERIVED_DATA=/Volumes/VPhone/installers/tg-keyboard-horizontal-actions-20261027 node tests/ios-ui/test_software_keyboard.mjs：1/1、0失败、0跳过，126.792秒。实际竖屏及横屏打开/取消Photos和Files、保留未发送x、保持完整键盘、Send/Close至少44pt且真实DOM可见；测试不点击Send、不写云端，冷启动清除仅内存测试草稿。日志同目录名 .log，xcresult Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_14-05-18-+0800.xcresult。framebuffers/send-orientation-3.png 已人工检查，输入x、完整发送按钮、关闭和完整软件键盘同时可见。
- 普通字号同一安装包回归：KEYBOARD_PICKER_CANCEL=1 KEYBOARD_DERIVED_DATA=/Volumes/VPhone/installers/tg-keyboard-horizontal-normal-20261027 node tests/ios-ui/test_software_keyboard.mjs，1/1、0失败、0跳过，87.448秒；日志同目录名 .log，xcresult Logs/Test/Test-TransferGenieSimulatorUITests-2026.10.27_14-09-14-+0800.xcresult。恢复 content_size=large、portrait及原硬件键盘偏好，冷启动无探针环境变量、无测试草稿。
- 浏览器键盘测试增加114px可视高度和layout scroll复现场景；Edge/Playwright keyboard、accessibility、feed及静态controller检查、npm run build、strict OpenSpec通过。本轮没有修改Supabase/Rust业务逻辑。5.1/5.6仍需Jam横竖屏、VoiceOver和真实设置验收，整体保持33/48、目标active。
