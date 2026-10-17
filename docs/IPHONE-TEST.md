# Thử Sổ Ví trên iPhone

Người dùng đã xác nhận **lõi và backup chạy thành công trên iPhone** trước đợt mở rộng. Chưa thu kết quả chi tiết của từng mục bên dưới. Smart Import mới có [checklist riêng](SMART-IMPORT.md); kết quả lõi trước đây không thay thế kiểm tra Inbox, migration3 và backupschema2. Điền phiên bản iOS, Expo Go, ngày thử và kết quả thực tế; mục chưa chạy giữ **CHƯA THỬ**.

## Chuẩn bị

Cài Expo Go từ App Store và đăng nhập cùng tài khoản Expo đang dùng trên laptop. SDK57 hiện yêu cầu đăng nhập ở cả hai phía ([nguồn Expo](https://expo.dev/changelog/expo-go-57-login)). Sổ Ví tự lưu SQLite trên điện thoại, không yêu cầu tài khoản online riêng.

Máy chủ tunnel hiện tại đã được xác nhận thuộc Sổ Ví, PID29432, cổng8081; bundle iOS tải qua tunnel HTTP200. Expo CLI laptop đã đăng nhập; không đổi tài khoản Codex. Giữ laptop và máy chủ Expo hoạt động. Tunnel có thể đổi địa chỉ sau khi khởi động lại; khi đó dùng QR mới từ terminal.

![Quét QR bằng Camera iPhone](./sovi-qr.png)

Địa chỉ hiện tại: `exp://xqycvq0-anhgook123885-8081.exp.direct`. Nếu xem hướng dẫn ngay trên iPhone, mở Expo Go rồi chọn máy chủ dự án của cùng tài khoản. Nếu không vào được, ghi nguyên lỗi để chẩn đoán; không gỡ Expo Go hoặc xóa dữ liệu để thử sửa. Cùng Wi-Fi giúp dùng LAN nếu tunnel có vấn đề.

## Checklist bắt buộc

- [ ] Mở app, tạo ví đầu tiên, xác nhận 5 tab: Giao dịch / Ví / Ngân sách / Hoạt động / Thêm.
- [ ] Vào **Thêm → Kiểm tra SQLite trên thiết bị**, chạy kiểm tra. Database test có tên riêng, không thay dữ liệu của bạn. Lưu lại12 dòng kết quả hoặc nguyên lỗi; đây là kiểm tra bridge thật, migration, tiền lớn, rollback, retry và Inbox.
- [ ] Trên sổ thử: Tiền mặt mở với1.000.000đ; Ngân hàng0đ. Chi Ăn uống58.000đ, sau đó chuyển100.000đ từ Tiền mặt sang Ngân hàng. Kết quả: Tiền mặt842.000đ, Ngân hàng100.000đ, tổng942.000đ; thu0đ, chi58.000đ, dòng tiền−58.000đ.
- [ ] Ngân sách Ăn uống5.500đ cùng kỳ: spent58.000đ, vượt52.500đ, khoảng1054,5%; thanh tiến độ tối đa100%. Retry không tạo cảnh báo trùng.
- [ ] Sửa chi thành50.000đ: Tiền mặt850.000đ, tổng950.000đ. Xóa chi: Tiền mặt900.000đ, tổng1.000.000đ. Xóa transfer: Tiền mặt1.000.000đ, Ngân hàng0đ.
- [ ] Đóng/mở và tải lại trong Expo Go khi máy chủ vẫn chạy: ví/giao dịch còn nguyên. Điều này chưa nghiệm thu app độc lập cold-start offline.
- [ ] Thử danh mục/nhãn, lưu trữ ví vẫn giữ lịch sử; nhiều nhãn không nhân đôi số liệu. Timeline tìm/lọc đúng, trên50 giao dịch tổng ngày giữ nguyên khi tải trang tiếp.
- [ ] Thử báo cáo đổi ví/kỳ, ngân sách và hoạt động đã đọc. Ngày địa phương quanh00:00 được nhóm đúng timezone đã chọn.
- [ ] Form: chạm lưu nhanh hai lần, lỗi giữ bản nháp, tải lại bản ghi chưa đổi vẫn giữ bản nháp, thay đổi từ nơi khác được báo rõ; back/swipe bảo vệ draft, đang lưu không rời form.
- [ ] Tăng cỡ chữ và bật VoiceOver: đọc được tên/tiền/nhóm lựa chọn; nút có tên, không bị bàn phím hoặc thanh dưới che; thử tên danh mục dài.
- [ ] **Thêm → Backup**: xuất JSON → chọn **Lưu vào Tệp** → kiểm tra file trong Files. CSV chỉ phục vụ đối chiếu.
- [ ] Chọn JSON vừa xuất: preview số lượng bản ghi và số dư đúng. Backup sổ hiện tại trước, xác nhận thay thế, đối chiếu ví/giao dịch/ngân sách/nhãn/quan hệ và số dư sau restore.
- [ ] File lỗi hoặc sai schema bị từ chối, dữ liệu cũ còn nguyên. Diagnostics riêng đã thử rollback khi transfer/restore lỗi; nếu có lỗi thực tế, giữ app và backup để chẩn đoán.

Gate lõi/backup đã được người dùng xác nhận để mở phần nâng cao. Smart Import văn bản đang mở rộng; FaceID/OCR/widget và app riêng chưa nghiệm thu. Chưa có quyền trả phí/signing/publish. Không coi bundle trên Windows hoặc test NodeSQLite là PASS trên iPhone.
