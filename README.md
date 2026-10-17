# project-template

Khuôn project chạy multi-agent trong Orca với Claude Code, Codex và Antigravity.

## Khởi tạo project mới
1. Copy thư mục `project-template`, đổi tên thành tên project.
2. Xóa thư mục `.git` của khuôn (nếu có), rồi chạy `git init`.
3. Điền mục "Ghi chú theo project" trong `AGENTS.md`.
4. Copy `.env.example` thành `.env`, điền giá trị thật. Không commit `.env`.
5. Đổi tiêu đề trong `README.md` thành tên project.

## Quy trình 5 bước
1. **Brief** — Claude viết `docs/brief.md`, `docs/architecture.md`.
2. **Task** — Điều phối tách việc thành `tasks/T<số>.md` theo `tasks/_TEMPLATE.md`.
3. **Worker** — Codex / Antigravity làm trong worktree riêng, báo xong ở `results/T<số>.md`.
4. **Nghiệm thu** — Điều phối tự chạy lệnh kiểm tra trong task. Đạt thì merge.
5. **Review cuối** — Claude review `git diff`, ghi `reviews/R<số>.md`.

Việc nhiều bước: ghi kế hoạch vào `plan/`, cập nhật `plan/progress.md` sau mỗi bước. Quyết định quan trọng: ghi `docs/decisions.md`.

## Ai làm gì

| Agent | Việc | File chính |
|---|---|---|
| Codex chat | Điều phối, giao task, nghiệm thu | `tasks/`, `plan/` |
| Codex worker | Backend, logic, test | `src/`, `tests/`, `results/` |
| Antigravity | Frontend, chạy thử trình duyệt | thư mục giao diện, `results/` |
| Claude | Brief đầu, review cuối | `docs/`, `reviews/` |

Chọn model: `MODELS.md`. Quy tắc chung: `AGENTS.md`.
