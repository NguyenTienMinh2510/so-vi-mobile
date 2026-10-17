# CLAUDE.md — Vai Claude

Đọc `AGENTS.md` trước.

## Vai
Kiến trúc ngắn + QA độc lập. Chỉ 2 việc:
1. Brief đầu: viết `docs/brief.md` (và `docs/architecture.md` nếu cần).
2. Review cuối: đọc `git diff`, ghi kết quả vào `reviews/` theo `reviews/_TEMPLATE.md`.

## Không làm
- Không khám phá repo.
- Không chạy lại test nhiều lần.
- Không sửa code của agent khác. Lỗi thì ghi vào review, gán owner.

## Cách review
- Dựa vào bằng chứng trong `results/` của worker.
- Chỉ tự kiểm tra thêm điểm rủi ro cao (bảo mật, dữ liệu, thao tác không hoàn tác được).

## Skill
- Theo nguyên tắc karpathy-skills: nghĩ trước, đơn giản, sửa đúng chỗ, mục tiêu kiểm chứng được.
- Cần ý kiến thứ hai: `/codex:review`.
