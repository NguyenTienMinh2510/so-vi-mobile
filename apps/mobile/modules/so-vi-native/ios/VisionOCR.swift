import Foundation
import Vision
import ImageIO

public struct VisionOCRResult {
  public let text: String
  public let languages: [String]
  public let warnings: [String]
  public var dictionary: [String: Any] { ["text": text, "languages": languages, "warnings": warnings] }
}
public enum VisionOCR {
  private static func failure(_ message: String) -> NSError { NSError(domain: "SoViVision", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  // The caller must admit an owned regular file from its trusted cache before invoking Vision.
  public static func recognize(_ url: URL, maximumPixelSize: Int? = nil) throws -> VisionOCRResult {
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true, let bytes = values.fileSize, bytes > 0, bytes <= 20 * 1024 * 1024 else { throw failure("Ảnh không hợp lệ hoặc vượt 20 MB. Bản nháp được giữ.") }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber, width.int64Value > 0, height.int64Value > 0, width.int64Value <= 40_000_000 / height.int64Value else { throw failure("Ảnh không đọc được hoặc vượt 40 megapixel.") }
    let image: CGImage?
    let orientation: CGImagePropertyOrientation
    if let maximumPixelSize {
      guard maximumPixelSize > 0, maximumPixelSize <= 2048 else { throw failure("Kích thước nhận diện ảnh không hợp lệ.") }
      image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize] as CFDictionary)
      orientation = .up
    } else {
      image = CGImageSourceCreateImageAtIndex(source, 0, nil)
      orientation = CGImagePropertyOrientation(rawValue: (properties[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1) ?? .up
    }
    guard let image else { throw failure("Không giải mã được ảnh. Chọn ảnh khác hoặc dán văn bản.") }
    let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
    let supported = try request.supportedRecognitionLanguages(); let languages = ["vi-VN", "en-US"].filter { supported.contains($0) }
    guard !languages.isEmpty else { throw failure("Vision trên thiết bị chưa hỗ trợ ngôn ngữ nhận diện cần dùng. Hãy dán văn bản.") }
    request.recognitionLanguages = languages
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    let candidates = (request.results ?? []).sorted { a, b in a.boundingBox.midY != b.boundingBox.midY ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX }.compactMap { $0.topCandidates(1).first }
    var warnings: [String] = []
    if !languages.contains("vi-VN") { warnings.append("Vision trên thiết bị chưa hỗ trợ tiếng Việt; đang dùng tiếng Anh. Kiểm tra dấu và số tiền.") }
    if candidates.contains(where: { $0.confidence < 0.8 }) { warnings.append("Có dòng nhận diện chưa chắc chắn. Kiểm tra từng số tiền và mã tham chiếu.") }
    if maximumPixelSize != nil { warnings.append("Ảnh được thu nhỏ để đọc trong bảng chia sẻ. Kiểm tra văn bản trước khi lưu.") }
    return VisionOCRResult(text: candidates.map { $0.string }.joined(separator: "\n"), languages: languages, warnings: warnings)
  }
}
