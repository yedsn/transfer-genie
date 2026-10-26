import Foundation
import QuickLook
import Tauri
import UIKit

final class LocalFileArgs: Decodable {
  let path: String
}

enum LocalFileValidator {
  static func url(for path: String) throws -> URL {
    let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw MobileIntegrationError.invalidPath("A local file path is required.")
    }

    let url = URL(fileURLWithPath: trimmed).standardizedFileURL
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
          !isDirectory.boolValue else {
      throw MobileIntegrationError.invalidPath("The local file does not exist or is a directory.")
    }
    return url
  }
}

final class PreviewCoordinator: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  let id = UUID()

  private weak var plugin: MobileIntegrationPlugin?
  private let reply: MobileInvocation
  private let fileURL: URL

  init(plugin: MobileIntegrationPlugin, reply: MobileInvocation, fileURL: URL) {
    self.plugin = plugin
    self.reply = reply
    self.fileURL = fileURL
  }

  func present(from presenter: UIViewController) {
    guard QLPreviewController.canPreview(fileURL as QLPreviewItem) else {
      reply.resolve(["presented": false, "supported": false])
      finish()
      return
    }

    let controller = QLPreviewController()
    controller.dataSource = self
    controller.delegate = self
    presenter.present(controller, animated: true) { [reply] in
      reply.resolve(["presented": true, "supported": true])
    }
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    1
  }

  func previewController(
    _ controller: QLPreviewController,
    previewItemAt index: Int
  ) -> QLPreviewItem {
    fileURL as QLPreviewItem
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    finish()
  }

  private func finish() {
    plugin?.releasePreview(id)
  }
}
