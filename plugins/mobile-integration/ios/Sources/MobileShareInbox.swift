import Foundation

enum MobileShareInboxError: LocalizedError, Equatable {
  case appGroupUnavailable
  case invalidBatchId
  case invalidManifest
  case unsupportedManifestVersion(Int)
  case emptyBatch
  case tooManyFiles(Int)
  case invalidFileName(String)
  case duplicateFile(String)
  case fileUnavailable(String)
  case sizeMismatch(String)
  case copyFailed(String)

  var errorDescription: String? {
    switch self {
    case .appGroupUnavailable:
      return "无法访问 Transfer Genie 的共享收件箱。"
    case .invalidBatchId:
      return "分享批次标识无效。"
    case .invalidManifest:
      return "分享批次的清单无法读取。"
    case .unsupportedManifestVersion(let version):
      return "分享批次版本 \(version) 不受支持。"
    case .emptyBatch:
      return "分享批次中没有文件。"
    case .tooManyFiles(let count):
      return "一次最多分享 10 项内容，当前为 \(count) 项。"
    case .invalidFileName(let name):
      return "分享批次包含无效文件名：\(name)"
    case .duplicateFile(let name):
      return "分享批次包含重复文件：\(name)"
    case .fileUnavailable(let name):
      return "分享文件已不可用：\(name)"
    case .sizeMismatch(let name):
      return "分享文件大小校验失败：\(name)"
    case .copyFailed(let message):
      return "复制分享文件失败：\(message)"
    }
  }
}

struct MobileShareManifestFile: Codable, Equatable {
  let fileId: String
  let importName: String
  let originalName: String
  let contentType: String?
  let sizeBytes: Int64
}

struct MobileShareManifest: Codable, Equatable {
  var version: Int
  var batchId: String
  var createdAtMs: Int64
  var files: [MobileShareManifestFile]
}

struct MobileShareBatch: Equatable {
  let directoryURL: URL
  let manifest: MobileShareManifest

  var batchId: String { manifest.batchId }
  var files: [MobileShareManifestFile] { manifest.files }
}

struct MobileShareImportFailure: Equatable {
  let fileId: String
  let importName: String
  let code: String
  let message: String
}

struct MobileShareStagedFile: Equatable {
  let fileId: String
  let path: URL
  let importName: String
  let originalName: String
  let contentType: String?
  let sizeBytes: Int64
}

struct MobileShareStageResult: Equatable {
  let batchId: String
  let createdAtMs: Int64
  let files: [MobileShareStagedFile]
  let failures: [MobileShareImportFailure]

  var complete: Bool { failures.isEmpty }
}

enum MobileShareInbox {
  static let appGroupIdentifier = "group.com.transfergenie"
  static let inboxDirectoryName = "TransferGenieShareInbox"
  static let manifestFileName = "manifest.json"
  static let filesDirectoryName = "files"
  static let partialSuffix = ".partial"
  static let maximumItemCount = 10
  static let manifestVersion = 1

  static func containerURL(fileManager: FileManager = .default) -> URL? {
    fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
  }

  static func inboxRoot(containerURL: URL) -> URL {
    containerURL.appendingPathComponent(inboxDirectoryName, isDirectory: true)
  }

  static func ensureInboxRoot(_ inboxRoot: URL, fileManager: FileManager = .default) throws -> URL {
    try fileManager.createDirectory(at: inboxRoot, withIntermediateDirectories: true)
    return inboxRoot
  }

  static func listReadyBatches(inboxRoot: URL, fileManager: FileManager = .default) throws -> [MobileShareBatch] {
    guard fileManager.fileExists(atPath: inboxRoot.path) else { return [] }
    let keys: [URLResourceKey] = [.isDirectoryKey, .isSymbolicLinkKey]
    let entries = try fileManager.contentsOfDirectory(
      at: inboxRoot,
      includingPropertiesForKeys: keys,
      options: [.skipsHiddenFiles]
    )

    var batches: [MobileShareBatch] = []
    for entry in entries where !entry.lastPathComponent.hasSuffix(partialSuffix) {
      let values = try entry.resourceValues(forKeys: Set(keys))
      guard values.isDirectory == true,
            values.isSymbolicLink != true,
            validBatchId(entry.lastPathComponent),
            isContained(entry, in: inboxRoot, fileManager: fileManager) else { continue }
      batches.append(try loadBatch(at: entry, expectedBatchId: entry.lastPathComponent))
    }
    return batches.sorted {
      if $0.manifest.createdAtMs == $1.manifest.createdAtMs {
        return $0.batchId < $1.batchId
      }
      return $0.manifest.createdAtMs < $1.manifest.createdAtMs
    }
  }

  static func cleanupPartialBatches(
    inboxRoot: URL,
    olderThan age: TimeInterval = 24 * 60 * 60,
    now: Date = Date(),
    fileManager: FileManager = .default
  ) {
    guard fileManager.fileExists(atPath: inboxRoot.path) else { return }
    let keys: [URLResourceKey] = [.contentModificationDateKey, .isDirectoryKey]
    guard let entries = try? fileManager.contentsOfDirectory(
      at: inboxRoot,
      includingPropertiesForKeys: keys,
      options: [.skipsHiddenFiles]
    ) else { return }

    for entry in entries where entry.lastPathComponent.hasSuffix(partialSuffix) {
      guard let values = try? entry.resourceValues(forKeys: Set(keys)),
            values.isDirectory == true,
            let modified = values.contentModificationDate,
            now.timeIntervalSince(modified) >= age else { continue }
      try? fileManager.removeItem(at: entry)
    }
  }

  static func loadBatch(
    at directoryURL: URL,
    expectedBatchId: String? = nil,
    fileManager: FileManager = .default
  ) throws -> MobileShareBatch {
    let directoryName = directoryURL.lastPathComponent
    let directoryValues = try directoryURL.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard directoryValues.isDirectory == true, directoryValues.isSymbolicLink != true else {
      throw MobileShareInboxError.invalidBatchId
    }
    guard validBatchId(directoryName), expectedBatchId == nil || expectedBatchId == directoryName else {
      throw MobileShareInboxError.invalidBatchId
    }

    let manifestURL = directoryURL.appendingPathComponent(manifestFileName, isDirectory: false)
    let manifestValues = try? manifestURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    guard let manifestValues,
          isContained(manifestURL, in: directoryURL, fileManager: fileManager),
          manifestValues.isRegularFile == true,
          manifestValues.isSymbolicLink != true,
          let data = try? Data(contentsOf: manifestURL),
          let manifest = try? JSONDecoder().decode(MobileShareManifest.self, from: data) else {
      throw MobileShareInboxError.invalidManifest
    }
    guard manifest.version == manifestVersion else {
      throw MobileShareInboxError.unsupportedManifestVersion(manifest.version)
    }
    guard manifest.batchId == directoryName else {
      throw MobileShareInboxError.invalidBatchId
    }
    guard !manifest.files.isEmpty else { throw MobileShareInboxError.emptyBatch }
    guard manifest.files.count <= maximumItemCount else {
      throw MobileShareInboxError.tooManyFiles(manifest.files.count)
    }

    var fileIds = Set<String>()
    var importNames = Set<String>()
    var validatedFiles: [MobileShareManifestFile] = []
    for file in manifest.files {
      guard validBatchId(file.fileId), fileIds.insert(file.fileId).inserted else {
        throw MobileShareInboxError.invalidManifest
      }
      guard isValidImportName(file.importName) else {
        throw MobileShareInboxError.invalidFileName(file.importName)
      }
      guard importNames.insert(file.importName).inserted else {
        throw MobileShareInboxError.duplicateFile(file.importName)
      }
      guard file.sizeBytes >= 0 else { throw MobileShareInboxError.invalidManifest }
      let source = try validatedFileURL(for: file, batchDirectory: directoryURL, fileManager: fileManager)
      guard let size = try? source.resourceValues(forKeys: [.fileSizeKey]).fileSize,
            Int64(size) == file.sizeBytes else {
        throw MobileShareInboxError.sizeMismatch(file.importName)
      }
      validatedFiles.append(file)
    }

    var normalized = manifest
    normalized.files = validatedFiles
    return MobileShareBatch(directoryURL: directoryURL, manifest: normalized)
  }

  static func validatedFileURL(
    for file: MobileShareManifestFile,
    batchDirectory: URL,
    fileManager: FileManager = .default
  ) throws -> URL {
    guard isValidImportName(file.importName) else {
      throw MobileShareInboxError.invalidFileName(file.importName)
    }
    let filesRoot = batchDirectory.appendingPathComponent(filesDirectoryName, isDirectory: true)
    let source = filesRoot.appendingPathComponent(file.importName, isDirectory: false)
    guard isContained(source, in: filesRoot, fileManager: fileManager),
          fileManager.fileExists(atPath: source.path) else {
      throw MobileShareInboxError.fileUnavailable(file.importName)
    }
    return source
  }

  static func safeImportName(
    index: Int,
    originalName: String?,
    fileExtension: String?
  ) throws -> String {
    guard index > 0 else { throw MobileShareInboxError.invalidFileName("0") }
    let raw = originalName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let suppliedURL = URL(fileURLWithPath: raw.isEmpty ? "file" : raw)
    let suppliedExtension = sanitizeExtension(suppliedURL.pathExtension)
    let fallbackExtension = sanitizeExtension(fileExtension ?? "")
    let chosenExtension = suppliedExtension.isEmpty ? fallbackExtension : suppliedExtension

    var stem = suppliedURL.deletingPathExtension().lastPathComponent
    if stem.isEmpty || stem == "." || stem == ".." { stem = "file" }
    stem = sanitizeStem(stem)
    if stem.isEmpty { stem = "file" }
    stem = String(stem.prefix(80))

    let prefix = String(format: "%02d-", min(index, 99))
    return chosenExtension.isEmpty ? prefix + stem : "\(prefix)\(stem).\(chosenExtension)"
  }

  static func stageDestination(
    importsRoot: URL,
    batchId: String,
    importName: String,
    fileManager: FileManager = .default
  ) throws -> URL {
    guard validBatchId(batchId), isValidImportName(importName) else {
      throw MobileShareInboxError.invalidFileName(importName)
    }
    let batchRoot = importsRoot.appendingPathComponent(batchId, isDirectory: true)
    let destination = batchRoot.appendingPathComponent(importName, isDirectory: false)
    guard isContained(destination, in: importsRoot, fileManager: fileManager) else {
      throw MobileShareInboxError.invalidFileName(importName)
    }
    return destination
  }

  static func copyFile(
    from source: URL,
    to destination: URL,
    fileManager: FileManager = .default
  ) throws {
    let securityAccess = source.startAccessingSecurityScopedResource()
    defer {
      if securityAccess { source.stopAccessingSecurityScopedResource() }
    }

    let coordinator = NSFileCoordinator()
    var coordinationError: NSError?
    var operationError: Error?
    coordinator.coordinate(
      readingItemAt: source,
      options: [.withoutChanges],
      error: &coordinationError
    ) { readableURL in
      do {
        try fileManager.copyItem(at: readableURL, to: destination)
      } catch {
        operationError = error
      }
    }
    if let error = coordinationError ?? operationError as NSError? {
      throw MobileShareInboxError.copyFailed(error.localizedDescription)
    }
  }

  static func stage(
    batch: MobileShareBatch,
    importsRoot: URL,
    fileManager: FileManager = .default
  ) throws -> MobileShareStageResult {
    let batchRoot = importsRoot.appendingPathComponent(batch.batchId, isDirectory: true)
    guard isContained(batchRoot, in: importsRoot, fileManager: fileManager) else {
      throw MobileShareInboxError.invalidBatchId
    }
    try fileManager.createDirectory(at: batchRoot, withIntermediateDirectories: true)
    guard isContained(batchRoot, in: importsRoot, fileManager: fileManager) else {
      throw MobileShareInboxError.invalidBatchId
    }

    var staged: [MobileShareStagedFile] = []
    var failures: [MobileShareImportFailure] = []
    for file in batch.files {
      do {
        let source = try validatedFileURL(
          for: file,
          batchDirectory: batch.directoryURL,
          fileManager: fileManager
        )
        let destination = try stageDestination(
          importsRoot: importsRoot,
          batchId: batch.batchId,
          importName: file.importName,
          fileManager: fileManager
        )
        try stageFile(
          source: source,
          destination: destination,
          expectedSize: file.sizeBytes,
          fileManager: fileManager
        )
        staged.append(MobileShareStagedFile(
          fileId: file.fileId,
          path: destination,
          importName: file.importName,
          originalName: file.originalName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes
        ))
      } catch {
        let importedError = error as? MobileShareInboxError
        failures.append(MobileShareImportFailure(
          fileId: file.fileId,
          importName: file.importName,
          code: failureCode(importedError),
          message: importedError?.errorDescription ?? error.localizedDescription
        ))
      }
    }
    return MobileShareStageResult(
      batchId: batch.batchId,
      createdAtMs: batch.manifest.createdAtMs,
      files: staged,
      failures: failures
    )
  }

  private static func stageFile(
    source: URL,
    destination: URL,
    expectedSize: Int64,
    fileManager: FileManager
  ) throws {
    let parent = destination.deletingLastPathComponent()
    try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
    if fileManager.fileExists(atPath: destination.path) {
      let values = try destination.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
      guard values.isSymbolicLink != true, values.isRegularFile == true,
            Int64(values.fileSize ?? -1) == expectedSize else {
        throw MobileShareInboxError.sizeMismatch(destination.lastPathComponent)
      }
      return
    }

    let temporary = parent.appendingPathComponent(
      ".\(destination.lastPathComponent).\(UUID().uuidString).importing",
      isDirectory: false
    )
    defer { try? fileManager.removeItem(at: temporary) }
    try copyFile(from: source, to: temporary, fileManager: fileManager)
    guard let size = try temporary.resourceValues(forKeys: [.fileSizeKey]).fileSize,
          Int64(size) == expectedSize else {
      throw MobileShareInboxError.sizeMismatch(source.lastPathComponent)
    }
    try fileManager.moveItem(at: temporary, to: destination)
  }

  private static func failureCode(_ error: MobileShareInboxError?) -> String {
    guard let error else { return "IMPORT_FAILED" }
    switch error {
    case .invalidBatchId, .invalidManifest, .invalidFileName, .duplicateFile:
      return "INVALID_MANIFEST"
    case .fileUnavailable:
      return "FILE_UNAVAILABLE"
    case .sizeMismatch:
      return "SIZE_MISMATCH"
    case .copyFailed, .appGroupUnavailable:
      return "COPY_FAILED"
    case .unsupportedManifestVersion, .emptyBatch, .tooManyFiles:
      return "IMPORT_FAILED"
    }
  }

  static func validBatchId(_ value: String) -> Bool {
    UUID(uuidString: value) != nil
  }

  static func isValidImportName(_ value: String) -> Bool {
    guard !value.isEmpty, value != ".", value != ".." else { return false }
    guard !value.contains("/"), !value.contains("\\"), !value.contains("\0") else { return false }
    return (value as NSString).lastPathComponent == value
  }

  static func isContained(
    _ candidate: URL,
    in root: URL,
    fileManager: FileManager = .default
  ) -> Bool {
    let rootPath = root.resolvingSymlinksInPath().standardizedFileURL.path
    let candidatePath = candidate.resolvingSymlinksInPath().standardizedFileURL.path
    return candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/")
  }

  private static func sanitizeStem(_ value: String) -> String {
    let forbidden = CharacterSet(charactersIn: "/\\:\0")
      .union(.controlCharacters)
      .union(.newlines)
    let replaced = String(value.unicodeScalars.map { scalar in
      forbidden.contains(scalar) ? "_" : Character(scalar)
    })
    return replaced.trimmingCharacters(in: CharacterSet(charactersIn: ". "))
  }

  private static func sanitizeExtension(_ value: String) -> String {
    let lowered = value.lowercased()
    let allowed = CharacterSet.alphanumerics
    guard lowered.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return "" }
    return String(lowered.prefix(16))
  }
}

// Share intake calls the builder serially and waits for each provider copy before continuing.
final class MobileShareBatchBuilder: @unchecked Sendable {
  let batchId: String
  let inboxRoot: URL
  let partialDirectory: URL

  private let finalDirectory: URL
  private let partialFilesDirectory: URL
  private let fileManager: FileManager
  private var files: [MobileShareManifestFile] = []
  private var didCommit = false

  init(
    inboxRoot: URL,
    batchId: String = UUID().uuidString,
    fileManager: FileManager = .default
  ) throws {
    guard MobileShareInbox.validBatchId(batchId) else {
      throw MobileShareInboxError.invalidBatchId
    }
    self.batchId = batchId
    self.inboxRoot = try MobileShareInbox.ensureInboxRoot(inboxRoot, fileManager: fileManager)
    self.fileManager = fileManager
    self.finalDirectory = inboxRoot.appendingPathComponent(batchId, isDirectory: true)
    self.partialDirectory = inboxRoot.appendingPathComponent(batchId + MobileShareInbox.partialSuffix, isDirectory: true)
    self.partialFilesDirectory = partialDirectory.appendingPathComponent(MobileShareInbox.filesDirectoryName, isDirectory: true)

    guard !fileManager.fileExists(atPath: finalDirectory.path),
          !fileManager.fileExists(atPath: partialDirectory.path) else {
      throw MobileShareInboxError.invalidBatchId
    }
    try fileManager.createDirectory(at: partialFilesDirectory, withIntermediateDirectories: true)
  }

  func addFile(
    sourceURL: URL,
    originalName: String?,
    fileExtension: String?,
    contentType: String?
  ) throws -> MobileShareManifestFile {
    guard files.count < MobileShareInbox.maximumItemCount else {
      throw MobileShareInboxError.tooManyFiles(files.count + 1)
    }
    guard fileManager.fileExists(atPath: sourceURL.path) else {
      throw MobileShareInboxError.fileUnavailable(originalName ?? sourceURL.lastPathComponent)
    }

    let importName = try MobileShareInbox.safeImportName(
      index: files.count + 1,
      originalName: originalName ?? sourceURL.lastPathComponent,
      fileExtension: fileExtension
    )
    let destination = partialFilesDirectory.appendingPathComponent(importName, isDirectory: false)
    try MobileShareInbox.copyFile(from: sourceURL, to: destination, fileManager: fileManager)
    guard let size = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
      throw MobileShareInboxError.fileUnavailable(importName)
    }
    let record = MobileShareManifestFile(
      fileId: UUID().uuidString,
      importName: importName,
      originalName: originalName?.isEmpty == false ? originalName! : sourceURL.lastPathComponent,
      contentType: contentType,
      sizeBytes: Int64(size)
    )
    files.append(record)
    return record
  }

  func commit() throws -> MobileShareBatch {
    guard !files.isEmpty else { throw MobileShareInboxError.emptyBatch }
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    let manifest = MobileShareManifest(
      version: MobileShareInbox.manifestVersion,
      batchId: batchId,
      createdAtMs: now,
      files: files
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(manifest)
    try data.write(to: partialDirectory.appendingPathComponent(MobileShareInbox.manifestFileName), options: .atomic)
    try fileManager.moveItem(at: partialDirectory, to: finalDirectory)
    didCommit = true
    return MobileShareBatch(directoryURL: finalDirectory, manifest: manifest)
  }

  func cancel() {
    guard !didCommit else { return }
    try? fileManager.removeItem(at: partialDirectory)
  }
}
