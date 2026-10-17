# Bản Sổ Ví hoàn thiện

**Bản cập nhật ngày12/10/2026 đã sẵn sàng để thử trên iPhone.** Bao gồm OCR chọn đúng tiếng Việt mà Apple Vision trả về, phân tích tổng hóa đơn, duyệt hai bước, giao diện gọn/dropdown/viền nhẹ/số tiền nổi bật, icon người dùng cung cấp, Chờ duyệt trong Giao dịch và lọc/dọn Hoạt động bằng cách đánh dấu đã đọc, giữ lịch sử. Người dùng giao Astra tự chốt giao diện khi AFK; kiểm tra và review nguồn/IPA độc lập đều đã đạt.

[Tải ZIP cập nhật](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38250440071/artifacts/11746909064), giải nén rồi chọn **so-vi-unsigned.ipa** trong SideStore → My Apps → +. [IPA giữ trên laptop](../artifacts/receipt-ocr-update/so-vi-unsigned.ipa) có16.084.035byte, SHA256 `9137ec9c02b4933e379ed13ed86ae3eaa070a459b40bf32c16ce89894a0dc779`. Cloud artifact hết hạn19:44:57ngày13/10/2026 giờ Việt Nam; bản local vẫn giữ. Cập nhật bằng cùng tài khoản SideStore, **không gỡ app cũ**. BundleID `local.sovi.moneytracker`, phiên bản0.1.1/build2 giữ nguyên; chữ ký ad-hoc vẫn cần SideStore ký cá nhân trước khi cài.

Nguồn90file trên commit `50baf0f683f466142f4d7f52b114518d91d44161`; [build38250440071](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38250440071) đạt140/140tests, TypeScript, ba bộ Swift, Release app+widget+Share, quyền/chữ ký ad-hoc. Root và Sol độc lập kiểm tra actualIPA: checksum, ZIP153mục, ba executable arm64/iOS, phiên bản/quyền/AppIntents, nội dung app/font và icon thật đạt. [Checklist thử](../artifacts/receipt-ocr-update/README.md), [hóa đơn](RECEIPT-OCR.md), [kích hoạt email/SMS](MAIL-SMS.md). FaceID/OCR/billthực/SQLite/Shortcuts/Share/widget trên iPhone vẫn chưa xác nhận; email chưa tự nhập cho tới khi người dùng tạo Automation.

Các mục Backup/khôi phục đã được bỏ khỏi menu theo yêu cầu; phần đọc/ghi backup và dữ liệu cũ được giữ trong nguồn. Không xóa/reset database, không đổi tài khoản hay gửi email/bill lên build.

## Lịch sử bản giao trước cải tiến hóa đơn

Thông tin dưới đây chỉ là bằng chứng và hướng dẫn của bản đã giao trước; dùng link bản cập nhật ở trên để thử tính năng hiện tại.

**Bản cập nhật OCR và khóa tự động đã sẵn sàng.** Đã sửa đường dẫn ảnh tạm khi thư mục OCR chưa tồn tại và khôi phục việc đọc cài đặt khi app mở ở trạng thái chưa hoạt động. Khi khóa bật, app tự yêu cầu Face ID lúc mở/quay lại; dự phòng bằng mật mã iPhone trong hộp xác thực thật của iOS. Hủy vẫn giữ khóa và không tự lặp xác thực. Giao diện lớp che khóa đã được người dùng chốt. Bản mới đã qua kiểm tra native và review IPA độc lập; cần thử lại hai lỗi trên iPhone sau cập nhật.

Bố cục đã được người dùng duyệt trong trình duyệt. Bản xem trước hiện tại: http://127.0.0.1:4173 và [file xem trước](../artifacts/ui-preview/so-vi-ui.html). Đây là màn hình ứng dụng với dữ liệu mẫu, không dùng database hoặc nội dung tài chính của người dùng.

Mã đã qua 108 kiểm tra, TypeScript, gói JavaScript iOS và review Sol độc lập. Kiểm tra Mac riêng đạt cả 20 tình huống đường dẫn mới và bộ kiểm tra OCR cố định. [Pipeline cuối](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38163876459) đã thành công, gồm kiểm tra Swift thực, biên dịch iOS và hai extension, kiểm tra chữ ký ad-hoc/quyền App Group. Sol độc lập đã kiểm tra IPA thật: ZIP, ba executable, module native, App Intents, phiên bản, icon giữ nguyên, font khóa và checksum đều đạt; 82 file nguồn khớp commit build `240722564ef8bdc1963cd7647f91e318d7434a7b`. Chưa đánh dấu iPhone đạt.

[Tải ZIP bản cập nhật](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38163876459/artifacts/11711192976). Mở bằng tài khoản GitHub có quyền repository, giải nén trong Files và chọn **so-vi-unsigned.ipa** qua SideStore → My Apps → +. Không chọn ZIP hoặc file .sha256. [IPA giữ trên laptop](../artifacts/phone-lock-ocr-update/so-vi-unsigned.ipa) có 15.911.211 byte; SHA256 `5a4355acd1d7f4407ee48bda327f354d2e4a983419a4c1bdfee934f40727f86f`. Link cloud hết hạn **01:31:48 ngày 13/10/2026 giờ Bangkok/Việt Nam**; bản local được giữ, không cần build lại chỉ vì link hết hạn. Chữ ký ad-hoc chỉ ghi yêu cầu capability; SideStore vẫn ký bằng tài khoản của anh trước khi cài.

Sau khi IPA được kiểm chứng, xuất JSON trước, giữ So Vi đang cài và cập nhật bằng cùng tài khoản SideStore. Không gỡ app; giữ mã định danh cũ để bảo toàn dữ liệu. Bản mới mang phiên bản 0.1.1, số bản 2 và icon ví xanh mới.

- Trang Giao dịch có Chụp ảnh, Chọn ảnh, Dán văn bản và Inbox ngay đầu trang. OCR đọc trên iPhone; luôn xem/sửa trước khi dùng kết quả và xác nhận ghi sổ.
- Thêm → Cài đặt → Khóa ứng dụng: bật bằng Face ID hoặc mật mã iPhone. Cho phép Face ID trong Cài đặt iPhone chưa bật khóa trong Sổ Ví. Khóa mặc định tắt; không có PIN riêng.
- Trong bảng chia sẻ ảnh/văn bản, chọn **Share to So Vi**. Kiểm tra hoặc sửa kết quả OCR, chọn **Lưu vào Inbox**, rồi mở Sổ Ví để phân tích và duyệt. Hủy không ghi tiền; ảnh gốc được giữ.
- Thêm widget Sổ Ví từ màn hình chính iPhone. Widget chỉ mở Ghi chi, Chụp ảnh, Văn bản hoặc Inbox; không hiển thị số dư. Cần iOS 17 trở lên và extension được ký/cài thành công.
- Shortcuts dùng action **Lưu nội dung vào Inbox Sổ Ví** cho văn bản SMS/email người dùng chọn. Không đọc trực tiếp thông báo của ứng dụng ngân hàng khác.
- Hàng chờ Shortcuts và chia sẻ độc lập, tối đa 50 mục mỗi hàng. Mục chưa nhận không nằm trong JSON; mở Inbox → **Thử nhận lại Shortcuts / chia sẻ** trước khi xuất backup. Khôi phục hoặc xóa sổ giữ hàng chờ chưa nhận.

Cần một lần đối chiếu trên bản cài cuối: dữ liệu cũ còn đúng; bật khóa, đóng/mở hoặc rời/quay lại app phải tự hiện xác thực iOS; hủy vẫn giữ khóa và thử lại được bằng Face ID/mật mã; kiểm tra SQLite đạt; OCR ảnh tiếng Việt từ Chụp ảnh và Chọn ảnh; chia sẻ văn bản/ảnh vào Inbox và chạm widget; xuất/khôi phục JSON. Build và kiểm tra trên laptop không thay thế các thao tác iPhone này. Vùng dữ liệu chia sẻ thiếu hoặc không rõ sẽ báo lỗi, không giả thành công hay chuyển sang hàng chờ khác.

SideStore vẫn cần gia hạn chữ ký bằng tài khoản miễn phí. App Release dùng được khi laptop tắt; cập nhật ứng dụng không tự gia hạn chữ ký Apple. Thiết lập/quyền Apple và việc ký trên iPhone do người dùng thực hiện; dự án không lưu tài khoản hoặc mật khẩu Apple.
