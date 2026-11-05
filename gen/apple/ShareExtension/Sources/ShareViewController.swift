import Foundation
import UniformTypeIdentifiers
import UIKit

final class ShareViewController: UIViewController {
  private var providers: [NSItemProvider] {
    (extensionContext?.inputItems as? [NSExtensionItem])?
      .flatMap { $0.attachments ?? [] } ?? []
  }
  private var builder: MobileShareBatchBuilder?
  private var isImporting = false
  private var committedBatch: MobileShareBatch?
  private var importTask: Task<Void, Never>?

  private let iconView = UIImageView(image: UIImage(systemName: "paperplane.fill"))
  private let titleLabel = UILabel()
  private let detailLabel = UILabel()
  private let progressView = UIProgressView(progressViewStyle: .default)
  private let statusLabel = UILabel()
  private let errorLabel = UILabel()
  private let addButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)

  var openURLHandler: ((URL, @escaping (Bool) -> Void) -> Void)?

  override func viewDidLoad() {
    super.viewDidLoad()
    configureView()
    configureContent()
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if !isImporting, committedBatch == nil {
      builder?.cancel()
    }
  }

  private func configureView() {
    view.backgroundColor = .systemBackground
    view.accessibilityIdentifier = "share-import-screen"

    iconView.tintColor = .label
    iconView.contentMode = .scaleAspectFit
    iconView.translatesAutoresizingMaskIntoConstraints = false

    titleLabel.text = "添加到 Transfer Genie"
    titleLabel.font = .preferredFont(forTextStyle: .title2)
    titleLabel.adjustsFontForContentSizeCategory = true
    titleLabel.numberOfLines = 0
    titleLabel.accessibilityIdentifier = "share-import-title"

    detailLabel.font = .preferredFont(forTextStyle: .body)
    detailLabel.textColor = .secondaryLabel
    detailLabel.adjustsFontForContentSizeCategory = true
    detailLabel.numberOfLines = 0

    progressView.progress = 0
    progressView.isHidden = true
    progressView.accessibilityIdentifier = "share-import-progress"

    statusLabel.font = .preferredFont(forTextStyle: .subheadline)
    statusLabel.textColor = .secondaryLabel
    statusLabel.adjustsFontForContentSizeCategory = true
    statusLabel.numberOfLines = 0
    statusLabel.accessibilityIdentifier = "share-import-status"

    errorLabel.font = .preferredFont(forTextStyle: .callout)
    errorLabel.textColor = .systemRed
    errorLabel.adjustsFontForContentSizeCategory = true
    errorLabel.numberOfLines = 0
    errorLabel.accessibilityIdentifier = "share-import-error"

    var addConfiguration = UIButton.Configuration.filled()
    addConfiguration.title = "添加到草稿"
    addConfiguration.cornerStyle = .large
    addButton.configuration = addConfiguration
    addButton.addTarget(self, action: #selector(primaryAction), for: .touchUpInside)
    addButton.accessibilityIdentifier = "share-import-add"

    var cancelConfiguration = UIButton.Configuration.plain()
    cancelConfiguration.title = "取消"
    cancelButton.configuration = cancelConfiguration
    cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    cancelButton.accessibilityIdentifier = "share-import-cancel"

    let textStack = UIStackView(arrangedSubviews: [
      titleLabel, detailLabel, errorLabel, progressView, statusLabel,
    ])
    textStack.axis = .vertical
    textStack.spacing = 12
    textStack.translatesAutoresizingMaskIntoConstraints = false

    let buttonStack = UIStackView(arrangedSubviews: [addButton, cancelButton])
    buttonStack.axis = .vertical
    buttonStack.spacing = 8
    buttonStack.translatesAutoresizingMaskIntoConstraints = false

    let content = UIStackView(arrangedSubviews: [iconView, textStack, buttonStack])
    content.axis = .vertical
    content.spacing = 24
    content.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(content)

    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      content.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      content.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
      iconView.widthAnchor.constraint(equalToConstant: 52),
      iconView.heightAnchor.constraint(equalToConstant: 52),
      addButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
    ])
  }

  private func configureContent() {
    let supported = providers.filter { Self.supportedType(for: $0) != nil }
    if providers.isEmpty {
      showTerminalError("没有可接收的分享内容。请返回后在相册或文件 App 中选择图片、视频或文件。")
      return
    }
    if supported.isEmpty {
      showTerminalError("当前分享内容不支持。请分享图片、视频或文件。")
      return
    }
    if supported.count > MobileShareInbox.maximumItemCount {
      showTerminalError("一次最多分享 10 项内容，当前为 \(supported.count) 项。请返回后减少选择。")
      return
    }
    let ignored = providers.count - supported.count
    detailLabel.text = ignored > 0
      ? "可接收 \(supported.count) 项，另有 \(ignored) 项类型不受支持并会忽略。"
      : "将接收 \(supported.count) 项。文件会先保存到 Transfer Genie 的共享收件箱，再由你确认发送。"
    statusLabel.text = "分享内容不会自动发送。"
    addButton.isEnabled = true
  }

  @objc private func primaryAction() {
    if let batch = committedBatch {
      openCommittedBatch(batch)
      return
    }
    beginImport()
  }

  private func beginImport() {
    guard !isImporting else { return }
    let supported = providers.filter { Self.supportedType(for: $0) != nil }
    guard !supported.isEmpty, supported.count <= MobileShareInbox.maximumItemCount else {
      configureContent()
      return
    }

    isImporting = true
    errorLabel.isHidden = true
    addButton.isEnabled = false
    cancelButton.configuration?.title = "取消接收"
    progressView.isHidden = false
    progressView.progress = 0
    statusLabel.text = "正在保存 0/\(supported.count) 项…"

    importTask = Task { [weak self] in
      guard let self else { return }
      do {
        guard let container = MobileShareInbox.containerURL() else {
          throw MobileShareInboxError.appGroupUnavailable
        }
        let inbox = MobileShareInbox.inboxRoot(containerURL: container)
        MobileShareInbox.cleanupPartialBatches(inboxRoot: inbox)
        let batchBuilder = try MobileShareBatchBuilder(inboxRoot: inbox)
        builder = batchBuilder
        try await copyProviders(supported, into: batchBuilder)
        try Task.checkCancellation()
        let batch = try batchBuilder.commit()
        committedBatch = batch
        isImporting = false
        builder = nil
        progressView.progress = 1
        statusLabel.text = "已保存到分享收件箱，正在打开 Transfer Genie…"
        addButton.isEnabled = true
        addButton.configuration?.title = "打开 Transfer Genie"
        cancelButton.configuration?.title = "稍后打开"
        openCommittedBatch(batch)
      } catch is CancellationError {
        finishCancelledImport()
      } catch {
        builder?.cancel()
        builder = nil
        isImporting = false
        presentImportFailure(error)
      }
    }
  }

  private func copyProviders(
    _ supported: [NSItemProvider],
    into batchBuilder: MobileShareBatchBuilder
  ) async throws {
    for (index, provider) in supported.enumerated() {
      try Task.checkCancellation()
      guard let type = Self.supportedType(for: provider) else { continue }
      try await Self.copyFileRepresentation(from: provider, as: type, into: batchBuilder)
      await MainActor.run {
        progressView.progress = Float(index + 1) / Float(supported.count)
        statusLabel.text = "正在保存 \(index + 1)/\(supported.count) 项…"
      }
    }
  }

  private static func supportedType(for provider: NSItemProvider) -> UTType? {
    let registered = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
    return registered.first(where: { $0.conforms(to: .image) })
      ?? registered.first(where: { $0.conforms(to: .movie) })
      ?? registered.first(where: { $0.conforms(to: .data) })
  }

  private static func copyFileRepresentation(
    from provider: NSItemProvider,
    as type: UTType,
    into batchBuilder: MobileShareBatchBuilder
  ) async throws {
    let suggestedName = provider.suggestedName
    let typeIdentifier = type.identifier
    let fileExtension = type.preferredFilenameExtension
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
        if let error {
          continuation.resume(throwing: MobileShareInboxError.copyFailed(error.localizedDescription))
        } else if let url {
          do {
            // The provider URL is only guaranteed to exist while this callback is running.
            _ = try batchBuilder.addFile(
              sourceURL: url,
              originalName: suggestedName ?? url.lastPathComponent,
              fileExtension: fileExtension ?? url.pathExtension,
              contentType: typeIdentifier
            )
            continuation.resume()
          } catch {
            continuation.resume(throwing: error)
          }
        } else {
          continuation.resume(throwing: MobileShareInboxError.fileUnavailable(suggestedName ?? typeIdentifier))
        }
      }
    }
  }

  func openCommittedBatch(_ batch: MobileShareBatch) {
    guard let url = Self.importURL(batchId: batch.batchId) else {
      showOpenFailure()
      return
    }
    let completion: (Bool) -> Void = { [weak self] opened in
      DispatchQueue.main.async {
        guard let self else { return }
        if opened {
          self.showOpenedSuccess()
          self.extensionContext?.completeRequest(returningItems: nil)
        } else {
          self.showOpenFailure()
        }
      }
    }
    if let openURLHandler {
      openURLHandler(url, completion)
    } else {
      extensionContext?.open(url, completionHandler: completion)
    }
  }

  static func importURL(batchId: String) -> URL? {
    guard MobileShareInbox.validBatchId(batchId) else { return nil }
    var components = URLComponents()
    components.scheme = "transfergenie"
    components.host = "share-import"
    components.queryItems = [URLQueryItem(name: "batch", value: batchId)]
    return components.url
  }

  func showOpenFailure() {
    statusLabel.text = "文件已安全保存，但暂时无法打开 Transfer Genie。"
    errorLabel.text = "请稍后手动打开 Transfer Genie；文件仍保留在分享收件箱中。"
    errorLabel.isHidden = false
    addButton.isEnabled = true
    addButton.configuration?.title = "再次打开"
    cancelButton.configuration?.title = "稍后处理"
    UIAccessibility.post(notification: .announcement, argument: errorLabel.text)
  }

  func showOpenedSuccess() {
    statusLabel.text = "已添加到草稿。请回到 Transfer Genie 确认后发送。"
    UIAccessibility.post(notification: .announcement, argument: statusLabel.text)
  }

  func presentImportFailure(_ error: Error) {
    progressView.isHidden = true
    statusLabel.text = "尚未添加到草稿。"
    errorLabel.text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    errorLabel.isHidden = false
    addButton.isEnabled = true
    addButton.configuration?.title = "重试"
    cancelButton.configuration?.title = "取消"
    UIAccessibility.post(notification: .announcement, argument: errorLabel.text)
  }

  func showTerminalError(_ message: String) {
    detailLabel.text = "Transfer Genie 无法接收本次分享。"
    errorLabel.text = message
    errorLabel.isHidden = false
    statusLabel.text = "不会创建空的分享批次。"
    addButton.isHidden = true
    cancelButton.configuration?.title = "关闭"
  }

  private func finishCancelledImport() {
    builder?.cancel()
    builder = nil
    isImporting = false
    extensionContext?.completeRequest(returningItems: nil)
  }

  @objc private func cancel() {
    if isImporting {
      importTask?.cancel()
      return
    }
    if committedBatch == nil {
      builder?.cancel()
    }
    extensionContext?.completeRequest(returningItems: nil)
  }
}
