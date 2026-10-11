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
    AsyncFunction("pendingSharedImportsAsync") { () throws -> [[String: Any]] in
      try SharedAppGroupResolver.appGroupQueue().pending().map { event in ["id": event.id, "source": event.source, "provider": event.provider, "sourceId": NSNull(), "text": event.text, "receivedAt": event.receivedAt] }
    }
    AsyncFunction("acknowledgeSharedImportAsync") { (id: String) in try SharedAppGroupResolver.appGroupQueue().acknowledge(id: id) }
    AsyncFunction("sharedInboxStatus") { () -> [String: Any] in
      do { _ = try SharedAppGroupResolver.appGroupQueue(); return ["available": true, "error": ""] }
      catch { return ["available": false, "error": error.localizedDescription] }
    }
    AsyncFunction("clearOcrCacheAsync") { () in
      let cache = try self.cacheDirectory()
      let root = try OCRCachePaths.cacheDirectory(cache, subdirectory: "SoViOCR")
      if FileManager.default.fileExists(atPath: root.path) {
        for file in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) where file.pathExtension == "image" { try FileManager.default.removeItem(at: OCRCachePaths.ownedFile(file.absoluteString, cache: cache, subdirectory: "SoViOCR")) }
      }
    }
    AsyncFunction("removeImageCopyAsync") { (uri: String) in
      let cache = try self.cacheDirectory()
      guard let file = (try? OCRCachePaths.ownedFile(uri, cache: cache, subdirectory: nil, requireUUID: true)) ?? (try? OCRCachePaths.ownedFile(uri, cache: cache, subdirectory: "ImagePicker", requireUUID: true)) else { return }
      if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    AsyncFunction("recognizeTextAsync") { (uri: String) throws -> [String: Any] in
      try self.recognize(uri)
    }.runOnQueue(DispatchQueue(label: "local.sovi.vision", qos: .userInitiated))
  }
  private func cacheDirectory() throws -> URL {
    if let cache = appContext?.config.cacheDirectory { return cache }
    return try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
  }
  private func recognize(_ uri: String) throws -> [String: Any] {
    let cache = try cacheDirectory()
    let url = try OCRCachePaths.ownedFile(uri, cache: cache, subdirectory: "SoViOCR")
    return try VisionOCR.recognize(url).dictionary
  }
}
