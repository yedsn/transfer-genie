import Foundation
import ImageIO
import Tauri
import UniformTypeIdentifiers

final class GenerateImageThumbnailArgs: Decodable {
  let path: String
  let maxPixelSize: Int?
}

struct GeneratedImageThumbnail {
  let url: URL
  let width: Int
  let height: Int
  let sizeBytes: Int

  var jsonObject: JsonObject {
    [
      "path": url.path,
      "width": width,
      "height": height,
      "sizeBytes": sizeBytes,
    ]
  }
}

enum ImageThumbnailGenerator {
  static let defaultMaxPixelSize = 1280
  static let maximumAllowedPixelSize = 4096

  static func generate(
    sourceURL: URL,
    maxPixelSize: Int,
    destinationDirectory: URL? = nil
  ) throws -> GeneratedImageThumbnail {
    guard (1...maximumAllowedPixelSize).contains(maxPixelSize) else {
      throw MobileIntegrationError(
        code: .invalidArguments,
        message: "maxPixelSize must be between 1 and \(maximumAllowedPixelSize)."
      )
    }

    guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, [
      kCGImageSourceShouldCache: false,
    ] as CFDictionary),
      CGImageSourceGetCount(source) > 0 else {
      throw MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "The source file is not a supported image or is corrupt."
      )
    }

    let thumbnailOptions: CFDictionary = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
      kCGImageSourceShouldCacheImmediately: true,
    ] as CFDictionary
    guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else {
      throw MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "ImageIO could not decode the source image."
      )
    }

    let outputDirectory = try prepareOutputDirectory(destinationDirectory)
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
        message: "ImageIO could not create the JPEG preview destination."
      )
    }

    CGImageDestinationAddImage(destination, thumbnail, [
      kCGImageDestinationLossyCompressionQuality: 0.82,
    ] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: outputURL)
      throw MobileIntegrationError(
        code: .previewGenerationFailed,
        message: "ImageIO could not write the JPEG preview."
      )
    }

    let values = try outputURL.resourceValues(forKeys: [.fileSizeKey])
    return GeneratedImageThumbnail(
      url: outputURL,
      width: thumbnail.width,
      height: thumbnail.height,
      sizeBytes: values.fileSize ?? 0
    )
  }

  private static func prepareOutputDirectory(_ suppliedDirectory: URL?) throws -> URL {
    let fileManager = FileManager.default
    let outputDirectory: URL
    if let suppliedDirectory {
      outputDirectory = suppliedDirectory
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
    return outputDirectory
  }
}
