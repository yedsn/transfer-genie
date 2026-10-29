import UIKit
import WebKit

// Public UIKit navigation with ONE live WKWebView. A native snapshot preserves
// the root during the transition; the real WebView moves between controllers.
// This is an isolated architecture experiment, not a business-app integration.
final class SharedWebRootController: UIViewController, WKNavigationDelegate, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
    weak var navigationHost: UINavigationController?
    private let webview = WKWebView()
    private var rootSnapshot: UIView?
    private var detail: SharedWebDetailController?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationHost?.delegate = self
        navigationHost?.interactivePopGestureRecognizer?.delegate = self
        if let gesture = navigationHost?.interactivePopGestureRecognizer {
            webview.scrollView.panGestureRecognizer.require(toFail: gesture)
        }
        view.addSubview(webview)
        webview.navigationDelegate = self
        webview.allowsBackForwardNavigationGestures = false
        let url = Bundle.main.url(forResource: "root", withExtension: "html")!
        webview.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        let button = UIButton(type: .system)
        button.setTitle("Open shared detail", for: .normal)
        button.frame = CGRect(x: 20, y: 60, width: 220, height: 44)
        button.addTarget(self, action: #selector(openDetail), for: .touchUpInside)
        view.addSubview(button)
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if webview.superview === view { webview.frame = view.bounds }
        rootSnapshot?.frame = view.bounds
    }
    @objc private func openDetail() {
        guard detail == nil, let navigation = navigationHost else { return }
        rootSnapshot = view.snapshotView(afterScreenUpdates: false)
        if let snapshot = rootSnapshot { view.addSubview(snapshot) }
        let detail = SharedWebDetailController(webview: webview)
        self.detail = detail
        detail.loadViewIfNeeded()
        webview.evaluateJavaScript("document.querySelector('h1').textContent='Shared detail';document.querySelector('a').style.display='none';if(!document.querySelector('textarea'))document.body.insertAdjacentHTML('beforeend','<textarea aria-label=Shared-draft></textarea>');document.querySelector('textarea').style.display='block'") { [weak self] _, _ in
            guard let self, self.detail === detail else { return }
            navigation.pushViewController(detail, animated: true)
        }
    }
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let navigation = navigationHost else { return false }
        print("SHARED gesture stack=\(navigation.viewControllers.count) transition=\(navigation.transitionCoordinator != nil) enabled=\(detail?.returnEnabled == true)")
        return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil && detail?.returnEnabled == true
    }
    func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
        print("SHARED didShow root=\(viewController === self) stack=\(navigationController.viewControllers.count) webview=\(String(describing: webview.superview))")
        if let detail = viewController as? SharedWebDetailController { detail.navigationSettled = true }
        guard viewController === self, detail != nil else { return }
        webview.removeFromSuperview()
        view.insertSubview(webview, at: 0)
        webview.frame = view.bounds
        // No navigation/reload: preserve the same DOM draft and editor instance.
        webview.evaluateJavaScript("document.querySelector('h1').textContent='Root';document.querySelector('a').style.display='inline';document.querySelector('textarea').style.display='none'") { [weak self] _, _ in
            self?.rootSnapshot?.removeFromSuperview()
            self?.rootSnapshot = nil
            self?.detail = nil
        }
    }
}

final class SharedWebDetailController: UIViewController {
    let webview: WKWebView
    var returnEnabled = true
    var navigationSettled = false {
        didSet { if navigationSettled { settled.text = "Native detail settled" } }
    }
    private let settled = UILabel()
    init(webview: WKWebView) { self.webview = webview; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(webview)
        let gate = UIButton(type: .system)
        gate.setTitle("Disable return", for: .normal)
        gate.frame = CGRect(x: 20, y: 60, width: 220, height: 44)
        gate.addTarget(self, action: #selector(toggleGate), for: .touchUpInside)
        view.addSubview(gate)
        let dismiss = UIButton(type: .system)
        dismiss.setTitle("Dismiss keyboard", for: .normal)
        dismiss.frame = CGRect(x: 220, y: 60, width: 150, height: 44)
        dismiss.addTarget(self, action: #selector(dismissKeyboard), for: .touchUpInside)
        view.addSubview(dismiss)
        settled.font = .systemFont(ofSize: 10)
        settled.frame = CGRect(x: 20, y: 104, width: 300, height: 20)
        view.addSubview(settled)
    }
    @objc private func toggleGate(_ sender: UIButton) {
        returnEnabled.toggle()
        sender.setTitle(returnEnabled ? "Disable return" : "Enable return", for: .normal)
    }
    @objc private func dismissKeyboard() {
        webview.endEditing(true)
        let gesture = navigationController?.interactivePopGestureRecognizer
        print("SHARED dismiss enabled=\(gesture?.isEnabled == true) state=\(gesture?.state.rawValue ?? -1) delegate=\(String(describing: gesture?.delegate))")
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webview.frame = view.bounds
    }
}
