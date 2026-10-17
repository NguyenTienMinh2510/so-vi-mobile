# Sổ Ví — hướng thiết kế và quy trình UI

Ngày xác minh nguồn: 13/10/2026, Asia/Bangkok. Đây là chuẩn cho các task UI tiếp
theo, không phải tuyên bố app hiện tại đã đạt chuẩn hoặc đã được thử trên iPhone.
Yêu cầu mới của người dùng ưu tiên hơn tài liệu này. Không thay acceptance của
task đang chạy hoặc reset deadline/counters để áp dụng rule mới.

## Hướng thiết kế

Ứng dụng tài chính tiếng Việt trên iPhone: bình tĩnh, gọn, rõ số tiền, thao tác
nhanh. Giữ nhận diện dark/green, viền nhẹ và icon hiện có trong `src/ui.tsx`.
Hiện đại thể hiện qua phân cấp, mật độ thông tin, tính nhất quán và phản hồi
thao tác; mỗi hiệu ứng cần có vai trò cụ thể trong luồng.

Những sở thích đã được người dùng chốt cần áp dụng xuyên màn:

- Chức năng chính nhìn thấy trước; thông tin phụ thu gọn và mở khi cần.
- Nhóm bằng khoảng cách, hàng và separator; dùng card khi nhóm thực sự cần
  phân biệt, không mặc định mỗi giao dịch/ghi chú/mục chọn là một card riêng.
- Giữ viền nhẹ cho các vùng nhập/nút cần nhận diện; giảm khung không đồng nghĩa
  xóa mọi affordance. Các hàng có chung trục căn lề và nhịp khoảng cách.
- Các mục ngắn có thể chung một hàng; mục dài, lỗi, bằng chứng và tiền cần đủ
  chỗ. Chữ lớn được xuống dòng; không ép hai cột nếu làm mất thông tin.
- Ghi chú phụ nhỏ và nghiêng theo sở thích người dùng, vẫn dễ đọc và đủ tương
  phản. Lỗi chặn thao tác phải rõ, gần nơi lỗi và có cách phục hồi.
- Mỗi bước có một hành động chính; hành động phụ có trọng lượng thấp hơn.
  Dùng nhãn động từ tiếng Việt nhất quán, loại chữ giải thích lặp lại.
- Tiền VND đầy đủ, phân nhóm bằng dấu chấm, căn hàng ổn định; dòng tiền và số
  dư luôn được phân biệt. Không sửa semantics tài chính để làm biểu đồ đẹp.
- Nút/icon có vùng chạm tối thiểu 44; trạng thái selected/expanded/busy/disabled
  có nhãn phù hợp. Không dùng màu hoặc icon đơn độc để truyền ý nghĩa quan trọng.

## Các mẫu tham khảo đã chọn

Ưu tiên màn sản phẩm và hướng dẫn chính thức. Các quan sát thị giác bên dưới là
đánh giá thiết kế của agent; các nguồn này không phải benchmark của Sổ Ví.

| Phạm vi | Nguồn đã đọc/xem | Áp dụng cho Sổ Ví |
|---|---|---|
| Giao dịch | [Copilot Transactions](https://help.copilot.money/en/articles/9554412-transactions-tab-overview): đã xem ảnh danh sách/tìm kiếm trong hướng dẫn | Ngày làm section; tên và số tiền quét nhanh; search/filter gọn; chi tiết mở khi chạm. Ảnh quan sát là bố cục màn rộng, cần kiểm tra lại trên iPhone. |
| Dòng tiền | [Copilot Cash Flow](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview): đã đọc mô tả biểu đồ và drill-down | Tổng quan thu/chi/dòng tiền theo kỳ; nhãn tiền chính xác; một vùng biểu đồ có lựa chọn, mở dữ liệu chi tiết khi cần. Không mặc định thêm mọi loại chart. |
| Ngân sách | [Monarch Budget](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch): đã xem hình mobile ở phần Viewing Actual & Remaining | Mobile chỉ giữ các cột cần nhìn ngay; phần thực chi/còn lại đổi cách xem thay vì trải ngang mọi cột; mục con thu gọn. Không sao chép nghiệp vụ/ngân hàng/cloud của Monarch. |
| Roadmap | [Wanderlog](https://wanderlog.com/): đã xem mẫu itinerary trên trang chính thức; [Daily itinerary](https://help.wanderlog.com/hc/en-us/sections/5154228681883--Daily-itinerary) | Học cách nhóm theo ngày, thứ tự điểm dừng và mở chi tiết; chuyển thành bữa ăn/quán/giá. Mẫu đã xem trên web, chưa kiểm chứng tương tác app mobile. Không thêm bản đồ hoặc luồng du lịch vào scope ăn uống. |
| Loading | [Apple Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | Đặt trạng thái chờ ổn định, mô tả bước ngắn và có hủy khi hỗ trợ; phần trăm chỉ dùng khi đo được tiến độ thật. |
| Form và chữ | [Apple Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data), [Apple Writing](https://developer.apple.com/design/human-interface-guidelines/writing) | Giảm nhập lại dữ liệu có sẵn; nhãn ngắn, nhất quán; lỗi chỉ rõ bước tiếp theo; tiến trình nhiều bước có hành động tới/lùi rõ. |

Đây là nguồn cảm hứng cấu trúc/tương tác, không phải yêu cầu mua dịch vụ, thêm
cloud hay sao chép thương hiệu/assets. Không lấy landing-page hero làm bố cục
màn tác vụ. Không gọi bản mẫu HTML là kiểm chứng native.

## Quy trình bắt buộc khi nhận task UI

### 1. Tự nghiên cứu và chốt hướng trong phạm vi được giao

Coordinator chịu trách nhiệm thiết kế xuyên suốt. Đọc yêu cầu, code/callers,
component hiện có và mục liên quan của tài liệu này trước khi giao writer.

Dùng lại nguồn đã chọn nếu đúng luồng. Khi luồng mới, nguồn không đủ phù hợp
hoặc thiết kế nguồn đã thay đổi, tự tìm nguồn công khai: hướng dẫn nền tảng,
màn sản phẩm/help center/App Store chính thức, rồi mới đến gallery concept.
Chọn 2–3 nguồn mạnh nhất; không thu gom hàng chục link. Khi cần quyết định về
SDK/API/dependency, kiểm tra tài liệu kỹ thuật chính thức cho phiên bản của app.

Mỗi nguồn ghi URL, ngày xem, màn/platform, quan sát cụ thể, điều sẽ học và
điều không phù hợp. Nguồn chưa xem ảnh chỉ được ghi là nguồn mô tả. Mẫu web
chỉ hỗ trợ ý tưởng; quyết định layout phải phù hợp màn mobile thực tế.
Ghi một hướng thống nhất; không trộn màu/font/components từ nhiều app.

Không hỏi lại sở thích đã rõ. Tự quyết typography/spacing/bố cục khả nghịch trong
scope được giao. Chỉ hỏi điều chưa biết làm đổi phạm vi hoặc quyết định sản phẩm.
Nếu người dùng đã yêu cầu duyệt một bản UI cụ thể trước build, giữ gate đó;
việc này không tạo gate duyệt từng sửa nhỏ trong quá trình làm.

### 2. Ghi tiêu chí trước khi viết

Trong hồ sơ task hiện có, ghi ngắn: việc người dùng cần làm, hành động chính,
thứ tự thông tin, một wireframe nếu thay cấu trúc, nguồn tham khảo và thay đổi
dự kiến. Không tạo bộ hồ sơ trùng chỉ để ghi thêm design.

| Màn/luồng | Tiêu chí hướng thiết kế |
|---|---|
| Giao dịch | Dòng tiền trước, chụp/chọn ảnh OCR tiếp theo; chờ duyệt là hàng gọn; lịch sử và recovery vẫn truy cập được. |
| Duyệt nội dung/hóa đơn | Tiền cần xác nhận nổi bật; bằng chứng gốc và thông tin giao dịch tách rõ; tới/lùi giữ bản nháp. |
| Ngân sách/Báo cáo | Chỉ số phục vụ quyết định đứng trước; lựa chọn kỳ/cách xem gọn; số tiền đầy đủ; chi tiết mở khi cần. |
| AI roadmap | Prompt và tạo roadmap đơn giản; khi tạo, trạng thái/hủy dễ thấy; kết quả tập trung ngày/bữa/quán/giá và ngân sách còn lại; thiết lập model là phần phụ. |
| Cài đặt/Hoạt động | Hàng nhóm nhất quán; ghi chú gần mục liên quan; thao tác đọc/lọc rõ, giữ lịch sử theo nghiệp vụ hiện có. |

Tiêu chí mới không được làm mất kiểm tra tiền, dữ liệu, lock, quyền, cancellation,
CAS/idempotency hoặc recovery. Nếu thay hành vi sản phẩm, xử lý như thay scope
thực sự trước khi cập nhật test; không sửa assertion chỉ để ra PASS.

### 3. Triển khai nhỏ nhất và áp dụng chuẩn xuyên màn

Đọc skill theo routing trong `.automation/SKILLS.md`; coordinator đưa phần
chọn lọc vào spec vì leaf runner không tự có catalog/tool của phiên tương tác.
Một writer như policy hiện có. Không mặc định mở thêm agent hay provider.

Sửa component/token chung khi đó là nguyên nhân; rà các callers bị ảnh hưởng.
Giữ cấu trúc `src/ui.tsx`/StyleSheet và dependency hiện có. Một lỗi lặp nhiều
màn cần sửa ở nguồn chung, không chờ người dùng nhắc từng màn. Không mở rộng
thành redesign toàn app khi task chỉ giao một phần không liên quan.

### 4. Xem bản render và tự sửa

Dùng công cụ browser/native thực có sẵn; tái sử dụng QA hiện có khi phù hợp.
Ảnh trước/sau có fixture tổng hợp và trạng thái rõ. Không đưa tài chính thật,
email hoặc code riêng lên dịch vụ tham khảo; không cần account/paid API mới.

- Kiểm tra 320/390/430px, chữ 100%/150%, nội dung dài và số tiền lớn; 1280px
  nếu preview web là deliverable. Kiểm tra keyboard, safe area, focus/VoiceOver
  trên native khi có quyền/công cụ; thiếu thiết bị thì ghi chưa thử.
- Tự xem screenshot: việc chính có dễ nhận ra, thông tin phụ có lấn át, các
  trục căn có đồng đều, mật độ có hợp lý, component có nhất quán? Ghi lỗi cụ
  thể và sửa rồi kiểm tra lại phần ảnh hưởng trong repair budget hiện có.
- Thực hiện luồng chính và một lỗi/phục hồi liên quan; kiểm tra loading, empty,
  error, partial, success, permission theo applicability. Nêu lý do nếu không
  áp dụng. Không dùng placeholder handler hoặc kết quả giả để chứng minh app.
- Dùng đúng đường xử lý sản phẩm cho output/API/model; test fixture giữ cả lỗi
  và raw response thực tế. Không làm sạch output riêng cho phép thử rồi tuyên
  bố app xử lý được output đó.

Khi review độc lập được yêu cầu theo policy, reviewer phải đọc cùng brief và
ảnh hiện tại, nêu lỗi trải nghiệm có thể hành động được. Không duyệt chỉ vì
writer đã ghi PASS hoặc checker đã tìm thấy file screenshot.

### 5. Báo kết quả đúng bằng chứng

Trong task/handoff, báo ba kết quả riêng:

| Kết quả | Bằng chứng cần có |
|---|---|
| Kỹ thuật | Test/typecheck/build phù hợp trên revision hiện tại. |
| Thị giác | Ảnh thật của bản render, viewport/font/state, quan sát và sửa lỗi cụ thể; đối chiếu hướng/reference đã chọn. |
| Hành vi | Các bước đã thao tác, kết quả mong đợi/thực tế, lỗi/phục hồi; nói rõ mock/browser/native/device. |

Record gồm revision hoặc source hash, nguồn tham khảo, ảnh/viewport/font/state,
luồng đã thử, findings đã sửa/còn lại và giới hạn. Dùng task/runtime hiện có;
không cần tạo thư viện report mới. Screenshot/test/count không tự chứng minh
thẩm mỹ hoặc native E2E. Check source/preview/IPA đang cùng phiên bản trước giao.

Chưa đủ bằng chứng thì ghi phần chưa kiểm chứng và bước tiếp theo cụ thể.
Hết budget/tool/quota thì bàn giao theo policy, không tự gia hạn hoặc né gate.
Quy trình này là chỉ dẫn agent; CI hiện có chưa có bộ chấm thị giác tự động.
