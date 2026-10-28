import XCTest
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import QuickLook
import Tauri
import UniformTypeIdentifiers
import UIKit
import WebKit
@testable import tauri_plugin_mobile_integration

final class MobileIntegrationPluginTests: XCTestCase {
    func testKeyboardGeometryReservesFloatingAssistantAndIgnoresUndockedKeyboards() {
        let bounds = CGRect(x: 0, y: 0, width: 440, height: 956)
        XCTAssertEqual(MobileKeyboard.visibleHeight(bounds: bounds, keyboardFrame: CGRect(x: 0, y: 620, width: 440, height: 336), clearance: 72), 548)
        XCTAssertEqual(MobileKeyboard.visibleHeight(bounds: bounds, keyboardFrame: CGRect(x: 0, y: 620, width: 440, height: 336), clearance: 0), 620)
        XCTAssertNil(MobileKeyboard.visibleHeight(bounds: bounds, keyboardFrame: CGRect(x: 0, y: 956, width: 440, height: 336), clearance: 72))
        XCTAssertNil(MobileKeyboard.visibleHeight(bounds: bounds, keyboardFrame: CGRect(x: 100, y: 400, width: 250, height: 200), clearance: 72))
        XCTAssertNil(MobileKeyboard.visibleHeight(bounds: bounds, keyboardFrame: CGRect(x: 0, y: 912, width: 440, height: 44), clearance: 72))
        XCTAssertTrue(MobileKeyboard.script(visibleHeight: nil).contains("visibleHeight: null"))
    }
    func testPluginCanBeCreated() throws {
        let plugin = MobileIntegrationPlugin()
        XCTAssertNotNil(plugin)
    }

    func testKeyboardNotificationsUpdateAndClearLoadedWebViewGeometry() {
        let ready = expectation(description: "Keyboard geometry document loaded")
        final class NavigationDelegate: NSObject, WKNavigationDelegate {
            let ready: XCTestExpectation
            init(_ ready: XCTestExpectation) { self.ready = ready }
            func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { ready.fulfill() }
        }
        let webview = WKWebView(frame: CGRect(x: 0, y: 0, width: 440, height: 956))
        let delegate = NavigationDelegate(ready)
        let plugin = MobileIntegrationPlugin()
        webview.navigationDelegate = delegate
        plugin.load(webview: webview)
        webview.loadHTMLString("<p>Keyboard fixture</p>", baseURL: nil)
        wait(for: [ready], timeout: 10)
        let shown = expectation(description: "Native keyboard frame reached WebView")
        NotificationCenter.default.post(name: UIResponder.keyboardWillChangeFrameNotification, object: nil,
            userInfo: [UIResponder.keyboardFrameEndUserInfoKey: CGRect(x: 0, y: 620, width: 440, height: 336)])
        webview.evaluateJavaScript("window.__TRANSFER_GENIE_KEYBOARD_HEIGHT__") { result, error in
            XCTAssertNil(error)
            XCTAssertEqual((result as? NSNumber)?.doubleValue, 548)
            shown.fulfill()
        }
        wait(for: [shown], timeout: 10)
        let hidden = expectation(description: "Keyboard hide cleared WebView constraint")
        NotificationCenter.default.post(name: UIResponder.keyboardWillHideNotification, object: nil)
        webview.evaluateJavaScript("window.__TRANSFER_GENIE_KEYBOARD_HEIGHT__ === null") { result, error in
            XCTAssertNil(error)
            XCTAssertEqual(result as? Bool, true)
            hidden.fulfill()
        }
        wait(for: [hidden], timeout: 10)
        withExtendedLifetime((plugin, delegate)) {}
    }

    func testAppWebViewDisablesPinchWithoutDisablingScrolling() {
        let webview = WKWebView()
        let plugin = MobileIntegrationPlugin()
        plugin.load(webview: webview)
        // An unattached WebView can have no pinch recognizer yet.
        XCTAssertNotEqual(webview.scrollView.pinchGestureRecognizer?.isEnabled, true)
        XCTAssertTrue(webview.scrollView.isScrollEnabled)
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        XCTAssertNotEqual(webview.scrollView.pinchGestureRecognizer?.isEnabled, true)
        XCTAssertGreaterThan(MobileAccessibility.textScale(for: .accessibilityExtraExtraExtraLarge), 3)
        withExtendedLifetime(plugin) {}
    }

    func testSystemTextScaleCoversStandardAndAccessibilityCategories() {
        XCTAssertEqual(MobileAccessibility.textScale(for: .large), 1, accuracy: 0.001)
        XCTAssertLessThan(MobileAccessibility.textScale(for: .small), 1)
        XCTAssertGreaterThan(MobileAccessibility.textScale(for: .extraExtraExtraLarge), 1)
        XCTAssertGreaterThan(MobileAccessibility.textScale(for: .accessibilityExtraExtraExtraLarge), 3)
    }

    func testAccessibilityScriptScalesActualWebTextAndRestoresPreferences() throws {
        let ready = expectation(description: "Web document loaded")
        let webview = WKWebView()
        final class NavigationDelegate: NSObject, WKNavigationDelegate {
            let ready: XCTestExpectation
            init(_ ready: XCTestExpectation) { self.ready = ready }
            func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { ready.fulfill() }
        }
        let delegate = NavigationDelegate(ready)
        webview.navigationDelegate = delegate
        webview.loadHTMLString("<p style='font-size:calc(15px * var(--mobile-text-scale, 1))'>正文</p>", baseURL: nil)
        wait(for: [ready], timeout: 10)
        for category in [UIContentSizeCategory.large, .accessibilityExtraExtraExtraLarge, .large] {
            let applied = expectation(description: "Applied system settings")
            let expected = 15 * MobileAccessibility.textScale(for: category)
            let reduceMotion = category.isAccessibilityCategory
            webview.evaluateJavaScript(MobileAccessibility.script(category: category, reduceMotion: reduceMotion)) { _, error in
                XCTAssertNil(error)
                webview.evaluateJavaScript("[parseFloat(getComputedStyle(document.querySelector('p')).fontSize), document.documentElement.dataset.mobileReducedMotion, document.documentElement.dataset.mobileAccessibilityText]") { result, error in
                    XCTAssertNil(error)
                    let values = result as? [Any]
                    XCTAssertEqual((values?.first as? NSNumber)?.doubleValue ?? 0, Double(expected), accuracy: 0.01)
                    XCTAssertEqual(values?[1] as? String, String(reduceMotion))
                    XCTAssertEqual(values?[2] as? String, String(category.isAccessibilityCategory))
                    applied.fulfill()
                }
            }
            wait(for: [applied], timeout: 10)
        }
        withExtendedLifetime(delegate) {}
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

    func testSystemPreferenceNotificationsRefreshTheLoadedWebView() {
        let ready = expectation(description: "Loaded document")
        final class NavigationDelegate: NSObject, WKNavigationDelegate {
            let ready: XCTestExpectation
            init(_ ready: XCTestExpectation) { self.ready = ready }
            func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { ready.fulfill() }
        }
        let webview = WKWebView()
        let delegate = NavigationDelegate(ready)
        let plugin = MobileIntegrationPlugin()
        webview.navigationDelegate = delegate
        plugin.load(webview: webview)
        webview.loadHTMLString("<p style='font-size:calc(15px * var(--mobile-text-scale, 1))'>正文</p>", baseURL: nil)
        wait(for: [ready], timeout: 10)
        for notification in [UIContentSizeCategory.didChangeNotification, UIAccessibility.reduceMotionStatusDidChangeNotification, UIApplication.didBecomeActiveNotification] {
            let refreshed = expectation(description: "Notification refresh")
            webview.evaluateJavaScript("document.documentElement.style.setProperty('--mobile-text-scale','0.1'); document.documentElement.dataset.mobileReducedMotion='stale';") { _, error in
                XCTAssertNil(error)
                NotificationCenter.default.post(name: notification, object: nil)
                webview.evaluateJavaScript("[parseFloat(getComputedStyle(document.querySelector('p')).fontSize), document.documentElement.dataset.mobileReducedMotion]") { result, error in
                    XCTAssertNil(error)
                    let values = result as? [Any]
                    let expected = 15 * MobileAccessibility.textScale(for: UIApplication.shared.preferredContentSizeCategory)
                    XCTAssertEqual((values?.first as? NSNumber)?.doubleValue ?? 0, Double(expected), accuracy: 0.01)
                    XCTAssertEqual(values?[1] as? String, String(UIAccessibility.isReduceMotionEnabled))
                    refreshed.fulfill()
                }
            }
            wait(for: [refreshed], timeout: 10)
        }
        withExtendedLifetime((plugin, delegate)) {}
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

    func testMediaPlaybackRoutingRecognizesSystemMediaTypes() throws {
        XCTAssertTrue(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.mp4")))
        XCTAssertTrue(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.mov")))
        XCTAssertTrue(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.m4a")))
        XCTAssertFalse(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.jpg")))
        XCTAssertFalse(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.pdf")))
        XCTAssertFalse(MediaPlaybackSupport.isMediaFile(URL(fileURLWithPath: "/tmp/sample.txt")))
    }

    func testQuickLookSupportsRepresentativeDocumentsAndRejectsUnknownType() throws {
        let fixtures: [(String, Data)] = [
            ("pdf", Data("%PDF-1.4\n%%EOF".utf8)),
            ("jpg", Data([0xff, 0xd8, 0xff, 0xd9])),
            ("txt", Data("Transfer Genie".utf8)),
            ("docx", Data([0x50, 0x4b, 0x03, 0x04])),
        ]
        var urls: [URL] = []
        defer { urls.forEach { try? FileManager.default.removeItem(at: $0) } }

        for (extensionName, bytes) in fixtures {
            let url = temporaryURL(extension: extensionName)
            try bytes.write(to: url)
            urls.append(url)
            XCTAssertTrue(
                QLPreviewController.canPreview(url as QLPreviewItem),
                "Quick Look should route .\(extensionName) documents to system preview"
            )
        }

        let unsupported = temporaryURL(extension: "tgunsupported")
        try Data("unsupported".utf8).write(to: unsupported)
        urls.append(unsupported)
        XCTAssertFalse(QLPreviewController.canPreview(unsupported as QLPreviewItem))
    }

    func testPresenterLookupRequiresMainThread() throws {
        let expectation = expectation(description: "background presenter lookup")
        DispatchQueue.global().async {
            XCTAssertNil(ActiveScenePresenter.current())
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 2)
    }

    func testMediaImportPreservesNameAndSurvivesSourceRemoval() throws {
        let source = temporaryURL(extension: "jpg")
        let bytes = Data("photo fixture".utf8)
        try bytes.write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let first = try MediaPickerCoordinator.copyIntoSandbox(source: source, originalName: "假日照片", contentType: .jpeg)
        let second = try MediaPickerCoordinator.copyIntoSandbox(source: source, originalName: "假日照片", contentType: .jpeg)
        defer {
            try? FileManager.default.removeItem(at: first.deletingLastPathComponent())
            try? FileManager.default.removeItem(at: second.deletingLastPathComponent())
        }
        XCTAssertEqual(first.lastPathComponent, "假日照片.jpg")
        XCTAssertEqual(second.lastPathComponent, "假日照片.jpg")
        XCTAssertNotEqual(first, second)
        try FileManager.default.removeItem(at: source)
        XCTAssertEqual(try Data(contentsOf: first), bytes)
        XCTAssertEqual(try Data(contentsOf: second), bytes)
    }

    func testDocumentImportPreservesNameAndSurvivesSourceRemoval() throws {
        let sourceDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: sourceDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: sourceDirectory) }
        let source = sourceDirectory.appendingPathComponent("项目说明.txt")
        let bytes = Data("document fixture".utf8)
        try bytes.write(to: source)
        let first = try DocumentPickerCoordinator.copyIntoSandbox(source)
        let second = try DocumentPickerCoordinator.copyIntoSandbox(source)
        let firstURL = URL(fileURLWithPath: try XCTUnwrap(first["path"] as? String))
        let secondURL = URL(fileURLWithPath: try XCTUnwrap(second["path"] as? String))
        defer {
            try? FileManager.default.removeItem(at: firstURL.deletingLastPathComponent())
            try? FileManager.default.removeItem(at: secondURL.deletingLastPathComponent())
        }
        XCTAssertEqual(firstURL.lastPathComponent, "项目说明.txt")
        XCTAssertEqual(first["originalName"] as? String, "项目说明.txt")
        XCTAssertNotEqual(firstURL, secondURL)
        try FileManager.default.removeItem(at: source)
        XCTAssertEqual(try Data(contentsOf: firstURL), bytes)
    }

    func testDocumentBatchFailureRollsBackOnlyItsOwnImports() throws {
        let source = temporaryURL(extension: "txt")
        let missing = temporaryURL(extension: "txt")
        let bytes = Data("batch document fixture".utf8)
        try bytes.write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let existing = try DocumentPickerCoordinator.copyIntoSandbox(source)
        let existingURL = URL(fileURLWithPath: try XCTUnwrap(existing["path"] as? String))
        defer { MobileImportBatch.discard([existing]) }
        let before = try importDirectories()

        XCTAssertThrowsError(try DocumentPickerCoordinator.copySelections([source, missing])) { error in
            XCTAssertEqual((error as? MobileIntegrationError)?.code, .resourceUnavailable)
        }
        XCTAssertEqual(try importDirectories(), before)
        XCTAssertEqual(try Data(contentsOf: source), bytes)
        XCTAssertEqual(try Data(contentsOf: existingURL), bytes, "An older successful import must survive rollback")
    }

    func testDocumentBatchSuccessKeepsOrderedSandboxCopies() throws {
        let first = temporaryURL(extension: "txt")
        let second = temporaryURL(extension: "txt")
        try Data("first".utf8).write(to: first)
        try Data("second".utf8).write(to: second)
        defer {
            try? FileManager.default.removeItem(at: first)
            try? FileManager.default.removeItem(at: second)
        }
        let items = try DocumentPickerCoordinator.copySelections([first, second])
        defer { MobileImportBatch.discard(items) }
        XCTAssertEqual(items.count, 2)
        for (item, source) in zip(items, [first, second]) {
            let copy = URL(fileURLWithPath: try XCTUnwrap(item["path"] as? String))
            XCTAssertEqual(try Data(contentsOf: copy), try Data(contentsOf: source))
            XCTAssertEqual(copy.lastPathComponent, source.lastPathComponent)
        }
    }

    func testMediaBatchFailureDiscardsCopiesAndPreservesError() throws {
        let source = temporaryURL(extension: "jpg")
        let bytes = Data("batch media fixture".utf8)
        try bytes.write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let before = try importDirectories()
        let copies = try (0..<2).map { index in
            try MediaPickerCoordinator.copyIntoSandbox(
                source: source, originalName: "batch-\(index).jpg", contentType: .jpeg
            )
        }
        let items: [JsonObject] = copies.map { ["path": $0.path] }
        defer { MobileImportBatch.discard(items) }
        let error = MobileIntegrationError(code: .resourceUnavailable, message: "iCloud unavailable")
        XCTAssertThrowsError(try MobileImportBatch.finish(items, error: error).get()) { result in
            XCTAssertEqual((result as? MobileIntegrationError)?.code, error.code)
            XCTAssertEqual((result as? MobileIntegrationError)?.message, error.message)
        }
        XCTAssertEqual(try importDirectories(), before)
        XCTAssertTrue(copies.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
        XCTAssertEqual(try Data(contentsOf: source), bytes)
    }

    func testMediaBatchSuccessAndCleanupCannotRemoveExternalFiles() throws {
        let source = temporaryURL(extension: "jpg")
        let bytes = Data("successful media fixture".utf8)
        try bytes.write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let copy = try MediaPickerCoordinator.copyIntoSandbox(
            source: source, originalName: "batch.jpg", contentType: .jpeg
        )
        let items: [JsonObject] = [["path": copy.path]]
        defer { MobileImportBatch.discard(items) }
        let result = try MobileImportBatch.finish(items, error: nil).get()
        XCTAssertEqual(result.first?["path"] as? String, copy.path)
        XCTAssertEqual(try Data(contentsOf: copy), bytes)
        MobileImportBatch.discard([["path": source.path]])
        XCTAssertEqual(try Data(contentsOf: source), bytes, "Cleanup must never follow an external source path")
    }

    private func importDirectories() throws -> Set<URL> {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        let imports = support.appendingPathComponent("TransferGenie/MobileImports", isDirectory: true)
        try FileManager.default.createDirectory(at: imports, withIntermediateDirectories: true)
        return Set(try FileManager.default.contentsOfDirectory(at: imports, includingPropertiesForKeys: nil))
    }

    func testSimulatorLowStorageImportFailsWithoutPublishingAFile() throws {
        #if DEBUG && targetEnvironment(simulator)
        let source = temporaryURL(extension: "txt")
        try Data("low storage fixture".utf8).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }
        let importDirectory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
            .appendingPathComponent("TransferGenie", isDirectory: true)
            .appendingPathComponent("MobileImports", isDirectory: true)
        let before = Set((try? FileManager.default.contentsOfDirectory(
            at: importDirectory,
            includingPropertiesForKeys: nil
        )) ?? [])
        setenv("TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST", "no-space", 1)
        defer { unsetenv("TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST") }

        XCTAssertThrowsError(try DocumentPickerCoordinator.copyIntoSandbox(source)) { error in
            let integrationError = error as? MobileIntegrationError
            XCTAssertEqual(integrationError?.code, .copyFailed)
            XCTAssertTrue(integrationError?.message.contains("存储空间不足") == true)
        }
        let after = Set((try? FileManager.default.contentsOfDirectory(
            at: importDirectory,
            includingPropertiesForKeys: nil
        )) ?? [])
        XCTAssertEqual(after, before, "Failed imports must remove their empty selection directory")
        #endif
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
