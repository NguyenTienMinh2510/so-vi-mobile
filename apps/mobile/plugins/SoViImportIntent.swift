import AppIntents
import SoViNative

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
    try NativeInboxQueue.shared.enqueue(text: text, source: source.rawValue, provider: provider, sourceId: sourceId)
    return .result()
  }
}

struct SoViImportShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: SoViImportIntent(), phrases: ["Lưu nội dung vào \(.applicationName)"], shortTitle: "Lưu vào Inbox", systemImageName: "tray.and.arrow.down")
  }
}
