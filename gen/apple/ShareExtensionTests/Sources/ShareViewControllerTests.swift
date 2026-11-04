import Foundation
import UIKit
import XCTest

@MainActor
final class ShareViewControllerTests: XCTestCase {
  func testShareScreenExposesStableAccessibilityIdentifiers() {
    let controller = ShareViewController()
    controller.loadViewIfNeeded()

    let identifiers = Set(allViews(in: controller.view).compactMap(\.accessibilityIdentifier))
    for identifier in [
      "share-import-screen",
      "share-import-title",
      "share-import-add",
      "share-import-cancel",
      "share-import-status",
      "share-import-error",
      "share-import-progress",
    ] {
      XCTAssertTrue(identifiers.contains(identifier), identifier)
    }
    XCTAssertEqual(label("share-import-title", in: controller.view)?.text, "添加到 Transfer Genie")
    XCTAssertEqual(errorText(in: controller.view), "没有可接收的分享内容。请返回后在相册或文件 App 中选择图片、视频或文件。")
    XCTAssertEqual(button("share-import-cancel", in: controller.view)?.configuration?.title, "关闭")
  }

  func testPartialFailureAndOpenFailureKeepActionableRetryState() {
    let controller = ShareViewController()
    controller.loadViewIfNeeded()

    controller.presentImportFailure(MobileShareInboxError.fileUnavailable("large-video.mov"))
    XCTAssertEqual(label("share-import-status", in: controller.view)?.text, "尚未添加到草稿。")
    XCTAssertEqual(errorText(in: controller.view), "分享文件已不可用：large-video.mov")
    XCTAssertEqual(button("share-import-add", in: controller.view)?.configuration?.title, "重试")

    controller.showOpenFailure()
    XCTAssertEqual(label("share-import-status", in: controller.view)?.text, "文件已安全保存，但暂时无法打开 Transfer Genie。")
    XCTAssertTrue(errorText(in: controller.view)?.contains("文件仍保留在分享收件箱中") == true)
    XCTAssertEqual(button("share-import-add", in: controller.view)?.configuration?.title, "再次打开")
  }

  func testSuccessfulOpenShowsCompletionState() {
    let controller = ShareViewController()
    controller.loadViewIfNeeded()
    controller.showOpenedSuccess()
    XCTAssertEqual(
      label("share-import-status", in: controller.view)?.text,
      "已添加到草稿。请回到 Transfer Genie 确认后发送。"
    )
  }

  func testFailedOpenKeepsCommittedBatchAndRetryURL() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("transfer-genie-share-open-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

    let source = root.appendingPathComponent("photo.jpg")
    try Data("photo".utf8).write(to: source)
    let builder = try MobileShareBatchBuilder(inboxRoot: root.appendingPathComponent("Inbox"))
    _ = try builder.addFile(sourceURL: source, originalName: "photo.jpg", fileExtension: "jpg", contentType: "public.jpeg")
    let batch = try builder.commit()

    let controller = ShareViewController()
    var requestedURL: URL?
    controller.openURLHandler = { url, completion in
      requestedURL = url
      completion(false)
    }
    controller.openCommittedBatch(batch)

    XCTAssertEqual(requestedURL?.absoluteString, "transfergenie://share-import?batch=\(batch.batchId)")
    XCTAssertTrue(FileManager.default.fileExists(atPath: batch.directoryURL.path), "opening failure must not delete the durable batch")
  }

  func testImportURLRejectsMalformedBatchIDs() {
    XCTAssertNil(ShareViewController.importURL(batchId: "../escape"))
    XCTAssertNotNil(ShareViewController.importURL(batchId: UUID().uuidString))
  }

  private func allViews(in view: UIView) -> [UIView] {
    [view] + view.subviews.flatMap(allViews)
  }

  private func label(_ identifier: String, in view: UIView) -> UILabel? {
    allViews(in: view).first { $0.accessibilityIdentifier == identifier } as? UILabel
  }

  private func button(_ identifier: String, in view: UIView) -> UIButton? {
    allViews(in: view).first { $0.accessibilityIdentifier == identifier } as? UIButton
  }

  private func errorText(in view: UIView) -> String? {
    label("share-import-error", in: view)?.text
  }
}
