import Foundation
import Darwin

@main
struct ModelMemoryCheck {
  static func peakRSS() -> Int64 {
    var usage = rusage()
    precondition(getrusage(RUSAGE_SELF, &usage) == 0)
    return Int64(usage.ru_maxrss)
  }
  static func main() throws {
    let documents = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
    let root = try ModelFileVerifier.directory()
    let candidate = root.appendingPathComponent("model.part")
    precondition(!FileManager.default.fileExists(atPath: candidate.path))
    precondition(FileManager.default.createFile(atPath: candidate.path, contents: nil))
    let output = try FileHandle(forWritingTo: candidate)
    try output.truncate(atOffset: ModelFileVerifier.byteCount)
    try output.close()
    let before = peakRSS()
    var rejected = false
    // Match the outer pool of a native callback; hash must drain its own chunks.
    try autoreleasepool {
      do { _ = try ModelFileVerifier.verify(candidate.absoluteString) }
      catch {
        guard error.localizedDescription.contains("Mã xác minh mô hình không khớp") else {
          FileHandle.standardError.write(Data("MODEL_NATIVE_ERROR: \(error.localizedDescription)\n".utf8))
          throw error
        }
        rejected = true
      }
    }
    let growth = peakRSS() - before
    FileHandle.standardError.write(Data("MODEL_MEMORY bytes=\(ModelFileVerifier.byteCount) peakGrowthBytes=\(growth) checksumRejected=\(rejected)\n".utf8))
    precondition(rejected, "Full-size corrupt fixture must never be accepted")
    if growth >= 128 * 1_048_576 {
      FileHandle.standardError.write(Data("FAIL: Model hash memory grows with file size\n".utf8))
      exit(EXIT_FAILURE)
    }
    precondition(!FileManager.default.fileExists(atPath: root.appendingPathComponent("model.gguf").path))
    print("PASS: actual full-size native verifier checksum guard and bounded memory")
  }
}
