import Foundation

public struct NativeInboxEnvelope: Codable {
  public let id: String
  public let source: String
  public let provider: String
  public let sourceId: String?
  public let text: String
  public let receivedAt: String

  enum CodingKeys: String, CodingKey { case id, source, provider, sourceId, text, receivedAt }
  public func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(id, forKey: .id); try values.encode(source, forKey: .source)
    try values.encode(provider, forKey: .provider); try values.encode(sourceId, forKey: .sourceId)
    try values.encode(text, forKey: .text); try values.encode(receivedAt, forKey: .receivedAt)
  }
}

public final class NativeInboxQueue {
  public static let shared = NativeInboxQueue()
  public static let changed = Notification.Name("SoViNativeInboxChanged")
  private static let lock = NSLock()
  private let fileManager = FileManager.default
  private let maxBytes = 24 * 1024
  private let suppliedDirectory: URL?
  public init(directory: URL? = nil) { suppliedDirectory = directory }

  private func error(_ message: String) -> NSError { NSError(domain: "SoViNativeInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func validID(_ value: String) -> Bool {
    value.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", options: .regularExpression) != nil
  }
  private func validText(_ value: String, maximum: Int) -> Bool { !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= maximum }
  private func directory() throws -> URL {
    var url = try suppliedDirectory ?? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("SoViNativeInbox", isDirectory: true)
    #if os(iOS)
    try fileManager.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    #else
    try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
    #endif
    var values = URLResourceValues(); values.isExcludedFromBackup = true; try url.setResourceValues(values)
    return url
  }
  private func files(in directory: URL) throws -> [URL] {
    let files = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard files.count <= 50 else { throw error("Hàng chờ Shortcuts vượt giới hạn. Nội dung được giữ nguyên.") }
    for file in files {
      let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
      guard file.pathExtension == "json", validID(file.deletingPathExtension().lastPathComponent), values.isRegularFile == true, values.isSymbolicLink != true, (values.fileSize ?? maxBytes + 1) <= maxBytes else { throw error("Hàng chờ Shortcuts có file lỗi. Nội dung được giữ nguyên; hãy thử lại.") }
    }
    return files
  }
  private func validate(_ event: NativeInboxEnvelope) throws {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard validID(event.id), ["sms", "email", "text"].contains(event.source), validText(event.provider, maximum: 200), event.sourceId == nil || validText(event.sourceId!, maximum: 200), validText(event.text, maximum: 4000), let date = formatter.date(from: event.receivedAt), formatter.string(from: date) == event.receivedAt, date <= Date() else { throw error("Nội dung Shortcuts không hợp lệ. Chỉ nhận văn bản từ 1 đến 4.000 ký tự.") }
  }

  @discardableResult public func enqueue(text: String, source: String, provider: String, sourceId: String?) throws -> NativeInboxEnvelope {
    Self.lock.lock()
    var committed = false
    defer { Self.lock.unlock(); if committed { NotificationCenter.default.post(name: Self.changed, object: nil) } }
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let received = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970 * 1000) / 1000)
    let event = NativeInboxEnvelope(id: UUID().uuidString.lowercased(), source: source, provider: provider.trimmingCharacters(in: .whitespacesAndNewlines), sourceId: sourceId?.trimmingCharacters(in: .whitespacesAndNewlines), text: text, receivedAt: formatter.string(from: received))
    try validate(event)
    let root = try directory(); guard try files(in: root).count < 50 else { throw error("Hàng chờ có 50 nội dung. Mở Inbox và nhận nội dung trước khi gửi thêm.") }
    let data = try JSONEncoder().encode(event); guard data.count <= maxBytes else { throw error("Nội dung Shortcuts quá lớn. Bản hiện có được giữ nguyên.") }
    #if os(iOS)
    try data.write(to: root.appendingPathComponent(event.id + ".json"), options: [.atomic, .completeFileProtection])
    #else
    try data.write(to: root.appendingPathComponent(event.id + ".json"), options: .atomic)
    #endif
    committed = true
    return event
  }
  public func pending() throws -> [NativeInboxEnvelope] {
    Self.lock.lock(); defer { Self.lock.unlock() }
    let root = try directory()
    return try files(in: root).map { try read($0) }.sorted { ($0.receivedAt, $0.id) < ($1.receivedAt, $1.id) }
  }
  private func read(_ file: URL) throws -> NativeInboxEnvelope {
    let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true, (values.fileSize ?? maxBytes + 1) <= maxBytes else { throw error("File Shortcuts không hợp lệ. Bản gốc được giữ nguyên.") }
    let data = try Data(contentsOf: file)
    guard data.count <= maxBytes, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys) == Set(["id", "source", "provider", "sourceId", "text", "receivedAt"]) else { throw error("Hàng chờ có nội dung lỗi. Bản gốc được giữ nguyên.") }
    let event = try JSONDecoder().decode(NativeInboxEnvelope.self, from: data); try validate(event)
    guard event.id + ".json" == file.lastPathComponent else { throw error("Mã file Shortcuts không khớp. Bản gốc được giữ nguyên.") }
    return event
  }
  public func acknowledge(_ id: String) throws {
    Self.lock.lock(); defer { Self.lock.unlock() }
    guard validID(id) else { throw error("Mã Shortcuts không hợp lệ.") }
    let file = try directory().appendingPathComponent(id + ".json")
    if fileManager.fileExists(atPath: file.path) { _ = try read(file); try fileManager.removeItem(at: file) }
  }
}
