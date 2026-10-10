import ExpoModulesCore
import Foundation
import Vision
import ImageIO

public final class SoViNativeModule: Module {
  private var observer: NSObjectProtocol?
  public func definition() -> ModuleDefinition {
    Name("SoViNative")
    Events("inboxChanged")
    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(forName: NativeInboxQueue.changed, object: nil, queue: nil) { [weak self] _ in self?.sendEvent("inboxChanged", [:]) }
    }
    OnStopObserving { if let observer = self.observer { NotificationCenter.default.removeObserver(observer); self.observer = nil } }
    OnDestroy { if let observer = self.observer { NotificationCenter.default.removeObserver(observer) } }
    AsyncFunction("pendingImportsAsync") { () throws -> [[String: Any]] in
      try NativeInboxQueue.shared.pending().map { event in
        ["id": event.id, "source": event.source, "provider": event.provider, "sourceId": event.sourceId as Any? ?? NSNull(), "text": event.text, "receivedAt": event.receivedAt]
      }
    }
    AsyncFunction("acknowledgeImportAsync") { (id: String) in try NativeInboxQueue.shared.acknowledge(id) }
    AsyncFunction("clearOcrCacheAsync") { () in
      let root = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("SoViOCR", isDirectory: true)
      guard root.resolvingSymlinksInPath() == root.standardizedFileURL else { throw self.failure("Thư mục ảnh tạm không hợp lệ.") }
      if FileManager.default.fileExists(atPath: root.path) {
        for file in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where file.pathExtension == "image" { try FileManager.default.removeItem(at: file) }
      }
    }
    AsyncFunction("removeImageCopyAsync") { (uri: String) in
      let root = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).standardizedFileURL
      guard let file = URL(string: uri), file.isFileURL, file.resolvingSymlinksInPath() == file.standardizedFileURL, [root, root.appendingPathComponent("ImagePicker", isDirectory: true)].contains(file.standardizedFileURL.deletingLastPathComponent()), UUID(uuidString: file.deletingPathExtension().lastPathComponent) != nil else { return }
      if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    AsyncFunction("recognizeTextAsync") { (uri: String) throws -> [String: Any] in
      try self.recognize(uri)
    }.runOnQueue(DispatchQueue(label: "local.sovi.vision", qos: .userInitiated))
  }
  private func failure(_ message: String) -> NSError { NSError(domain: "SoViVision", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func recognize(_ uri: String) throws -> [String: Any] {
    let manager = FileManager.default
    let cache = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("SoViOCR", isDirectory: true).standardizedFileURL
    guard let url = URL(string: uri), url.isFileURL, url.host == nil || url.host == "", url.standardizedFileURL.deletingLastPathComponent() == cache, url.resolvingSymlinksInPath() == url.standardizedFileURL else { throw failure("Chỉ đọc bản ảnh tạm riêng của Sổ Ví trên điện thoại.") }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true, let bytes = values.fileSize, bytes > 0, bytes <= 20 * 1024 * 1024 else { throw failure("Ảnh không hợp lệ hoặc vượt 20 MB. Bản nháp được giữ.") }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber, width.int64Value > 0, height.int64Value > 0, width.int64Value <= 40_000_000 / height.int64Value else { throw failure("Ảnh không đọc được hoặc vượt 40 megapixel.") }
    guard let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw failure("Không giải mã được ảnh. Chọn ảnh khác hoặc dán văn bản.") }
    let orientation = CGImagePropertyOrientation(rawValue: (properties[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1) ?? .up
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
    let supported = try request.supportedRecognitionLanguages()
    let languages = ["vi-VN", "en-US"].filter { supported.contains($0) }
    guard !languages.isEmpty else { throw failure("Vision trên thiết bị chưa hỗ trợ ngôn ngữ nhận diện cần dùng. Hãy dán văn bản.") }
    request.recognitionLanguages = languages
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    let observations = request.results ?? []
    let candidates = observations.sorted { a, b in
      if a.boundingBox.midY != b.boundingBox.midY { return a.boundingBox.midY > b.boundingBox.midY }
      return a.boundingBox.minX < b.boundingBox.minX
    }.compactMap { $0.topCandidates(1).first }
    var warnings: [String] = []
    if !languages.contains("vi-VN") { warnings.append("Vision trên thiết bị chưa hỗ trợ tiếng Việt; đang dùng tiếng Anh. Kiểm tra dấu và số tiền.") }
    if candidates.contains(where: { $0.confidence < 0.8 }) { warnings.append("Có dòng nhận diện chưa chắc chắn. Kiểm tra từng số tiền và mã tham chiếu.") }
    return ["text": candidates.map { $0.string }.joined(separator: "\n"), "languages": languages, "warnings": warnings]
  }
}
