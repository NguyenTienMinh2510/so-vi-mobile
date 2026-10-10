import Foundation

// Runs the actual Foundation queue on macOS in an isolated directory, never the app's data.
@main struct QueueCheck {
  static func main() throws {
    func check(_ condition: @autoclosure () throws -> Bool) rethrows { let result = try condition(); assert(result) }
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("sovi-queue-check-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let queue = NativeInboxQueue(directory: root)
    func send(_ text: String = "Thanh toán thành công 58.000 VND") throws -> NativeInboxEnvelope {
      try queue.enqueue(text: text, source: "sms", provider: "Ngân hàng", sourceId: nil)
    }
    func rejects(_ action: () throws -> Void) {
      do { try action(); fatalError("Expected rejection") } catch { }
    }
    let first = try send(); let reopened = NativeInboxQueue(directory: root)
    try check(reopened.pending().count == 1)
    try check(reopened.pending().first?.id == first.id)
    let firstFile = root.appendingPathComponent(first.id + ".json")
    let object = try JSONSerialization.jsonObject(with: Data(contentsOf: firstFile)) as! [String: Any]
    assert(object["sourceId"] is NSNull, "JSON must include explicit null sourceId")
    rejects { _ = try send(String(repeating: "😀", count: 2000) + "x") }
    let unicode = try send(String(repeating: "😀", count: 2000)); try reopened.acknowledge(unicode.id)
    rejects { try queue.acknowledge("../escape") }
    for _ in 1..<50 { _ = try send() }
    let before = try queue.pending().map(\.id).sorted()
    rejects { _ = try send() }; try check(queue.pending().map(\.id).sorted() == before)
    for id in before { try queue.acknowledge(id) }
    let corruptID = UUID().uuidString.lowercased()
    let corrupt = root.appendingPathComponent(corruptID + ".json")
    let bytes = Data("not JSON".utf8); try bytes.write(to: corrupt)
    rejects { _ = try queue.pending() }; try check(Data(contentsOf: corrupt) == bytes)
    try FileManager.default.removeItem(at: corrupt)
    let huge = Data(repeating: 0, count: 24 * 1024 + 1); try huge.write(to: corrupt)
    rejects { _ = try queue.pending() }; try check(Data(contentsOf: corrupt) == huge)
    try FileManager.default.removeItem(at: corrupt)
    var old: [String] = []; for _ in 0..<10 { old.append(try send().id) }
    let errors = NSLock(); var failures = 0
    DispatchQueue.concurrentPerform(iterations: 30) { index in
      do {
        if index < 10 { try reopened.acknowledge(old[index]) }
        else { _ = try queue.enqueue(text: "New message \(index)", source: "text", provider: "Kiểm thử", sourceId: nil) }
      } catch { errors.lock(); failures += 1; errors.unlock() }
    }
    assert(failures == 0); let final = try reopened.pending()
    assert(final.count == 20); assert(Set(final.map(\.id)).count == 20)
    assert(final.allSatisfy { !old.contains($0.id) })
    let snapshot = try reopened.pending().map(\.id).sorted()
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: root.path)
    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path) }
    rejects { _ = try send() }
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
    try check(reopened.pending().map(\.id).sorted() == snapshot)
    print("PASS: native queue restart, nulls, UTF16, invalid IDs, overflow, corrupt/oversize preservation, concurrent append/ack, failed write preservation")
  }
}
