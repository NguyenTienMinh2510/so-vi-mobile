import Foundation
import Vision
import ImageIO
import CoreGraphics
import CoreText
import Darwin

// Compile beside the actual VisionOCR.swift; every image and amount here is synthetic.
@main struct ReceiptVisionCheck {
  static func main() throws {
    let manager = FileManager.default
    let temporary = manager.temporaryDirectory.resolvingSymlinksInPath().standardizedFileURL
    let root = temporary.appendingPathComponent("sovi-receipt-vision-" + UUID().uuidString, isDirectory: true)
    precondition(root.deletingLastPathComponent().path == temporary.path)
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: root) }
    var failures: [String] = []
    let labels = ["Tạm tính", "VAT", "Giảm giá", "Tổng thanh toán", "Khách đưa", "Tiền thừa"]
    let amounts = ["150.000", "12.000", "10.000", "152.000", "200.000", "48.000"]
    func log(_ message: String) { print(message); fflush(stdout) }
    func check(_ valid: Bool, _ message: String) {
      log((valid ? "PASS: " : "FAIL: ") + message)
      if !valid { failures.append(message) }
    }
    func folded(_ text: String) -> String {
      text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi-VN"))
        .replacingOccurrences(of: "đ", with: "d")
        .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    }
    func numbers(_ text: String) -> [String] {
      let expression = try! NSRegularExpression(pattern: "[0-9]+(?:[.,][0-9]{3})+")
      let range = NSRange(text.startIndex..., in: text)
      return expression.matches(in: text, range: range).map {
        String(text[Range($0.range, in: text)!]).replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: "")
      }.sorted()
    }
    let expectedNumbers = amounts.map { $0.replacingOccurrences(of: ".", with: "") }.sorted()
    func image(fontSize: CGFloat, splitColumns: Bool) throws -> CGImage {
      guard let context = CGContext(data: nil, width: 1600, height: 1200, bitsPerComponent: 8, bytesPerRow: 0,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw NSError(domain: "ReceiptVisionCheck", code: 1)
      }
      context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 1600, height: 1200))
      func draw(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat) {
        let attributes: [NSAttributedString.Key: Any] = [
          NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("Helvetica" as CFString, size, nil),
          NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1)
        ]
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
        context.textPosition = CGPoint(x: x, y: y); CTLineDraw(line, context)
      }
      draw("HÓA ĐƠN TỔNG HỢP THỬ", x: 100, y: 1080, size: 48)
      for index in labels.indices {
        let y = CGFloat(920 - index * 110)
        if splitColumns {
          draw(labels[index], x: 100, y: y, size: fontSize)
          draw(amounts[index] + " VND", x: 960, y: y, size: fontSize)
        } else { draw(labels[index] + ": " + amounts[index] + " VND", x: 100, y: y, size: fontSize) }
      }
      guard let result = context.makeImage() else { throw NSError(domain: "ReceiptVisionCheck", code: 2) }
      return result
    }
    func turned(_ original: CGImage) throws -> CGImage {
      guard let context = CGContext(data: nil, width: original.height, height: original.width, bitsPerComponent: 8, bytesPerRow: 0,
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw NSError(domain: "ReceiptVisionCheck", code: 3)
      }
      context.translateBy(x: CGFloat(original.height), y: 0); context.rotate(by: .pi / 2)
      context.draw(original, in: CGRect(x: 0, y: 0, width: CGFloat(original.width), height: CGFloat(original.height)))
      guard let result = context.makeImage() else { throw NSError(domain: "ReceiptVisionCheck", code: 4) }
      return result
    }
    func write(_ image: CGImage, name: String, orientation: CGImagePropertyOrientation) throws -> URL {
      let url = root.appendingPathComponent(name + ".tiff")
      guard let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.tiff" as CFString, 1, nil) else {
        throw NSError(domain: "ReceiptVisionCheck", code: 5)
      }
      CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: orientation.rawValue,
        kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFOrientation: orientation.rawValue]] as CFDictionary)
      guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "ReceiptVisionCheck", code: 6) }
      return url
    }
    func direct(_ image: CGImage, correction: Bool, label: String) throws {
      let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = correction
      let supported = try request.supportedRecognitionLanguages()
      let vietnamese = supported.filter { $0.lowercased().split(separator: "-").first == "vi" }
      let languages = vietnamese + supported.filter { $0 == "en-US" }
      log("MODEL: \(label) revision=\(request.revision) supported=\(supported) configured=\(languages) correction=\(correction)")
      check(!languages.isEmpty, label + " has a supported recognition language")
      guard !languages.isEmpty else { return }
      request.recognitionLanguages = languages
      try VNImageRequestHandler(cgImage: image).perform([request])
      let observations = request.results ?? []
      let rows = observations.compactMap { observation -> String? in
        guard let text = observation.topCandidates(1).first else { return nil }
        log("REGION: \(label) x=\(observation.boundingBox.minX) y=\(observation.boundingBox.midY) confidence=\(text.confidence) text=\(text.string)")
        return text.string
      }
      let text = rows.joined(separator: "\n")
      check(numbers(text) == expectedNumbers, label + " all six exact numbers match ground truth")
      let exactLabels = labels.filter { text.localizedCaseInsensitiveContains($0) }.count
      let foldedLabels = labels.filter { folded(text).contains(folded($0)) }.count
      log("ACCURACY: \(label) exactVietnameseLabels=\(exactLabels)/\(labels.count) foldedLabels=\(foldedLabels)/\(labels.count)")
      if vietnamese.isEmpty { log("WARNING: \(label) Vietnamese is unavailable for this request on this host; English fallback is not Vietnamese PASS") }
    }
    do {
      log("HOST: \(ProcessInfo.processInfo.operatingSystemVersionString); this host evidence does not establish iPhone support")
      let defaultRevision = VNRecognizeTextRequest().revision
      for revision in VNRecognizeTextRequest.supportedRevisions {
        let request = VNRecognizeTextRequest(); request.revision = revision; request.recognitionLevel = .accurate
        log("REVISION: value=\(revision) default=\(defaultRevision) accurateSupported=\(try request.supportedRecognitionLanguages())")
      }
      let clear = try image(fontSize: 42, splitColumns: false)
      let split = try image(fontSize: 30, splitColumns: true)
      try direct(clear, correction: false, label: "direct-clear-no-correction")
      try direct(clear, correction: true, label: "direct-clear-correction")
      try direct(split, correction: false, label: "direct-columns-no-correction")
      try direct(split, correction: true, label: "direct-columns-correction")
      let fixtures = [
        ("clear", try write(clear, name: "clear", orientation: .up)),
        ("columns-small", try write(split, name: "columns-small", orientation: .up)),
        ("columns-rotated", try write(turned(split), name: "columns-rotated", orientation: .right))
      ]
      for (name, url) in fixtures {
        for maximumPixelSize in [nil, 1200] as [Int?] {
          let label = name + (maximumPixelSize == nil ? "-app" : "-share1200")
          let result = try VisionOCR.recognize(url, maximumPixelSize: maximumPixelSize)
          log("SOURCE: \(label) languages=\(result.languages) warnings=\(result.warnings) text=\(result.text.replacingOccurrences(of: "\n", with: " | "))")
          check(numbers(result.text) == expectedNumbers, label + " all six exact numbers match ground truth")
          for value in ["Tổng thanh toán", "Khách đưa", "Tiền thừa"] {
            check(folded(result.text).contains(folded(value)), label + " retains label " + value)
          }
          let exact = labels.filter { result.text.localizedCaseInsensitiveContains($0) }.count
          log("ACCURACY: \(label) exactVietnameseLabels=\(exact)/\(labels.count)")
        }
      }
    } catch { failures.append("probe error: \(error)"); log("FAIL: probe error: \(error)") }
    try manager.removeItem(at: root)
    log("CLEANUP: synthetic fixture directory removed")
    guard failures.isEmpty else {
      throw NSError(domain: "ReceiptVisionCheck", code: 7, userInfo: [NSLocalizedDescriptionKey: failures.joined(separator: "\n")])
    }
    log("PASS: synthetic numeric/label/orientation/Share assertions; iPhone Vietnamese accuracy remains unverified")
  }
}
