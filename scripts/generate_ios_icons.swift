import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Reuse the macOS artwork; leave room for the system's rounded icon mask.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let input = root.appendingPathComponent("icons/icon.png")
guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
      let artwork = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fatalError("Cannot read macOS icon")
}
let catalog = root.appendingPathComponent("gen/apple/Assets.xcassets/AppIcon.appiconset")
let contents = try JSONSerialization.jsonObject(with: Data(contentsOf: catalog.appendingPathComponent("Contents.json"))) as! [String: Any]
let entries = contents["images"] as! [[String: String]]

func render(size: Int, transparent: Bool) -> CGImage {
  let alpha = transparent ? CGImageAlphaInfo.premultipliedLast : .noneSkipLast
  let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                          bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: alpha.rawValue)!
  if !transparent {
    context.setFillColor(CGColor(red: 250 / 255, green: 249 / 255, blue: 245 / 255, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
  }
  // Original artwork has 16px of top and 38px of bottom transparent padding.
  let subject = artwork.cropping(to: CGRect(x: 0, y: 16, width: 512, height: 460))!
  let width = CGFloat(size) * 0.76
  let height = width * CGFloat(subject.height) / CGFloat(subject.width)
  context.interpolationQuality = .high
  context.draw(subject, in: CGRect(x: (CGFloat(size) - width) / 2,
                                 y: (CGFloat(size) - height) / 2, width: width, height: height))
  return context.makeImage()!
}

func write(_ image: CGImage, to url: URL) throws {
  let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
}

if CommandLine.arguments.contains("--verify") {
  for entry in entries {
    let filename = entry["filename"]!
    let size = Int(Double(entry["size"]!.components(separatedBy: "x")[0])! * Double(entry["scale"]!.dropLast())!)
    let url = root.appendingPathComponent("icons/ios/" + filename)
    let image = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(url as CFURL, nil)!, 0, nil)!
    precondition(image.width == size && image.height == size, "Wrong icon dimensions")
    precondition(![CGImageAlphaInfo.first, .last, .premultipliedFirst, .premultipliedLast].contains(image.alphaInfo), "iOS AppIcon must be opaque")
    let pixels = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                           bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                           bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    pixels.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    let bytes = pixels.data!.assumingMemoryBound(to: UInt8.self)
    var left = size, right = 0, top = size, bottom = 0
    for y in 0..<size { for x in 0..<size {
      let index = (y * size + x) * 4
      if Int(bytes[index + 1]) > Int(bytes[index]) + 50 {
        left = min(left, x); right = max(right, x)
        top = min(top, y); bottom = max(bottom, y)
      }
    } }
    precondition(left >= Int(Double(size) * 0.1) && right < Int(Double(size) * 0.9), "Icon needs horizontal mask clearance")
    precondition(top >= Int(Double(size) * 0.1) && bottom < Int(Double(size) * 0.9), "Icon needs vertical mask clearance")
    precondition(abs(left + right - size + 1) <= 2 && abs(top + bottom - size + 1) <= 2, "Artwork must be centered")
    let sourceData = try Data(contentsOf: url)
    let catalogData = try Data(contentsOf: catalog.appendingPathComponent(filename))
    precondition(sourceData == catalogData, "Catalog differs from source")
  }
  print("Verified all iOS AppIcon sizes, opaque backgrounds and catalog copies")
  exit(0)
}

try write(render(size: 1024, transparent: true), to: root.appendingPathComponent("icons/ios-source.png"))
for entry in entries {
  guard let filename = entry["filename"], let points = Double(entry["size"]!.components(separatedBy: "x")[0]),
        let scale = Double(entry["scale"]!.dropLast()) else { continue }
  let image = render(size: Int(points * scale), transparent: false)
  try write(image, to: root.appendingPathComponent("icons/ios/" + filename))
  try write(image, to: catalog.appendingPathComponent(filename))
}
print("Generated centered iOS artwork and \(entries.count) opaque AppIcon assets")
