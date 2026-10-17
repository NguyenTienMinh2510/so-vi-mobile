import AppIntents
import Foundation
internal import SoViNative

enum SoViImportSource: String, AppEnum {
  case sms, email, text
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Nguồn nội dung")
  static var caseDisplayRepresentations: [SoViImportSource: DisplayRepresentation] = [.sms: "SMS", .email: "Email", .text: "Văn bản"]
}

struct SoViImportIntent: AppIntent {
  static var title: LocalizedStringResource = "Lưu nội dung vào Inbox Sổ Ví"
  static var description = IntentDescription("Lưu SMS hoặc email đã chọn trên điện thoại. Mở Sổ Ví để phân tích và duyệt; chưa ghi tiền vào sổ.")
  static var openAppWhenRun: Bool = true
  static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication
  @Parameter(title: "Nội dung") var text: String
  @Parameter(title: "Nguồn", default: .text) var source: SoViImportSource
  @Parameter(title: "Ngân hàng / nhà cung cấp", default: "Shortcuts") var provider: String
  @Parameter(title: "ID nguồn (nếu có)") var sourceId: String?
  static var parameterSummary: some ParameterSummary { Summary("Lưu \(\.$text) vào Inbox Sổ Ví") { \.$source; \.$provider; \.$sourceId } }
  func perform() async throws -> some IntentResult {
    try NativeInboxQueue.shared.enqueue(text: try SoViMessageText.plain(text), source: source.rawValue, provider: provider, sourceId: sourceId)
    return .result()
  }
}

struct SoViImportShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: SoViImportIntent(), phrases: ["Lưu nội dung vào \(.applicationName)"], shortTitle: "Lưu vào Inbox", systemImageName: "tray.and.arrow.down")
  }
}

/// Email automations can pass HTML bodies (BIDV: ~19k chars markup, ~1.1k chars text). Mirrors messageToPlainText in src/import.ts.
enum SoViMessageText {
  static let maximumRaw = 200_000
  static func plain(_ text: String) throws -> String {
    guard text.utf16.count <= maximumRaw else { throw NSError(domain: "SoVi", code: 413, userInfo: [NSLocalizedDescriptionKey: "Email quá dài. Chia sẻ đoạn thông báo giao dịch thay vì cả thư."]) }
    guard text.range(of: "<(?:html|body|table|div|span|td|p|br|font|meta|style)\\b[^>]*>", options: [.regularExpression, .caseInsensitive]) != nil else { return text }
    var value = text
    for (pattern, replacement) in [("<!--[\\s\\S]*?-->", ""), ("<(script|style|head|title)\\b[^>]*>[\\s\\S]*?</\\1\\s*>", ""), ("<br\\s*/?>|</(?:p|div|tr|li|h[1-6]|table|td|th)\\s*>", "\n"), ("<[^>]*>", "")] {
      value = value.replacingOccurrences(of: pattern, with: replacement, options: [.regularExpression, .caseInsensitive])
    }
    let numeric = try NSRegularExpression(pattern: "&#(x[0-9a-fA-F]+|[0-9]+);")
    for match in numeric.matches(in: value, range: NSRange(value.startIndex..., in: value)).reversed() {
      guard let whole = Range(match.range, in: value), let codeRange = Range(match.range(at: 1), in: value) else { continue }
      let code = String(value[codeRange]); let number = code.hasPrefix("x") || code.hasPrefix("X") ? UInt32(code.dropFirst(), radix: 16) : UInt32(code)
      value.replaceSubrange(whole, with: number.flatMap(Unicode.Scalar.init).map { String(Character($0)) } ?? "")
    }
    for (entity, character) in [("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"), ("&amp;", "&")] { value = value.replacingOccurrences(of: entity, with: character, options: .caseInsensitive) }
    return value.components(separatedBy: "\n").map { $0.replacingOccurrences(of: "[ \\t\\u00a0\\u200b]+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: "\n")
  }
}
