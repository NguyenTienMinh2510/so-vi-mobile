import Foundation
import CryptoKit

enum ModelFileVerifier {
  static let byteCount: UInt64 = 3_443_763_168
  static let checksum = "21c4643259ce62ffd979848e5819ce03823fd9e9902279ab54cc0d572d83d33e"
  static func directory() throws -> URL {
    let fm = FileManager.default
    // iOS may alias the platform-owned /var ancestor; app-owned children may never be symlinks.
    let documents = try fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false).resolvingSymlinksInPath().standardizedFileURL
    let root = documents.appendingPathComponent("SoViAI", isDirectory: true)
    if !fm.fileExists(atPath: root.path) { try fm.createDirectory(at: root, withIntermediateDirectories: false) }
    guard (try fm.attributesOfItem(atPath: root.path))[.type] as? FileAttributeType == .typeDirectory, root.resolvingSymlinksInPath().standardizedFileURL.path == root.path else { throw error("Vùng mô hình riêng không hợp lệ.") }
    for name in ["model.gguf", "model.part"] {
      let file = root.appendingPathComponent(name)
      do { let attributes = try fm.attributesOfItem(atPath: file.path); guard attributes[.type] as? FileAttributeType == .typeRegular, file.resolvingSymlinksInPath().standardizedFileURL.path == file.path else { throw error("Không dùng liên kết ngoài vùng mô hình riêng.") } }
      catch let error as NSError { if error.domain != NSCocoaErrorDomain || error.code != NSFileReadNoSuchFileError { throw error } }
    }
    var excluded = root
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try excluded.setResourceValues(values)
    return root
  }
  static func promote() throws {
    let root = try directory()
    let source = root.appendingPathComponent("model.part"), target = root.appendingPathComponent("model.gguf")
    if FileManager.default.fileExists(atPath: target.path) { _ = try FileManager.default.replaceItemAt(target, withItemAt: source) }
    else { try FileManager.default.moveItem(at: source, to: target) }
  }
  static func verify(_ uri: String) throws -> Bool {
    let fm = FileManager.default
    let root = try directory()
    let suppliedRoot = try fm.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false).standardizedFileURL.appendingPathComponent("SoViAI", isDirectory: true)
    guard let url = URL(string: uri), url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil,
      url.user == nil, url.password == nil, url.port == nil, !url.pathComponents.contains(".."), !url.pathComponents.contains("."),
      ["model.gguf", "model.part"].contains(url.lastPathComponent), [root.path, suppliedRoot.path].contains(url.standardizedFileURL.deletingLastPathComponent().path),
      url.standardizedFileURL.path == url.path else { throw error("Đường dẫn mô hình không hợp lệ.") }
    let fileURL = root.appendingPathComponent(url.lastPathComponent)
    guard url.resolvingSymlinksInPath().standardizedFileURL.path == fileURL.path else { throw error("Không dùng liên kết ngoài vùng mô hình riêng.") }
    let attributes = try fm.attributesOfItem(atPath: fileURL.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular, (attributes[.size] as? NSNumber)?.uint64Value == byteCount else { throw error("File mô hình sai dung lượng. Chọn đúng Qwen3.5-4B Q5_K_M hoặc tải lại.") }
    let file = try FileHandle(forReadingFrom: fileURL)
    defer { try? file.close() }
    var hash = SHA256()
    var total: UInt64 = 0
    while try autoreleasepool(invoking: {
      guard let data = try file.read(upToCount: 1_048_576), !data.isEmpty else { return false }
      total += UInt64(data.count)
      guard total <= byteCount else { throw error("File mô hình đã thay đổi khi kiểm tra.") }
      hash.update(data: data)
      return true
    }) { }
    guard total == byteCount, hash.finalize().map({ String(format: "%02x", $0) }).joined() == checksum else { throw error("Mã xác minh mô hình không khớp. File được giữ ngoài trạng thái sẵn sàng; tải lại hoặc nhập đúng file.") }
    return true
  }
  private static func error(_ message: String) -> NSError { NSError(domain: "SoViModel", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
