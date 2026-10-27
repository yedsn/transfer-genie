import Foundation
import Tauri
import UniformTypeIdentifiers
import UIKit

final class SelectDocumentsArgs: Decodable {
  let allowsMultipleSelection: Bool?
}

final class DocumentPickerCoordinator: NSObject, UIDocumentPickerDelegate {
  let id = UUID()

  private weak var plugin: MobileIntegrationPlugin?
  private let reply: MobileInvocation
  private let allowsMultipleSelection: Bool

  init(
    plugin: MobileIntegrationPlugin,
    reply: MobileInvocation,
    allowsMultipleSelection: Bool
  ) {
    self.plugin = plugin
    self.reply = reply
    self.allowsMultipleSelection = allowsMultipleSelection
  }

  func present(from presenter: UIViewController) {
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [.item],
      asCopy: false
    )
    picker.allowsMultipleSelection = allowsMultipleSelection
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    reply.cancel()
    finish()
  }

  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard !urls.isEmpty else {
      reply.cancel()
      finish()
      return
    }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      do {
        let items = try Self.copySelections(urls)
        DispatchQueue.main.async {
          self.reply.resolve(["items": items])
          self.finish()
        }
      } catch let error as MobileIntegrationError {
        DispatchQueue.main.async {
          self.reply.reject(error)
          self.finish()
        }
      } catch {
        DispatchQueue.main.async {
          self.reply.reject(MobileIntegrationError(
            code: .copyFailed,
            message: "Failed to copy the selected document into the app sandbox: \(error.localizedDescription)"
          ))
          self.finish()
        }
      }
    }
  }

  static func copySelections(_ sources: [URL]) throws -> [JsonObject] {
    var items: [JsonObject] = []
    do {
      for source in sources {
        items.append(try copyIntoSandbox(source))
      }
      return items
    } catch {
      MobileImportBatch.discard(items)
      throw error
    }
  }

  static func copyIntoSandbox(_ source: URL) throws -> JsonObject {
    let gainedAccess = source.startAccessingSecurityScopedResource()
    defer {
      if gainedAccess { source.stopAccessingSecurityScopedResource() }
    }

    let destination = try importDestination(for: source)
    var imported = false
    defer {
      if !imported {
        try? FileManager.default.removeItem(at: destination.deletingLastPathComponent())
      }
    }
    try MobileImportTestHooks.checkWritableStorage()
    let coordinator = NSFileCoordinator()
    var coordinationError: NSError?
    var copyError: Error?
    coordinator.coordinate(
      readingItemAt: source,
      options: .withoutChanges,
      error: &coordinationError
    ) { readableURL in
      do {
        try FileManager.default.copyItem(at: readableURL, to: destination)
      } catch {
        copyError = error
      }
    }

    if let error = coordinationError ?? copyError as NSError? {
      throw MobileIntegrationError(
        code: .resourceUnavailable,
        message: "The selected document could not be read: \(error.localizedDescription)"
      )
    }
    let values = try destination.resourceValues(forKeys: [.contentTypeKey, .fileSizeKey])
    imported = true
    return [
      "path": destination.path,
      "originalName": source.lastPathComponent,
      "contentType": values.contentType?.preferredMIMEType as Any,
      "sizeBytes": values.fileSize ?? 0,
    ]
  }

  private static func importDestination(for source: URL) throws -> URL {
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

    let selectionDirectory = importDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try fileManager.createDirectory(at: selectionDirectory, withIntermediateDirectories: true)
    return selectionDirectory.appendingPathComponent(source.lastPathComponent)
  }

  private func finish() {
    plugin?.releaseDocumentPicker(id)
  }
}
