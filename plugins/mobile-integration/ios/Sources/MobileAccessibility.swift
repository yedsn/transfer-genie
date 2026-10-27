import UIKit
import WebKit

enum MobileAccessibility {
  static func textScale(for category: UIContentSizeCategory) -> CGFloat {
    let traits = UITraitCollection(preferredContentSizeCategory: category)
    return UIFont.preferredFont(forTextStyle: .body, compatibleWith: traits).pointSize / 17
  }

  static func script(
    category: UIContentSizeCategory,
    reduceMotion: Bool
  ) -> String {
    let scale = textScale(for: category)
    return """
      (() => {
        const root = document.documentElement;
        if (!root) return;
        root.style.setProperty('--mobile-text-scale', '\(scale)');
        root.dataset.mobileAccessibilityText = '\(category.isAccessibilityCategory)';
        root.dataset.mobileReducedMotion = '\(reduceMotion)';
      })();
      """
  }

  static func currentScript() -> String {
    script(
      category: UIApplication.shared.preferredContentSizeCategory,
      reduceMotion: UIAccessibility.isReduceMotionEnabled
    )
  }
}
