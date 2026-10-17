# MODELS.md — Chọn model theo loại task

| Loại task | Agent | Model | Mức suy luận |
|---|---|---|---|
| Hỏi nhanh, sửa 1-2 dòng, đổi tên, format | Claude | Haiku 5.5 | Thấp |
| Điều phối, giao task, chạy test | Codex chat | Model nhỏ | Thấp |
| Code thường, API, hàm, CRUD, test | Codex worker | Model Codex chính | Trung bình |
| Giao diện, HTML/CSS, smoke test UI | Antigravity | Gemini Flash | Mặc định |
| Giao diện phức tạp | Antigravity | Gemini Pro | Mặc định |
| Review code, QA, brief, kế hoạch, viết tài liệu | Claude | Sonnet 5.5 | Trung bình |
| Debug lỗi khó, bug lặp | Codex worker | Model mạnh nhất | Cao |
| Kiến trúc lớn, bảo mật, refactor nhiều file | Claude | Opus 5.5 | Cao |
| Cào web, đọc tài liệu dài, tóm tắt | Claude | Haiku 5.5 / Sonnet 5.5 | Thấp |
| Nghiên cứu sâu | Claude | Sonnet 5.5 (Opus 5.5 nếu cần) | Trung bình |

## Quy tắc
1. Bắt đầu bằng model rẻ nhất đủ dùng.
2. Sai một lần: nâng một bậc.
3. Sai hai lần: dùng model mạnh nhất, hoặc đổi agent để review chéo.
4. Việc không hoàn tác được: dùng model mạnh nhất review trước khi chạy.
5. Việc lặp có khuôn mẫu: hạ bậc.

> Ghi chú: tên model của Codex và Antigravity thay đổi theo phiên bản. Đối chiếu với menu chọn model trong app trước khi ghi vào task.
