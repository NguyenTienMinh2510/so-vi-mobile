import UIKit
import UniformTypeIdentifiers

final class SoViShareViewController: UIViewController, UITextViewDelegate {
  private let editor = UITextView()
  private let status = UILabel()
  private let save = UIButton(type: .system)
  private let retry = UIButton(type: .system)
  private let cancel = UIButton(type: .system)
  private var busy = false
  private var saving = false
  private var finished = false
  private var providerProgress: Progress?
  private var ownedImage: URL?
  private let itemID = UUID().uuidString.lowercased()
  override func viewDidLoad() {
    super.viewDidLoad(); view.backgroundColor = UIColor(red: 0.04, green: 0.06, blue: 0.07, alpha: 1)
    let heading = UILabel(); heading.text = "Chia sẻ vào Inbox Sổ Ví"; heading.font = .preferredFont(forTextStyle: .headline); heading.textColor = .white; heading.adjustsFontForContentSizeCategory = true; heading.numberOfLines = 0; heading.accessibilityTraits = .header
    let explanation = UILabel(); explanation.text = "Kiểm tra và sửa văn bản trước khi lưu. Ảnh được đọc trên iPhone; chưa ghi tiền vào sổ."; explanation.numberOfLines = 0; explanation.font = .preferredFont(forTextStyle: .body); explanation.textColor = .lightGray; explanation.adjustsFontForContentSizeCategory = true
    editor.backgroundColor = UIColor(white: 0.12, alpha: 1); editor.textColor = .white; editor.font = .preferredFont(forTextStyle: .body); editor.adjustsFontForContentSizeCategory = true; editor.delegate = self; editor.accessibilityLabel = "Văn bản chia sẻ — kiểm tra và sửa"; editor.layer.cornerRadius = 12
    status.numberOfLines = 0; status.textColor = .lightGray; status.font = .preferredFont(forTextStyle: .footnote); status.adjustsFontForContentSizeCategory = true; status.accessibilityTraits = .updatesFrequently
    save.setTitle("Lưu vào Inbox", for: .normal); save.addTarget(self, action: #selector(saveItem), for: .touchUpInside)
    retry.setTitle("Thử nhận diện lại", for: .normal); retry.addTarget(self, action: #selector(retryImage), for: .touchUpInside); retry.isHidden = true
    cancel.setTitle("Hủy", for: .normal); cancel.addTarget(self, action: #selector(cancelShare), for: .touchUpInside)
    for button in [save, retry, cancel] { button.titleLabel?.font = .preferredFont(forTextStyle: .body); button.titleLabel?.adjustsFontForContentSizeCategory = true; button.titleLabel?.numberOfLines = 0; button.titleLabel?.textAlignment = .center; button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true }
    let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false; scroll.keyboardDismissMode = .interactive; view.addSubview(scroll)
    let stack = UIStackView(arrangedSubviews: [heading, explanation, editor, status, retry, save, cancel]); stack.axis = .vertical; stack.spacing = 12; stack.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(stack)
    NSLayoutConstraint.activate([scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor), stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 16), stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 16), stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -16), stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -16), stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -32), editor.heightAnchor.constraint(equalToConstant: 240)])
    update(); receiveSelectedItem()
  }
  private func update(_ message: String? = nil) {
    let count = editor.text.utf16.count
    save.isEnabled = !busy && !finished && count <= 4000 && !editor.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    editor.isEditable = !busy && !finished; retry.isEnabled = !busy && !finished; cancel.isEnabled = !saving && !finished
    status.text = message ?? "\(count)/4.000 ký tự. Lưu xong, mở Sổ Ví → Inbox để phân tích và duyệt."
    if count > 4000 { status.text = "\(count)/4.000 ký tự. Nội dung được giữ nguyên; hãy rút gọn trước khi lưu." }
    if message != nil { UIAccessibility.post(notification: .announcement, argument: status.text) }
  }
  func textViewDidChange(_ textView: UITextView) { update() }
  private func receiveSelectedItem() {
    guard let items = extensionContext?.inputItems as? [NSExtensionItem], items.count == 1 else { update("Chỉ chia sẻ một văn bản hoặc một ảnh mỗi lần."); return }
    let attachments = items[0].attachments ?? []
    if attachments.isEmpty, let text = items[0].attributedContentText?.string { editor.text = text; update(); return }
    guard attachments.count == 1 else { update("Chỉ chọn một văn bản hoặc một ảnh mỗi lần. Nội dung gốc được giữ."); return }
    let provider = attachments[0]; busy = true; update("Đang đọc nội dung đã chọn…")
    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      providerProgress = provider.loadObject(ofClass: NSString.self) { [weak self] item, error in
        DispatchQueue.main.async { guard let self, !self.finished else { return }; self.busy = false; if let text = item as? String { self.editor.text = text; self.update() } else { self.update(error?.localizedDescription ?? "Không đọc được văn bản. Nội dung gốc được giữ.") } }
      }
    } else if let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) {
      providerProgress = provider.loadFileRepresentation(forTypeIdentifier: type) { [weak self] source, error in
        guard let self else { return }
        var copied: URL?
        do {
          guard let source else { throw error ?? NSError(domain: "SoViShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "Không đọc được ảnh đã chọn."]) }
          let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]); guard values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize, size > 0, size <= 20 * 1024 * 1024 else { throw NSError(domain: "SoViShare", code: 1, userInfo: [NSLocalizedDescriptionKey: "Chọn ảnh tối đa 20 MB. Ảnh gốc được giữ."]) }
          let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".image")
          copied = copy
          try FileManager.default.copyItem(at: source, to: copy); try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: copy.path)
          DispatchQueue.main.async { if self.finished { try? FileManager.default.removeItem(at: copy); return }; self.ownedImage = copy; self.busy = false; self.retry.isHidden = false; self.readImage() }
        } catch { if let copied { try? FileManager.default.removeItem(at: copied) }; DispatchQueue.main.async { if !self.finished { self.busy = false; self.update(error.localizedDescription) } } }
      }
    } else { busy = false; update("Chỉ hỗ trợ văn bản thuần hoặc một ảnh. Không tải nội dung từ Internet.") }
  }
  private func readImage() {
    guard !busy, !finished, let ownedImage else { return }; busy = true; update("Đang nhận diện ảnh trên iPhone…")
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result = Result { try VisionOCR.recognize(ownedImage, maximumPixelSize: 1200) }
      DispatchQueue.main.async { guard let self, !self.finished else { return }; self.busy = false
        switch result { case .success(let value): if !value.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { self.editor.text = value.text; self.update(value.warnings.joined(separator: "\n") + "\nKiểm tra và sửa trước khi lưu.") } else { self.update("Không tìm thấy chữ. Bản nháp và ảnh gốc được giữ; thử lại hoặc nhập văn bản.") }
        case .failure(let error): self.update(error.localizedDescription + " Bản nháp và ảnh gốc được giữ.") }
      }
    }
  }
  @objc private func retryImage() { if !editor.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { let alert = UIAlertController(title: "Nhận diện lại?", message: "Kết quả mới sẽ thay văn bản đang sửa.", preferredStyle: .alert); alert.addAction(UIAlertAction(title: "Giữ bản nháp", style: .cancel)); alert.addAction(UIAlertAction(title: "Nhận diện lại", style: .default) { _ in self.readImage() }); present(alert, animated: true) } else { readImage() } }
  @objc private func saveItem() {
    guard save.isEnabled, !busy, !finished else { return }; busy = true; saving = true; update("Đang lưu nội dung vào hàng chờ…")
    let text = editor.text ?? ""
    let id = itemID
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let result = Result { try SharedAppGroupResolver.appGroupQueue().append(text: text, provider: "Chia sẻ", id: id) }
      DispatchQueue.main.async { guard let self, !self.finished else { return }; self.busy = false; self.saving = false
        switch result { case .success: self.finished = true; self.cleanImage(); self.editor.isEditable = false; self.save.isEnabled = false; self.status.text = "Đã lưu nội dung. Mở Sổ Ví → Inbox để phân tích và duyệt; chưa ghi tiền vào sổ."; UIAccessibility.post(notification: .announcement, argument: self.status.text); self.extensionContext?.completeRequest(returningItems: nil)
        case .failure(let error): self.update(error.localizedDescription) }
      }
    }
  }
  private func cleanImage() { if let ownedImage { try? FileManager.default.removeItem(at: ownedImage) }; ownedImage = nil }
  @objc private func cancelShare() { guard !saving else { update("Chờ lưu nội dung hoàn tất trước khi hủy."); return }; finished = true; providerProgress?.cancel(); cleanImage(); extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError)) }
  deinit { if let ownedImage { try? FileManager.default.removeItem(at: ownedImage) } }
}
