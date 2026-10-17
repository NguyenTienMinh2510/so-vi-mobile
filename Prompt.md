# Prompt khởi động dự án

Dán nội dung bên dưới vào Codex ở root dự án. Nếu dùng cho dự án mới,
thay phần YÊU CẦU bằng ý tưởng của bạn; với dự án cũ mô tả thay đổi mong muốn.
Sau khi dùng Install.ps1, file này cũng nằm tại root dự án.

---

Bạn là coordinator của dự án này. Hãy đọc root AGENTS.md (nếu có),
.automation/AGENTS.md, .automation/PROJECT.md, .automation/STATUS.md,
.automation/RUNTIME.md và .automation/models.json trước khi bắt đầu.

YÊU CẦU CỦA TÔI:

[Bạn là kỹ sư phụ trách xây dựng và hoàn thiện moneyTracker, tên hiển thị tiếng Việt là “Sổ Ví”. Hãy thực hiện công việc đến khi có một bản ứng dụng có thể thử trên điện thoại, không chỉ đưa ra kế hoạch.

## 1. Mục tiêu và môi trường

- Ứng dụng quản lý tài chính cá nhân bằng tiếng Việt, VND, ưu tiên iPhone 12 Pro Max.
- Người dùng đang phát triển trên laptop Acer chạy Windows và cho biết iPhone chạy iOS 26.6.1. Kiểm tra khả năng tương thích thực tế trước khi khẳng định hỗ trợ phiên bản này.
- Chức năng cốt lõi: ví, thu/chi, chuyển ví, timeline, ngân sách, báo cáo, hoạt động và backup.
- SQLite trên điện thoại là nguồn dữ liệu chính. Chức năng cốt lõi không cần server hoặc đăng nhập online.
- Ưu tiên không có phí dịch vụ định kỳ. Cloud backup và đồng bộ chưa thuộc bản đầu.
- Bản thử đầu chạy trong Expo Go; bản dùng lâu dài là app iOS được build và ký riêng.
- Không coi chạy trong Expo Go là đã phát hành hoặc đã kiểm chứng một app độc lập.

## 2. Khảo sát trước khi triển khai

Nếu có repository:

- Đọc README, DESIGN.md, docs/PRODUCT.md, docs/BUILD.md và docs/STATUS.md nếu có.
- Kiểm tra Git status, scripts, workspace, runtime và code hiện có; giữ nguyên thay đổi của người dùng.
- Yêu cầu trong prompt này ưu tiên hơn định hướng Capacitor/web-only trong tài liệu cũ.
- Nếu đã có pnpm monorepo với apps/web, apps/api và packages/api-client, thêm app Expo tại apps/mobile. Giữ bản web/API để tham chiếu và sử dụng riêng.
- Dùng lại logic TypeScript độc lập nền tảng khi thực sự phù hợp. UI React DOM, CSS/Tailwind web và React Router không được mặc định chạy trên React Native.
- Không yêu cầu hoàn thiện lại toàn bộ web/backend trước khi xây bản mobile.
- Nghiệp vụ đang nằm trong NestJS phải được triển khai cho local app; không chỉ thay URL API rồi gọi đó là offline.

Nếu repository mới, tạo dự án Expo tối thiểu theo cấu trúc dễ bảo trì. Không tạo backend hoặc monorepo nếu chưa cần.

## 3. Stack đã chọn

- React Native + Expo + TypeScript.
- Expo Router cho điều hướng.
- expo-sqlite cho dữ liệu local.
- React Native StyleSheet và theme tokens TypeScript cho giao diện; không áp nguyên CSS variables từ web.
- expo-file-system, expo-document-picker và expo-sharing khi triển khai backup.
- expo-image-picker khi triển khai nhập ảnh.
- expo-local-authentication và expo-secure-store cho giai đoạn app riêng, theo nhu cầu thực tế.
- Dùng thư viện icon phù hợp React Native đã có hoặc một bộ duy nhất; không cài chồng nhiều bộ.
- Không mặc định cần Redux, ORM, thư viện chart nặng hoặc một framework form mới.

Kiểm tra tài liệu chính thức, chọn Expo SDK stable tương thích Expo Go đang có trên iPhone và phiên bản React Native đi kèm. Dùng công cụ cài dependency của Expo để tránh lệch version; không tự nâng React Native ngoài phạm vi SDK. Tuân theo package manager của repository.

Tách vừa đủ: UI/form, nghiệp vụ, truy cập SQLite và adapter file/native. Không viết SQL trong component. Không tạo interface, dependency injection hoặc platform adapter chưa có người gọi.

## 4. Database và tính toàn vẹn

Schema cần bao phủ wallets, categories, tags, transactions, transaction_tags, transfers, balance_adjustments, budgets, budget_wallets, budget_categories, activities, settings và thông tin migration. Thêm bảng imported_events khi bắt đầu Smart Import.

- Không sao chép bảng tài khoản online, session hoặc token vào bản local nếu không có nhu cầu.
- Có khóa ngoại, index phù hợp và migration version rõ ràng.
- Dùng transaction cho mutation tài chính và import backup.
- Dùng truy vấn có tham số, không nối input người dùng vào SQL.
- Kiểm tra semantics transaction của expo-sqlite; tránh thao tác ngoài scope bị cuốn vào cùng transaction. Serialize ghi hoặc dùng transaction độc quyền phù hợp.
- Không reset hoặc xóa database để xử lý lỗi migration.
- Seed chỉ cho database demo/test được chọn rõ ràng; không âm thầm thêm giao dịch demo vào dữ liệu thật.
- Database test dùng tên riêng, không dùng database người dùng.
- Version và idempotency áp dụng trong cùng transaction khi cần để chặn ghi trùng/ghi stale.
- Nếu database không mở hoặc migration thất bại, hiển thị lỗi và đường khôi phục; không tự thay bằng mock hoặc database rỗng.

## 5. Quy tắc tiền và thời gian

- VND nguyên; amount giao dịch > 0. Số dư và điều chỉnh được phép âm.
- Dùng BigInt cho tính toán tiền, chuỗi số nguyên cho JSON/backup.
- SQLite INTEGER là signed 64-bit nhưng bridge JavaScript có thể trả Number. Không giả định driver nhận/trả BigInt chính xác.
- Với INTEGER, bind chuỗi và CAST có kiểm soát, đọc tiền bằng CAST AS TEXT khi cần; kiểm tra round-trip số lớn. Chỉ chốt cách lưu khi chứng minh không mất chính xác.
- Đặt giới hạn hợp lệ, kiểm tra overflow cả từng số tiền và tổng. Không để phép cộng SQLite vượt giới hạn rồi chuyển sang REAL.
- Không tính hoặc format tiền bằng Number; Number chỉ được dùng cho dữ liệu biểu diễn đã scale trong giới hạn an toàn. Nhãn tiền luôn lấy từ dữ liệu chính xác.

Số dư = opening balance + income - expense + transfer in - transfer out + các điều chỉnh có hiệu lực.
Dòng tiền = income - expense; không tính opening balance, điều chỉnh hoặc chuyển ví.

- Tổng số dư gồm ví lưu trữ còn tiền. Lưu trữ ngăn ghi mới, không xóa lịch sử.
- Lưu thời điểm hiệu lực của opening balance/điều chỉnh để báo cáo lịch sử đúng. Không suy ngược lịch sử từ số dư hiện tại.
- Transfer là một thao tác nguyên tử, không tạo income/expense giả. Sửa/xóa phải đảo tác động cũ nhất quán.
- Ngân sách: spent là tổng expense khớp phạm vi; remaining = limit - spent; overspent = max(spent - limit, 0).
- Một giao dịch tính một lần dù có nhiều tag; mỗi ngân sách tính độc lập.
- Progress bar tối đa 100%, tỷ lệ text có thể vượt 100%.
- Cảnh báo khi chuyển từ không vượt sang vượt; retry không tạo event trùng. Đọc báo cáo không phát sinh event.
- Timestamp UTC, nhóm ngày/tháng theo timezone người dùng; mặc định Asia/Ho_Chi_Minh.
- Khoảng ngày dùng [start, endExclusive), tính trọn ngày kết thúc.
- Không dùng toISOString().slice(0, 10) để xác định ngày địa phương.
- Chặn giao dịch tương lai ở cả form và lớp nghiệp vụ; không chỉ dựa vào date picker.

## 6. Chức năng phải hoàn thiện

Onboarding: giới thiệu ngắn, múi giờ, tạo ví đầu tiên, nhập backup; không bắt đăng ký online.

Ví: tạo/sửa tên và icon/lưu trữ; số dư ban đầu; điều chỉnh số dư riêng có lịch sử; chi tiết ví, tổng số dư và lịch sử số dư.

Danh mục và nhãn: danh mục thu/chi riêng; tạo/sửa/lưu trữ; danh mục mặc định tiếng Việt; giữ lịch sử của dữ liệu đã dùng.

Giao dịch: tạo/chi tiết/sửa/xóa; số tiền, ví, danh mục, ngày giờ, ghi chú, tag; lỗi đúng trường; chặn double submit; giữ draft khi lưu lỗi.

Chuyển ví: tạo/sửa/xóa giữa hai ví khác nhau còn hoạt động; rollback toàn bộ khi có lỗi.

Timeline: nhóm ngày, tổng ngày, tìm ghi chú/tên danh mục, lọc ví/loại/danh mục/tag/ngày; danh sách ảo hóa; phân trang theo thứ tự ổn định có ID làm tie-breaker; mở chi tiết khi chạm.

Báo cáo: thu, chi, dòng tiền, chi theo danh mục, tổng số dư và lịch sử; chọn kỳ/ví; chart nhẹ hoặc biểu diễn đơn giản kèm số liệu text để đối chiếu.

Ngân sách: CRUD; hạn mức dương, kỳ, nhiều ví/danh mục; tiến độ, còn lại/vượt; giao dịch liên quan và cảnh báo.

Hoạt động: lịch sử mutation, điều chỉnh số dư và vượt ngân sách; đánh dấu đã đọc.

Cài đặt: timezone, backup/import, trạng thái nền tảng, xóa dữ liệu có xác nhận. Khóa Face ID triển khai ở milestone native, không làm nút giả trong bản Expo Go.

Sau mutation, cập nhật toàn bộ dữ liệu liên quan: timeline, ví, báo cáo, ngân sách và hoạt động. Không lưu số dư độc lập mà không có cơ chế giữ nhất quán với ledger.

## 7. Backup trước khi dùng dữ liệu thật

- JSON backup đầy đủ có schemaVersion, tiền dạng string và timestamp rõ ràng.
- CSV phục vụ xuất giao dịch, không thay thế backup đầy đủ.
- File export không chứa token, khóa hoặc bí mật.
- Import kiểm tra kích thước, schema, tiền, ngày, ID và quan hệ; không chỉ cast TypeScript rồi tin dữ liệu.
- Bản đầu chỉ cần khôi phục toàn bộ: xem trước số lượng bản ghi và xác nhận thay thế. Không xây merge phức tạp nếu chưa cần.
- Validation trước khi thay thế, thay thế trong transaction; lỗi phải giữ nguyên dữ liệu cũ.
- Kiểm chứng export → restore → đối chiếu số dư và quan hệ.
- Nếu lấy dữ liệu từ PostgreSQL hiện có, thực hiện export/import tường minh, không tự xóa hoặc sửa database server.
- Dữ liệu của Expo Go không tự chuyển sang app riêng. Cần export/import khi chuyển sang binary riêng.
- Có hướng dẫn backup trước khi gỡ app hoặc thay môi trường thử nghiệm.

## 8. Thiết kế React Native

Phong cách yên tĩnh, rõ ràng, ưu tiên đọc tiền và thao tác một tay. Tiếng Việt đầy đủ; system font và tabular numerals khi nền tảng hỗ trợ.

Theme tokens:
background #0B1012; surface #151D21; surface-raised #202C32;
border #34434B; text-primary #F2F6F5; text-secondary #B2C2C9;
accent #20D3A2; expense #FF7484; income #57DFAC;
transfer #86BFFF; warning #F4C56A.

Giá trị kích thước dùng đơn vị logical của React Native:

- Body 16, secondary 14, caption >=12, số tổng 36–44.
- Spacing 4/8/12/16/24/32/48; radius input/button 12, card 18, sheet 24.
- Gutter 16; touch target >=44; FAB 56 mặc định thêm Chi.
- 5 tab: Giao dịch, Ví, Ngân sách, Hoạt động, Thêm. Reports và Inbox có liên kết rõ ràng.
- Form sheet hoặc route toàn màn hình, danh mục dạng grid wrap được tên dài.
- Safe area, bàn phím và thanh điều hướng không che nội dung/nút lưu.
- Input tiền hỗ trợ bàn phím số và dấu phân cách nhưng lưu giá trị chính xác.
- Loading, empty, error và retry có hành vi thật; toast chỉ sau commit thành công.
- Dùng accessibilityLabel/Role/State phù hợp, hỗ trợ VoiceOver và font scaling.
- Tôn trọng reduced motion. Back/cancel/đóng form có hành vi nhất quán và bảo vệ draft khi cần.
- Không áp yêu cầu DOM như aria attributes, CSS hoặc Escape cho native; xử lý theo API nền tảng.
- Không tự vẽ status bar iOS. Không hero marketing, rainbow gradient, glassmorphism hoặc emoji làm bộ icon chính.

## 9. Tính năng điện thoại nâng cao

Sau khi lõi local + backup chạy được trên iPhone:

- Face ID qua expo-local-authentication. Face ID không kiểm chứng trong Expo Go; cần development build.
- Bí mật qua expo-secure-store; khóa app không đồng nghĩa database đã được mã hóa. Nếu cần mã hóa, dùng giải pháp chuẩn và kiểm tra khả năng backup/khôi phục khóa.
- Nhập ảnh bằng image picker/camera; xin quyền khi sử dụng.
- OCR local, ưu tiên tích hợp native phù hợp; Apple Vision qua module/plugin cần binary riêng. Kiểm tra ngôn ngữ được hỗ trợ và ảnh tiếng Việt thật.
- Shortcuts/App Intents, widget và Share Extension cần kiểm tra module/extension, signing và phiên bản iOS. Có thể viết Swift cho phần native cần thiết.
- Không cam kết đọc trực tiếp hộp thư SMS, thông báo của app ngân hàng hoặc chạy nền liên tục.
- Không mặc định iPhone 12 Pro Max hỗ trợ mọi tính năng chỉ vì đã nâng iOS.

Giai đoạn Smart Import:

- Bắt đầu bằng văn bản SMS/email dán vào app; sau đó ảnh/OCR.
- Gmail OAuth/cloud là tùy chọn, không điều kiện để dùng local.
- Phân loại payment_success, pending_order, internal_transfer, refund, balance_update, ignored.
- Chuyển cho người khác mặc định expense; internal_transfer chỉ khi ví đích thuộc người dùng.
- pending_order không tự trừ ví; balance_update không tạo chi tiêu kép; không nhầm số dư với amount.
- received → processing → needs_review/imported/duplicate/failed.
- Luôn duyệt trước khi ghi sổ ở bản đầu; ghi event và giao dịch trong cùng transaction.
- Dedup bằng ID nguồn/mã tham chiếu và tín hiệu phù hợp; giữ hai giao dịch thật có cùng số tiền.
- Không tự gửi nội dung/ảnh tài chính ra cloud; cho xóa ảnh gốc; báo rõ lỗi và trường không chắc chắn.
- Nhãn “Sắp có” hoặc “Chưa kiểm chứng” cho tích hợp chưa hoàn tất.

## 10. Milestones và cách thử trên iPhone

M1: khảo sát, scaffold apps/mobile, migration SQLite; tạo ví → ghi chi → số dư đúng → đóng/mở vẫn còn. Chuẩn bị mở bằng Expo Go từ Windows qua QR, cùng mạng hoặc tunnel khi cần. Ghi phiên bản Expo SDK và hướng dẫn tài khoản theo tài liệu hiện tại.

M2: hoàn thiện giao dịch/chuyển ví, backup/restore, dữ liệu bền vững và các kiểm tra tiền. Đây là bản dùng thử đầu, chưa cần đợi OCR/widget.

M3: timeline/filter, danh mục/tag, ngân sách, báo cáo, hoạt động và settings; hoàn thiện các trạng thái và accessibility.

M4: binary iOS riêng, Face ID, kiểm tra offline khi cold start, vòng đời app và native integrations. EAS có thể build cloud từ Windows; cài development build lên iPhone theo hướng này cần signing và tài khoản Apple Developer phù hợp. Không cam kết mọi bước đều miễn phí.

M5: Smart Import và các chức năng iOS nâng cao theo thứ tự có ích; cập nhật gate riêng cho từng tích hợp.

- Không chạy xcodebuild hoặc giả định có simulator iOS trên Windows.
- Không chặn M1–M3 chỉ vì thiếu Mac hoặc tài khoản Developer.
- Expo Go có thể cần dev server để tải JavaScript. Không dùng nó làm bằng chứng rằng app độc lập cold-start offline đã đạt.
- Không tạo EAS job có chi phí, đăng ký dịch vụ hoặc publish nếu chưa được cho phép.
- Nếu thiếu quyền/tài khoản/hardware, hoàn thành phần độc lập, ghi checkpoint và hướng dẫn tiếp tục.
- Không tự scaffold một dự án SwiftUI khác để thử nghiệm song song.

## 11. Nghiệm thu

Trên database test riêng, dùng thời gian cố định:

1. Tiền mặt 1.000.000đ, Ngân hàng 0đ.
2. Chi Ăn uống 58.000đ từ Tiền mặt.
3. Chuyển 100.000đ sang Ngân hàng.
4. Tiền mặt 842.000đ; Ngân hàng 100.000đ; tổng 942.000đ; thu 0đ, chi 58.000đ, dòng tiền -58.000đ.
5. Ngân sách Ăn uống 5.500đ: spent 58.000đ, vượt 52.500đ, khoảng 1054,5%.
6. Sửa chi thành 50.000đ: Tiền mặt 850.000đ; tổng 950.000đ.
7. Xóa chi: Tiền mặt 900.000đ; tổng 1.000.000đ.
8. Xóa transfer: Tiền mặt 1.000.000đ; Ngân hàng 0đ; tổng không đổi.
9. Reload/đóng mở giữ dữ liệu; app riêng cold-start offline vẫn CRUD và báo cáo được.
10. Export/restore giữ số dư và quan hệ; migration từ schema cũ giữ dữ liệu.
11. Lỗi giữa transfer hoặc restore rollback toàn bộ.
12. Double submit/retry không ghi trùng; stale mutation được xử lý rõ.
13. Kiểm tra số lớn vượt Number.MAX_SAFE_INTEGER, giới hạn INTEGER, tổng overflow, ví âm và timezone qua nửa đêm.
14. Giao dịch nhiều tag không nhân đôi báo cáo/ngân sách; ví archive vẫn giữ lịch sử.
15. Khi làm import, phân biệt số dư/amount, pending/refund/transfer và chống trùng có kiểm thử.

Typecheck/unit test không thay thế kiểm chứng expo-sqlite trên iPhone. Nếu chưa có tương tác thiết bị, chỉ báo phần thực sự chạy và checklist cần người dùng thực hiện.]

1. Xác định workspace đang mở, Git state, quy tắc sẵn có, code và công cụ
   thực tế. Với dự án có sẵn, bảo toàn thay đổi của tôi và kiến trúc phù hợp.
   Với dự án mới, đề xuất kiến trúc nhỏ nhất đáp ứng yêu cầu. Không mặc định
   React/NestJS, tách frontend/backend, microservice hay database cụ thể.
2. Làm rõ người dùng, phạm vi, dữ liệu và acceptance. Chỉ hỏi điều chưa biết
   làm thay đổi kết quả; tiếp tục phần độc lập. Quyền đã có không hỏi lại.
3. Điền PROJECT, ARCHITECTURE, VERIFICATION và STATUS theo bằng chứng của
   dự án. Ghi phân biệt hiện trạng/đề xuất/chưa xác minh. Chia milestone và
   task nhỏ; mỗi task có input, file được sửa, check, deadline và budget.
4. Coordinator mặc định Astra; implementation và review là hai phiên Sol
   riêng theo models.json. Antigravity hỗ trợ UI/context/analysis trong
   phiên có giám sát khi có tool; không bịa kết quả delegation hoặc quota.
5. Chọn 2–4 skill liên quan từ SKILLS.md và catalog thực có. Đọc nội dung
   skill trước khi áp dụng; không cài thêm toàn bộ kho hoặc đổi công nghệ
   vì một skill gợi ý. Đưa hướng dẫn cần thiết vào spec của leaf runner.
6. Dùng runner cho task phù hợp với capability đã kiểm chứng: JSON spec →
   quyền đã có → approve → plan → implementation → review độc lập → check
   sandbox → apply. Chuẩn bị test/acceptance trước giao việc; worker không
   tự nới gate. Task cần browser/build/install/migration hoặc binary dùng
   quy trình có giám sát và check đúng công nghệ; không bỏ kiểm tra cho qua.
7. Khi lỗi, dùng feedback cụ thể. Sau hai vòng sửa, coordinator chẩn đoán;
   tối đa ba vòng, không reset budget khi đổi phiên. Auth/quota/tool thiếu
   thì giữ checkpoint và báo điều kiện để tiếp tục. Chỉ dùng CLI đăng nhập
   và model đã cấu hình; không tự chuyển API key hay tài khoản.
8. Kiểm tra hành vi/end-to-end phù hợp. UI cần flow, trạng thái lỗi/loading,
   viewport, accessibility và bằng chứng. Chỉ ghi VERIFIED khi acceptance
   trên code hiện tại qua. Lưu task/handoff và bước tiếp theo để mở rộng.
9. Thực hiện liên tục trong phạm vi được phép. Trước push/merge/deploy hoặc
   thao tác phá hủy chưa được cho phép, chuẩn bị kết quả cụ thể để review.
   Không tự cài Windows service chỉ vì template có service.ps1.

Bắt đầu bằng việc đọc dự án và xử lý yêu cầu, không chỉ đưa một kế hoạch.
