# Brief — Sửa AI local (Qwen3.5-4B, llama.rn) của Sổ Ví

## Mục tiêu
1. Chế độ "Suy nghĩ kỹ" không làm app crash. Có giới hạn token và thời gian, hết giới hạn thì chuyển sang chế độ nhanh.
2. Chế độ nhanh nhận đúng món người dùng thích hoặc không ăn.
AI vẫn phải tự suy luận, không thay bằng luật cứng. Bộ tính vẫn kiểm từng đồng.

## Hiện trạng đã đọc (nhánh `fix/local-ai-thinking`)
- `apps/mobile/src/spending-ai.ts`: `think()` ở dòng 81, `infer()` ở dòng 111. Mỗi lần gọi đều `initLlama` lại và `release` ở `finally`.
- `apps/mobile/src/spending-thinking.ts:8`: `THINKING_LIMITS` gồm context 3072, predict 1280, timeout 360 s.
- `apps/mobile/src/spending-roadmap-screen.tsx:100-119`: tối đa 2 lượt `think`, sau đó fallback sang `infer`. Mỗi lượt nạp lại mô hình 3,44 GB.
- `apps/mobile/src/spending-roadmap.ts:124` (`roadmapAiCatalog`), `:151` (`reviewRoadmapPreferences`).
- Test gốc: `cd apps/mobile && npm test` cho 258 test, 255 pass, 3 fail. Cả 3 fail là lỗi CRLF/Xcode trên Windows, không liên quan AI.

## Nguyên nhân khả dĩ (giả thuyết, chưa kiểm chứng trên iPhone)
**Crash khi thinking**
- C1. Màn hình tự khóa giữa chừng: một lượt chạy 2–6 phút nhưng app không giữ màn hình sáng (không có keep-awake). Khi khóa máy, AppState đổi và `cancel()` (`spending-roadmap-screen.tsx:51`) chỉ gọi `stopCompletion` bất đồng bộ. GPU Metal có thể vẫn đang chạy khi app đã vào nền. iOS không cho chạy GPU ở nền, nên có thể abort hoặc kill app. **Đã loại (2026-10-18):** người dùng xác nhận crash không do tự khóa. Vẫn thêm keep-awake (đã duyệt) để tránh hủy giữa chừng.
- C2. **(Ưu tiên)** Đỉnh bộ nhớ: mô hình được nạp tới 3 lần liền (2 lượt think rồi infer), mỗi lần là một `initLlama` 3,44 GB với `n_gpu_layers: 99`. Lần nạp sau có thể bắt đầu khi bộ nhớ của lần trước chưa được trả hết. App không có entitlement `increased-memory-limit` (iPhone 6 GB), nên dễ bị jetsam kill.
- C3. Tổng thời gian không bị chặn: timeout 360 s tính cho từng lượt. Tổng có thể vượt 12 phút cộng thời gian nạp, làm máy nóng và tăng khả năng gặp C1.

**Chế độ nhanh không ra sở thích** (chuỗi "không tìm được sở thích" không có trong code, xảy ra ở màn Roadmap, câu báo lỗi có nhắc tới sở thích)
- P1. `roadmapAiCatalog` (`spending-roadmap.ts:128-130`) chỉ nhận mệnh đề bắt đầu bằng `thich|uu tien|khong an…`. Câu như "mình thích phở" hay "em không ăn bún" không khớp. Khi đó món không vào danh sách bắt buộc, có thể bị cắt khỏi 8 món gửi cho AI, nên AI không có ID để chọn.
- P2. Prompt `infer` (`spending-ai.ts:135`) có câu "Chỉ các ID này được truy xuất: <ID quán>", mâu thuẫn với "Chỉ dùng ID trong thực đơn". Với `temperature: 0` và schema chặt, trả mảng rỗng là lựa chọn "an toàn" của model. Kết quả: `reviewRoadmapPreferences` báo "AI chưa giữ món được thích…".
- P3. Few-shot (`spending-ai.ts:124`) dùng toàn món `menu[0]`, có thể làm lệch kết quả.

## Hướng sửa
- Một `LlamaContext` dùng cho cả lượt chạy (các lượt think và fallback infer), chỉ release ở cuối.
- Hạ giới hạn: predict khoảng 768, timeout khoảng 150 s mỗi lượt, cộng một tổng ngân sách thời gian. Hết ngân sách thì bỏ lượt think thứ 2 và fallback ngay.
- Giảm KV cache (`cache_type_k/v: 'q8_0'`, `flash_attn`): `apps/mobile` không có `node_modules`, nên chưa kiểm được typings của llama.rn 0.13.0-rc.7. Tạm hoãn, chưa làm.
- Keep-awake: người dùng đã duyệt cài `expo-keep-awake`. Bật trong `SpendingAi.run()` khi AI chạy, tắt ở `finally`; không sửa UI. Cần build lại app iOS.
- Fast mode: code tự khớp món trước (`matchCatalogDishes`), chấp nhận chủ ngữ đứng trước ("mình/em/tôi thích…"), luôn đưa món khớp vào 8 món gửi AI, bỏ câu ID quán gây nhiễu.
- Tách phần dựng prompt và tham số thành hàm thuần để test được bằng node.

## Tiêu chí xong
- [ ] `npm test` không có fail mới so với baseline 255/258. Có test mới cho: dùng chung context, ngân sách thời gian/token, fallback, và "mình thích phở" vào được menu AI.
- [ ] Không đổi UI ngoài phạm vi task. Không thêm package khi chưa được duyệt.
- [ ] Trên iPhone: chưa kiểm chứng được, cần người dùng chạy theo `docs/IPHONE-TEST.md`. Không khẳng định đã hết crash.

## Cách kiểm tra
`cd apps/mobile && npm test`, review `git diff main..fix/local-ai-thinking`. Trên máy thật: chạy thinking 3 lần liền với màn hình để tự khóa, rồi để luôn sáng.

---

# Giai đoạn 2 (2026-10-18): chuyển sang AI trên mạng

## Kết quả thử trên máy thật (IPA run 39062178132)
- Chế độ nhanh, câu "quận 10, thích ăn phở, 700k trong 7 ngày": báo "AI chưa trả về sở thích hợp lệ…". Lỗi đến từ `parseAiPreferences`, chuỗi `content` không phải JSON. Rất có thể `content` rỗng còn JSON nằm ở `text`.
- "Suy nghĩ kỹ" vẫn crash. Giả thuyết C2 chưa đúng hoặc chưa đủ.

## Quyết định của người dùng
- AI chạy trên **Cloudflare Workers AI** (miễn phí 10.000 Neurons mỗi ngày), có chế độ thinking. Worker gọi model qua binding `env.AI`, không cần API key bên ngoài. App gọi Worker bằng mã truy cập riêng lưu trong Keychain.
- Bỏ Qwen local. Mất mạng, lỗi hoặc hết quota thì dùng **bộ hiểu câu offline** trong code.

## Thiết kế
- `apps/ai-worker/`: Worker chỉ làm proxy mỏng. Nhận `{ mode: 'fast' | 'think', messages, schema? }`, kiểm tra mã `APP_TOKEN` (secret) và giới hạn kích thước, chọn model theo `mode` ở phía server, gọi `env.AI.run`, trả `{ content, reasoning }`.
- App dùng lại `buildThinkingMessages`, `buildFastPrompt`, `parseThinkingResult` và `parseAiPreferences`. Toàn bộ kiểm tra đầu ra vẫn nằm trong app, bộ tính vẫn kiểm từng đồng.
- Chế độ nhanh: chạy bộ hiểu câu offline trước. Câu nào nó không hiểu thì mới gọi Worker `fast`.
- Suy nghĩ kỹ: gọi Worker `think` (tối đa 2 lượt, giữ cơ chế góp ý từ bộ tính). Lỗi thì xuống `fast`, rồi xuống offline, kèm cảnh báo.
- Dữ liệu gửi đi: chỉ mô tả sở thích, kỳ, ngân sách và thực đơn dự trù. Không gửi sổ, giao dịch hay số dư.
- Bỏ Qwen (`llama.rn`, phần tải mô hình, `ModelFileVerifier`, AI ở `spending-screen`) để sang T4, sau khi T3 chạy được trên máy.

## Tiêu chí xong
- [ ] Câu "quận 10, thích ăn phở, 700k trong 7 ngày" ra roadmap khi tắt mạng.
- [ ] Có mạng: "Suy nghĩ kỹ" trả về tips và reasoning, không crash.
- [ ] Mã truy cập không nằm trong repo hay log. Worker từ chối yêu cầu không có mã đúng.
