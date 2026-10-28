import UIKit

enum MobileKeyboard {
  static func visibleHeight(bounds: CGRect, keyboardFrame: CGRect, clearance: CGFloat) -> CGFloat? {
    let intersection = bounds.intersection(keyboardFrame)
    guard !intersection.isNull, intersection.height > 80,
          intersection.maxY >= bounds.maxY - 1 else { return nil }
    return max(0, intersection.minY - bounds.minY - clearance)
  }

  static func script(visibleHeight: CGFloat?) -> String {
    let height = visibleHeight.map { String(Double($0)) } ?? "null"
    return """
      window.__TRANSFER_GENIE_KEYBOARD_HEIGHT__ = \(height);
      window.dispatchEvent(new CustomEvent('transfer-genie-keyboard-geometry', { detail: { visibleHeight: \(height) } }));
      """
  }
}
