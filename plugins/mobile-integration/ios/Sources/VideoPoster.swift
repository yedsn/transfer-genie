import AVFoundation
import Foundation
import ImageIO
import Tauri
import UniformTypeIdentifiers

final class GenerateVideoPosterArgs: Decodable {
  let requestId: String
  let path: String
  let maxPixelSize: Int?
  let timeoutMilliseconds: Int?
}

final class CancelVideoPosterArgs: Decodable {
  let requestId: String
}

final class VideoPosterRequest {
  typealias Completion = (Result<GeneratedImageThumbnail, MobileIntegrationError>) -> Void

  private let generator: AVAssetImageGenerator
  private let asset: AVURLAsset
  private let completion: Completion
  private let destinationDirectory: URL?
  private let timeoutInterval: TimeInterval
  private let lock = NSLock()
  private var finished = false
  private var preparationTask: Task<Void, Never>?

  init(
    sourceURL: URL,
    maxPixelSize: Int,
    timeout: TimeInterval,
    destinationDirectory: URL? = nil,
    completion: @escaping Completion
  ) throws {
    guard (1...ImageThumbnailGenerator.maximumAllowedPixelSize).contains(maxPixelSize) else {
      throw MobileIntegrationError(
        code: .invalidArguments,
        message: "maxPixelSize must be between 1 and \(ImageThumbnailGenerator.maximumAllowedPixelSize)."
      )
    }
    guard timeout > 0 else {
      throw MobileIntegrationError(
        code: .invalidArguments,
        message: "timeoutMilliseconds must be greater than zero."
      )
    }

    asset = AVURLAsset(url: sourceURL)
    generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: maxPixelSize, height: maxPixelSize)
    generator.requestedTimeToleranceBefore = .positiveInfinity
    generator.requestedTimeToleranceAfter = .positiveInfinity
    self.completion = completion
    self.destinationDirectory = destinationDirectory
    timeoutInterval = timeout

  }

  func start() {
    preparationTask = Task { [weak self] in
      guard let self else { return }
      do {
        let duration = try await asset.load(.duration)
        guard !Task.isCancelled else { return }
        let durationSeconds = duration.seconds
        guard durationSeconds.isFinite, durationSeconds > 0 else {
          finish(.failure(MobileIntegrationError(
            code: .previewGenerationFailed,
            message: "The source file is not a readable video."
          )))
          return
        }
        let targetSeconds = min(0.5, max(durationSeconds / 2, 0))
        generateFrame(at: CMTime(seconds: targetSeconds, preferredTimescale: 600))
      } catch {
        guard !Task.isCancelled else { return }
        finish(.failure(MobileIntegrationError(
          code: .previewGenerationFailed,
          message: "The source file is not a readable video: \(error.localizedDescription)"
        )))
      }
    }

    DispatchQueue.global().asyncAfter(deadline: .now() + timeoutInterval) { [weak self] in
      self?.handleTimeout()
    }
  }

  private func generateFrame(at targetTime: CMTime) {
    generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: targetTime)]) {
      [weak self] _, image, _, result, error in
      guard let self else { return }
      guard result == .succeeded, let image else {
        self.finish(.failure(MobileIntegrationError(
          code: .previewGenerationFailed,
          message: error?.localizedDescription
            ?? "AVFoundation could not decode a frame from the source video."
        )))
        return
      }

      do {
        self.finish(.success(try self.writeJPEG(image)))
      } catch let error as MobileIntegrationError {
        self.finish(.failure(error))
      } catch {
        self.finish(.failure(MobileIntegrationError(
          code: .previewGenerationFailed,
          message: "Failed to write the video poster: \(error.localizedDescription)"
        )))
      }
    }

  }

  func cancel() {
    preparationTask?.cancel()
    generator.cancelAllCGImageGeneration()
    finish(.failure(.cancelled))
  }

  private func handleTimeout() {
    preparationTask?.cancel()
    generator.cancelAllCGImageGeneration()
    finish(.failure(MobileIntegrationError(
      code: .timeout,
      message: "Video poster generation timed out."
    )))
  }

  private func finish(_ result: Result<GeneratedImageThumbnail, MobileIntegrationError>) {
    lock.lock()
    guard !finished else {
      lock.unlock()
      return
    }
    finished = true
    lock.unlock()
    completion(result)
  }

  private func writeJPEG(_ image: CGImage) throws -> GeneratedImageThumbnail {
    let fileManager = FileManager.default
    let outputDirectory: URL
    if let destinationDirectory {
      outputDirectory = destinationDirectory
    } else {
      outputDirectory = try fileManager.url(
        for: .cachesDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
      .appendingPathComponent("TransferGenie", isDirectory: true)
      .appendingPathComponent("MobilePreviews", isDirectory: true)
    }
    try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
    let outputURL = outputDirectory
      .appendingPathComponent(UUID().uuidString)
      .appendingPathExtension("jpg")
    guard let destination = CGImageDestinationCreateWithURL(
      outputURL as CFURL,
      UTType.jpeg.identifier as CFString,
      1,
      nil
    ) else {
      throw MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "ImageIO could not create the video poster destination."
      )
    }
    CGImageDestinationAddImage(destination, image, [
      kCGImageDestinationLossyCompressionQuality: 0.82,
    ] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      try? fileManager.removeItem(at: outputURL)
      throw MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "ImageIO could not write the video poster."
      )
    }
    let values = try outputURL.resourceValues(forKeys: [.fileSizeKey])
    return GeneratedImageThumbnail(
      url: outputURL,
      width: image.width,
      height: image.height,
      sizeBytes: values.fileSize ?? 0
    )
  }
}
