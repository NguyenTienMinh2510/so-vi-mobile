# Kho quán ăn cho Roadmap

Tích hợp ngày 17/10/2026. Nguồn Overture Places release `2026-09-23.1`,
49.605 bản ghi chấp nhận, phạm vi TP.HCM cũ theo polygon lịch sử 2008.
Không nhập 19.705 bản ghi `needs-review`. Không bảo đảm đầy đủ hoặc còn hoạt động.

## Cách dùng

Trong app: **Giao dịch → AI chi tiêu** (hoặc **Thêm → AI chi tiêu**) → Roadmap.
Nhập `Quận 10, 7 ngày, 900k, 3 bữa/ngày`, tạo lịch, mở **Chi tiết bữa**.
Danh sách tối đa 5 quán có địa chỉ gốc, nguồn/release/giấy phép và nút Google Maps.
Không có quán: dùng nút tìm chính món đó trên Maps. Lỗi kho: thử lại ở chi tiết;
lịch dự trù vẫn có thể tạo/lưu/mở. Lưu hoặc xác nhận đã ăn không tạo khoản chi.
Chỉ liên kết khoản chi đã được xác nhận trong sổ theo luồng hiện có.

Preview kiểm tra từ source: `http://127.0.0.1:4187/`. Bản này dùng component và
StyleSheet thật, SQLite thật qua cầu nối localhost, sổ thử trong bộ nhớ và AI
mô phỏng; không phải bản chạy native. Lưu preview chỉ tồn tại trong phiên trang.
Khởi động lại từ thư mục gốc khi cần:

```powershell
node .automation/.runtime/food-roadmap-preview.cjs
node .automation/.runtime/food-roadmap-server.cjs
```

## Import chạy lại

Từ thư mục gốc dự án:

```powershell
python apps/mobile/scripts/import-food.py "C:/Users/Minh/Universal-Agent-Studio/.local/searching-food/exports/ef16080a2003499196a861279aaaaf3b/4642a252bd65"
```

Python dùng thư viện chuẩn, không thêm dịch vụ hoặc dependency. Output mặc định
`apps/mobile/assets/food/sovi-food-2026-09-23.1.db`, tách biệt `sovi.sqlite`.
Importer chặn output nằm trong bộ nguồn và tên database tài chính. Kiểm tra tất cả
4 hash dữ liệu, số lượng, khóa `source:id`, release, địa chỉ/tọa độ và phân loại.
Upsert trong transaction, giữ nguyên rowid, FTS và vùng hành chính không nhân đôi.
Database chứa bảng ngoài kho quán bị từ chối; import không xóa dữ liệu cũ để né lỗi.

Các giấy phép bàn giao đã bị đổi xuống dòng sau lúc tính hash: chỉ phép quy đổi
CRLF→LF khớp hash gốc mới được chấp nhận. Không chấp nhận sửa nội dung khác.
`assets/food/verification.json` ghi hash byte thực tế, hash manifest và phép so sánh.
Tệp nguồn không bị sửa. Giữ tệp giấy phép nguyên byte ở `assets/food/licenses`;
toàn văn giấy phép, attribution, manifest và provenance từng quán cũng nằm trong DB
được đóng gói. Không cần ship bản JSON 82 MB hoặc đọc JSON khi tìm kiếm.

Asset được import vào sandbox app một lần, kiểm tra release và bật SQLite
`query_only`. Dữ liệu mới phải dùng tên asset/database theo release mới, hoặc tăng
phiên bản tên khi thay cấu trúc cùng release; không overwrite sổ người dùng.

## Kiến trúc và mức bằng chứng

`RoadmapScreen → loadRoadmapMeals → loadFoodVenues → searchFoodVenues`.
Truy xuất khi tạo lấy tối đa 12 quán theo khu vực; Qwen3.5-4B hiện có chỉ nhận tối
đa 3 tên/ID kèm nhãn chưa xác minh. AI chỉ trả JSON sở thích theo schema đóng;
không có trường quán/địa chỉ/giá. ID món lạ, trường quán tự thêm hoặc điều kiện sai
bị từ chối trước khi tính/hiển thị/lưu. UI lấy thông tin quán trực tiếp từ DB.

Chi tiết bữa tìm tối đa 5 quán theo tên món. API truy xuất cũng hỗ trợ tên quán,
nhóm món có taxonomy cụ thể, và vị trí/bán kính (lọc bbox, tính khoảng cách, giới
hạn 60 ứng viên trước khi lấy kết quả). UI hiện tìm theo khu vực, chưa xin GPS;
không hiển thị khoảng cách khi thiếu điểm gốc. Chỉ mục vùng/FTS và tọa độ được
tạo khi import. Hỗ trợ tiếng Việt có/không dấu, Q10/District 10, tên huyện có/không
tiền tố. Tên món khớp nguyên từ, ưu tiên tên giữ dấu; tên quán hỗ trợ tiền tố.
Địa chỉ nguồn không đủ vùng hành chính sẽ không được đoán quận từ tọa độ.

Kho hiện không có thực đơn, giá, giờ mở cửa hoặc Google Place ID đã xác minh.
Mọi quán hiện có nhãn **Gợi ý cần xác minh**, kể cả tên chứa đúng món hoặc taxonomy
gợi ý nhóm món. Không có nhãn “Thực đơn xác minh” hay “đang mở cửa” cho tập này.
Không tự tạo Place ID. Nút Maps dùng HTTPS Search API chuẩn với query tên/địa chỉ/
tọa độ, hoặc query món+khu vực; không quét Google Maps và không gọi OSM.

Lịch dùng 16 món gợi ý độc lập với kho quán, mức dự trù biên soạn 25.000–45.000 đ
và `estimated=true`; đây không phải giá suy từ taxonomy hay báo giá của quán.
Lịch cân ngân sách bằng BigInt, ưu tiên đa dạng món/nhóm món và khung bữa sáng;
xôi/bánh cuốn dành bữa sáng. Ngân sách/điều kiện chặt có thể làm giảm đa dạng hoặc
bị từ chối nếu không có phương án. Không chứng nhận nguyên liệu/dị ứng.

Không đổi schema lịch/sổ, CAS, khóa app, hủy hoặc bước xác nhận giao dịch.
Lịch cũ giữ nguyên món/giá/nguồn đã lưu và truy xuất quán khi mở chi tiết.

## Kiểm tra và giới hạn

```powershell
cd apps/mobile
npm run typecheck
npm test
node node_modules/expo/bin/cli export --platform ios --output-dir dist-food-verification
```

Fixture tự động không dùng mạng công cộng: import lặp/hash/tách sổ; tiếng Việt,
vùng, quán đóng, khoảng cách; ID/bằng chứng/Maps; ngày/tuần, thời gian, hủy,
lưu/mở lịch cũ và mới; kho thiếu/error/empty; AI chưa có/đầu ra không hợp lệ.
Không có cấu hình lint riêng. Bằng chứng phiên này và hash source:
`artifacts/food-all-tests.log`, `food-typecheck.log`, `food-ios-bundle.log`,
`food-import-report.json`, `food-ui-check.log`, `food-source-hashes.json`;
ảnh trong `artifacts/food-roadmap-preview`.

Chưa chạy native iPhone, Qwen thật với context mới, RAM/thời gian mở asset khoảng 90 MB,
VoiceOver, GPS hay chuyển sang app Maps trên điện thoại. Windows chỉ kiểm tra
Hermes/iOS JS export và native adapter bằng fixture; chưa tạo IPA hay phát hành.
Tìm bỏ dấu vẫn có thể khớp đồng âm; nhãn chưa xác minh luôn được giữ.

## Kiến thức món cho AI local (bổ sung 17/10/2026)

Từ 49.605 tên quán, `apps/mobile/scripts/build-food-knowledge.py` đếm số quán có
tên chứa từng món theo 23 quận/huyện/TP Thủ Đức (vùng ≥100 quán, bỏ cấp phường)
và sinh `src/food-knowledge.generated.ts` (~12 KB, kèm SHA DB nguồn). App và AI
không quét DB 90 MB khi tạo lịch. Tên gọi món nằm ở `scripts/food-dishes.json`.
Tên có dấu chỉ khớp alias có dấu, nên “Phố Nướng” không bị tính là phở; tên dài
thắng tên ngắn (“Bún chả cá” là bún cá, không tính bún chả).

Dùng kiến thức này ở bốn chỗ:
- Thêm 6 món phổ biến trong kho: bánh xèo, bún đậu mắm tôm, bò né, bún cá, bún mắm,
  bánh ướt (tổng 22 món). Giá vẫn là dự trù biên soạn, không lấy từ quán.
- Qwen nhận `aliases` cho mỗi món (ví dụ hủ tíu/hu tieu, bún bò Huế, cơm sườn,
  gà xối mỡ); bộ duyệt sau AI và bộ tính không-AI cùng khớp alias, ưu tiên tên
  khớp đúng rồi tên dài nhất. Danh sách cho AI tăng 6→8 món để “không ăn bún”
  vẫn đủ cả 7 món bún. AI vẫn chỉ trả ID trong schema đóng.
- Danh sách món được xếp theo số quán đặt tên theo món ở quận đã nhập, nên bộ
  tính và danh sách rút gọn cho AI thử món phổ biến tại khu vực trước.
- Chi tiết bữa tìm quán thêm các cụm alias chính xác (FTS phrase) và hiện “Kho có
  N quán ở khu vực này đặt tên theo món (tín hiệu tên, chưa xác minh thực đơn)”.

Chạy lại khi đổi DB hoặc danh sách tên gọi (test kiểm tra file sinh ra khớp):

```powershell
python apps/mobile/scripts/build-food-knowledge.py
```

Giới hạn: đây là tín hiệu tên quán, không phải thực đơn; quán bán món nhưng tên
không chứa món sẽ không được đếm. Khu vực ngoài TP.HCM cũ không có số đếm và giữ
thứ tự món mặc định. Chưa đo Qwen thật trên iPhone với prompt có alias.
