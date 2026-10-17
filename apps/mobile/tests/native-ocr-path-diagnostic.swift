import Foundation

// Compile alongside the actual OCRCachePaths.swift on macOS; every path logged is synthetic.
@main struct OCRPathDiagnostic {
  static func main() throws {
    let manager = FileManager.default
    let temporary = manager.temporaryDirectory.resolvingSymlinksInPath().standardizedFileURL
    let root = temporary.appendingPathComponent("sovi-ocr-path-diagnostic-" + UUID().uuidString, isDirectory: true)
    precondition(root.deletingLastPathComponent().path == temporary.path)
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    var failures: [String] = []
    let bytes = Data("synthetic-ocr-image".utf8)

    func require(_ condition: Bool, _ message: String) throws {
      if !condition { throw NSError(domain: "OCRPathDiagnostic", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    }
    func inspect(_ label: String, _ url: URL) {
      precondition(url.standardizedFileURL.pathComponents.contains(root.lastPathComponent))
      print("  \(label): path=\(url.path) directoryHint=\(url.hasDirectoryPath)")
      do {
        let attributes = try manager.attributesOfItem(atPath: url.path)
        print("    no-follow type=\(String(describing: attributes[.type])) size=\(String(describing: attributes[.size])) permissions=\(String(describing: attributes[.posixPermissions]))")
      } catch {
        let error = error as NSError
        print("    no-follow error=\(error.domain):\(error.code)")
      }
    }
    func paths(_ label: String, _ cache: URL) {
      print("CALL: " + label)
      let supplied = cache.standardizedFileURL.appendingPathComponent("SoViOCR", isDirectory: true)
      let canonical = cache.resolvingSymlinksInPath().standardizedFileURL.appendingPathComponent("SoViOCR", isDirectory: true)
      inspect("cache supplied", cache)
      inspect("cache resolved", cache.resolvingSymlinksInPath().standardizedFileURL)
      inspect("child supplied", supplied)
      inspect("child canonical", canonical)
      inspect("child supplied resolved", supplied.resolvingSymlinksInPath().standardizedFileURL)
      inspect("child canonical resolved", canonical.resolvingSymlinksInPath().standardizedFileURL)
    }
    func positive(_ label: String, _ action: () throws -> Void) {
      do { try action(); print("PASS: " + label) }
      catch {
        let error = error as NSError
        let failure = "\(label): \(error.domain):\(error.code) \(error.localizedDescription)"
        failures.append(failure); print("FAIL: " + failure)
      }
    }
    func reject(_ label: String, _ action: () throws -> Void) {
      do {
        try action()
        failures.append(label + ": unexpectedly accepted"); print("FAIL: " + label + ": unexpectedly accepted")
      } catch {
        let error = error as NSError
        if error.domain == "SoViVision" && error.code == 1 { print("PASS: rejected " + label) }
        else {
          let failure = "\(label): wrong rejection \(error.domain):\(error.code)"
          failures.append(failure); print("FAIL: " + failure)
        }
      }
    }

    do {
      let parent = root.appendingPathComponent("real", isDirectory: true)
      let cache = parent.appendingPathComponent("Caches", isDirectory: true)
      let alias = root.appendingPathComponent("trusted-parent-alias", isDirectory: true)
      try manager.createDirectory(at: cache, withIntermediateDirectories: true)
      try manager.createSymbolicLink(at: alias, withDestinationURL: parent)
      let trusted = alias.appendingPathComponent("Caches", isDirectory: true)
      let ocr = cache.appendingPathComponent("SoViOCR", isDirectory: true)
      let hints = [trusted, cache].flatMap { base in
        [URL(fileURLWithPath: base.path, isDirectory: true), URL(fileURLWithPath: base.path, isDirectory: false)]
      }
      for (index, hint) in hints.enumerated() {
        let label = "absent SoViOCR #\(index)"
        paths(label, hint)
        positive(label) {
          try require(!manager.fileExists(atPath: ocr.path), "first child must remain absent")
          let result = try OCRCachePaths.cacheDirectory(hint, subdirectory: "SoViOCR")
          inspect("returned", result)
          try require(result.standardizedFileURL.path == ocr.path, "missing child must return canonical path")
          try require(!manager.fileExists(atPath: ocr.path), "resolver must not create the child")
        }
      }
      try manager.createDirectory(at: ocr, withIntermediateDirectories: false)
      let image = ocr.appendingPathComponent("read.image")
      try bytes.write(to: image)
      for (index, hint) in hints.enumerated() {
        let label = "existing SoViOCR #\(index)"
        paths(label, hint)
        positive(label) {
          let result = try OCRCachePaths.cacheDirectory(hint, subdirectory: "SoViOCR")
          inspect("returned", result)
          try require(result.standardizedFileURL.path == ocr.path, "existing child must return canonical path")
        }
        let suppliedImage = hint.appendingPathComponent("SoViOCR/read.image", isDirectory: false)
        for uri in [suppliedImage, image] {
          positive("ownedFile #\(index) uri=\(uri.path)") {
            inspect("file supplied", uri)
            inspect("file supplied resolved", uri.resolvingSymlinksInPath().standardizedFileURL)
            let result = try OCRCachePaths.ownedFile(uri.absoluteString, cache: hint, subdirectory: "SoViOCR")
            inspect("file returned", result)
            try require(result.standardizedFileURL.path == image.path, "owned file must return canonical path")
            try require(try Data(contentsOf: result) == bytes, "owned file must actually be readable")
          }
        }
      }
      let outside = root.appendingPathComponent("outside-cache", isDirectory: true)
      try manager.createDirectory(at: outside, withIntermediateDirectories: false)
      for kind in ["outside-link", "inside-link", "dangling-link", "regular-file"] {
        let hostile = root.appendingPathComponent(kind, isDirectory: true)
        try manager.createDirectory(at: hostile, withIntermediateDirectories: false)
        let child = hostile.appendingPathComponent("SoViOCR", isDirectory: true)
        if kind == "regular-file" { try bytes.write(to: URL(fileURLWithPath: child.path, isDirectory: false)) }
        else {
          let target = kind == "outside-link" ? outside : hostile.appendingPathComponent("target", isDirectory: true)
          if kind == "inside-link" { try manager.createDirectory(at: target, withIntermediateDirectories: false) }
          try manager.createSymbolicLink(at: child, withDestinationURL: target)
        }
        paths(kind, hostile)
        reject(kind) { _ = try OCRCachePaths.cacheDirectory(hostile, subdirectory: "SoViOCR") }
      }
    } catch {
      let error = error as NSError
      failures.append("fixture setup: \(error.domain):\(error.code) \(error.localizedDescription)")
      print("FAIL: " + failures.last!)
    }
    do { try manager.removeItem(at: root) }
    catch { failures.append("fixture cleanup: \(error)"); print("FAIL: " + failures.last!) }
    guard failures.isEmpty else {
      throw NSError(domain: "OCRPathDiagnostic", code: 1, userInfo: [NSLocalizedDescriptionKey: failures.joined(separator: "\n")])
    }
    print("PASS: all OCR path diagnostic assertions; synthetic fixtures removed")
  }
}
