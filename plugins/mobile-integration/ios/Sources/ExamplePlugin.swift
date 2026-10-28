import SwiftRs
import Tauri
import UIKit
import WebKit

class DiagnosticArgs: Decodable {
  let requestId: String
}

class MobileIntegrationPlugin: Plugin {
  private var mediaPickerCoordinators: [UUID: MediaPickerCoordinator] = [:]
  private var documentPickerCoordinators: [UUID: DocumentPickerCoordinator] = [:]
  private var previewCoordinators: [UUID: PreviewCoordinator] = [:]
  private var playbackCoordinators: [UUID: PlaybackCoordinator] = [:]
  private var videoPosterRequests: [String: VideoPosterRequest] = [:]
  private let videoPosterLock = NSLock()
  private var lifecycleObservers: [NSObjectProtocol] = []
  private weak var accessibilityWebview: WKWebView?
  private var canvasOffsetObservation: NSKeyValueObservation?

  override func load(webview: WKWebView) {
    super.load(webview: webview)
    // Keep app layout fixed; Dynamic Type is handled independently below.
    webview.scrollView.pinchGestureRecognizer?.isEnabled = false
    // Nested message/editor regions scroll; the app canvas must not rubber-band.
    webview.scrollView.bounces = false
    webview.scrollView.alwaysBounceVertical = false
    webview.scrollView.alwaysBounceHorizontal = false
    webview.scrollView.isScrollEnabled = false
    webview.scrollView.contentInsetAdjustmentBehavior = .never
    // WebKit can still scroll the root programmatically when focusing a caret.
    // The app uses nested CSS scroll regions, so the root always stays at zero.
    canvasOffsetObservation = webview.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
      if scrollView.contentOffset != .zero { scrollView.setContentOffset(.zero, animated: false) }
    }
    webview.scrollView.setContentOffset(.zero, animated: false)
    #if DEBUG && targetEnvironment(simulator)
    if ProcessInfo.processInfo.environment["TRANSFER_GENIE_IOS_LAYOUT_PROBE"] == "1" {
      SimulatorLayoutProbe().install(in: webview)
    }
    #endif
    accessibilityWebview = webview
    webview.configuration.userContentController.addUserScript(WKUserScript(
      source: MobileAccessibility.currentScript(),
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    ))
    webview.evaluateJavaScript(MobileAccessibility.currentScript(), completionHandler: nil)

    let center = NotificationCenter.default
    lifecycleObservers = [
      center.addObserver(
        forName: UIResponder.keyboardWillChangeFrameNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in self?.refreshKeyboard(notification) },
      center.addObserver(
        forName: UIResponder.keyboardWillHideNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.accessibilityWebview?.evaluateJavaScript(MobileKeyboard.script(visibleHeight: nil), completionHandler: nil)
      },
      center.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        self?.refreshAccessibility()
        self?.emitLifecycleState(for: notification.name)
      },
      center.addObserver(
        forName: UIContentSizeCategory.didChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in self?.refreshAccessibility() },
      center.addObserver(
        forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in self?.refreshAccessibility() },
      center.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        self?.refreshAccessibility()
        self?.emitLifecycleState(for: notification.name)
      },
    ]
  }

  private func refreshAccessibility() {
    accessibilityWebview?.scrollView.pinchGestureRecognizer?.isEnabled = false
    accessibilityWebview?.scrollView.bounces = false
    accessibilityWebview?.scrollView.isScrollEnabled = false
    accessibilityWebview?.evaluateJavaScript(MobileAccessibility.currentScript(), completionHandler: nil)
  }

  private func refreshKeyboard(_ notification: Notification) {
    guard let webview = accessibilityWebview,
          let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
    let localFrame = webview.convert(frame, from: nil)
    // iOS 26+ includes the floating previous/next/Done assistant in the
    // reported keyboard frame. Keep only a minimal visual gap above that frame.
    let clearance: CGFloat
    if #available(iOS 26.0, *) { clearance = 4 } else { clearance = 0 }
    let height = MobileKeyboard.visibleHeight(bounds: webview.bounds, keyboardFrame: localFrame, clearance: clearance)
    webview.evaluateJavaScript(MobileKeyboard.script(visibleHeight: height), completionHandler: nil)
  }

  deinit {
    let center = NotificationCenter.default
    lifecycleObservers.forEach(center.removeObserver)
  }

  private func emitLifecycleState(for notification: Notification.Name) {
    guard let state = mobileLifecycleState(for: notification) else { return }
    trigger("lifecycle", data: ["state": state])
  }

  @objc public func diagnostic(_ invoke: Invoke) {
    let args: DiagnosticArgs
    do {
      args = try invoke.parseArgs(DiagnosticArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let reply = MobileInvocation(invoke)
    DispatchQueue.main.async { [weak self] in
      self?.refreshAccessibility()
      reply.resolve([
        "requestId": args.requestId,
        "platform": "ios",
        "nativePlugin": true,
        "mainThread": Thread.isMainThread,
      ])
    }
  }

  @objc public func selectMedia(_ invoke: Invoke) {
    let args: SelectMediaArgs
    do {
      args = try invoke.parseArgs(SelectMediaArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    ActiveScenePresenter.present(invoke: invoke) { [weak self] presenter, reply in
      guard let self else {
        reply.reject(MobileIntegrationError(
          code: .unavailable,
          message: "The mobile integration plugin is unavailable."
        ))
        return
      }

      let coordinator = MediaPickerCoordinator(
        plugin: self,
        reply: reply,
        selectionLimit: args.selectionLimit
      )
      self.mediaPickerCoordinators[coordinator.id] = coordinator
      coordinator.present(from: presenter)
    }
  }

  func releaseMediaPicker(_ id: UUID) {
    mediaPickerCoordinators.removeValue(forKey: id)
  }

  @objc public func selectDocuments(_ invoke: Invoke) {
    let args: SelectDocumentsArgs
    do {
      args = try invoke.parseArgs(SelectDocumentsArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    ActiveScenePresenter.present(invoke: invoke) { [weak self] presenter, reply in
      guard let self else {
        reply.reject(MobileIntegrationError(
          code: .unavailable,
          message: "The mobile integration plugin is unavailable."
        ))
        return
      }

      let coordinator = DocumentPickerCoordinator(
        plugin: self,
        reply: reply,
        allowsMultipleSelection: args.allowsMultipleSelection ?? true
      )
      self.documentPickerCoordinators[coordinator.id] = coordinator
      coordinator.present(from: presenter)
    }
  }

  func releaseDocumentPicker(_ id: UUID) {
    documentPickerCoordinators.removeValue(forKey: id)
  }

  @objc public func previewFile(_ invoke: Invoke) {
    let args: LocalFileArgs
    do {
      args = try invoke.parseArgs(LocalFileArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let reply = MobileInvocation(invoke)
    let fileURL: URL
    do {
      fileURL = try LocalFileValidator.url(for: args.path)
    } catch let error as MobileIntegrationError {
      reply.reject(error)
      return
    } catch {
      reply.reject(.invalidPath(error.localizedDescription))
      return
    }

    ActiveScenePresenter.present(invoke: invoke) { [weak self] presenter, presentationReply in
      guard let self else {
        presentationReply.reject(MobileIntegrationError(
          code: .unavailable,
          message: "The mobile integration plugin is unavailable."
        ))
        return
      }
      if MediaPlaybackSupport.isMediaFile(fileURL) {
        let coordinator = PlaybackCoordinator(
          plugin: self,
          reply: presentationReply,
          fileURL: fileURL
        )
        self.playbackCoordinators[coordinator.id] = coordinator
        coordinator.present(from: presenter)
      } else {
        let coordinator = PreviewCoordinator(
          plugin: self,
          reply: presentationReply,
          fileURL: fileURL
        )
        self.previewCoordinators[coordinator.id] = coordinator
        coordinator.present(from: presenter)
      }
    }
  }

  @objc public func shareFile(_ invoke: Invoke) {
    let args: LocalFileArgs
    do {
      args = try invoke.parseArgs(LocalFileArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let fileURL: URL
    do {
      fileURL = try LocalFileValidator.url(for: args.path)
    } catch let error as MobileIntegrationError {
      MobileInvocation(invoke).reject(error)
      return
    } catch {
      MobileInvocation(invoke).reject(.invalidPath(error.localizedDescription))
      return
    }

    ActiveScenePresenter.present(invoke: invoke) { presenter, reply in
      let controller = UIActivityViewController(
        activityItems: [fileURL],
        applicationActivities: nil
      )
      controller.popoverPresentationController?.sourceView = presenter.view
      controller.popoverPresentationController?.sourceRect = CGRect(
        x: presenter.view.bounds.midX,
        y: presenter.view.bounds.midY,
        width: 1,
        height: 1
      )
      controller.completionWithItemsHandler = { activityType, completed, _, error in
        if let error {
          reply.reject(MobileIntegrationError(
            code: .presentationFailed,
            message: "Sharing failed: \(error.localizedDescription)"
          ))
        } else if !completed {
          reply.cancel()
        } else {
          reply.resolve([
            "completed": true,
            "activityType": activityType?.rawValue as Any,
          ])
        }
      }
      presenter.present(controller, animated: true)
    }
  }

  @objc public func generateImageThumbnail(_ invoke: Invoke) {
    let args: GenerateImageThumbnailArgs
    do {
      args = try invoke.parseArgs(GenerateImageThumbnailArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let reply = MobileInvocation(invoke)
    let sourceURL: URL
    do {
      sourceURL = try LocalFileValidator.url(for: args.path)
    } catch let error as MobileIntegrationError {
      reply.reject(error)
      return
    } catch {
      reply.reject(.invalidPath(error.localizedDescription))
      return
    }

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let thumbnail = try ImageThumbnailGenerator.generate(
          sourceURL: sourceURL,
          maxPixelSize: args.maxPixelSize ?? ImageThumbnailGenerator.defaultMaxPixelSize
        )
        reply.resolve(thumbnail.jsonObject)
      } catch let error as MobileIntegrationError {
        reply.reject(error)
      } catch {
        reply.reject(MobileIntegrationError(
          code: .previewGenerationFailed,
          message: "Failed to generate the image preview: \(error.localizedDescription)"
        ))
      }
    }
  }

  @objc public func generateVideoPoster(_ invoke: Invoke) {
    let args: GenerateVideoPosterArgs
    do {
      args = try invoke.parseArgs(GenerateVideoPosterArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let reply = MobileInvocation(invoke)
    let sourceURL: URL
    do {
      sourceURL = try LocalFileValidator.url(for: args.path)
    } catch let error as MobileIntegrationError {
      reply.reject(error)
      return
    } catch {
      reply.reject(.invalidPath(error.localizedDescription))
      return
    }

    let requestId = args.requestId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !requestId.isEmpty else {
      reply.reject(MobileIntegrationError(
        code: .invalidArguments,
        message: "requestId is required."
      ))
      return
    }

    do {
      let request = try VideoPosterRequest(
        sourceURL: sourceURL,
        maxPixelSize: args.maxPixelSize ?? ImageThumbnailGenerator.defaultMaxPixelSize,
        timeout: Double(args.timeoutMilliseconds ?? 15_000) / 1_000
      ) { [weak self] result in
        switch result {
        case .success(let poster): reply.resolve(poster.jsonObject)
        case .failure(let error): reply.reject(error)
        }
        self?.removeVideoPosterRequest(requestId)
      }
      guard storeVideoPosterRequest(request, requestId: requestId) else {
        reply.reject(MobileIntegrationError(
          code: .invalidArguments,
          message: "A video poster request with this requestId is already active."
        ))
        return
      }
      request.start()
    } catch let error as MobileIntegrationError {
      reply.reject(error)
    } catch {
      reply.reject(MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "Failed to start video poster generation: \(error.localizedDescription)"
      ))
    }
  }

  @objc public func cancelVideoPoster(_ invoke: Invoke) {
    let args: CancelVideoPosterArgs
    do {
      args = try invoke.parseArgs(CancelVideoPosterArgs.self)
    } catch {
      MobileInvocation(invoke).reject(.invalidArguments(error))
      return
    }

    let request = removeVideoPosterRequest(args.requestId)
    request?.cancel()
    MobileInvocation(invoke).resolve(["cancelled": request != nil])
  }

  private func storeVideoPosterRequest(
    _ request: VideoPosterRequest,
    requestId: String
  ) -> Bool {
    videoPosterLock.lock()
    defer { videoPosterLock.unlock() }
    guard videoPosterRequests[requestId] == nil else { return false }
    videoPosterRequests[requestId] = request
    return true
  }

  @discardableResult
  private func removeVideoPosterRequest(_ requestId: String) -> VideoPosterRequest? {
    videoPosterLock.lock()
    defer { videoPosterLock.unlock() }
    return videoPosterRequests.removeValue(forKey: requestId)
  }

  func releasePreview(_ id: UUID) {
    previewCoordinators.removeValue(forKey: id)
  }

  func releasePlayback(_ id: UUID) {
    playbackCoordinators.removeValue(forKey: id)
  }
}

func mobileLifecycleState(for notification: Notification.Name) -> String? {
  switch notification {
  case UIApplication.didEnterBackgroundNotification:
    return "background"
  case UIApplication.didBecomeActiveNotification:
    return "foreground"
  default:
    return nil
  }
}

@_cdecl("init_plugin_mobile_integration")
func initPlugin() -> Plugin {
  return MobileIntegrationPlugin()
}
