#if DEBUG && targetEnvironment(simulator)
import WebKit

// Explicit, layout-only diagnostics; never compiled into device or release builds.
final class SimulatorLayoutProbe: NSObject, WKScriptMessageHandler {
  private let output = FileManager.default.temporaryDirectory.appendingPathComponent("mobile-layout-probe.jsonl")
  private let geometryLabel = UILabel()

  func install(in webview: WKWebView) {
    geometryLabel.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
    geometryLabel.textColor = .clear
    geometryLabel.isAccessibilityElement = true
    geometryLabel.accessibilityIdentifier = "Simulator layout geometry"
    webview.addSubview(geometryLabel)
    if !FileManager.default.fileExists(atPath: output.path) {
      FileManager.default.createFile(atPath: output.path, contents: nil)
    }
    let controller = webview.configuration.userContentController
    controller.add(self, name: "mobileLayoutProbe")
    controller.addUserScript(WKUserScript(source: Self.script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame,
          let data = try? JSONSerialization.data(withJSONObject: message.body, options: [.sortedKeys]),
          let handle = try? FileHandle(forWritingTo: output) else { return }
    geometryLabel.accessibilityValue = String(data: data, encoding: .utf8)
    defer { try? handle.close() }
    do {
      try handle.seekToEnd()
      try handle.write(contentsOf: data + Data([10]))
    } catch { }
  }

  private static let script = """
    (() => {
      function capture(event) {
        const viewport = window.visualViewport;
        const rects = {};
        for (const selector of ['.mobile-shell', '.mobile-composer-sheet', '.mobile-composer-content', '.mobile-composer-toolbar-dock', '.mobile-rich-editor-host', '.mobile-compose-actions', '.mobile-composer-sheet textarea', '.mobile-composer-sheet .mobile-primary-button', '.mobile-compose-tools button:nth-child(1)', '.mobile-compose-tools button:nth-child(2)', '.mobile-compose-tools button:nth-child(3)', '.mobile-attachment-strip', '.mobile-attachment-strip .mobile-draft-open', '.mobile-attachment-strip button[aria-label="移除附件"]']) {
          const el = document.querySelector(selector);
          if (!el) continue;
          const r = el.getBoundingClientRect(), css = getComputedStyle(el);
          let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
          for (let parent = el.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
            if (style.display === 'contents') continue;
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
          }
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          rects[selector] = { x: r.x, y: r.y, width: r.width, height: r.height, clipLeft: left, clipRight: right, clipTop: top, clipBottom: bottom, centerHit: hit === el || el.contains(hit), scrollTop: el.scrollTop, scrollLeft: el.scrollLeft, display: css.display, position: css.position, fontSize: css.fontSize };
        }
        window.webkit.messageHandlers.mobileLayoutProbe.postMessage({
          event, time: Date.now(), innerWidth, innerHeight, scrollX, scrollY,
          viewport: viewport ? { width: viewport.width, height: viewport.height, top: viewport.offsetTop, left: viewport.offsetLeft, scale: viewport.scale } : null,
          keyboardClass: document.querySelector('.mobile-shell')?.classList.contains('is-keyboard-visible'),
          textScale: getComputedStyle(document.documentElement).getPropertyValue('--mobile-text-scale'),
          activeTag: document.activeElement?.tagName, rects
        });
      }
      for (const name of ['resize', 'scroll']) window.visualViewport?.addEventListener(name, () => capture('viewport-' + name));
      document.addEventListener('scroll', () => capture('element-scroll'), true);
      for (const name of ['resize', 'focusin', 'focusout', 'pointerup']) window.addEventListener(name, () => {
        capture(name);
        setTimeout(() => capture(name + '-settled'), 350);
      });
      let mutationTimer;
      new MutationObserver(() => {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => capture('dom-settled'), 100);
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      capture('load');
    })();
    """
}
#endif
