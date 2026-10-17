# AI roadmap ăn uống — nguồn online và Qwen4B

Bản hiện tại sửa lỗi app văng sau khi tải model100%: bước xác minh từng đoạn
giải phóng bộ nhớ ngay; file tải đủ bị gián đoạn được xác minh/khôi phục khi bấm
Kiểm tra mô hình. 196tests/typecheck/source review/nativeRelease/actualIPAaudit
PASS. Phép đo macOS với3.443GB: peakRSSgrowth bản cũ3.056.910.336bytes,
bản sửa2.179.072bytes. [App đã sửa và hướng dẫn GGUF riêng](../artifacts/ai-model-crash-fix/README.md).
Nguồn6db30e6/build38409413009; bản này chưa thêm tải nền/tiếp tục phần tải dở
trong app, dùng lựa chọn Safari/Tệp→Nhập GGUF người dùng đã đề xuất. Tải/nhập/
khôi phục và nạp4B trên iPhone thật vẫn cần thử lại.

Hiện tại: roadmap dùng nguồn online miễn phí tại Quận10, Qwen3.5-4B Q5_K_M
3,44GB + bộ tính VND. Prompt tạo lịch ngày/tuần, đổi món và xem chênh lệch.
Tệp model đã xác minh SHA;5/5câu thử CPU hiện tại PASS, chưa kiểm tra RAM/tốc độ
trên iPhone. Checkpoint bố cục [bản4B giao diện gọn](../artifacts/ai-roadmap-compact-v1/README.md)
là lịch sử trước khi sửa lỗi tải model, giữ lại để đối chiếu.

Yêu cầu mới thu gọn danh mục/thiết lập đã qua187tests/typecheck/review và UI
320..1280px/chữ100..150%; preview hiện đúng4B ở tab đang mở. Build iPhone
38345545134/6ff72cf SUCCESS, IPA21.586.050byte đã qua root và review độc lập. Preview giả lập AI,
không chứng minh4B đã nạp trên thiết bị. Contract hiện tại:
[roadmap](../.automation/tasks/ai-spending-roadmap-contract.md).

## Hồ sơ manual-menu v1 lịch sử — đã bị phạm vi roadmap thay thế

Ngày: 2026-10-13 (Asia/Bangkok). Trạng thái: source đã triển khai/review,
vòngAI4 đã được duyệt và hoàn thành. CaseA3chính8/8 hai thứ tự thực đơn,
case mở rộng15/16, một kết quả mâu thuẫn bị từ chối và có chọn trực tiếp.
Native build đang chạy; chưa native/device PASS, chưa có IPA tính năng này.
Nguồn: trao đổi trực tiếp với người dùng; quyết định mới nhất là bộ lập kế
hoạch + AI local nhỏ, không gọi API. Hồ sơ thực thi:
[ai-spending-v1](../.automation/tasks/ai-spending-v1.md).

## Phạm vi và thuật ngữ

- Tính năng nằm trong app Sổ Ví, điểm vào từ màn hình Thêm hiện có. Không
  thêm tab, không đổi bố cục chung; dùng component và phong cách hiện có.
- V1 lập kế hoạch ăn uống mỗi ngày trong kỳ ngân sách, tối đa 31 ngày.
  Các khoản chi khác chỉ là khoản cố định/dự phòng do người dùng nhập,
  không tự tạo lịch du lịch hay tư vấn tài chính/dinh dưỡng chuyên môn.
- Kế hoạch là dự kiến, giao dịch là khoản đã ghi sổ. Chọn/đổi/hoàn thành
  bữa không tự ghi, sửa hoặc xóa giao dịch. Ghi sổ dùng flow xác nhận sẵn có.
- Ưu tiên mềm: cố gắng tăng món yêu thích. Ràng buộc cứng: ngân sách,
  dị ứng/món loại trừ và tần suất người dùng đã chọn rõ. Không suy ra
  “thích phở” thành “3 bữa/tuần”; hiển thị cách hiểu để người dùng sửa.
- Còn lại = ngân sách kỳ − khoản đã chi thuộc phạm vi kỳ − khoản cố định
  chưa chi − dự phòng. Khoản cố định đã ghi sổ không được trừ hai lần.
  Coordinator phải chốt cách liên kết chi thực tế trong contract trước code.
- Ngày đã qua/đã khóa và bữa đã xác nhận giữ nguyên khi tính lại; chỉ sửa
  phần tương lai sau khi người dùng xem và chấp nhận chênh lệch.

## Luồng người dùng

1. Nhập ngày bắt đầu/kết thúc, ngân sách VND, phạm vi ví/danh mục, khoản
   cố định/dự phòng, số bữa, khả năng tự nấu, món kiêng và sở thích.
2. Nhập sở thích bằng văn bản hoặc chọn trực tiếp. AI local chuyển văn bản
   thành đề xuất có cấu trúc; người dùng xem/sửa trước khi áp dụng.
3. Bộ lập kế hoạch tạo đủ ngày/bữa yêu cầu từ danh mục đã có giá. Hiển thị
   món, khẩu phần, chi phí, tự nấu/quán và địa chỉ nếu người dùng đã lưu.
   Phân bổ linh hoạt từng ngày; không mặc định mọi ngày phải chi bằng nhau.
4. Đổi món: hiển thị giá cũ/mới, chênh lệch, số dư dự kiến cuối kỳ và phần
   cần điều chỉnh. Có thể giữ các bữa khác hoặc xem phương án cân lại.
   Không âm thầm tăng ngân sách, lấy dự phòng hoặc giảm số bữa.
5. Lưu, mở lại offline và cập nhật theo khoản đã chi, sau xác nhận. Không
   tính lại mỗi lần mở màn hình; xử lý dữ liệu thay đổi khi đang xem đề xuất.

## Bộ lập kế hoạch và dữ liệu

- Logic thông thường trên thiết bị: lọc lựa chọn hợp lệ, xếp bữa theo ưu
  tiên và hạn chế lặp, kiểm tra tổng tiền. Không cần tự huấn luyện model.
- Không hứa nghiệm tối ưu toàn cục. Nếu thuật toán chưa tìm được lịch,
  nói “chưa tìm được phương án”, không khẳng định toán học là vô nghiệm.
- Tiền dùng convention canonical TEXT/BigInt và giới hạn hiện có;
  không float, SQL SUM tiền hoặc chuyển BigInt thành Number để tính.
- Giá có nguồn/thời điểm/khẩu phần/trạng thái ước tính hoặc đã xác nhận.
  Menu người dùng nhập là nguồn dùng được; dữ liệu minh họa gắn nhãn rõ,
  không quảng cáo là giá thị trường hiện tại. Món không có giá không được
  đưa vào kế hoạch cam kết ngân sách.
- Với tự nấu, phân biệt chi phí khẩu phần và tiền thực trả khi mua cả gói.
  Nếu chưa có mô hình tồn kho/mua gói, chỉ dùng giá bữa do người dùng xác
  nhận bao gồm chi phí; ghi giới hạn, không giả lập tiết kiệm không tồn tại.
- Không bắt buộc thêm OCR menu: OCR hóa đơn hiện có giữ nguyên. Không
  tự coi các dòng OCR là thực đơn đã xác nhận.
- Lưu kế hoạch/danh mục/sở thích local qua storage hiện có; coordinator
  chốt migration, backup và restore trước writer. Backup không chứa file
  mô hình, đường dẫn máy, cache hoặc trạng thái inference. Backup cũ phải
  restore được, dữ liệu kế hoạch không được âm thầm mất khi backup mới.

## AI local và vòng đời mô hình

- AI có thật trong app; không chỉ đổi nhãn bộ quy tắc thành AI. AI chỉ
  hiểu sở thích và giải thích phương án đã kiểm tra, không tự đặt giá,
  địa chỉ, tính số dư hay ghi sổ.
- Thiết bị mục tiêu: iPhone 12 Pro Max. Không phụ thuộc Apple Intelligence.
  Ứng viên đầu: model Instruct đa ngôn ngữ khoảng 1–2B, lượng tử hóa 4-bit.
  Qwen 3.5 4B chỉ là ứng viên đối chiếu, chưa phải lựa chọn đã xác minh.
- Tận dụng runtime tương thích React Native/iOS và native pipeline hiện
  có. Chỉ thêm dependency cần thiết sau kiểm tra phiên bản, giấy phép,
  model architecture, iOS/Metal và native build; không đổi stack.
- Mặc định đề xuất: tải model một lần từ nguồn công khai miễn phí hoặc
  nhập file. Tải file không phải inference API. Hiển thị dung lượng trước
  tải, xác minh revision/license/checksum từ nguồn đáng tin và lưu trong
  private app storage. Không tự tải khi mở app, không kèm khóa/token.
- Có tiến độ, hủy, thiếu dung lượng, tải dở, file sai/hỏng/không tương
  thích, tải lại và xóa model. Không load/download song song trùng lặp;
  giải phóng context khi không dùng, không chạy trong Share/widget.
- Có schema chặt, giới hạn input/output/time/context và hủy inference;
  kiểm tra món ID, số lần, enum và trường lạ. Nội dung nhập/model là dữ
  liệu không tin cậy. Không thực thi lệnh/tool do model đề xuất.
- Chưa tải model hoặc inference lỗi: chọn sở thích trực tiếp và bộ lập
  kế hoạch vẫn dùng được, báo rõ AI chưa sẵn sàng. Điều này không được
  dùng để tuyên bố AI đã đạt acceptance.

## Mạng, phí và quyền riêng tư

- Không Modal, API AI, Google Places/Routes/Maps SDK API, backend, tài
  khoản mới hoặc dịch vụ tính phí. Không tự đổi model sang cloud khi lỗi.
- Không gửi ảnh, văn bản sở thích, vị trí hay giao dịch ra ngoài. Mạng
  duy nhất dự kiến trong setup là tải model do người dùng chủ động yêu cầu;
  dùng file nhập thì setup cũng không cần mạng. Lập kế hoạch hoạt động offline.
- V1 quán/địa chỉ do người dùng nhập. Tự động lấy quán/món/giá từ Google
  Maps được hoãn theo quyết định “không gọi API”. Không scraping thay thế.
- Không quảng cáo không mất mọi chi phí phân phối iOS; giữ quy trình
  build/sign riêng hiện có và không tự mua membership/credit.

## Acceptance bắt buộc

| ID | Kết quả kiểm tra được |
|---|---|
| A1 | Ngày/kỳ/số bữa/VND hợp lệ; biên 1 và 31 ngày, hết tháng/năm, giá trị quá giới hạn được kiểm tra. |
| A2 | Lịch đủ bữa, không món kiêng, tổng dự kiến + chi thực tế + fixed chưa chi + dự phòng không vượt ngân sách; báo thiếu dữ liệu/ngân sách rõ. |
| A3 | “Ưu tiên cơm”, “thích phở”, “phở ít nhất 3 lần/tuần”, “không ăn phở” được phân biệt; có duyệt/sửa điều kiện AI hiểu. |
| A4 | Đổi 12.000đ sang 30.000đ tăng đúng 18.000đ; không tự tiêu dự phòng, sửa ngày khóa hay ghi giao dịch; xử lý proposal cũ khi ledger thay đổi. |
| A5 | Lưu/reload và điều chỉnh chi thực tế không trừ đôi; migration/backup/restore cũ/mới và rollback giữ tài chính hiện có. |
| A6 | Model load và inference native thật trên iPhone mục tiêu; sau setup chế độ máy bay vẫn hiểu sở thích và tạo kế hoạch. Mock/Expo Go/source PASS không thay thế. |
| A7 | Tải/nhập/hủy/xóa/lỗi model không mất draft/ledger; AI timeout/context/schema lỗi có fallback trực tiếp và không gọi mạng. |
| A8 | Thêm → tính năng → setup → kế hoạch → đổi món hoạt động; loading/empty/error, VoiceOver, chữ lớn, bàn phím/safe-area và draft được kiểm tra. |
| A9 | Regression hiện có, typecheck, Hermes, native build và reviewer độc lập PASS; FaceID/OCR/Share/widget và bundle identity giữ nguyên. |
| A10 | Ghi model/runtime/hash/license, dung lượng, thời gian load/response, độ ổn định và nhiệt độ/pin quan sát trên máy; không hứa tốc độ khi chưa đo. |

## Quyết định mở và bằng chứng

Coordinator được chọn runtime/model miễn phí nhỏ nhất đạt kiểm thử và
chốt schema/allowlist sau đọc code. Chưa được tự nới acceptance nếu model
không đạt. Không tìm được phương án native hợp lệ thì ghi bằng chứng và
dừng phần đó, không đổi cloud hoặc bỏ AI để tuyên bố hoàn tất.

Hiện trạng đã đọc: package.json chưa có runtime LLM; MoreScreen ở
src/screens.tsx; route (tabs)/more.tsx; Apple Vision/native bridge đã có.
Chưa đọc toàn bộ persistence/backup hoặc thử thiết bị trong phiên setup.
Chưa có benchmark, lựa chọn model, source implementation hay device PASS.
# Current user requirement — visual online roadmap, 2026-10-13

User supersedes the former manual-menu/no-data-API scope below. Product now starts
with one local-AI prompt and helper examples, produces a minimal visual food/
spending roadmap, daily and weekly views, editable meal stages and exact budget
recalculation. Food names/prices/places come from online sources, never invented
by AI or required manual catalogue entry. Initial test area Quận10, TP.HCM;
prioritize free public online sources. Inference remains local Qwen3.5-2B; no paid
Google Places setup selected. Source read date/URL, listed-price caveat, unknown/
offline/error handling required. Current implementation contract:
[ai-spending-roadmap-contract](../.automation/tasks/ai-spending-roadmap-contract.md).
User cancels Antigravity and requests local design skills + awesome-design.
Current machine checkpoint2026-10-13 10:44Asia/Bangkok: IMPLEMENTED_MACHINE /
WAITING_DEVICE. Qwen3.5-4B Q5_K_M3.44GB replaces2B byexplicituserchoice;
native andJS metadata pin same3443763168bytes/hash21c464...d33e at4168f45...4c15d6.
ActualdownloadfullhashPASS; currentrealonline18foodmenus+short-ID inference
adapter+exactsourcepreferences restore+semanticguard localCPU5/5PASS. No universal
language accuracy or iPhoneRAM/latency claim. 187tests/typecheck/Hermes/nativeRelease
PASS; exactprivate107sourcea444898/run38341977280 actualnewIPA root+independent
signature/resources/identities/auditPASS. Newartifact
[IPA](../artifacts/ai-roadmap-v1/so-vi-unsigned.ipa),
[guide](../artifacts/ai-roadmap-v1/README.md),
[interactivepreview](http://127.0.0.1:4175/roadmap/),
[qualityevidence](../.automation/.runtime/ai-roadmap-model-4b-evidence.json).
Preview uses source +capturedpublicmenus +explicitmockAI, notnativeproof. Free
coveragecurrently3Quận10menus/max18foods; listedpricesnotguaranteeddine-inquotes.
Roadmap initial1/repairs3of3complete, separateuser4Bupgradeinitial1/no repair;
allhistoricalbudgetsretained. Allwriters/reviewersSTOP; no more sourcework needed
without concrete new userfeedback. RealphoneA6/A10/sourcefetch/VoiceOver remain
userdevicechecks; fallback explicitexactmath neverfakeAI/nosilenthardconditiondrop.
Old source/native/device checkpoints below are historical and do not prove this
new roadmap is complete. Preserve old financial/planner/protected-slot rules.

## Chế độ Suy nghĩ kỹ và món tự nấu (17/10/2026)

Roadmap có lựa chọn **Cách AI làm việc: Nhanh / Suy nghĩ kỹ**.
- Nhanh: như cũ, Qwen không thinking, chỉ hiểu sở thích (2048 context, 60 giây).
- Suy nghĩ kỹ: Qwen bật thinking (`enable_thinking`, `reasoning_format: auto`),
  context 4096, tối đa 1536 token, chờ tối đa 5 phút. AI nhận ngân sách, số bữa,
  trung bình tiền/bữa, quyền tự nấu và cả thực đơn (≤32 món, giá dự trù, hợp bữa
  sáng, số quán gần đó). AI trả về một JSON đóng: món ưu tiên, số lần/tuần đề
  xuất, có tự nấu hay không và tối đa 4 lời khuyên. Bộ tính BigInt lập lịch và
  kiểm từng đồng; nếu không khả thi, góp ý của bộ tính được gửi lại cho AI một
  lần. Màn hình hiện lời khuyên và “Xem AI đã nghĩ gì” (bản suy nghĩ, ≤4000 ký tự).
  Lời khuyên/suy nghĩ không lưu cùng lịch; schema không đổi.
- Điều người dùng nêu rõ vẫn bắt buộc: món không ăn, món thích, số lần cụ thể.
  AI không được tự loại món, không nhận dị ứng/nguyên liệu.

Tự nấu: 8 món dự trù theo nguyên liệu chợ (10.000–20.000 đ/phần, chưa xác minh).
Ghi “tự nấu được”/“nấu ở nhà” để cho phép, “không nấu” để cấm. Chưa nói gì thì
chế độ Nhanh chỉ ăn ngoài và báo khi ngân sách thấp hơn mức ăn ngoài rẻ nhất
(ví dụ 21 bữa cần ~525.000 đ); Suy nghĩ kỹ để AI quyết định. Chi tiết bữa tự nấu
hiện nguyên liệu thay cho danh sách quán.

Chưa đo trên iPhone: thời gian thinking, RAM với context 4096, chất lượng JSON
khi Qwen 4B suy nghĩ dài. Nếu hay bị “suy nghĩ quá lâu”, giảm mô tả hoặc dùng Nhanh.
