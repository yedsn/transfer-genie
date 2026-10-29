import UIKit
import WebKit
import Tauri
@testable import tauri_plugin_mobile_integration

// An offline control experiment: same plugin and fixed CSS canvas as the app,
// without its Supabase dependency or any user database. Never ships in the app.
@main
final class ProbeApp: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let root: UIViewController = ProcessInfo.processInfo.environment["PRODUCTION_NAVIGATION"] == "1" ? ProductionNavigationController() : ProcessInfo.processInfo.environment["SHARED_WEBVIEW"] == "1" ? SharedWebRootController() : ProbeController()
        if let root = root as? SharedWebRootController {
            let navigation = UINavigationController(rootViewController: root)
            navigation.setNavigationBarHidden(true, animated: false)
            window.rootViewController = navigation
            root.navigationHost = navigation
        } else
        if ProcessInfo.processInfo.environment["HOST_NAVIGATION"] == "1" {
            let navigation = UINavigationController(rootViewController: root)
            navigation.setNavigationBarHidden(ProcessInfo.processInfo.environment["NATIVE_PUSH"] != "1", animated: false)
            window.rootViewController = navigation
        } else {
            window.rootViewController = root
        }
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class FixtureHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let fixed = ProcessInfo.processInfo.environment["FIXED_CANVAS"] == "1"
        let page = task.request.url?.lastPathComponent == "detail" ? "Detail" : "Root"
        let css = fixed ? "html,body{height:100%;overflow:hidden;margin:0}main{position:fixed;inset:0;overflow:hidden}" : "body{margin:0}main{height:100vh}"
        let html = "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><style>\(css)main{background:#faf9f5;padding:70px 20px;font:24px -apple-system;box-sizing:border-box}</style><main><h1>\(page)</h1><p>Offline native navigation fixture</p><a href='tg-probe://localhost/detail'>Web detail link</a><div style='height:50%;overflow:auto'><p>Nested scrolling content</p><div style='height:1000px'></div></div></main>"
        let data = Data(html.utf8)
        task.didReceive(URLResponse(url: task.request.url!, mimeType: "text/html", expectedContentLength: data.count, textEncodingName: "utf-8"))
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class ProbeController: UIViewController, WKNavigationDelegate {
    private var webview: WKWebView!
    private var plugin: Plugin?
    private let status = UILabel()
    private var observed: [UIGestureRecognizer] = []
    private var usesFileFixture: Bool { ProcessInfo.processInfo.environment["FILE_FIXTURE"] == "1" }
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(FixtureHandler(), forURLScheme: "tg-probe")
        webview = WKWebView(frame: .zero, configuration: config)
        webview.navigationDelegate = self
        view.addSubview(webview)
        if ProcessInfo.processInfo.environment["USE_PLUGIN"] == "1" {
            let plugin = initPlugin()
            plugin.load(webview: webview)
            self.plugin = plugin
        }
        webview.allowsBackForwardNavigationGestures = true
        status.accessibilityIdentifier = "navigation-status"
        status.font = .systemFont(ofSize: 12)
        status.numberOfLines = 2
        view.addSubview(status)
        let button = UIButton(type: .system)
        button.setTitle("Open detail", for: .normal)
        button.addTarget(self, action: #selector(openDetail), for: .touchUpInside)
        button.frame = CGRect(x: 20, y: 60, width: 120, height: 44)
        view.addSubview(button)
        if usesFileFixture {
            let url = Bundle.main.url(forResource: "root", withExtension: "html")!
            webview.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webview.load(URLRequest(url: URL(string: "tg-probe://localhost/root")!))
        }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webview.frame = view.bounds
        status.frame = CGRect(x: 150, y: 55, width: view.bounds.width - 160, height: 50)
    }
    @objc private func openDetail() {
        if ProcessInfo.processInfo.environment["NATIVE_PUSH"] == "1" {
            let detail = UIViewController()
            detail.title = "Detail"
            detail.view.backgroundColor = .systemBackground
            let title = UILabel(frame: CGRect(x: 40, y: 150, width: 250, height: 60))
            title.text = "Native detail"
            detail.view.addSubview(title)
            navigationController?.pushViewController(detail, animated: true)
            return
        }
        webview.load(URLRequest(url: URL(string: "tg-probe://localhost/detail")!))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.allowsBackForwardNavigationGestures = true
        let page = webView.url?.deletingPathExtension().lastPathComponent ?? "unknown"
        status.text = "\(page) back=\(webView.canGoBack) scroll=\(webView.scrollView.isScrollEnabled)"
        if ProcessInfo.processInfo.environment["OBSERVE_GESTURES"] == "1" { observeGestures(webView) }
    }
    private func observeGestures(_ view: UIView) {
        for gesture in view.gestureRecognizers ?? [] where !observed.contains(where: { $0 === gesture }) {
            observed.append(gesture)
            gesture.addTarget(self, action: #selector(gestureChanged))
            print("PROBE recognizer \(type(of: gesture)) enabled=\(gesture.isEnabled) view=\(type(of: view))")
        }
        view.subviews.forEach(observeGestures)
    }
    @objc private func gestureChanged(_ recognizer: UIGestureRecognizer) {
        if recognizer.state != .changed, let pan = recognizer as? UIPanGestureRecognizer {
            print("PROBE state \(type(of: recognizer))=\(recognizer.state.rawValue) translation=\(pan.translation(in: webview)) velocity=\(pan.velocity(in: webview)) back=\(webview.canGoBack) children=\(webview.superview?.subviews.map { $0.layer.name ?? String(describing: type(of: $0)) } ?? [])")
        }
    }
}
