# Bản Sổ Ví riêng: OCR và Shortcuts

Bản tổng hợp mới đang được kiểm chứng tại [hướng dẫn tính năng nâng cao](ADVANCED-IOS.md), gồm sửa khóa/OCR/SQLite, icon mới, widget và Share Extension. Các bản cài và checkpoint bên dưới là lịch sử, không thay thế kết quả pipeline cuối.

Checkpoint mới nhất ngày 11/10: người dùng đã cài So Vi và xác nhận mở lại khi tắt mạng thành công. Chưa xác nhận các phép thử OCR, Shortcuts, SQLite hoặc backup trên bản riêng. [Bản cập nhật khóa Face ID / mật mã](APP-LOCK.md) đã build thành công và kiểm tra IPA độc lập; phần bản cài bên dưới mô tả bản OCR/Shortcuts trước đó. Cài cập nhật với cùng tài khoản SideStore, giữ app hiện tại và xuất JSON trước; không gỡ So Vi để đổi bản.

Đây là hướng cài miễn phí qua SideStore, không phát hành App Store. Bản Release chứa mã ứng dụng để dùng bình thường khi laptop tắt. Chỉ được coi là đã đạt sau khi có IPA build thành công, cài lên iPhone và thử cold start khi tắt mạng.

## Bản cài đã sẵn sàng

**Dùng bản sửa tên cho SideStore:** [Tải ZIP bản So Vi](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38079953593/artifacts/11679926919), giải nén trong Files rồi chọn **so-vi-unsigned-namefix.ipa** ở SideStore → My Apps → +. Bản cũ bị Apple từ chối `appIdName='Sổ Ví'`; bản này chỉ đổi `CFBundleDisplayName` thành **So Vi**, giao diện vẫn tiếng Việt và mã định danh giữ nguyên. Job repack miễn phí đã thành công; mã native/JavaScript/AppIntent giữ nguyên từng byte, không cần build lại.

Artifact cloud13,955,062byte, SHA256`6dd2b564f41eb1932e3fdd6027629519f7964d47ea18d91346f55169f645c7a8`, hết hạn **02:28:56 ngày12/10/2026 giờ Bangkok**. [Bản sửa được đóng gói trên laptop](../artifacts/native-inbox-v1/so-vi-unsigned-namefix.ipa) có cùng nội dung app, nhưng ZIP nén khác nên checksum riêng `36bade4d83dfed0db4384240ea8c89ae5639913bf726203c8260b00693d3eeb7` và14,232,251byte. Cả hai đã kiểm tra chỉ đổi tên, CRC/permissions/identity hợp lệ; chưa xác nhận cài trên iPhone. Bản cũ bên dưới được giữ làm nguồn build, không chọn nó để thử lại lỗi tên.

[Tải IPA Sổ Ví](../artifacts/native-inbox-v1/so-vi-unsigned.ipa) — build [38077015484](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38077015484) đã thành công. Bản 13,973,691 byte có executable iOS arm64, bundle JavaScript và metadata action `SoViImportIntent`; SHA256 `9c1db2adda18950a766fda780b902fd159ce2c600fabae383c8dc3508ebee36f`. Đây là IPA **chưa ký**, cần SideStore ký bằng Apple Account của anh trước khi cài. Chưa thử trên iPhone.

[Trình cài iloader cho Windows](../artifacts/installation/iloader-windows-x64-v2.3.6.msi) đã tải từ release chính thức v2.3.6 và đối chiếu SHA256 GitHub. Chưa chạy trình cài. [LocalDevVPN trên App Store](https://apps.apple.com/app/localdevvpn/id6755608044) cần cài trên iPhone. Giữ IPA trên máy: artifact cloud chỉ tồn tại 1 ngày.

## Chuyển dữ liệu an toàn

1. Trong Sổ Ví trên Expo Go, xuất JSON vào Files và giữ một bản riêng.
2. Cài bản Sổ Ví riêng, mở app rồi nhập JSON và đối chiếu số dư/quan hệ.
3. Dữ liệu Expo Go không tự chuyển sang app riêng. Giữ Expo Go và backup đến khi đối chiếu xong; không gỡ app để sửa lỗi.

## Build miễn phí

Mã nguồn cần ở repository GitHub **riêng tư**, chỉ gồm ứng dụng, kiểm thử tổng hợp và workflow. Không upload database, backup, ảnh/nội dung tài chính, credential, pairing file hoặc log máy. Workflow `Unsigned iOS Release` chỉ chạy thủ công, runner macOS tiêu chuẩn, tối đa45phút, artifact giữ1ngày. Không Apple credential, không EAS signing, không publish.

Tài khoản chưa có thẻ thanh toán: GitHub chặn khi hết hạn mức miễn phí. Nếu sau này thêm thẻ, đặt ngân sách Actions $0 và bật dừng sử dụng trước khi chạy lại. Không chọn runner large/xlarge. [Chính sách phí GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Build kiểm tra TypeScript/logic, chạy mã hàng đợi Swift trong thư mục test riêng, rồi compile app iOS Release. IPA phải chứa bundle JavaScript, metadata App Intents và executable iOS arm64. **Kiểm thử JavaScript trên Windows không chứng minh native build thành công.**

## Cài và gia hạn

Theo [điều kiện SideStore](https://docs.sidestore.io/docs/installation/prerequisites) và [hướng dẫn cài chính thức](https://docs.sidestore.io/docs/installation/install): chuẩn bị cáp, mở khóa iPhone, kết nối/trust máy, thiết lập SideStore lần đầu và LocalDevVPN. Người dùng tự nhập Apple Account và xác nhận trên thiết bị; không gửi mật khẩu cho agent hoặc lưu vào project.

Trên Windows, hướng dẫn chính thức dùng iTunes/Apple Devices để nhận điện thoại và **iloader** để cài SideStore Stable. Trên iPhone, cài LocalDevVPN từ App Store; sau khi cài SideStore, vào Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị để tin cậy tài khoản, rồi Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển và khởi động lại nếu được yêu cầu. Mở LocalDevVPN, kết nối, đăng nhập SideStore bằng cùng Apple Account và refresh SideStore lần đầu. Nếu xuất hiện yêu cầu thu hồi chứng chỉ, kiểm tra các app sideload đang dùng trước khi xác nhận vì chúng có thể bị ảnh hưởng.

Nếu iloader báo **Failed to connect to usbmuxd: device socket io failed**, kiểm tra iTunes đã nhận điện thoại trước. Trên máy này, lần kiểm tra ban đầu Windows đã thấy iPhone qua USB nhưng chưa có Apple Mobile Device Service hoặc iTunes/Apple Devices. [Trình cài iTunes chính thức](../artifacts/installation/iTunes64Setup.exe) đã tải và xác minh chữ ký Apple; cần hoàn tất cài đặt rồi mở iTunes, mở khóa iPhone/chọn Tin cậy và mở lại iloader. Không đặt lại hay khôi phục iPhone để xử lý lỗi kết nối này. Nếu dịch vụ đã có nhưng không chạy, dùng [hướng dẫn Apple về AMDS](https://support.apple.com/en-us/102347).

Nếu đăng nhập iloader báo **invalid Trust Key (-45003)** khi kết thúc provisioning Anisette, chưa thể kết luận mật khẩu sai. Trong iloader → Settings, thử một máy chủ có sẵn khác và **Reset Anisette State**, đóng/mở lại iloader rồi tự đăng nhập một lần; có thể cần 2FA lại. [Mã nguồn tùy chọn/reset của iloader v2.3.6](https://github.com/nab138/iloader/blob/v2.3.6/src/pages/Settings.tsx). Reset này chỉ xóa trạng thái Anisette trong keyring; nếu báo không có trạng thái hoặc đang dùng “Don't use keyring”, báo lại để chẩn đoán, không tự xóa file tài khoản/chứng chỉ/pairing. Nếu vẫn cùng lỗi sau thử có giới hạn, giữ checkpoint và chờ dịch vụ được xử lý; chưa có cách sửa chắc chắn cho mã lỗi này.

Checkpoint thiết lập: người dùng đăng nhập iloader thành công khi chọn **StikStore**, cài SideStore, bật Chế độ nhà phát triển và xác nhận refresh SideStore lần đầu đã hoàn tất: app mở lại, hiện **7 DAYS**. Giữ lựa chọn đang hoạt động; chưa cần reset hay đổi máy chủ tiếp. Bước tiếp theo là cài IPA Sổ Ví; chưa xác nhận app Sổ Ví chạy trên iPhone.

Tải IPA từ artifact GitHub riêng tư, dùng SideStore ký và cài. Tài khoản Apple miễn phí cần gia hạn7ngày; kết nối Wi-Fi và LocalDevVPN khi refresh. Laptop thường chỉ cần lần thiết lập đầu; có thể cần lại nếu SideStore hết hạn hoặc pairing bị mất sau cập nhật iOS. SideStore cũng chiếm một trong3app sideload miễn phí đang hoạt động. [FAQ SideStore](https://docs.sidestore.io/docs/faq).

Sau khi **refresh SideStore lần đầu thành công**, đưa IPA vào Files trên iPhone. Có thể mở [artifact riêng tư của build này](https://github.com/NguyenTienMinh2510/so-vi-mobile/actions/runs/38077015484/artifacts/11678982640) trong Safari, tự đăng nhập GitHub có quyền repository, tải ZIP rồi giải nén trong Files để lấy `so-vi-unsigned.ipa`. Trong SideStore → My Apps → **+**, chọn file IPA đó và tự xác nhận việc ký/cài. Không chọn ZIP hoặc file `.sha256`. Artifact cloud hết hạn sau1ngày; bản IPA trên laptop vẫn giữ tại `artifacts/native-inbox-v1/so-vi-unsigned.ipa`, không cần build lại chỉ vì link hết hạn.

## OCR

Vào Inbox → Dán nội dung → Chọn ảnh hoặc Chụp ảnh. Chỉ xin quyền khi chạm nút. Vision xử lý trên iPhone; ảnh tạm do app sở hữu được xóa sau khi đọc, ảnh gốc Photos được giữ. Mỗi ảnh tối đa20MB/40megapixel. Ngôn ngữ được hỏi từ Vision trên thiết bị; nếu tiếng Việt chưa có, app báo dùng tiếng Anh và yêu cầu kiểm tra dấu/số.

Văn bản OCR giữ nguyên trong vùng xem/sửa riêng; chọn **Dùng văn bản đã kiểm tra** mới thay nội dung nhập. Trên4000ký tự phải rút gọn tường minh, không cắt âm thầm. Lưu vào Inbox → Phân tích → duyệt ví/loại/số tiền/ngày → **Xác nhận ghi sổ**. Hủy, từ chối quyền hoặc lỗi OCR không ghi tiền và giữ phần đang nhập.

## Shortcuts SMS/email

Sau khi cài, mở Sổ Ví ít nhất một lần, rồi tìm action **Lưu nội dung vào Inbox Sổ Ví** trong Shortcuts. Thử thủ công bằng văn bản giả trước. Chọn nguồn SMS/email/văn bản, tên ngân hàng/nhà cung cấp, nội dung và ID nguồn nếu có.

Automation Message/Mail đưa nội dung cần nhập vào action trên. Cần thử input thực tế của trigger trên phiên bản iOS đang dùng; không hứa tất cả SMS/email được đọc tự động. App có thể phải mở hoặc thiết bị phải được mở khóa. Action lưu hàng đợi riêng trên máy; Inbox nhận rồi phân tích, luôn duyệt trước khi ghi sổ. App không đọc notification của ứng dụng ngân hàng khác.

Nếu lỗi nhận: Inbox → **Thử nhận lại từ Shortcuts**. Nếu đã nhận nhưng chưa phân tích: mở mục **Mới nhận** → Phân tích. Hàng đợi tối đa50nội dung; đầy/lỗi không tự xóa bản cũ. Nội dung chưa vào Inbox không nằm trong JSON backup; vẫn được giữ khi khôi phục/xóa sổ và có thể xuất hiện lại khi nhận thành công. Hàng đợi bị hỏng cần giữ app và báo lỗi, không reset để che lỗi.

## Gate trên iPhone — chưa đánh dấu PASS

- Cài SideStore/IPA, mở app và thấy action trong Shortcuts.
- Tắt Metro/laptop, bật chế độ máy bay, force quit rồi mở lại: CRUD, báo cáo và dữ liệu cũ còn đúng.
- OCR ảnh tiếng Việt/số tiền thật, ảnh xoay; thử hủy/quyền từ chối/lỗi/ảnh lớn/VoiceOver/font lớn.
- Chạy Shortcut hai lần: không tự ghi tiền; nguồn có mã tham chiếu trùng được đối chiếu, giao dịch khác cùng số tiền không bị mất.
- Thử khi app đóng/đang mở, điện thoại khóa, lỗi rồi retry; ghi hành vi thực tế, không giả background PASS.
- Duyệt một giao dịch, xuất JSON, khôi phục và đối chiếu tiền/Inbox/liên kết.
- Refresh trước hạn7ngày và xác nhận app vẫn mở được, không mất dữ liệu.

Face ID, widget và Share Extension chưa thuộc lần tích hợp OCR/Shortcuts này.
