import XCTest
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import Tauri
import UniformTypeIdentifiers
import UIKit
@testable import tauri_plugin_mobile_integration

final class MobileIntegrationPluginTests: XCTestCase {
    func testPluginCanBeCreated() throws {
        let plugin = MobileIntegrationPlugin()
        XCTAssertNotNil(plugin)
    }

    func testLifecycleNotificationsMapToStablePluginStates() throws {
        XCTAssertEqual(
            mobileLifecycleState(for: UIApplication.didEnterBackgroundNotification),
            "background"
        )
        XCTAssertEqual(
            mobileLifecycleState(for: UIApplication.didBecomeActiveNotification),
            "foreground"
        )
        XCTAssertNil(mobileLifecycleState(for: UIApplication.didReceiveMemoryWarningNotification))
    }

    func testTopViewControllerFollowsNavigationController() throws {
        let root = UIViewController()
        let navigation = UINavigationController(rootViewController: root)
        let visible = UIViewController()
        navigation.pushViewController(visible, animated: false)

        XCTAssertTrue(ActiveScenePresenter.topViewController(from: navigation) === visible)
    }

    func testInvocationOnlyResolvesOnce() throws {
        var successCount = 0
        var errorCount = 0
        let invoke = Invoke(
            command: "test",
            callback: 1,
            error: 2,
            sendResponse: { callback, _ in
                if callback == 1 { successCount += 1 }
                if callback == 2 { errorCount += 1 }
            },
            sendChannelData: { _, _ in },
            data: "{}"
        )
        let reply = MobileInvocation(invoke)

        reply.resolve(["ok": true])
        reply.cancel()

        XCTAssertEqual(successCount, 1)
        XCTAssertEqual(errorCount, 0)
    }

    func testCancellationUsesStructuredErrorCode() throws {
        var errorPayload = ""
        let invoke = Invoke(
            command: "test",
            callback: 1,
            error: 2,
            sendResponse: { callback, payload in
                if callback == 2 { errorPayload = payload ?? "" }
            },
            sendChannelData: { _, _ in },
            data: "{}"
        )

        MobileInvocation(invoke).cancel()

        XCTAssertTrue(errorPayload.contains("CANCELLED"))
    }

    func testLocalFileValidatorRejectsMissingFile() throws {
        XCTAssertThrowsError(try LocalFileValidator.url(for: "/tmp/transfer-genie-missing-file")) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .invalidPath)
        }
    }

    func testLocalFileValidatorAcceptsExistingFile() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("transfer-genie-plugin-test-\(UUID().uuidString).txt")
        try Data("ok".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        XCTAssertEqual(try LocalFileValidator.url(for: url.path), url.standardizedFileURL)
    }

    func testPresenterLookupRequiresMainThread() throws {
        let expectation = expectation(description: "background presenter lookup")
        DispatchQueue.global().async {
            XCTAssertNil(ActiveScenePresenter.current())
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 2)
    }

    func testImageThumbnailBoundsLargeJPEGAndAppliesOrientation() throws {
        let source = try makeImageFile(
            type: .jpeg,
            width: 2400,
            height: 1200,
            properties: [kCGImagePropertyOrientation: 6]
        )
        defer { try? FileManager.default.removeItem(at: source) }

        let thumbnail = try makeThumbnail(source: source, maxPixelSize: 320)
        defer { try? FileManager.default.removeItem(at: thumbnail.url) }

        XCTAssertEqual(max(thumbnail.width, thumbnail.height), 320)
        XCTAssertEqual(thumbnail.width, 160)
        XCTAssertEqual(thumbnail.height, 320)
        XCTAssertEqual(try imageType(at: thumbnail.url), UTType.jpeg.identifier)
    }

    func testImageThumbnailSupportsPNG() throws {
        try assertThumbnailCanBeGenerated(type: .png)
    }

    func testImageThumbnailSupportsHEIC() throws {
        try assertThumbnailCanBeGenerated(type: .heic)
    }

    func testImageThumbnailSupportsGIF() throws {
        try assertThumbnailCanBeGenerated(type: .gif)
    }

    func testImageThumbnailRejectsCorruptImage() throws {
        let source = temporaryURL(extension: "jpg")
        try Data([0xff, 0xd8, 0xff, 0x00]).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        XCTAssertThrowsError(try makeThumbnail(source: source)) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .previewGenerationFailed)
        }
    }

    func testImageThumbnailRejectsUnsupportedFile() throws {
        let source = temporaryURL(extension: "txt")
        try Data("not an image".utf8).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        XCTAssertThrowsError(try makeThumbnail(source: source)) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .previewGenerationFailed)
        }
    }

    func testVideoPosterSupportsPortraitMOVPreferredTransform() throws {
        let source = try makeVideoFile(
            fileType: .mov,
            fileExtension: "mov",
            width: 320,
            height: 180,
            duration: 1,
            transform: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 180, ty: 0)
        )
        defer { try? FileManager.default.removeItem(at: source) }

        let poster = try awaitPoster(source: source, maxPixelSize: 160)
        defer { try? FileManager.default.removeItem(at: poster.url) }

        XCTAssertLessThan(poster.width, poster.height)
        XCTAssertLessThanOrEqual(max(poster.width, poster.height), 160)
    }

    func testVideoPosterSupportsLandscapeMP4() throws {
        let source = try makeVideoFile(
            fileType: .mp4,
            fileExtension: "mp4",
            width: 320,
            height: 180,
            duration: 1
        )
        defer { try? FileManager.default.removeItem(at: source) }

        let poster = try awaitPoster(source: source, maxPixelSize: 160)
        defer { try? FileManager.default.removeItem(at: poster.url) }

        XCTAssertGreaterThan(poster.width, poster.height)
        XCTAssertLessThanOrEqual(max(poster.width, poster.height), 160)
    }

    func testVideoPosterSupportsShortVideo() throws {
        let source = try makeVideoFile(
            fileType: .mov,
            fileExtension: "mov",
            width: 160,
            height: 90,
            duration: 0.2
        )
        defer { try? FileManager.default.removeItem(at: source) }

        let poster = try awaitPoster(source: source, maxPixelSize: 120)
        defer { try? FileManager.default.removeItem(at: poster.url) }
        XCTAssertGreaterThan(poster.sizeBytes, 0)
    }

    func testVideoPosterRejectsCorruptVideo() throws {
        let source = temporaryURL(extension: "mp4")
        try Data([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        XCTAssertThrowsError(try awaitPoster(source: source)) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .previewGenerationFailed)
        }
    }

    func testVideoPosterRejectsUnsupportedContainer() throws {
        let source = temporaryURL(extension: "mkv")
        try Data("unsupported video codec fixture".utf8).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        XCTAssertThrowsError(try awaitPoster(source: source)) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .previewGenerationFailed)
        }
    }

    func testVideoPosterCanBeCancelled() throws {
        let source = try makeVideoFile(
            fileType: .mov,
            fileExtension: "mov",
            width: 320,
            height: 180,
            duration: 1
        )
        defer { try? FileManager.default.removeItem(at: source) }
        let completion = expectation(description: "cancelled poster")
        var result: Result<GeneratedImageThumbnail, MobileIntegrationError>?
        let request = try VideoPosterRequest(
            sourceURL: source,
            maxPixelSize: 160,
            timeout: 5,
            destinationDirectory: FileManager.default.temporaryDirectory
        ) { value in
            result = value
            completion.fulfill()
        }

        request.cancel()
        wait(for: [completion], timeout: 2)
        if case .failure(let error) = result {
            XCTAssertEqual(error.code, .cancelled)
        } else {
            XCTFail("Expected cancellation failure")
        }
    }

    func testVideoPosterTimesOut() throws {
        let source = try makeVideoFile(
            fileType: .mov,
            fileExtension: "mov",
            width: 320,
            height: 180,
            duration: 1
        )
        defer { try? FileManager.default.removeItem(at: source) }
        let completion = expectation(description: "timed out poster")
        var result: Result<GeneratedImageThumbnail, MobileIntegrationError>?
        let request = try VideoPosterRequest(
            sourceURL: source,
            maxPixelSize: 160,
            timeout: 0.000_001,
            destinationDirectory: FileManager.default.temporaryDirectory
        ) { value in
            result = value
            completion.fulfill()
        }

        request.start()
        wait(for: [completion], timeout: 2)
        if case .failure(let error) = result {
            XCTAssertEqual(error.code, .timeout)
        } else {
            XCTFail("Expected timeout failure")
        }
    }

    private func assertThumbnailCanBeGenerated(type: UTType) throws {
        let source = try makeImageFile(type: type, width: 640, height: 360)
        defer { try? FileManager.default.removeItem(at: source) }

        let thumbnail = try makeThumbnail(source: source, maxPixelSize: 200)
        defer { try? FileManager.default.removeItem(at: thumbnail.url) }

        XCTAssertLessThanOrEqual(thumbnail.width, 200)
        XCTAssertLessThanOrEqual(thumbnail.height, 200)
        XCTAssertGreaterThan(thumbnail.sizeBytes, 0)
        XCTAssertEqual(try imageType(at: thumbnail.url), UTType.jpeg.identifier)
    }

    private func awaitPoster(
        source: URL,
        maxPixelSize: Int = 200
    ) throws -> GeneratedImageThumbnail {
        var completion: XCTestExpectation?
        var result: Result<GeneratedImageThumbnail, MobileIntegrationError>?
        let request = try VideoPosterRequest(
            sourceURL: source,
            maxPixelSize: maxPixelSize,
            timeout: 5,
            destinationDirectory: FileManager.default.temporaryDirectory
        ) { value in
            result = value
            completion?.fulfill()
        }
        let posterExpectation = expectation(description: "video poster")
        completion = posterExpectation
        request.start()
        wait(for: [posterExpectation], timeout: 6)
        return try XCTUnwrap(result).get()
    }

    private func makeVideoFile(
        fileType: AVFileType,
        fileExtension: String,
        width: Int,
        height: Int,
        duration: Double,
        transform: CGAffineTransform = .identity
    ) throws -> URL {
        let url = temporaryURL(extension: fileExtension)
        let writer = try AVAssetWriter(outputURL: url, fileType: fileType)
        let input = AVAssetWriterInput(
            mediaType: .video,
            outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
            ]
        )
        input.transform = transform
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
            ]
        )
        XCTAssertTrue(writer.canAdd(input))
        writer.add(input)
        XCTAssertTrue(writer.startWriting())
        writer.startSession(atSourceTime: .zero)

        let frameRate: Int32 = 10
        let frameCount = max(2, Int(ceil(duration * Double(frameRate))))
        for index in 0..<frameCount {
            while !input.isReadyForMoreMediaData { RunLoop.current.run(until: Date().addingTimeInterval(0.001)) }
            var pixelBuffer: CVPixelBuffer?
            let status = CVPixelBufferPoolCreatePixelBuffer(nil, try XCTUnwrap(adaptor.pixelBufferPool), &pixelBuffer)
            XCTAssertEqual(status, kCVReturnSuccess)
            let buffer = try XCTUnwrap(pixelBuffer)
            CVPixelBufferLockBaseAddress(buffer, [])
            if let baseAddress = CVPixelBufferGetBaseAddress(buffer) {
                memset(baseAddress, index % 2 == 0 ? 0x33 : 0x99, CVPixelBufferGetDataSize(buffer))
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            XCTAssertTrue(adaptor.append(
                buffer,
                withPresentationTime: CMTime(value: Int64(index), timescale: frameRate)
            ))
        }

        input.markAsFinished()
        let finished = expectation(description: "video fixture writer")
        writer.finishWriting { finished.fulfill() }
        wait(for: [finished], timeout: 5)
        if writer.status != .completed {
            throw writer.error ?? NSError(domain: "PluginTests", code: 6)
        }
        return url
    }

    private func makeThumbnail(
        source: URL,
        maxPixelSize: Int = 200
    ) throws -> GeneratedImageThumbnail {
        try ImageThumbnailGenerator.generate(
            sourceURL: source,
            maxPixelSize: maxPixelSize,
            destinationDirectory: FileManager.default.temporaryDirectory
        )
    }

    private func makeImageFile(
        type: UTType,
        width: Int,
        height: Int,
        properties: [CFString: Any] = [:]
    ) throws -> URL {
        let bytesPerRow = width * 4
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw NSError(domain: "PluginTests", code: 1)
        }
        context.setFillColor(UIColor.systemBlue.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        guard let image = context.makeImage() else {
            throw NSError(domain: "PluginTests", code: 2)
        }

        let url = temporaryURL(extension: type.preferredFilenameExtension ?? "img")
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            type.identifier as CFString,
            1,
            nil
        ) else {
            throw NSError(domain: "PluginTests", code: 3)
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw NSError(domain: "PluginTests", code: 4)
        }
        return url
    }

    private func imageType(at url: URL) throws -> String? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            throw NSError(domain: "PluginTests", code: 5)
        }
        return CGImageSourceGetType(source) as String?
    }

    private func temporaryURL(extension fileExtension: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("transfer-genie-thumbnail-test-\(UUID().uuidString)")
            .appendingPathExtension(fileExtension)
    }
}
