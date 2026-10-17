# Nhận email BIDV và SMS vào Sổ Ví

Ngày12/10, người dùng đã xác nhận đăng nhập tài khoản trong Apple Mail. Đây là bước cấu hình Mail, chưa là bằng chứng Automation chạy. Tác vụ native đã được đóng gói trong IPA cập nhật; trigger thực tế vẫn cần thử trên iPhone.

Để kích hoạt: Phím tắt → Tự động hóa → + → Email; chọn người gửi `bidvcare@bidv.com.vn`, đúng tài khoản vừa thêm và Chạy ngay (hoặc tắt Hỏi trước khi chạy nếu máy dùng nhãn đó). Lần đầu có thể chỉ lọc người gửi/tài khoản, chưa thêm điều kiện tiêu đề để tránh không khớp. Thêm tác vụ **Lưu nội dung vào Inbox Sổ Ví**, Nguồn **Email**, nhà cung cấp **BIDV**, ID nguồn để trống. Trường Nội dung dùng biến **Đầu vào phím tắt**, lấy phần nội dung/body của email. Có thể thêm bước lấy văn bản từ đầu vào nếu cần chuyển kiểu; kiểm tra bằng Xem nhanh rằng có nhãn và số tiền giao dịch, không chỉ tiêu đề/người gửi. Tên trường chuyển kiểu phụ thuộc ngôn ngữ/iOS; chưa xác nhận UI cụ thể trên máy người dùng.

Lưu Automation rồi chờ một thư BIDV mới phù hợp điều kiện, thử lần đầu khi điện thoại mở khóa. Thư cũ trong hộp thư không kích hoạt lại chỉ vì vừa bật Automation. Nếu không thấy tác vụ Sổ Ví, mở app một lần rồi tìm theo tên **So Vi/Sổ Ví** trong danh sách tác vụ; IPA mới cần được cài bằng cùng tài khoản SideStore, không gỡ app cũ. Nguồn nhận đúng sẽ xuất hiện trong **Chờ duyệt** (Inbox trên bản cũ), chưa tự trừ số dư. Mẫu thử chọn **Bỏ qua, giữ lịch sử**. Tác vụ hiện yêu cầu xác thực thiết bị và mở app; không cam kết chạy âm thầm khi máy khóa. [Điều kiện email/SMS của Apple](https://support.apple.com/en-nz/guide/shortcuts/apdd711f9dff/9.0/ios/26), [chạy tự động](https://support.apple.com/en-nz/guide/shortcuts/apd602971e63/9.0/ios/26).

Luồng của bản nguồn đang cập nhật: **Shortcuts chuyển nội dung → tự phân tích → Chờ duyệt trên trang Giao dịch → xác nhận ghi sổ**. Lịch sử nguồn vẫn được giữ qua “Xem tất cả chờ duyệt và lịch sử”. Bản đã cài trước vẫn dùng tên Inbox. Email mới đến ứng dụng Gmail chưa tự chạy đường này; app không kết nối Gmail hoặc đọc thông báo ngân hàng trực tiếp. IPA cũng không tự tạo Automation trên iPhone.

Mẫu email BIDV người dùng cung cấp ngày 12/10/2026 đã được kiểm tra cục bộ: nhận đúng giao dịch chi và số tiền VND trong trường “Số tiền giao dịch gốc/Original amount”. File gốc không dùng làm fixture hay đưa vào cloud build. “Approval code” trong mẫu chưa chứng minh là mã duy nhất cho mọi giao dịch; không dùng riêng mã đó để tự gộp thanh toán khác nhau.

## Thử đường nhận trước khi cấu hình email

1. Mở app Sổ Ví đã cài, mở khóa. Trong Shortcuts, tạo phím tắt mới với tác vụ **Văn bản** chứa `Thanh toán thành công 58.000 VND. Mã GD: SOVI-TEST-001`.
2. Thêm tác vụ **Lưu nội dung vào Inbox Sổ Ví**. Nội dung là kết quả Văn bản; Nguồn = Văn bản; Ngân hàng / nhà cung cấp = `BIDV`; để ID nguồn trống cho lần thử này.
3. Chạy khi điện thoại đã mở khóa. Tác vụ yêu cầu xác thực thiết bị và mở Sổ Ví. Trong Inbox phải có nguồn chờ duyệt, số tiền đề xuất 58.000đ, số dư chưa đổi. Không xác nhận mẫu thử; chọn Bỏ qua để giữ dấu vết.
4. Không thấy tác vụ thì mở lại Sổ Ví và tìm theo tên app trong Shortcuts. Không thấy mục trong Inbox thì chọn **Thử nhận lại Shortcuts / chia sẻ**; đọc lỗi hiện ra. Nguồn đã nhận nhưng phân tích lỗi cần mở chính mục đó để Phân tích; nút nhận lại không tự phân tích mọi mục đã được ACK khỏi hàng chờ.

## Email BIDV đang đến Gmail

Apple Mail có thể dùng cùng tài khoản Google hiện có. Thêm tài khoản vào **Cài đặt → Ứng dụng → Mail → Tài khoản Mail → Thêm tài khoản → Google**, tự đăng nhập trên iPhone và bật Mail; vẫn có thể dùng Gmail bình thường. Kiểm tra thư BIDV xuất hiện trong Apple Mail trước khi tạo trigger. [Hướng dẫn Apple](https://support.apple.com/en-gb/102619).

Trong Shortcuts tạo Automation **Email**: Account là tài khoản vừa thêm, Sender là `bidvcare@bidv.com.vn`, Subject Contains là cụm chủ đề thực của thông báo giao dịch thành công. Các điều kiện phải cùng khớp. Chọn **Run Immediately / Chạy ngay** nếu iOS trên máy có tùy chọn đó. [Trigger email/SMS trên iOS 26](https://support.apple.com/en-nz/guide/shortcuts/apdd711f9dff/9.0/ios/26) và [chạy tự động](https://support.apple.com/en-nz/guide/shortcuts/apd602971e63/9.0/ios/26); tác vụ riêng vẫn có thể yêu cầu tương tác.

Dùng **Shortcut Input / Đầu vào phím tắt** của email làm đầu vào; lấy trường nội dung/body thành văn bản, không chỉ lấy Subject hoặc Sender. Khi chỉnh biến, kiểm tra nội dung thật bằng Quick Look trên iPhone trước khi nối đến Sổ Ví. Tên trường/tác vụ có thể khác theo ngôn ngữ/iOS; nếu không lấy được body, dùng Share/copy nội dung từ thư để nhập, không điền số tiền cố định trong Automation.

Nối văn bản đó đến **Lưu nội dung vào Inbox Sổ Ví**: Nguồn = Email, nhà cung cấp = `BIDV`, ID nguồn để trống nếu không có mã nguồn duy nhất đã kiểm tra. Không dùng Approval code riêng làm ID nguồn. Giữ nhãn số tiền, tiền tệ và trạng thái; app giới hạn 4.000 ký tự. Nếu body vượt giới hạn, giữ bản gốc và chọn phần thông báo giao dịch cần nhập; không âm thầm cắt thư rồi coi là đầy đủ.

Trigger chạy theo lúc Apple Mail nhận thư; không cam kết trùng thời điểm thông báo của Gmail. Tác vụ Sổ Ví yêu cầu xác thực và mở app, nên cần thử riêng khi máy khóa; chưa cam kết ghi nền không cần mở khóa. Email cũ không phải bằng chứng trigger email mới hoạt động: thử bằng thư mới phù hợp điều kiện, hoặc chạy phím tắt nhận nội dung thủ công.

## SMS

Tạo Automation **Tin nhắn / Message** theo người gửi BIDV hoặc cụm nội dung đủ cụ thể. Lấy **nội dung tin nhắn** từ Shortcut Input, nối đến cùng tác vụ, Nguồn = SMS, nhà cung cấp vẫn `BIDV`. App dùng mã tham chiếu phù hợp cùng nhà cung cấp để chống trùng giữa SMS/email; không đoán hai nguồn là một chỉ vì cùng số tiền. Luôn kiểm tra nguồn trùng trước khi xác nhận.

## Nghiệm thu trên điện thoại

- Chạy mẫu thử: có mục Inbox đã phân tích, chưa ghi số dư.
- Email mới BIDV → Apple Mail → Automation nhận đúng body → Inbox đề xuất số tiền đúng.
- SMS mới đúng điều kiện → Inbox; nguồn không đúng điều kiện không nhập.
- Mở khóa/Face ID, hủy, lỗi, nhận lại và chạy lại không làm mất nguồn hoặc ghi tiền hai lần.
- Duyệt giao dịch thật: chọn ví/danh mục/ngày, kiểm tra tiền tệ và trạng thái rồi xác nhận; đối chiếu số dư. Nội dung chưa thanh toán/thất bại không thành giao dịch chi.

Các bước Automation/Apple Mail/khóa máy cần người dùng thực hiện trên iPhone; kiểm tra máy tính hoặc build IPA không thay thế các bước này. Apple Pay là cách thanh toán; nguồn đầu vào trong luồng này là thông báo BIDV, chưa phải kết nối lịch sử Apple Pay.

## Sửa lỗi không đọc được số tiền từ email (17/10/2026)

Nguyên nhân tìm được từ mẫu BIDV: thư chỉ có phần HTML, dài khoảng 18.700 ký tự
mã HTML nhưng chỉ khoảng 1.100 ký tự chữ. Nếu Shortcuts chuyển nguyên HTML thì
tác vụ cũ từ chối vì vượt giới hạn 4.000 ký tự; nếu chỉ chuyển Tiêu đề thì không
có số tiền. Với phần chữ, bộ phân tích đọc đúng 24.000 VND.

Thay đổi:
- Tác vụ **Lưu nội dung vào Inbox Sổ Ví** nhận tối đa 200.000 ký tự, tự bỏ thẻ
  HTML/style/script và giải mã ký tự (`&nbsp;`, `&#7882;`…) trên iPhone trước khi
  lưu; phần chữ vẫn giới hạn 4.000 ký tự. Cần cài IPA mới có thay đổi Swift này.
- Dán HTML vào màn **Dán nội dung** cũng tự đổi sang chữ.
- Nếu chỉ nhận được tiêu đề (không có số tiền), mục chờ duyệt hiện cảnh báo
  “Có vẻ chỉ nhận được tiêu đề email…”.

Cấu hình Shortcuts: trường Nội dung dùng **Đầu vào phím tắt**; nếu thấy cảnh báo
tiêu đề, chạm biến đó và chọn thuộc tính nội dung/body của email (tên mục tùy
ngôn ngữ iOS, chưa xác nhận trên máy người dùng). Kiểm tra bằng thư BIDV mới.
