# iOS 原生返回对照测试

这个独立 App 不读取业务数据库、不连接 Supabase，也不卸载 Transfer Genie。
它用于区分 WebKit 历史手势和 UIKit 原生导航行为，不能代替业务 App 验收。

生成项目：

~~~sh
xcodegen generate --spec tests/native-navigation/project.yml
~~~

用本机可用 Simulator 的 UDID 替换命令里的占位值：

~~~sh
xcodebuild test -quiet \
  -project tests/native-navigation/NativeNavigationProbe.xcodeproj \
  -scheme NativeNavigationProbe \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' \
  -only-testing:NativeNavigationProbeUITests/NavigationTests/testUIKitNativePopControl \
  -only-testing:NativeNavigationProbeUITests/NavigationTests/testSingleWebViewUIKitBackAndNativeGate \
  -only-testing:NativeNavigationProbeUITests/NavigationTests/testSingleWebViewCancelledBackPreservesEditorAcrossReentry \
  CODE_SIGNING_ALLOWED=NO
~~~

三个测试分别验证标准 UIKit 返回、单 WebView 原生 gate，以及取消后返回／重新打开保留编辑内容。
均使用 XCTest 真正的左缘拖动，不调用私有模拟 swipe 或 JavaScript history.back()。
单 WebView 原型通过原生视图快照保留主页面，将同一个 WebView 移入子控制器；取消时不销毁编辑器，完成时再放回。
根滚动手势必须等待 interactivePopGestureRecognizer 判定，否则输入框聚焦后可能抢占侧滑。

其他 WebKit 对照测试保留为诊断：在 2026-10-30 的 iOS 26.4 Simulator 中未通过。
不要执行整个测试套件后把这些已知失败与业务回归混为一谈，也不要为得到绿色结果删除失败对照。

正式接入仍需验证 Tauri 控制器 containment、Vue 顶层／嵌套页、键盘、选区、滚动、原生 picker、附件、完整草稿持久化和实体 iPhone。
原型在 DOM 中保留输入值只证明编辑器复用，不证明业务草稿已落盘。
