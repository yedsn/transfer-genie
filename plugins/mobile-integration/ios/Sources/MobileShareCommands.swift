import Foundation
import Tauri

final class ListSharedImportsArgs: Decodable {}

final class StageSharedImportsArgs: Decodable {
  let batchIds: [String]
}

final class AcknowledgeSharedImportsArgs: Decodable {
  let batchIds: [String]
}

extension MobileIntegrationPlugin {
  @objc public func listSharedImports(_ invoke: Invoke) {
    let reply = MobileInvocation(invoke)
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let inbox = try Self.shareInboxRoot()
        MobileShareInbox.cleanupPartialBatches(inboxRoot: inbox)
        let batches = try MobileShareInbox.listReadyBatches(inboxRoot: inbox)
        reply.resolve(["batches": batches.map(Self.manifestJSON)])
      } catch {
        reply.reject(Self.shareCommandError(error))
      }
    }
  }

  @objc public func stageSharedImports(_ invoke: Invoke) {
    let args: StageSharedImportsArgs
    do {
      args = try invoke.parseArgs(StageSharedImportsArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }
    guard !args.batchIds.isEmpty, args.batchIds.allSatisfy(MobileShareInbox.validBatchId),
          Set(args.batchIds).count == args.batchIds.count else {
      MobileInvocation(invoke).reject(MobileIntegrationError(
        code: .invalidArguments,
        message: "A non-empty list of unique share batch IDs is required."
      ))
      return
    }

    let reply = MobileInvocation(invoke)
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let inbox = try Self.shareInboxRoot()
        let imports = try Self.mobileImportsRoot()
        var results: [MobileShareStageResult] = []
        for batchId in args.batchIds {
          let directory = inbox.appendingPathComponent(batchId, isDirectory: true)
          guard FileManager.default.fileExists(atPath: directory.path) else {
            throw MobileShareInboxError.invalidBatchId
          }
          let batch = try MobileShareInbox.loadBatch(at: directory, expectedBatchId: batchId)
          results.append(try MobileShareInbox.stage(batch: batch, importsRoot: imports))
        }
        reply.resolve(["batches": results.map(Self.stageJSON)])
      } catch {
        reply.reject(Self.shareCommandError(error))
      }
    }
  }

  @objc public func acknowledgeSharedImports(_ invoke: Invoke) {
    let args: AcknowledgeSharedImportsArgs
    do {
      args = try invoke.parseArgs(AcknowledgeSharedImportsArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }
    guard args.batchIds.allSatisfy(MobileShareInbox.validBatchId),
          Set(args.batchIds).count == args.batchIds.count else {
      MobileInvocation(invoke).reject(MobileIntegrationError(
        code: .invalidArguments,
        message: "Share batch IDs must be unique UUIDs."
      ))
      return
    }

    let reply = MobileInvocation(invoke)
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let inbox = try Self.shareInboxRoot()
        var acknowledged: [String] = []
        for batchId in args.batchIds {
          let directory = inbox.appendingPathComponent(batchId, isDirectory: true)
          if FileManager.default.fileExists(atPath: directory.path) {
            _ = try MobileShareInbox.loadBatch(at: directory, expectedBatchId: batchId)
            try FileManager.default.removeItem(at: directory)
          }
          acknowledged.append(batchId)
        }
        reply.resolve(["acknowledgedBatchIds": acknowledged])
      } catch {
        reply.reject(Self.shareCommandError(error))
      }
    }
  }

  private static func shareInboxRoot() throws -> URL {
    guard let container = MobileShareInbox.containerURL() else {
      throw MobileShareInboxError.appGroupUnavailable
    }
    return try MobileShareInbox.ensureInboxRoot(
      MobileShareInbox.inboxRoot(containerURL: container)
    )
  }

  private static func mobileImportsRoot() throws -> URL {
    let support = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let root = support.appendingPathComponent("TransferGenie/MobileImports", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  private static func shareCommandError(_ error: Error) -> MobileIntegrationError {
    guard let error = error as? MobileShareInboxError else {
      return MobileIntegrationError(code: .invalidArguments, message: error.localizedDescription)
    }
    let code: MobileIntegrationErrorCode
    switch error {
    case .appGroupUnavailable:
      code = .unavailable
    case .fileUnavailable:
      code = .resourceUnavailable
    case .copyFailed:
      code = .copyFailed
    default:
      code = .invalidArguments
    }
    return MobileIntegrationError(code: code, message: error.errorDescription ?? "Share import failed.")
  }

  private static func manifestJSON(_ batch: MobileShareBatch) -> JsonObject {
    [
      "batchId": batch.batchId,
      "createdAtMs": batch.manifest.createdAtMs,
      "files": batch.files.map(fileJSON),
    ]
  }

  private static func fileJSON(_ file: MobileShareManifestFile) -> JsonObject {
    [
      "fileId": file.fileId,
      "importName": file.importName,
      "originalName": file.originalName,
      "contentType": file.contentType as Any,
      "sizeBytes": file.sizeBytes,
    ]
  }

  private static func stageJSON(_ result: MobileShareStageResult) -> JsonObject {
    [
      "batchId": result.batchId,
      "createdAtMs": result.createdAtMs,
      "complete": result.complete,
      "files": result.files.map { file in
        [
          "fileId": file.fileId,
          "path": file.path.path,
          "importName": file.importName,
          "originalName": file.originalName,
          "contentType": file.contentType as Any,
          "sizeBytes": file.sizeBytes,
        ]
      },
      "failures": result.failures.map { failure in
        [
          "fileId": failure.fileId,
          "importName": failure.importName,
          "code": failure.code,
          "message": failure.message,
        ]
      },
    ]
  }
}
