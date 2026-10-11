import Foundation

// Compile actual NativeInboxQueue.swift + SharedInboxQueue.swift with this file on macOS.
@main struct SharedInboxCheck {
  static func check(_ condition: @autoclosure () throws -> Bool) rethrows { let value = try condition(); assert(value) }
  static func reject(_ label: String, _ action: () throws -> Void) {
    do { try action(); fatalError("Expected rejection: " + label) } catch { }
  }
  static func main() throws {
    let args = CommandLine.arguments
    if args.count > 2 {
      let queue = SharedInboxQueue(directory: URL(fileURLWithPath: args[2], isDirectory: true))
      if args[1] == "append-worker" {
        let count = Int(args[3])!
        for number in 0..<count { do { _ = try queue.append(text: "worker \(ProcessInfo.processInfo.processIdentifier)-\(number)", provider: "Chia sẻ", id: nil) } catch { } }
        return
      }
      if args[1] == "ack-worker" { for id in args.dropFirst(3) { try queue.acknowledge(id: id) }; return }
      fatalError("Unknown worker mode")
    }
    let manager = FileManager.default
    let root = manager.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("sovi-shared-check-" + UUID().uuidString, isDirectory: true)
    try manager.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? manager.removeItem(at: root) }
    func directory(_ name: String) throws -> URL { let path = root.appendingPathComponent(name, isDirectory: true); try manager.createDirectory(at: path, withIntermediateDirectories: true); return path }
    func contents(_ directory: URL) throws -> [URL] { try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) }
    func process(_ arguments: [String]) throws -> Process { let process = Process(); process.executableURL = URL(fileURLWithPath: args[0]); process.arguments = arguments; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice; try process.run(); return process }
    func wait(_ processes: [Process]) { for process in processes { process.waitUntilExit(); assert(process.terminationStatus == 0) } }
    let sharedRoot = try directory("shared"); let queue = SharedInboxQueue(directory: sharedRoot)
    let original = try queue.append(text: "Thanh toán thành công 58.000 VND", provider: "Chia sẻ", id: nil)
    assert(original.source == "text" && original.sourceId == nil && original.provider == "Chia sẻ")
    assert(original.id == original.id.lowercased() && UUID(uuidString: original.id) != nil)
    let file = sharedRoot.appendingPathComponent(original.id + ".json"); let originalBytes = try Data(contentsOf: file)
    let object = try JSONSerialization.jsonObject(with: originalBytes) as! [String: Any]
    assert(Set(object.keys) == Set(["id", "source", "provider", "sourceId", "text", "receivedAt"]))
    assert(object["sourceId"] is NSNull)
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    assert(formatter.date(from: original.receivedAt) != nil)
    let replay = try SharedInboxQueue(directory: sharedRoot).append(text: original.text, provider: original.provider, id: original.id)
    assert(replay.id == original.id && replay.receivedAt == original.receivedAt)
    try check(Data(contentsOf: file) == originalBytes)
    reject("same ID different payload") { _ = try queue.append(text: "changed", provider: "Chia sẻ", id: original.id) }
    try check(Data(contentsOf: file) == originalBytes)
    try check(queue.pending().count == 1)
    for (text, provider) in [("", "Chia sẻ"), ("  ", "Chia sẻ"), (String(repeating: "😀", count: 2000) + "x", "Chia sẻ"), ("Text", ""), ("Text", String(repeating: "p", count: 201))] {
      reject("hostile input bounds") { _ = try queue.append(text: text, provider: provider, id: nil) }
    }
    reject("path ID") { _ = try queue.append(text: "Text", provider: "Chia sẻ", id: "../outside") }
    reject("ACK path ID") { try queue.acknowledge(id: "../outside") }
    let exact = try queue.append(text: String(repeating: "😀", count: 2000), provider: "Chia sẻ", id: nil)
    try queue.acknowledge(id: exact.id); try queue.acknowledge(id: exact.id)
    for item in try contents(sharedRoot) { assert(item.lastPathComponent == ".lock" || (item.pathExtension == "json" && UUID(uuidString: item.deletingPathExtension().lastPathComponent) != nil)) }

    // A crash before app ACK leaves a durable original; reopening then ACK removes only that item.
    let reopened = SharedInboxQueue(directory: sharedRoot); try check(reopened.pending().map(\.id) == [original.id])
    try reopened.acknowledge(id: original.id); try check(queue.pending().isEmpty)
    let privateRoot = try directory("private"); let privateQueue = NativeInboxQueue(directory: privateRoot)
    let privateItem = try privateQueue.enqueue(text: "Private pending", source: "sms", provider: "Shortcuts", sourceId: nil)
    let privateFile = privateRoot.appendingPathComponent(privateItem.id + ".json"); let privateBytes = try Data(contentsOf: privateFile)
    let sharedItem = try queue.append(text: "Shared pending", provider: "Chia sẻ", id: nil); try queue.acknowledge(id: sharedItem.id)
    try check(privateQueue.pending().map(\.id) == [privateItem.id]); try check(Data(contentsOf: privateFile) == privateBytes)

    // Unknown/corrupt/oversize files are retained, with only the fixed .lock excluded.
    for name in [".unknown", "unexpected.txt", UUID().uuidString.lowercased() + ".json"] {
      let corrupt = sharedRoot.appendingPathComponent(name); let bytes = Data("not-json".utf8); try bytes.write(to: corrupt)
      reject("unknown/corrupt queue file") { _ = try queue.pending() }
      reject("append while corruption exists") { _ = try queue.append(text: "do not discard", provider: "Chia sẻ", id: nil) }
      try check(Data(contentsOf: corrupt) == bytes); try manager.removeItem(at: corrupt)
    }
    let largeFile = sharedRoot.appendingPathComponent(UUID().uuidString.lowercased() + ".json"); let huge = Data(repeating: 0, count: 24 * 1024 + 1); try huge.write(to: largeFile)
    reject("oversize serialized queue file") { _ = try queue.pending() }; try check(Data(contentsOf: largeFile) == huge); try manager.removeItem(at: largeFile)
    let malformed = try queue.append(text: "Malformed fixture", provider: "Chia sẻ", id: nil); let malformedFile = sharedRoot.appendingPathComponent(malformed.id + ".json"); let validBytes = try Data(contentsOf: malformedFile)
    let validObject = try JSONSerialization.jsonObject(with: validBytes) as! [String: Any]
    for change in ["unknown": "x", "receivedAt": "2099-01-01T00:00:00.000Z", "source": "sms", "id": UUID().uuidString.lowercased()] {
      var value = validObject; value[change.key] = change.value; let bytes = try JSONSerialization.data(withJSONObject: value); try bytes.write(to: malformedFile)
      reject("untrusted serialized envelope") { _ = try queue.pending() }; reject("ACK untrusted envelope") { try queue.acknowledge(id: malformed.id) }; try check(Data(contentsOf: malformedFile) == bytes)
    }
    try validBytes.write(to: malformedFile); try queue.acknowledge(id: malformed.id)
    let outside = root.appendingPathComponent("outside.json"); try Data("outside-preserve".utf8).write(to: outside)
    let linkID = UUID().uuidString.lowercased(); let link = sharedRoot.appendingPathComponent(linkID + ".json"); try manager.createSymbolicLink(at: link, withDestinationURL: outside)
    reject("queue symlink") { _ = try queue.pending() }; reject("ACK symlink") { try queue.acknowledge(id: linkID) }; try manager.removeItem(at: link)
    let lockRoot = try directory("lock-link"); try manager.createSymbolicLink(at: lockRoot.appendingPathComponent(".lock"), withDestinationURL: outside)
    reject("fixed lock symlink") { _ = try SharedInboxQueue(directory: lockRoot).append(text: "Blocked", provider: "Chia sẻ", id: nil) }
    try check(Data(contentsOf: outside) == Data("outside-preserve".utf8))

    // Separate processes must share a real filesystem lock; a process-local NSLock does not satisfy this.
    let concurrent = try directory("concurrent"); let concurrentQueue = SharedInboxQueue(directory: concurrent)
    var workers: [Process] = []; for _ in 0..<8 { workers.append(try process(["append-worker", concurrent.path, "20"])) }; wait(workers)
    let atCapacity = try concurrentQueue.pending(); assert(atCapacity.count == 50); assert(Set(atCapacity.map(\.id)).count == 50)
    reject("full queue") { _ = try concurrentQueue.append(text: "51st", provider: "Chia sẻ", id: nil) }
    for item in atCapacity { try concurrentQueue.acknowledge(id: item.id) }
    var originals: [String] = []; for number in 0..<20 { originals.append(try concurrentQueue.append(text: "Original \(number)", provider: "Chia sẻ", id: nil).id) }
    let acknowledger = try process(["ack-worker", concurrent.path] + Array(originals.prefix(10)))
    let writer = try process(["append-worker", concurrent.path, "20"]); wait([acknowledger, writer])
    let final = try concurrentQueue.pending(); assert(final.count == 30); assert(Set(final.map(\.id)).count == 30); assert(final.allSatisfy { !originals.prefix(10).contains($0.id) }); assert(originals.suffix(10).allSatisfy { id in final.contains { $0.id == id } })
    try manager.setAttributes([.posixPermissions: 0o500], ofItemAtPath: sharedRoot.path)
    reject("failed durable write") { _ = try queue.append(text: "Write must fail", provider: "Chia sẻ", id: nil) }
    try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: sharedRoot.path); try check(queue.pending().isEmpty); try check(Data(contentsOf: privateFile) == privateBytes)
    let base = "group.local.sovi.moneytracker"; let parent = "local.sovi.moneytracker"; let team = "AB12CD34EF"
    let candidate = try SharedAppGroupResolver.candidates(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent + "." + team, altAppGroups: [base, base + "." + team, base + "." + team, "group.foreign", base + ".short", base + ".ab12cd34ef", base + ".AB12CD34EFXX"])
    assert(Set(candidate) == Set([base, base + "." + team])); assert(candidate.count == 2)
    let exactCandidate = try SharedAppGroupResolver.candidates(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent, altAppGroups: [])
    assert(exactCandidate == [base])
    reject("wrong configured group") { _ = try SharedAppGroupResolver.candidates(base: "group.foreign", parentBundleIdentifier: parent, actualParentBundleIdentifier: parent, altAppGroups: []) }
    reject("wrong configured parent") { _ = try SharedAppGroupResolver.candidates(base: base, parentBundleIdentifier: "local.foreign", actualParentBundleIdentifier: parent, altAppGroups: []) }
    let groupContainer = try directory("group-container")
    let alias = root.appendingPathComponent("group-alias"); try manager.createSymbolicLink(at: alias, withDestinationURL: groupContainer)
    let same = try SharedAppGroupResolver.resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent + "." + team, altAppGroups: [base], container: { group in group == base ? groupContainer : alias })
    assert(same == groupContainer)
    let remapped = try SharedAppGroupResolver.resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent + "." + team, altAppGroups: [], container: { group in group == base + "." + team ? groupContainer : nil })
    assert(remapped == groupContainer)
    let otherContainer = try directory("other-group-container")
    reject("ambiguous distinct containers") { _ = try SharedAppGroupResolver.resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent + "." + team, altAppGroups: [base], container: { group in group == base ? groupContainer : otherContainer }) }
    reject("denied AppGroup access") { _ = try SharedAppGroupResolver.resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent, altAppGroups: [], container: { _ in nil }) }
    reject("nonfile container") { _ = try SharedAppGroupResolver.resolve(base: base, parentBundleIdentifier: parent, actualParentBundleIdentifier: parent, altAppGroups: [], container: { _ in URL(string: "https://example.test/container")! }) }
    print("PASS: shared durable append/restart/retry/ACK, bounds/corrupt preservation, trusted regular files, cross-process flock capacity+ACK, old private queue preservation")
  }
}
