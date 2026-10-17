# Thử Smart Import văn bản

Vào **Thêm → Inbox → Dán nội dung mới**. Chọn nguồn, nhập ngân hàng/nhà cung cấp và dán SMS/email. App phân tích trên điện thoại, không gửi nội dung tài chính lên cloud và không tự đọc hộp thư.

1. Chạm **Lưu vào Inbox**. Bước này chỉ lưu nội dung, chưa tạo giao dịch.
2. Mở mục vừa lưu, chạm **Phân tích nội dung**, rồi mở lại mục trong Inbox.
3. Kiểm tra đề xuất: số tiền VND nguyên, thu/chi hoặc chuyển giữa hai ví của bạn, danh mục và ngày giờ. Ngày mặc định là lúc nhận nội dung; hãy sửa về lúc giao dịch thực tế.
4. Chạm **Xác nhận ghi sổ** sau khi đối chiếu. Chuyển cho người khác là Chi; chuyển ví chỉ dùng khi cả hai ví thuộc bạn.

Đơn chờ, thông báo số dư và nội dung chưa nhận diện không tạo thu/chi. Mã nguồn/tham chiếu giúp chống nhập trùng; hai giao dịch cùng số tiền vẫn được giữ để duyệt khi không có mã chứng minh trùng. **Bỏ qua, giữ lịch sử** giữ nội dung và có thể mở lại một nguồn trùng chưa ghi sổ để duyệt.

Giới hạn 4.000 ký tự được kiểm tra trước khi lưu. Nội dung dài hơn phải được rút gọn chủ động. Parser chỉ nhận các dạng tiền VND có nhãn/đơn vị đã hỗ trợ; trường không chắc chắn cần nhập lại khi duyệt.

## Checklist trên sổ thử

- [ ] Dán `Thanh toán thành công số tiền 58.000 VND. Số dư 942.000 VND. Mã giao dịch: TEST001`. Lưu/phân tích chưa đổi số dư; đề xuất Chi58.000đ, không nhầm942.000đ.
- [ ] Duyệt và xác nhận một lần; chạm nhanh hai lần không tạo hai giao dịch. Dán lại cùng ngân hàng/mãTEST001 không ghi thêm.
- [ ] Hai thông báo thanh toán58.000đ không có mã tham chiếu vẫn được giữ để duyệt; kiểm tra đó có thật sự là hai giao dịch.
- [ ] Đơn đang chờ và thông báo số dư không có nút xác nhận thu/chi. Hoàn tiền đề xuất Thu; chuyển nội bộ cần hai ví của bạn.
- [ ] Dán trên4.000 ký tự: app giữ bản dán, báo lỗi và chưa tạo mục Inbox.
- [ ] **Thêm → Kiểm tra SQLite trên thiết bị**: lưu lại12 dòng kết quả hoặc nguyên lỗi. Database kiểm tra riêng, không thay dữ liệu thật.
- [ ] Xuất JSON mới vào Files, kiểm tra preview có số mục Inbox; khôi phục trên sổ thử và đối chiếu nội dung, liên kết giao dịch, số dư. FileJSON chứa cả nội dungSMS/email đã dán: giữ file riêng tư. Backup mới schema2; bản app cũ chưa hỗ trợ schema2.
- [ ] Thử tăng cỡ chữ, VoiceOver, bàn phím và thao tác quay lại khi đang nhập/lưu.

**Smart Import mới: CHƯA THỬ trên iPhone.** Người dùng đã xác nhận lõi và backup trước đợt mở rộng; kết quả đó chưa bao gồm Inbox/migration3/backupschema2.

## Bản iOS riêng và chi phí

Chưa cần mua Apple Developer để tiếp tục bản Expo Go. Apple Developer Program giá99USD/năm chủ yếu phục vụ phân phối/TestFlight/AppStore và một số quyền hệ thống. [Apple](https://developer.apple.com/programs/)

Nếu có thể dùng Mac, Xcode Personal Team với Apple Account miễn phí cho phép cài lên iPhone, nhưng provisioning hết hạn sau7 ngày và cần ký/cài lại. Expo hướng dẫn build cục bộ bằng công cụ native cho lựa chọn này. [Apple](https://developer.apple.com/help/account/basics/about-your-developer-account), [Expo](https://docs.expo.dev/develop/development-builds/introduction/)

AltStore Classic có cách cài trên Windows và gia hạn app mỗi7 ngày; vẫn cần fileIPA tương thích đã được xây, không thay thế công đoạn tạo binary iOS. [Windows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows), [gia hạn](https://faq.altstore.io/altstore-classic/your-altstore)

FaceID không thử được trong Expo Go. OCR native/widget/extension cần kiểm tra build, quyền hệ thống và thiết bị; chưa được triển khai hoặc nghiệm thu. Không đăng ký dịch vụ, ký hay phát hành trong đợt này.
