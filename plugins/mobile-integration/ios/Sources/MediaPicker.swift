import Foundation
import PhotosUI
import Tauri
import UniformTypeIdentifiers
import UIKit

final class SelectMediaArgs: Decodable {
  let selectionLimit: Int?
}

final class MediaPickerCoordinator: NSObject, PHPickerViewControllerDelegate {
  let id = UUID()

  private weak var plugin: MobileIntegrationPlugin?
  private let reply: MobileInvocation
  private let selectionLimit: Int

  init(plugin: MobileIntegrationPlugin, reply: MobileInvocation, selectionLimit: Int?) {
    self.plugin = plugin
    self.reply = reply
    self.selectionLimit = min(max(selectionLimit ?? 10, 1), 50)
  }

  func present(from presenter: UIViewController) {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.filter = .any(of: [.images, .videos])
    configuration.preferredAssetRepresentationMode = .current
    configuration.selectionLimit = selectionLimit

    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)

    guard !results.isEmpty else {
      reply.cancel()
      finish()
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var selected = Array<JsonObject?>(repeating: nil, count: results.count)
    var firstError: MobileIntegrationError?

    for (index, result) in results.enumerated() {
      group.enter()
      copySelection(result.itemProvider) { outcome in
        lock.lock()
        switch outcome {
        case .success(let item):
          selected[index] = item
        case .failure(let error):
          if firstError == nil { firstError = error }
        }
        lock.unlock()
        group.leave()
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self else { return }
      switch MobileImportBatch.finish(selected.compactMap { $0 }, error: firstError) {
      case .failure(let error):
        self.reply.reject(error)
      case .success(let items):
        self.reply.resolve(["items": items])
      }
      self.finish()
    }
  }

  private func copySelection(
    _ provider: NSItemProvider,
    completion: @escaping (Result<JsonObject, MobileIntegrationError>) -> Void
  ) {
    guard let typeIdentifier = supportedTypeIdentifier(for: provider),
          let contentType = UTType(typeIdentifier) else {
      completion(.failure(MobileIntegrationError(
        code: .unavailable,
        message: "The selected Photos item has an unsupported media type."
      )))
      return
    }

    provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
      guard error == nil, let url else {
        completion(.failure(MobileIntegrationError(
          code: .resourceUnavailable,
          message: error?.localizedDescription
            ?? "The selected Photos item could not be downloaded from iCloud."
        )))
        return
      }

      var copiedURL: URL?
      do {
        let originalName = provider.suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let destination = try Self.copyIntoSandbox(
          source: url,
          originalName: originalName,
          contentType: contentType
        )
        copiedURL = destination
        let values = try destination.resourceValues(forKeys: [.fileSizeKey])
        completion(.success([
          "path": destination.path,
          "originalName": destination.lastPathComponent,
          "mediaType": contentType.conforms(to: .movie) ? "video" : "image",
          "contentType": contentType.preferredMIMEType as Any,
          "sizeBytes": values.fileSize ?? 0,
        ]))
      } catch let error as MobileIntegrationError {
        if let copiedURL { MobileImportBatch.discard([["path": copiedURL.path]]) }
        completion(.failure(error))
      } catch {
        if let copiedURL { MobileImportBatch.discard([["path": copiedURL.path]]) }
        completion(.failure(MobileIntegrationError(
          code: .copyFailed,
          message: "Failed to copy the selected Photos item into the app sandbox: \(error.localizedDescription)"
        )))
      }
    }
  }

  private func supportedTypeIdentifier(for provider: NSItemProvider) -> String? {
    provider.registeredTypeIdentifiers.first { identifier in
      guard let type = UTType(identifier) else { return false }
      return type.conforms(to: .image) || type.conforms(to: .movie)
    }
  }

  static func copyIntoSandbox(
    source: URL,
    originalName: String?,
    contentType: UTType
  ) throws -> URL {
    let fileManager = FileManager.default
    let baseDirectory = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let importDirectory = baseDirectory
      .appendingPathComponent("TransferGenie", isDirectory: true)
      .appendingPathComponent("MobileImports", isDirectory: true)
    try fileManager.createDirectory(
      at: importDirectory,
      withIntermediateDirectories: true
    )

    let suppliedExtension = originalName.map { URL(fileURLWithPath: $0).pathExtension } ?? ""
    let sourceExtension = source.pathExtension
    let fileExtension = [suppliedExtension, sourceExtension, contentType.preferredFilenameExtension ?? ""]
      .first { !$0.isEmpty } ?? "bin"
    // Keep the user-visible basename: Rust sends the name from this sandbox path.
    // A unique directory isolates two selections with the same original filename.
    let rawName = originalName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let basename = URL(fileURLWithPath: rawName.flatMap { $0.isEmpty ? nil : $0 } ?? source.lastPathComponent).lastPathComponent
    let filename = URL(fileURLWithPath: basename).pathExtension.isEmpty
      ? basename + "." + fileExtension : basename
    let selectionDirectory = importDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try fileManager.createDirectory(at: selectionDirectory, withIntermediateDirectories: true)
    let destination = selectionDirectory.appendingPathComponent(filename)
    var imported = false
    defer {
      if !imported { try? fileManager.removeItem(at: selectionDirectory) }
    }
    try MobileImportTestHooks.checkWritableStorage()
    try fileManager.copyItem(at: source, to: destination)
    imported = true
    return destination
  }

  private func finish() {
    plugin?.releaseMediaPicker(id)
  }
}
