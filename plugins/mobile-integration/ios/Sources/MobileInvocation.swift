import Foundation
import Tauri
import UIKit

enum MobileIntegrationErrorCode: String, Equatable {
  case cancelled = "CANCELLED"
  case invalidArguments = "INVALID_ARGUMENTS"
  case invalidPath = "INVALID_PATH"
  case noPresenter = "NO_PRESENTER"
  case copyFailed = "COPY_FAILED"
  case presentationFailed = "PRESENTATION_FAILED"
  case previewGenerationFailed = "PREVIEW_GENERATION_FAILED"
  case resourceUnavailable = "RESOURCE_UNAVAILABLE"
  case timeout = "TIMEOUT"
  case unavailable = "UNAVAILABLE"
}

struct MobileIntegrationError: Error {
  let code: MobileIntegrationErrorCode
  let message: String

  static let cancelled = MobileIntegrationError(
    code: .cancelled,
    message: "The user cancelled the operation."
  )

  static let noPresenter = MobileIntegrationError(
    code: .noPresenter,
    message: "No active iOS scene is available to present native UI."
  )

  static func invalidArguments(_ error: Error) -> MobileIntegrationError {
    MobileIntegrationError(
      code: .invalidArguments,
      message: "Invalid command arguments: \(error.localizedDescription)"
    )
  }

  static func invalidPath(_ message: String) -> MobileIntegrationError {
    MobileIntegrationError(code: .invalidPath, message: message)
  }
}

enum MobileImportTestHooks {
  static func checkWritableStorage() throws {
    #if DEBUG && targetEnvironment(simulator)
    if let raw = getenv("TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST"),
       String(cString: raw) == "no-space" {
      throw MobileIntegrationError(
        code: .copyFailed,
        message: "本机存储空间不足，未保存所选文件。请释放空间后重试。"
      )
    }
    #endif
  }
}

enum MobileImportBatch {
  static func discard(_ items: [JsonObject]) {
    guard let support = try? FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: false
    ) else { return }
    let imports = support.appendingPathComponent("TransferGenie/MobileImports", isDirectory: true)
      .standardizedFileURL
    for item in items {
      guard let path = item["path"] as? String else { continue }
      let directory = URL(fileURLWithPath: path).standardizedFileURL.deletingLastPathComponent()
      guard directory.deletingLastPathComponent() == imports,
            UUID(uuidString: directory.lastPathComponent) != nil else { continue }
      try? FileManager.default.removeItem(at: directory)
    }
  }

  static func finish(
    _ items: [JsonObject], error: MobileIntegrationError?
  ) -> Result<[JsonObject], MobileIntegrationError> {
    if let error {
      discard(items)
      return .failure(error)
    }
    return .success(items)
  }
}

final class MobileInvocation {
  private let invoke: Invoke
  private let lock = NSLock()
  private var completed = false

  init(_ invoke: Invoke) {
    self.invoke = invoke
  }

  func resolve(_ value: JsonObject) {
    guard markCompleted() else { return }
    invoke.resolve(value)
  }

  func reject(_ error: MobileIntegrationError) {
    guard markCompleted() else { return }
    invoke.reject(error.message, code: error.code.rawValue)
  }

  func cancel() {
    reject(.cancelled)
  }

  private func markCompleted() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard !completed else { return false }
    completed = true
    return true
  }
}

enum ActiveScenePresenter {
  static func current() -> UIViewController? {
    guard Thread.isMainThread else { return nil }

    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }

    for scene in scenes {
      let window = scene.windows.first(where: { $0.isKeyWindow })
        ?? scene.windows.first(where: { !$0.isHidden && $0.alpha > 0 })
      if let root = window?.rootViewController {
        return topViewController(from: root)
      }
    }

    return nil
  }

  static func topViewController(from root: UIViewController) -> UIViewController {
    if let presented = root.presentedViewController, !presented.isBeingDismissed {
      return topViewController(from: presented)
    }
    if let navigation = root as? UINavigationController,
       let visible = navigation.visibleViewController {
      return topViewController(from: visible)
    }
    if let tabs = root as? UITabBarController,
       let selected = tabs.selectedViewController {
      return topViewController(from: selected)
    }
    if let split = root as? UISplitViewController,
       let last = split.viewControllers.last {
      return topViewController(from: last)
    }
    if let navigation = root.children.last(where: { $0 is UINavigationController }) {
      return topViewController(from: navigation)
    }
    return root
  }

  static func present(
    invoke: Invoke,
    operation: @escaping (UIViewController, MobileInvocation) -> Void
  ) {
    let reply = MobileInvocation(invoke)
    DispatchQueue.main.async {
      guard let presenter = current() else {
        reply.reject(.noPresenter)
        return
      }
      operation(presenter, reply)
    }
  }
}
