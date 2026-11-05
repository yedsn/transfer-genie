import XCTest
import Foundation

final class MobileShareInboxTests: XCTestCase {
    private var temporaryDirectories: [URL] = []

    override func tearDown() {
        for directory in temporaryDirectories {
            try? FileManager.default.removeItem(at: directory)
        }
        temporaryDirectories.removeAll()
        super.tearDown()
    }

    func testManifestRequiresSupportedSchemaAndCanonicalBatchAndFileIds() throws {
        let inbox = try temporaryDirectory().appendingPathComponent("Inbox", isDirectory: true)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)

        let unsupported = try makeBatch(inbox: inbox, version: 99)
        XCTAssertThrowsError(try MobileShareInbox.loadBatch(at: unsupported.directoryURL)) { error in
            XCTAssertEqual(error as? MobileShareInboxError, .unsupportedManifestVersion(99))
        }

        let valid = try makeBatch(inbox: inbox)
        let forged = valid.directoryURL.deletingLastPathComponent()
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.moveItem(at: valid.directoryURL, to: forged)
        XCTAssertThrowsError(try MobileShareInbox.loadBatch(at: forged, expectedBatchId: valid.batchId)) { error in
            XCTAssertEqual(error as? MobileShareInboxError, .invalidBatchId)
        }
        XCTAssertFalse(MobileShareInbox.validBatchId("../../escape"))
    }

    func testSafeNamesAreDeterministicAndRejectTraversal() throws {
        XCTAssertEqual(
            try MobileShareInbox.safeImportName(index: 1, originalName: "Report.PDF", fileExtension: "txt"),
            "01-Report.pdf"
        )
        XCTAssertEqual(
            try MobileShareInbox.safeImportName(index: 2, originalName: "../Report.PDF", fileExtension: "txt"),
            "02-Report.pdf"
        )
        XCTAssertEqual(
            try MobileShareInbox.safeImportName(index: 1, originalName: "same.txt", fileExtension: nil),
            "01-same.txt"
        )
        XCTAssertEqual(
            try MobileShareInbox.safeImportName(index: 2, originalName: "same.txt", fileExtension: nil),
            "02-same.txt"
        )
        for value in ["", ".", "..", "../escape", "folder/file", "folder\\file", "nul\0name"] {
            XCTAssertFalse(MobileShareInbox.isValidImportName(value), value)
        }
        XCTAssertThrowsError(try MobileShareInbox.safeImportName(index: 0, originalName: "file.txt", fileExtension: nil))
    }

    func testBuilderSurvivesSourceRemovalAndDoesNotExposePartialBatch() throws {
        let root = try temporaryDirectory()
        let inbox = root.appendingPathComponent("Inbox", isDirectory: true)
        let source = root.appendingPathComponent("source.jpg")
        let bytes = Data("durable image bytes".utf8)
        try bytes.write(to: source)

        let builder = try MobileShareBatchBuilder(inboxRoot: inbox)
        _ = try builder.addFile(sourceURL: source, originalName: "photo.jpg", fileExtension: "jpg", contentType: "public.jpeg")
        XCTAssertTrue(try MobileShareInbox.listReadyBatches(inboxRoot: inbox).isEmpty)
        try FileManager.default.removeItem(at: source)

        let batch = try builder.commit()
        XCTAssertEqual(try MobileShareInbox.listReadyBatches(inboxRoot: inbox).map(\.batchId), [batch.batchId])
        let loaded = try MobileShareInbox.loadBatch(at: batch.directoryURL)
        XCTAssertEqual(loaded.files.count, 1)
        XCTAssertEqual(try Data(contentsOf: loaded.directoryURL.appendingPathComponent("files/01-photo.jpg")), bytes)
    }

    func testCleanupRemovesOnlyOldPartialDirectories() throws {
        let inbox = try temporaryDirectory()
        let fileManager = FileManager.default
        let oldPartial = inbox.appendingPathComponent("\(UUID().uuidString).partial", isDirectory: true)
        let newPartial = inbox.appendingPathComponent("\(UUID().uuidString).partial", isDirectory: true)
        try fileManager.createDirectory(at: oldPartial, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: newPartial, withIntermediateDirectories: true)
        try fileManager.setAttributes([.modificationDate: Date(timeIntervalSince1970: 100)], ofItemAtPath: oldPartial.path)

        let completed = try makeBatch(inbox: inbox)
        MobileShareInbox.cleanupPartialBatches(
            inboxRoot: inbox,
            olderThan: 60,
            now: Date(timeIntervalSince1970: 1_000)
        )
        XCTAssertFalse(fileManager.fileExists(atPath: oldPartial.path))
        XCTAssertTrue(fileManager.fileExists(atPath: newPartial.path))
        XCTAssertTrue(fileManager.fileExists(atPath: completed.directoryURL.path))
    }

    func testStagingIsIdempotentAndReusesDeterministicPaths() throws {
        let root = try temporaryDirectory()
        let inbox = root.appendingPathComponent("Inbox", isDirectory: true)
        let imports = root.appendingPathComponent("Imports", isDirectory: true)
        try FileManager.default.createDirectory(at: imports, withIntermediateDirectories: true)
        let batch = try makeBatch(inbox: inbox, files: [("01-report.pdf", Data("report".utf8))])

        let first = try MobileShareInbox.stage(batch: batch, importsRoot: imports)
        XCTAssertTrue(first.complete)
        XCTAssertEqual(first.files.map(\.importName), ["01-report.pdf"])
        XCTAssertEqual(first.files.first?.path.path, imports.appendingPathComponent("\(batch.batchId)/01-report.pdf").path)
        let second = try MobileShareInbox.stage(batch: batch, importsRoot: imports)
        XCTAssertEqual(second.files.map(\.path), first.files.map(\.path))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: imports.appendingPathComponent(batch.batchId).path).count, 1)

        try FileManager.default.removeItem(at: first.files[0].path)
        let retried = try MobileShareInbox.stage(batch: batch, importsRoot: imports)
        XCTAssertEqual(retried.files.map(\.path), first.files.map(\.path))
    }

    #if os(iOS)
    func testStagingRejectsSymlinkEscapeAndKeepsBatchAvailableForRetry() throws {
        let root = try temporaryDirectory()
        let inbox = root.appendingPathComponent("Inbox", isDirectory: true)
        let imports = root.appendingPathComponent("Imports", isDirectory: true)
        let outside = root.appendingPathComponent("outside.txt")
        try Data("outside".utf8).write(to: outside)
        try FileManager.default.createDirectory(at: imports, withIntermediateDirectories: true)

        let batch = try makeBatch(inbox: inbox, files: [("01-escape.txt", Data("manifest".utf8))])
        let escaped = batch.directoryURL.appendingPathComponent("files/01-escape.txt")
        try FileManager.default.removeItem(at: escaped)
        try FileManager.default.createSymbolicLink(at: escaped, withDestinationURL: outside)

        let result = try MobileShareInbox.stage(batch: batch, importsRoot: imports)
        XCTAssertFalse(result.complete)
        XCTAssertEqual(result.failures.first?.code, "FILE_UNAVAILABLE")
        XCTAssertTrue(FileManager.default.fileExists(atPath: batch.directoryURL.path), "a failed import must retain the inbox batch")
    }
    #endif

    func testDuplicateImportNamesAreRejected() throws {
        let inbox = try temporaryDirectory()
        let batchId = UUID().uuidString
        let directory = inbox.appendingPathComponent(batchId, isDirectory: true)
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("files"), withIntermediateDirectories: true)
        try Data("one".utf8).write(to: directory.appendingPathComponent("files/01-same.txt"))
        let manifest = MobileShareManifest(version: 1, batchId: batchId, createdAtMs: 1, files: [
            MobileShareManifestFile(fileId: UUID().uuidString, importName: "01-same.txt", originalName: "same.txt", contentType: "public.text", sizeBytes: 3),
            MobileShareManifestFile(fileId: UUID().uuidString, importName: "01-same.txt", originalName: "same.txt", contentType: "public.text", sizeBytes: 3),
        ])
        try JSONEncoder().encode(manifest).write(to: directory.appendingPathComponent("manifest.json"))

        XCTAssertThrowsError(try MobileShareInbox.loadBatch(at: directory)) { error in
            XCTAssertEqual(error as? MobileShareInboxError, .duplicateFile("01-same.txt"))
        }
    }

    private func temporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("transfer-genie-share-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        temporaryDirectories.append(directory)
        return directory
    }

    private func makeBatch(
        inbox: URL,
        version: Int = 1,
        files: [(String, Data)] = [("01-photo.jpg", Data("photo".utf8))]
    ) throws -> MobileShareBatch {
        let batchId = UUID().uuidString
        let directory = inbox.appendingPathComponent(batchId, isDirectory: true)
        let filesDirectory = directory.appendingPathComponent("files", isDirectory: true)
        try FileManager.default.createDirectory(at: filesDirectory, withIntermediateDirectories: true)
        var manifestFiles: [MobileShareManifestFile] = []
        for (index, file) in files.enumerated() {
            try file.1.write(to: filesDirectory.appendingPathComponent(file.0))
            manifestFiles.append(MobileShareManifestFile(
                fileId: UUID().uuidString,
                importName: file.0,
                originalName: "original-\(index + 1)-\(file.0)",
                contentType: file.0.hasSuffix(".jpg") ? "public.jpeg" : "public.data",
                sizeBytes: Int64(file.1.count)
            ))
        }
        let manifest = MobileShareManifest(version: version, batchId: batchId, createdAtMs: 1, files: manifestFiles)
        try JSONEncoder().encode(manifest).write(to: directory.appendingPathComponent("manifest.json"))
        return MobileShareBatch(directoryURL: directory, manifest: manifest)
    }
}
