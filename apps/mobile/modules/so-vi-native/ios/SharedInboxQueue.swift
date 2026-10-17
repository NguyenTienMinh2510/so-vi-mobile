import Foundation
import Darwin

public enum SharedAppGroupResolver {
  private static func unavailable() -> NSError { NSError(domain: "SoViSharedInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: "Chia sẻ chưa truy cập được vùng dữ liệu chung. Giữ nội dung gốc và thử lại; Inbox Shortcuts vẫn hoạt động."]) }
  public static func candidates(base: String, parentBundleIdentifier: String, actualParentBundleIdentifier: String, altAppGroups: [String]) throws -> [String] {
    guard base == "group.local.sovi.moneytracker", parentBundleIdentifier == "local.sovi.moneytracker" else { throw unavailable() }
    let teamPattern = "^[A-Z0-9]{10}$"
    func valid(_ group: String) -> Bool { group == base || (group.hasPrefix(base + ".") && String(group.dropFirst(base.count + 1)).range(of: teamPattern, options: .regularExpression) != nil) }
    var result = [base]
    for group in altAppGroups.prefix(64) where valid(group) && !result.contains(group) { result.append(group) }
    if actualParentBundleIdentifier.hasPrefix(parentBundleIdentifier + ".") {
      let team = String(actualParentBundleIdentifier.dropFirst(parentBundleIdentifier.count + 1))
      if team.range(of: teamPattern, options: .regularExpression) != nil { let mapped = base + "." + team; if !result.contains(mapped) { result.append(mapped) } }
    }
    return result
  }
  public static func resolve(base: String, parentBundleIdentifier: String, actualParentBundleIdentifier: String, altAppGroups: [String], container: (String) -> URL?) throws -> URL {
    var containers: [URL] = []
    for group in try candidates(base: base, parentBundleIdentifier: parentBundleIdentifier, actualParentBundleIdentifier: actualParentBundleIdentifier, altAppGroups: altAppGroups) {
      guard let url = container(group) else { continue }
      guard url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil else { throw unavailable() }
      let canonical = url.resolvingSymlinksInPath().standardizedFileURL
      guard (try? canonical.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else { throw unavailable() }
      if !containers.contains(canonical) { containers.append(canonical) }
    }
    guard containers.count == 1 else { throw unavailable() }
    return containers[0]
  }
  public static func appGroupQueue(bundle: Bundle = .main) throws -> SharedInboxQueue {
    guard let base = bundle.object(forInfoDictionaryKey: "SoViBaseAppGroup") as? String, let parent = bundle.object(forInfoDictionaryKey: "SoViParentBundleIdentifier") as? String else { throw unavailable() }
    var location = bundle.bundleURL; var actualParent: String?
    for _ in 0..<4 { if location.pathExtension == "app" { actualParent = Bundle(url: location)?.bundleIdentifier; break }; location.deleteLastPathComponent() }
    guard let actualParent else { throw unavailable() }
    // shortcut: normal SideStore identifiers append the team. Custom signer mappings need a separate device check.
    let root = try resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: actualParent, altAppGroups: bundle.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? [], container: { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) })
    return SharedInboxQueue(directory: root.appendingPathComponent("SoViSharedInbox", isDirectory: true))
  }
}

public final class SharedInboxQueue {
  private let directory: URL
  private let manager = FileManager.default
  private let maximumBytes = 24 * 1024
  public init(directory: URL) { self.directory = directory }
  private func failure(_ message: String = "Hàng chờ chia sẻ không hợp lệ. Nội dung gốc được giữ; không ghi sổ.") -> NSError { NSError(domain: "SoViSharedInbox", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private func validID(_ id: String) -> Bool { id == id.lowercased() && id.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options: .regularExpression) != nil }
  private func formatter() -> ISO8601DateFormatter { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter }
  private func validate(_ event: NativeInboxEnvelope) throws {
    let time = formatter()
    guard validID(event.id), event.source == "text", event.sourceId == nil, !event.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, event.text.utf16.count <= 4000, !event.provider.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, event.provider.utf16.count <= 200, let date = time.date(from: event.receivedAt), date <= Date(), time.string(from: date) == event.receivedAt else { throw failure() }
  }
  private func locked<T>(_ operation: (URL) throws -> T) throws -> T {
    guard directory.isFileURL, directory.resolvingSymlinksInPath().standardizedFileURL == directory.standardizedFileURL, (try? directory.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true else { throw failure() }
    #if os(iOS)
    try manager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    #else
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    #endif
    var root = directory; var values = URLResourceValues(); values.isExcludedFromBackup = true; try root.setResourceValues(values)
    let descriptor = Darwin.open(root.appendingPathComponent(".lock").path, O_RDWR | O_CREAT | O_NOFOLLOW, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw failure("Không ghi được hàng chờ chia sẻ. Nội dung gốc được giữ; thử lại.") }
    defer { Darwin.close(descriptor) }
    var info = stat(); guard fstat(descriptor, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, flock(descriptor, LOCK_EX) == 0 else { throw failure() }
    defer { flock(descriptor, LOCK_UN) }
    #if os(iOS)
    try manager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: root.appendingPathComponent(".lock").path)
    #endif
    return try operation(root)
  }
  private func read(_ file: URL) throws -> NativeInboxEnvelope {
    let properties = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard properties.isRegularFile == true, properties.isSymbolicLink != true, (properties.fileSize ?? maximumBytes + 1) <= maximumBytes, file.pathExtension == "json", validID(file.deletingPathExtension().lastPathComponent) else { throw failure() }
    let data = try Data(contentsOf: file)
    guard data.count <= maximumBytes, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys) == Set(["id", "source", "provider", "sourceId", "text", "receivedAt"]) else { throw failure() }
    let event = try JSONDecoder().decode(NativeInboxEnvelope.self, from: data); try validate(event)
    guard event.id + ".json" == file.lastPathComponent else { throw failure() }
    return event
  }
  private func readAll(_ root: URL) throws -> [NativeInboxEnvelope] {
    let files = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.lastPathComponent != ".lock" }
    guard files.count <= 50 else { throw failure("Hàng chờ chia sẻ vượt giới hạn. Nội dung được giữ nguyên.") }
    return try files.map { try read($0) }.sorted { ($0.receivedAt, $0.id) < ($1.receivedAt, $1.id) }
  }
  @discardableResult public func append(text: String, provider: String = "Chia sẻ", id: String? = nil) throws -> NativeInboxEnvelope {
    return try locked { root in
      let identifier = id ?? UUID().uuidString.lowercased()
      let date = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970 * 1000) / 1000)
      let event = NativeInboxEnvelope(id: identifier, source: "text", provider: provider.trimmingCharacters(in: .whitespacesAndNewlines), sourceId: nil, text: text, receivedAt: formatter().string(from: date))
      try validate(event); let pending = try readAll(root)
      if let existing = pending.first(where: { $0.id == identifier }) { guard existing.text == event.text, existing.provider == event.provider else { throw failure("Mã chia sẻ đã có nội dung khác. Bản đã lưu được giữ nguyên.") }; return existing }
      guard pending.count < 50 else { throw failure("Inbox chia sẻ có 50 nội dung chờ. Mở Sổ Ví để nhận trước khi gửi thêm.") }
      let data = try JSONEncoder().encode(event); guard data.count <= maximumBytes else { throw failure() }
      #if os(iOS)
      try data.write(to: root.appendingPathComponent(identifier + ".json"), options: [.atomic, .completeFileProtection])
      #else
      try data.write(to: root.appendingPathComponent(identifier + ".json"), options: .atomic)
      #endif
      return event
    }
  }
  public func pending() throws -> [NativeInboxEnvelope] { try locked { try readAll($0) } }
  public func acknowledge(id: String) throws {
    guard validID(id) else { throw failure() }
    try locked { root in let file = root.appendingPathComponent(id + ".json"); if manager.fileExists(atPath: file.path) || (try? file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { _ = try read(file); try manager.removeItem(at: file) } }
  }
}
