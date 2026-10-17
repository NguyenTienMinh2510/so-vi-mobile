# Khóa So Vi bằng Face ID

**Bản hiện tại:** OCR và khóa tự động đã qua kiểm tra native, review mã và IPA độc lập. Xem [bản cập nhật và hướng dẫn giữ dữ liệu](ADVANCED-IOS.md). Giao diện lớp che đã được người dùng chốt; hộp Face ID/mật mã do iOS hiển thị. Hành vi trên iPhone cần được thử sau cập nhật.

**Tải bản mới:** [ZIP OCR / Face ID tự động / mật mã iPhone](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38163876459/artifacts/11711192976). Giải nén trong Files, chọn **so-vi-unsigned.ipa** qua SideStore → My Apps → + để cài cập nhật, giữ app So Vi đang có. Cùng tài khoản SideStore, xuất JSON trước và không gỡ app.

[Build iOS mới](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38163876459) thành công: 108 kiểm thử, TypeScript, kiểm tra hàng đợi và OCR Swift, biên dịch app cùng hai extension đạt. Sol độc lập đã kiểm tra mã và IPA thật. Quyền Face ID tiếng Việt, mã khóa, OCR, Share/widget và action Shortcuts có trong gói; hành vi trên iPhone chưa được xác nhận.

ZIP cloud hết hạn **01:31:48 ngày 13/10/2026 giờ Bangkok/Việt Nam**. [IPA lưu trên laptop](../artifacts/phone-lock-ocr-update/so-vi-unsigned.ipa) 15.911.211 byte, SHA256 `5a4355acd1d7f4407ee48bda327f354d2e4a983419a4c1bdfee934f40727f86f`. SideStore vẫn phải ký bằng tài khoản cá nhân trên thiết bị. Handoff hiện tại: ../.automation/handoffs/phone-lock-ocr-followup.md.

Bản mới có Thêm → Cài đặt → Khóa ứng dụng. Bật/tắt yêu cầu xác thực bằng Face ID hoặc mật mã iPhone; không đặt PIN riêng. Khóa mặc định tắt, thiết lập lưu riêng trên thiết bị, không nằm trong JSON backup. Khóa màn hình ứng dụng không mã hóa database.

Khi khóa bật, lần mở đầu tự yêu cầu xác thực trước khi hiện sổ. Rời app thì che nội dung và tự yêu cầu mở khóa khi quay lại. Bản nháp đã mở được giữ. Hủy xác thực không tự lặp; hủy hoặc lỗi đọc thiết lập không mở dữ liệu. Dùng nút thử lại, không gỡ ứng dụng hay xóa sổ để xử lý. Hệ thống có thể yêu cầu mật mã iPhone nếu Face ID chưa sẵn sàng; người dùng tự nhập trên thiết bị.

Sau khi cập nhật, mở So Vi và đối chiếu dữ liệu cũ trước. Vào Thêm → Cài đặt → Khóa ứng dụng để bật; mặc định khóa vẫn tắt. Sau đó kiểm tra:

- Bật khóa, hủy Face ID: sổ chưa hiện. Thử lại bằng Face ID hoặc mật mã iPhone.
- Đóng hẳn rồi mở lại khi không có mạng: vẫn yêu cầu xác thực, dữ liệu còn đúng.
- Đang sửa một bản nháp, rời app rồi quay lại: nội dung giữ nguyên sau mở khóa.
- Mở Control Center/đa nhiệm: nội dung tài chính được che; kiểm tra cả ảnh xem trước ngay khi vuốt rời app, không suy ra từ kết quả test trên laptop.
- Mở hộp thoại bỏ bản nháp hoặc xác nhận thao tác, khóa máy rồi quay lại: callback cũ không tự bỏ bản nháp/ghi tiền khi app đang khóa.
- Hủy, từ chối quyền, khóa Face ID tạm thời, bật/tắt khóa và thử VoiceOver/font lớn.
- Nhận Shortcuts khi khóa: chỉ vào Inbox, không tự ghi tiền; xuất/khôi phục JSON vẫn đối chiếu đúng.

OCR/Shortcuts cần thử thực tế riêng. Bản hiện tại có Widget và Share Extension; IPA đã qua kiểm tra capability/chữ ký ad-hoc nhưng chưa kiểm chứng profile ký miễn phí trên thiết bị cho hai extension. Giữ tài khoản SideStore hiện có, không cần mua dịch vụ cho phần khóa app.

Sau lần bật khóa, lớp làm mờ màn hình đa nhiệm được giữ đến khi app đóng hẳn/mở lại, kể cả khi tắt khóa. App không chặn ảnh chụp màn hình chủ động. Hiệu quả làm mờ lúc rời app cần kiểm tra trên iPhone.
