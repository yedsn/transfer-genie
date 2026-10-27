import AVFoundation
import AVKit
import Foundation
import QuickLook
import Tauri
import UIKit
import UniformTypeIdentifiers

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

enum MediaPlaybackSupport {
  static func isMediaFile(_ url: URL) -> Bool {
    guard let type = UTType(filenameExtension: url.pathExtension) else { return false }
    return type.conforms(to: .movie) || type.conforms(to: .audio)
  }

  static func isPlayable(_ url: URL) async -> Bool {
    do {
      return try await AVURLAsset(url: url).load(.isPlayable)
    } catch {
      return false
    }
  }
}

final class PlaybackCoordinator: NSObject, UIAdaptivePresentationControllerDelegate {
  let id = UUID()

  private weak var plugin: MobileIntegrationPlugin?
  private let reply: MobileInvocation
  private let fileURL: URL
  private weak var navigationController: UINavigationController?
  private var player: AVPlayer?

  init(plugin: MobileIntegrationPlugin, reply: MobileInvocation, fileURL: URL) {
    self.plugin = plugin
    self.reply = reply
    self.fileURL = fileURL
  }

  func present(from presenter: UIViewController) {
    Task { [weak self, weak presenter] in
      guard let self else { return }
      guard await MediaPlaybackSupport.isPlayable(fileURL) else {
        await MainActor.run {
          self.reply.resolve(["presented": false, "supported": false])
          self.finish()
        }
        return
      }

      await MainActor.run {
        guard let presenter else {
          self.reply.reject(.noPresenter)
          self.finish()
          return
        }
        let player = AVPlayer(url: self.fileURL)
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = true
        controller.navigationItem.leftBarButtonItem = UIBarButtonItem(
          barButtonSystemItem: .done,
          target: self,
          action: #selector(self.dismissPlayback)
        )
        let navigation = UINavigationController(rootViewController: controller)
        navigation.modalPresentationStyle = .fullScreen
        navigation.presentationController?.delegate = self
        self.navigationController = navigation
        self.player = player
        presenter.present(navigation, animated: true) {
          player.play()
          self.reply.resolve(["presented": true, "supported": true])
        }
      }
    }
  }

  @objc private func dismissPlayback() {
    player?.pause()
    guard let navigationController else {
      finish()
      return
    }
    navigationController.dismiss(animated: true) { [weak self] in self?.finish() }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    player?.pause()
    finish()
  }

  private func finish() {
    player = nil
    plugin?.releasePlayback(id)
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
    controller.navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .done,
      target: self,
      action: #selector(dismissPreview)
    )
    let navigation = UINavigationController(rootViewController: controller)
    navigation.modalPresentationStyle = .fullScreen
    presenter.present(navigation, animated: true) { [reply] in
      reply.resolve(["presented": true, "supported": true])
    }
  }

  @objc private func dismissPreview() {
    guard let controller = ActiveScenePresenter.current() else {
      finish()
      return
    }
    controller.dismiss(animated: true) { [weak self] in self?.finish() }
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
