import Foundation

struct OCRCachePaths {
  private static func invalid() -> NSError { NSError(domain: "SoViVision", code: 1, userInfo: [NSLocalizedDescriptionKey: "Đường dẫn ảnh tạm không hợp lệ."]) }
  static func cacheDirectory(_ cache: URL, subdirectory: String) throws -> URL {
    guard cache.isFileURL, !subdirectory.isEmpty, ![".", ".."].contains(subdirectory), !subdirectory.contains("/"), !subdirectory.contains("\\") else { throw invalid() }
    // Only the platform-supplied cache parent may have an alias, never an app-owned child.
    let canonical = cache.resolvingSymlinksInPath().standardizedFileURL.appendingPathComponent(subdirectory, isDirectory: true)
    let supplied = cache.standardizedFileURL.appendingPathComponent(subdirectory, isDirectory: true)
    guard supplied.resolvingSymlinksInPath().standardizedFileURL.path == canonical.path, canonical.resolvingSymlinksInPath().standardizedFileURL.path == canonical.path, (try? supplied.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) != true else { throw invalid() }
    return canonical
  }
  static func ownedFile(_ uri: String, cache: URL, subdirectory: String?, requireUUID: Bool = false) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL, url.host == nil || url.host == "", url.query == nil, url.fragment == nil, url.user == nil, url.password == nil, url.port == nil, !url.pathComponents.contains(".."), !url.pathComponents.contains(".") else { throw invalid() }
    let canonical = try subdirectory.map { try cacheDirectory(cache, subdirectory: $0) } ?? cache.resolvingSymlinksInPath().standardizedFileURL
    let supplied = subdirectory.map { cache.standardizedFileURL.appendingPathComponent($0, isDirectory: true) } ?? cache.standardizedFileURL
    let file = url.standardizedFileURL
    guard [supplied.path, canonical.path].contains(file.deletingLastPathComponent().path), !file.lastPathComponent.isEmpty else { throw invalid() }
    let expected = canonical.appendingPathComponent(file.lastPathComponent, isDirectory: false)
    guard file.resolvingSymlinksInPath().standardizedFileURL.path == expected.path else { throw invalid() }
    let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true, !requireUUID || UUID(uuidString: file.deletingPathExtension().lastPathComponent) != nil else { throw invalid() }
    return expected
  }
}
