# AGENTS.md — Hợp đồng chung cho mọi agent

Mọi agent đọc file này trước khi làm việc. Chọn model theo `MODELS.md`.

## Vai trò

| Vai | Agent | Phạm vi |
|---|---|---|
| Điều phối | Codex chat | Mỏng: chia task, giao việc, chạy test nghiệm thu. Không tự code. |
| Backend / test | Codex worker | Logic, API, CRUD, refactor, viết test. |
| Frontend + chạy thử trình duyệt | Antigravity | Giao diện, HTML/CSS, smoke test UI. Xem `GEMINI.md`. |
| Kiến trúc ngắn + QA độc lập | Claude | Chỉ brief đầu (`docs/brief.md`) và review cuối bằng `git diff`. Xem `CLAUDE.md`. |

## Tiết kiệm quota
- Đọc tối thiểu: chỉ file trong task, chỉ phần cần.
- Review bằng `git diff`, không đọc lại cả repo.
- Mỗi đợt review chỉ một vòng sửa lỗi.
- Lỗi Low không chặn: ghi vào `reviews/`, không mở vòng sửa mới.
- `results/T<số>.md` (worker_done) tối đa 10 dòng.
- Xong task thì giải phóng worker.

## Bàn giao
- Một file chỉ một người viết. Chồng file thì dùng worktree riêng hoặc làm tuần tự.
- Task (`tasks/T<số>.md`, theo `tasks/_TEMPLATE.md`) phải có: mục tiêu, file được sửa, tiêu chí xong, lệnh kiểm tra.
- Worker báo xong bằng `results/T<số>.md`, kèm bằng chứng.
- Điều phối chỉ nghiệm thu sau khi tự chạy lệnh kiểm tra.

## An toàn
- Không đọc `.env` hay bất kỳ bí mật nào. Chỉ dùng `.env.example`.
- Không deploy, không push.
- Không xóa dữ liệu khi chưa hỏi người dùng.
- Không bỏ qua hộp thoại xin quyền.

## Ghi chú theo project (người dùng điền)
- Stack: Expo 57 / React Native (iOS), AI local llama.rn 0.13.0-rc.7 + Qwen3.5-4B Q5_K_M
- Lệnh chạy: `cd apps/mobile && npx expo start` (AI local chỉ chạy trên bản build iPhone, không chạy Expo Go)
- Lệnh test: `cd apps/mobile && npm test` (baseline 2026-10-18: 255/258 pass; 3 fail sẵn do CRLF/Xcode trên Windows)
- Phạm vi Codex worker: `apps/mobile/src/spending-ai.ts`, `spending-thinking.ts`, `spending-roadmap.ts`, `apps/mobile/tests/`
- Phạm vi Antigravity: `apps/mobile/src/*-screen.tsx`
- Điều tuyệt đối không làm: `<điền>`
