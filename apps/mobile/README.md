# Sổ Ví — bản thử Expo Go

Ứng dụng tiếng Việt, VND, SQLite local. Ví, thu/chi, chuyển ví, ngân sách, báo cáo, hoạt động và backup JSON chạy trong app; không cần tài khoản online của Sổ Ví. Bản thử dùng Expo SDK57.0.27, React Native0.86.3, React19.2.3.

## Mở trên iPhone

1. Cài **Expo Go** từ App Store, đăng nhập tài khoản Expo của bạn.
2. Laptop và iPhone dùng cùng Wi-Fi. Expo CLI trên laptop và Expo Go phải đăng nhập **cùng tài khoản Expo**, theo [hướng dẫn hiện tại của Expo](https://expo.dev/changelog/expo-go-57-login). Đây là tài khoản của môi trường thử, không phải tài khoản Sổ Ví.
3. Máy chủ thử nền và QR hiện tại được ghi tại [hướng dẫn thiết bị](../../docs/IPHONE-TEST.md). Nếu laptop đã khởi động lại, mở terminal trong thư mục này và chạy:

```powershell
npx expo login
npm start -- --go --lan
```

`expo login` chỉ cần khi chưa đăng nhập; tự đăng nhập trong trình duyệt, không gửi mật khẩu vào chat. Quét QR bằng Camera iPhone. Nếu LAN bị router chặn, chạy `npm start -- --go --tunnel` rồi quét QR mới. [Tài liệu Expo](https://docs.expo.dev/get-started/start-developing/) giải thích LAN/tunnel và đăng nhập.

## Trước khi dùng dữ liệu thật

Thực hiện checklist thiết bị. Xuất JSON vào Files và kiểm tra file đã lưu; mở bảng chia sẻ không chứng minh đã backup. Backup trước khi gỡ Expo Go hoặc chuyển sang app riêng. Dữ liệu Expo Go không tự chuyển sang binary iOS khác.

## Kiểm tra trên laptop

```powershell
npm test
npm run typecheck
npx expo install --check
npm run bundle:ios
```

Trên máy này Hermes cần thư mục tạm trong workspace khi chạy dưới sandbox. Bằng chứng và log nằm tại `../../.automation/VERIFICATION.md` và `../../.automation/.runtime/`. Kiểm tra màn hình trong tests dùng hook/tree stub; không chứng minh layout hoặc VoiceOver trên iPhone.

Người dùng đã xác nhận thử lõi + backup trên iPhone. Smart Import văn bản mới nằm ở **Thêm → Inbox**; xem [cách thử và giới hạn](../../docs/SMART-IMPORT.md). JSONschema2 giữ cả nội dung Inbox và hỗ trợ khôi phục backupschema1 cũ.

Face ID, OCR, widget, Shortcuts và binary riêng chưa được kiểm chứng. Có thể thử binary bằng Xcode/Mac với Apple Account miễn phí (ký lại mỗi7ngày); không bắt buộc mua tài khoản để tiếp tục ExpoGo. Expo Go chưa chứng minh app độc lập khởi động offline.
