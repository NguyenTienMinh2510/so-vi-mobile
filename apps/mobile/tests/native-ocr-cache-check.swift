import Foundation

// Compile with the actual OCRCachePaths.swift on macOS; all files below are disposable fixtures.
@main struct OCRCacheCheck {
  static func main() throws {
    let manager = FileManager.default
    let root = manager.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("sovi-ocr-cache-check-" + UUID().uuidString, isDirectory: true)
    try manager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: root) }
    func reject(_ label: String, _ action: () throws -> Void) {
      do { try action(); fatalError("Expected rejection: " + label) } catch { }
    }
    func check(_ condition: @autoclosure () throws -> Bool) rethrows { let result = try condition(); assert(result) }
    func write(_ url: URL) throws { try Data("fixture-image".utf8).write(to: url) }
    let actualParent = root.appendingPathComponent("real", isDirectory: true)
    let cache = actualParent.appendingPathComponent("Caches", isDirectory: true)
    let outside = root.appendingPathComponent("outside", isDirectory: true)
    let alias = root.appendingPathComponent("parent-alias", isDirectory: true)
    try manager.createDirectory(at: cache, withIntermediateDirectories: true)
    try manager.createDirectory(at: outside, withIntermediateDirectories: true)
    try manager.createSymbolicLink(at: alias, withDestinationURL: actualParent)
    let trusted = alias.appendingPathComponent("Caches", isDirectory: true)
    let ocr = cache.appendingPathComponent("SoViOCR", isDirectory: true)
    let picker = cache.appendingPathComponent("ImagePicker", isDirectory: true)
    assert(!manager.fileExists(atPath: ocr.path), "first OCR capture has no pre-existing child directory")
    let firstCaptureDirectory = try OCRCachePaths.cacheDirectory(trusted, subdirectory: "SoViOCR")
    assert(firstCaptureDirectory.standardizedFileURL.path == ocr.standardizedFileURL.path)
    try manager.createDirectory(at: firstCaptureDirectory, withIntermediateDirectories: true)
    let firstCapture = firstCaptureDirectory.appendingPathComponent(UUID().uuidString + ".jpg")
    try write(firstCapture)
    let firstRead = try OCRCachePaths.ownedFile(firstCapture.absoluteString, cache: trusted, subdirectory: "SoViOCR")
    let firstBytes = try Data(contentsOf: firstRead); assert(firstBytes == Data("fixture-image".utf8))
    try manager.removeItem(at: firstRead); assert(!manager.fileExists(atPath: firstCapture.path))
    try manager.createDirectory(at: ocr, withIntermediateDirectories: true)
    try manager.createDirectory(at: picker, withIntermediateDirectories: true)
    let image = ocr.appendingPathComponent("read.image"); try write(image)
    let aliasedImage = trusted.appendingPathComponent("SoViOCR/read.image")
    try check(OCRCachePaths.cacheDirectory(trusted, subdirectory: "SoViOCR") == ocr)
    try check(OCRCachePaths.ownedFile(aliasedImage.absoluteString, cache: trusted, subdirectory: "SoViOCR") == image)
    try check(OCRCachePaths.ownedFile(image.absoluteString, cache: trusted, subdirectory: "SoViOCR") == image)
    for cacheHint in [URL(fileURLWithPath: cache.path, isDirectory: true), URL(fileURLWithPath: cache.path, isDirectory: false), URL(fileURLWithPath: trusted.path, isDirectory: true), URL(fileURLWithPath: trusted.path, isDirectory: false)] {
      let child = try OCRCachePaths.cacheDirectory(cacheHint, subdirectory: "SoViOCR")
      assert(child.standardizedFileURL.path == ocr.standardizedFileURL.path)
      let acceptedURIs = cacheHint.path == trusted.path ? [image.absoluteString, aliasedImage.absoluteString] : [image.absoluteString]
      for uri in acceptedURIs {
        let readable = try OCRCachePaths.ownedFile(uri, cache: cacheHint, subdirectory: "SoViOCR")
        assert(readable.standardizedFileURL.path == image.standardizedFileURL.path)
        let bytes = try Data(contentsOf: readable); assert(bytes == Data("fixture-image".utf8))
      }
    }
    let encodedImage = ocr.appendingPathComponent("read space % image.jpg"); try write(encodedImage)
    let encodedAlias = trusted.appendingPathComponent("SoViOCR/read space % image.jpg")
    assert(encodedImage.absoluteString.contains("%20") && encodedImage.absoluteString.contains("%25"))
    for uri in [encodedImage.absoluteString, encodedAlias.absoluteString] {
      let readable = try OCRCachePaths.ownedFile(uri, cache: URL(fileURLWithPath: trusted.path, isDirectory: false), subdirectory: "SoViOCR")
      assert(readable.standardizedFileURL.path == encodedImage.standardizedFileURL.path)
      let bytes = try Data(contentsOf: readable); assert(bytes == Data("fixture-image".utf8))
    }
    let clearEncoded = try OCRCachePaths.ownedFile(encodedAlias.absoluteString, cache: trusted, subdirectory: "SoViOCR")
    try manager.removeItem(at: clearEncoded); assert(!manager.fileExists(atPath: encodedImage.path)); assert(manager.fileExists(atPath: image.path))
    let external = outside.appendingPathComponent("private.image"); try write(external)
    let sibling = cache.appendingPathComponent("SoViOCR-other", isDirectory: true); try manager.createDirectory(at: sibling, withIntermediateDirectories: true)
    let siblingImage = sibling.appendingPathComponent("read.image"); try write(siblingImage)
    for (label, uri) in [
      ("https", "https://example.test/image"), ("host", "file://localhost" + image.path),
      ("query", image.absoluteString + "?copy=1"), ("fragment", image.absoluteString + "#image"),
      ("outside", external.absoluteString), ("sibling", siblingImage.absoluteString),
      ("traversal", trusted.absoluteString + "SoViOCR/../SoViOCR/read.image"),
      ("encoded traversal", trusted.absoluteString + "SoViOCR/%2e%2e/SoViOCR/read.image")
    ] { reject(label) { _ = try OCRCachePaths.ownedFile(uri, cache: trusted, subdirectory: "SoViOCR") } }
    let fileLink = ocr.appendingPathComponent("link.image"); try manager.createSymbolicLink(at: fileLink, withDestinationURL: image)
    reject("file symlink") { _ = try OCRCachePaths.ownedFile(fileLink.absoluteString, cache: trusted, subdirectory: "SoViOCR") }
    let untrustedAlias = root.appendingPathComponent("outside-alias", isDirectory: true); try manager.createSymbolicLink(at: untrustedAlias, withDestinationURL: cache)
    reject("untrusted alias into approved cache") { _ = try OCRCachePaths.ownedFile(untrustedAlias.appendingPathComponent("SoViOCR/read.image").absoluteString, cache: trusted, subdirectory: "SoViOCR") }
    for child in ["SoViOCR", "ImagePicker"] {
      let linkedCache = root.appendingPathComponent("linked-" + child, isDirectory: true); try manager.createDirectory(at: linkedCache, withIntermediateDirectories: true)
      let linkedChild = linkedCache.appendingPathComponent(child, isDirectory: true); try manager.createSymbolicLink(at: linkedChild, withDestinationURL: outside)
      reject("child directory symlink") { _ = try OCRCachePaths.cacheDirectory(linkedCache, subdirectory: child) }
      reject("file through child directory symlink") { _ = try OCRCachePaths.ownedFile(linkedChild.appendingPathComponent("private.image").absoluteString, cache: linkedCache, subdirectory: child) }
      let internalCache = root.appendingPathComponent("internal-link-" + child, isDirectory: true); try manager.createDirectory(at: internalCache, withIntermediateDirectories: true)
      let internalDestination = internalCache.appendingPathComponent("real-child", isDirectory: true); try manager.createDirectory(at: internalDestination, withIntermediateDirectories: true)
      let internalImage = internalDestination.appendingPathComponent("private.image"); try write(internalImage)
      let internalChild = internalCache.appendingPathComponent(child, isDirectory: true); try manager.createSymbolicLink(at: internalChild, withDestinationURL: internalDestination)
      reject("child symlink within cache") { _ = try OCRCachePaths.cacheDirectory(internalCache, subdirectory: child) }
      reject("file through child symlink within cache") { _ = try OCRCachePaths.ownedFile(internalChild.appendingPathComponent("private.image").absoluteString, cache: internalCache, subdirectory: child) }
    }
    let copyDirectories: [String?] = [nil, "ImagePicker"]
    for child in copyDirectories {
      let directory = child == nil ? cache : picker
      let owned = directory.appendingPathComponent(UUID().uuidString + ".jpg"); try write(owned)
      let nonOwned = directory.appendingPathComponent("family-photo.jpg"); try write(nonOwned)
      let allowed = try OCRCachePaths.ownedFile(owned.absoluteString, cache: trusted, subdirectory: child, requireUUID: true)
      assert(allowed == owned); try manager.removeItem(at: allowed)
      reject("non UUID original") { _ = try OCRCachePaths.ownedFile(nonOwned.absoluteString, cache: trusted, subdirectory: child, requireUUID: true) }
      assert(manager.fileExists(atPath: nonOwned.path)); assert(manager.fileExists(atPath: external.path))
      reject("outside owned UUID") { _ = try OCRCachePaths.ownedFile(outside.appendingPathComponent(UUID().uuidString + ".jpg").absoluteString, cache: trusted, subdirectory: child, requireUUID: true) }
    }
    print("PASS: trusted parent alias/canonical cache; child/file symlinks, nonfile/host/outside/sibling/traversal rejected; only owned UUID copies eligible for deletion")
  }
}
