import WidgetKit
import SwiftUI

struct SoViEntry: TimelineEntry { let date: Date }
struct SoViProvider: TimelineProvider {
  func placeholder(in context: Context) -> SoViEntry { SoViEntry(date: Date()) }
  func getSnapshot(in context: Context, completion: @escaping (SoViEntry) -> Void) { completion(SoViEntry(date: Date())) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<SoViEntry>) -> Void) { completion(Timeline(entries: [SoViEntry(date: Date())], policy: .never)) }
}
struct SoViWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: SoViEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Sổ Ví").font(.headline).foregroundStyle(Color(red: 0.13, green: 0.83, blue: 0.64))
      if family == .systemSmall {
        Label("Ghi khoản chi", systemImage: "plus.circle.fill").font(.title3)
        Text("Mở sổ để nhập và xác nhận").font(.caption)
      } else {
        HStack(spacing: 24) { action("Ghi chi", icon: "plus.circle", url: "sovi:///transaction"); action("Chụp ảnh", icon: "camera", url: "sovi:///import-text?input=camera") }
        HStack(spacing: 24) { action("Văn bản", icon: "doc.text", url: "sovi:///import-text"); action("Inbox", icon: "tray", url: "sovi:///inbox") }
      }
    }.foregroundStyle(.white).frame(maxWidth: .infinity, alignment: .leading)
      .containerBackground(Color(red: 0.04, green: 0.06, blue: 0.07), for: .widget)
      .widgetURL(URL(string: "sovi:///transaction"))
  }
  private func action(_ title: String, icon: String, url: String) -> some View { Link(destination: URL(string: url)!) { Label(title, systemImage: icon).font(.body).frame(maxWidth: .infinity, alignment: .leading) }.accessibilityLabel(title + ", mở Sổ Ví") }
}
@main struct SoViWidget: Widget {
  let kind = "SoViQuickActions"
  var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: SoViProvider()) { SoViWidgetView(entry: $0) }.configurationDisplayName("Sổ Ví · Nhập nhanh").description("Mở sổ để ghi chi hoặc duyệt nội dung. Không hiển thị dữ liệu tài chính.").supportedFamilies([.systemSmall, .systemMedium]) }
}
