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
    let supported = try request.supportedRecognitionLanguages()
    let vietnamese = supported.first { $0.lowercased() == "vi" || $0.lowercased().hasPrefix("vi-") }
    let languages = [vietnamese, supported.contains("en-US") ? "en-US" : nil].compactMap { $0 }
    guard !languages.isEmpty else { throw failure("Vision trên thiết bị chưa hỗ trợ ngôn ngữ nhận diện cần dùng. Hãy dán văn bản.") }
    request.recognitionLanguages = languages
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    var rows: [[VNRecognizedTextObservation]] = []
    for observation in (request.results ?? []).sorted(by: { $0.boundingBox.midY > $1.boundingBox.midY }) {
      let box = observation.boundingBox
      if let index = rows.firstIndex(where: { row in
        let other = row[0].boundingBox
        let overlap = min(box.maxY, other.maxY) - max(box.minY, other.minY)
        return overlap >= min(box.height, other.height) * 0.5
      }) { rows[index].append(observation) }
      else { rows.append([observation]) }
    }
    let rowCandidates = rows.map { row in row.sorted { $0.boundingBox.minX < $1.boundingBox.minX }.compactMap { $0.topCandidates(1).first } }
    let candidates = rowCandidates.flatMap { $0 }
    var warnings: [String] = []
    if vietnamese == nil { warnings.append("Vision trên thiết bị chưa hỗ trợ tiếng Việt; đang dùng tiếng Anh. Kiểm tra dấu và số tiền.") }
    if candidates.contains(where: { $0.confidence < 0.8 }) { warnings.append("Có dòng nhận diện chưa chắc chắn. Kiểm tra từng số tiền và mã tham chiếu.") }
    if maximumPixelSize != nil { warnings.append("Ảnh được thu nhỏ để đọc trong bảng chia sẻ. Kiểm tra văn bản trước khi lưu.") }
    return VisionOCRResult(text: rowCandidates.map { $0.map { $0.string }.joined(separator: " ") }.filter { !$0.isEmpty }.joined(separator: "\n"), languages: languages, warnings: warnings)
  }
}
