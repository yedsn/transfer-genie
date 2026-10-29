import UIKit
import WebKit

// Keep Tao's window/root controller and the one Tauri WebView alive. Only
// public UIKit containment and the system navigation animator are used.
final class MobileNavigation: NSObject, UINavigationControllerDelegate, UIGestureRecognizerDelegate {
  private let webview: WKWebView
  private let root = MobileNavigationPage()
  private var navigation: UINavigationController?
  private var child: MobileNavigationPage?
  private var snapshot: UIView?
  private var page = ""
  private var requestId = ""
  private var returning = false
  private(set) var returnEnabled = false
  private var gateRevision: UInt64 = 0

  init(webview: WKWebView) {
    self.webview = webview
    super.init()
  }

  var canGoBack: Bool { child != nil && navigation?.viewControllers.count == 2 }

  func setReturnEnabled(_ enabled: Bool, revision: UInt64) {
    guard revision >= gateRevision else { return }
    gateRevision = revision
    returnEnabled = enabled
  }

  private func install() -> Bool {
    if navigation != nil { return true }
    guard let owner = webview.window?.rootViewController,
          owner.presentedViewController == nil else { return false }
    let navigation = MobileNavigationHost(rootViewController: root)
    navigation.systemOwner = owner
    navigation.setNavigationBarHidden(true, animated: false)
    navigation.delegate = self
    owner.addChild(navigation)
    navigation.view.frame = owner.view.bounds
    navigation.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    owner.view.addSubview(navigation.view)
    navigation.didMove(toParent: owner)
    self.navigation = navigation
    navigation.view.layoutIfNeeded()
    navigation.interactivePopGestureRecognizer?.delegate = self
    if let gesture = navigation.interactivePopGestureRecognizer {
      webview.scrollView.panGestureRecognizer.require(toFail: gesture)
    }
    root.attach(webview)
    return true
  }

  func perform(page: String, action: String, requestId: String) -> Bool {
    guard ["detail", "composer"].contains(page), !requestId.isEmpty else { return false }
    if action == "prepare" {
      guard child == nil, snapshot == nil, install(),
            navigation?.transitionCoordinator == nil,
            let snapshot = webview.snapshotView(afterScreenUpdates: false) else { return false }
      self.page = page
      self.requestId = requestId
      returnEnabled = false
      snapshot.isUserInteractionEnabled = false
      snapshot.accessibilityElementsHidden = true
      snapshot.frame = root.view.bounds
      snapshot.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      root.view.addSubview(snapshot)
      self.snapshot = snapshot
      return true
    }
    guard self.page == page, self.requestId == requestId, let navigation else { return false }
    switch action {
    case "show":
      guard child == nil, snapshot != nil, navigation.transitionCoordinator == nil else { return false }
      let child = MobileNavigationPage()
      self.child = child
      child.attach(webview)
      navigation.pushViewController(child, animated: !UIAccessibility.isReduceMotionEnabled)
      return true
    case "close":
      guard canGoBack, navigation.transitionCoordinator == nil else { return false }
      returnEnabled = false
      webview.endEditing(true)
      navigation.popViewController(animated: !UIAccessibility.isReduceMotionEnabled)
      return true
    case "finish":
      guard returning, navigation.topViewController === root else { return false }
      // Reparenting a WKWebView can briefly leave its remote rendering layer
      // blank. Wait for WebKit's screen update, not only Vue's DOM acknowledgement.
      // Keep the existing root cover until the real root is composited.
      let configuration = WKSnapshotConfiguration()
      configuration.afterScreenUpdates = true
      webview.takeSnapshot(with: configuration) { [weak self] _, _ in
        guard let self, self.returning, self.requestId == requestId,
              self.navigation?.topViewController === self.root else { return }
        UIView.performWithoutAnimation { self.reset() }
      }
      return true
    case "resume":
      guard returning, let child, navigation.topViewController === root else { return false }
      returning = false
      child.attach(webview)
      navigation.pushViewController(child, animated: false)
      return true
    case "cancel":
      guard child == nil else { return false }
      reset()
      return true
    default:
      return false
    }
  }

  private func reset() {
    snapshot?.removeFromSuperview()
    snapshot = nil
    child = nil
    returning = false
    returnEnabled = false
    page = ""
    requestId = ""
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    canGoBack && returnEnabled && !returning &&
      navigation?.transitionCoordinator == nil && navigation?.presentedViewController == nil
  }

  func navigationController(_ navigationController: UINavigationController, didShow viewController: UIViewController, animated: Bool) {
    if viewController === child {
      emit("transfer-genie-navigation-shown")
      return
    }
    guard viewController === root, child != nil, !returning else { return }
    returning = true
    returnEnabled = false
    webview.endEditing(true)
    root.attach(webview)
    if let snapshot { root.view.bringSubviewToFront(snapshot) }
    // Only a completed pop reaches this path. Cancellation retains the child
    // and its live DOM/editor. Vue removes its layer before acknowledging finish.
    emit("transfer-genie-navigation-returned")
  }

  private func emit(_ name: String) {
    let payload = ["page": page, "requestId": requestId]
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else { return }
    webview.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(name)',{detail:\(json)}))", completionHandler: nil)
  }
}

private final class MobileNavigationPage: UIViewController {
  func attach(_ webview: WKWebView) {
    loadViewIfNeeded()
    webview.removeFromSuperview()
    view.insertSubview(webview, at: 0)
    webview.frame = view.bounds
    webview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  }
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
  }
}

private final class MobileNavigationHost: UINavigationController {
  weak var systemOwner: UIViewController?
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { systemOwner?.supportedInterfaceOrientations ?? .all }
  override var prefersStatusBarHidden: Bool { systemOwner?.prefersStatusBarHidden ?? false }
  override var prefersHomeIndicatorAutoHidden: Bool { systemOwner?.prefersHomeIndicatorAutoHidden ?? false }
}
