import UIKit
import WebKit
@testable import tauri_plugin_mobile_integration

// Offline UI fixture calling the exact production coordinator, not a copy.
// This proves containment/gesture mechanics, not business draft persistence.
final class ProductionNavigationController: UIViewController, WKScriptMessageHandler {
  private var webview: WKWebView!
  private var navigation: MobileNavigation!
  private var revision: UInt64 = 0
  private let requestId = "production-fixture"
  override func viewDidLoad() {
    super.viewDidLoad()
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(self, name: "fixture")
    webview = WKWebView(frame: view.bounds, configuration: configuration)
    webview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(webview)
    navigation = MobileNavigation(webview: webview)
    webview.loadHTMLString("""
      <meta name=viewport content='width=device-width,initial-scale=1,viewport-fit=cover'>
      <style>html,body{margin:0;height:100%;overflow:hidden;background:#faf9f5;font:20px -apple-system}main{padding:70px 20px}button{font:inherit;min-height:44px}textarea{display:block;width:90%;height:160px;font:20px -apple-system}</style>
      <main><h1>Production root</h1><button id=open onclick=send('prepare')>Open production page</button>
      <div id=detail hidden><button onclick=send('gate') id=gate>Disable return</button><button onclick='document.activeElement.blur()'>Dismiss keyboard</button><button onclick=send('close')>Close production page</button><textarea aria-label='Production draft'></textarea><p id=settled></p></div></main>
      <script>
      function send(action){webkit.messageHandlers.fixture.postMessage(action)}
      function show(){document.querySelector('h1').textContent='Production detail';document.querySelector('#open').hidden=true;document.querySelector('#detail').hidden=false;send('show')}
      window.addEventListener('transfer-genie-navigation-shown',()=>document.querySelector('#settled').textContent='Production settled');
      window.addEventListener('transfer-genie-navigation-returned',()=>{document.querySelector('h1').textContent='Production root';document.querySelector('#detail').hidden=true;document.querySelector('#open').hidden=false;requestAnimationFrame(()=>requestAnimationFrame(()=>send('finish')))});
      </script>
      """, baseURL: nil)
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let action = message.body as? String else { return }
    if action == "gate" {
      revision += 1
      navigation.setReturnEnabled(!navigation.returnEnabled, revision: revision)
      let label = navigation.returnEnabled ? "Disable return" : "Enable return"
      webview.evaluateJavaScript("document.querySelector('#gate').textContent='\(label)'", completionHandler: nil)
      return
    }
    guard navigation.perform(page: "composer", action: action, requestId: requestId) else { return }
    if action == "prepare" { webview.evaluateJavaScript("show()", completionHandler: nil) }
    if action == "show" {
      revision += 1
      navigation.setReturnEnabled(true, revision: revision)
    }
  }
}
