# Bảng món dự trù T5

80 món ăn ngoài + 8 món tự nấu. Giá VND mỗi phần là dự trù biên tập, chưa xác minh giá tại quán; không phải giá do AI tạo.

Nguồn: sovi-food-2026-09-23.1.db, mở chỉ đọc. Món mới được sàng lọc bằng FTS `venue_search` theo cụm tên món (cột `name`), mỗi món ≥10 quán; cột cuối là số tên quán đang hoạt động khớp aliases sau khi bộ sinh ưu tiên tên dài nhất. Đây là tín hiệu tên quán, không xác nhận thực đơn hay giá.

`com-ca` là món cũ chỉ có 3 tín hiệu, giữ để tương thích theo xác nhận của điều phối. Món tự nấu không dùng số quán làm bằng chứng.

| id | Tên | Giá dự trù VND | Nhóm | Bữa | Số quán toàn TP |
|---|---|---:|---|---|---:|
| banh-mi | Bánh mì | 25000 | banh | sang | 793 |
| pho | Phở | 45000 | nuoc | sang, trua | 1043 |
| bun-bo | Bún bò | 45000 | nuoc | sang, trua | 738 |
| hu-tieu | Hủ tiếu | 35000 | nuoc | sang, trua | 763 |
| xoi | Xôi | 25000 | nep | sang | 191 |
| banh-cuon | Bánh cuốn | 35000 | banh | sang | 254 |
| chao | Cháo | 30000 | chao | sang | 482 |
| bun-rieu | Bún riêu | 35000 | nuoc | sang, trua | 229 |
| com-tam | Cơm tấm | 40000 | com | trua, toi | 780 |
| com-ga | Cơm gà | 45000 | com | trua, toi | 255 |
| bun-thit-nuong | Bún thịt nướng | 40000 | kho | trua, toi | 135 |
| mi-quang | Mì Quảng | 45000 | kho | trua, toi | 216 |
| banh-canh | Bánh canh | 35000 | nuoc | sang, trua | 485 |
| com-ca | Cơm cá | 40000 | com | trua, toi | 3 |
| bun-cha | Bún chả | 45000 | kho | trua, toi | 215 |
| mi-xao | Mì xào | 40000 | kho | trua, toi | 36 |
| banh-xeo | Bánh xèo | 50000 | banh | trua, toi | 197 |
| bun-dau | Bún đậu mắm tôm | 55000 | kho | trua, toi | 429 |
| bo-ne | Bò né | 50000 | bo | sang, trua | 135 |
| bun-ca | Bún cá | 40000 | nuoc | trua, toi | 200 |
| bun-mam | Bún mắm | 50000 | nuoc | trua, toi | 120 |
| banh-uot | Bánh ướt | 30000 | banh | sang | 63 |
| com-chay | Cơm chay | 30000 | com | trua, toi | 176 |
| com-nieu | Cơm niêu | 50000 | com | trua, toi | 119 |
| com-van-phong | Cơm văn phòng | 35000 | com | trua, toi | 48 |
| com-chien | Cơm chiên | 35000 | com | trua, toi | 38 |
| com-ga-xoi-mo | Cơm gà xối mỡ | 40000 | com | trua, toi | 138 |
| com-ga-hai-nam | Cơm gà Hải Nam | 50000 | com | trua, toi | 21 |
| com-tho | Cơm thố | 40000 | com | trua, toi | 17 |
| com-bac | Cơm Bắc | 40000 | com | trua, toi | 11 |
| com-que | Cơm quê | 35000 | com | trua, toi | 17 |
| bun-moc | Bún mọc | 40000 | nuoc | sang, trua | 49 |
| bun-oc | Bún ốc | 45000 | nuoc | sang, trua | 11 |
| bun-thai | Bún Thái | 45000 | nuoc | trua, toi | 45 |
| bun-nuoc-leo | Bún nước lèo | 40000 | nuoc | sang, trua | 23 |
| bun-quay | Bún quậy | 50000 | nuoc | trua, toi | 24 |
| mi-vit-tiem | Mì vịt tiềm | 60000 | nuoc | trua, toi | 32 |
| mi-sui-cao | Mì sủi cảo | 45000 | nuoc | sang, trua | 14 |
| mi-ga | Mì gà | 40000 | nuoc | sang, trua | 41 |
| mi-bo | Mì bò | 45000 | nuoc | sang, trua | 24 |
| mi-cay | Mì cay | 50000 | nuoc | trua, toi | 269 |
| mi-y | Mì Ý | 50000 | kho | trua, toi | 26 |
| mi-tron | Mì trộn | 35000 | kho | trua, toi | 69 |
| mien-ga | Miến gà | 40000 | nuoc | sang, trua | 15 |
| banh-hoi | Bánh hỏi | 40000 | banh | trua, toi | 18 |
| banh-can | Bánh căn | 35000 | banh | sang | 28 |
| banh-khot | Bánh khọt | 45000 | banh | trua, toi | 34 |
| banh-beo | Bánh bèo | 35000 | banh | sang | 79 |
| banh-bot-loc | Bánh bột lọc | 35000 | banh | trua, toi | 21 |
| banh-trang-cuon | Bánh tráng cuốn | 40000 | cuon | trua, toi | 14 |
| nem-nuong | Nem nướng | 45000 | cuon | toi | 151 |
| goi-cuon | Gỏi cuốn | 35000 | cuon | trua, toi | 26 |
| bo-kho | Bò kho | 45000 | bo | sang, trua | 61 |
| bo-bit-tet | Bò bít tết | 65000 | bo | trua, toi | 43 |
| bo-la-lot | Bò lá lốt | 45000 | nuong | toi | 30 |
| bo-nuong | Bò nướng | 60000 | nuong | toi | 67 |
| ga-nuong | Gà nướng | 55000 | nuong | toi | 207 |
| vit-quay | Vịt quay | 55000 | vit | trua, toi | 121 |
| vit-nuong | Vịt nướng | 55000 | nuong | toi | 31 |
| lau-thai | Lẩu Thái | 80000 | lau | toi | 21 |
| lau-bo | Lẩu bò | 90000 | lau | toi | 257 |
| lau-ga | Lẩu gà | 80000 | lau | toi | 164 |
| lau-de | Lẩu dê | 100000 | lau | toi | 263 |
| lau-ca | Lẩu cá | 80000 | lau | toi | 139 |
| lau-mam | Lẩu mắm | 80000 | lau | toi | 34 |
| lau-nam | Lẩu nấm | 70000 | lau | toi | 11 |
| oc-huong | Ốc hương | 70000 | oc | toi | 13 |
| chao-suon | Cháo sườn | 30000 | chao | sang | 25 |
| chao-long | Cháo lòng | 30000 | chao | sang | 164 |
| chao-vit | Cháo vịt | 35000 | chao | sang | 33 |
| chao-ech | Cháo ếch | 45000 | chao | sang | 93 |
| chao-ca | Cháo cá | 35000 | chao | sang | 13 |
| banh-mi-chao | Bánh mì chảo | 40000 | banh | sang | 39 |
| banh-mi-que | Bánh mì que | 25000 | banh | sang | 28 |
| banh-mi-xiu-mai | Bánh mì xíu mại | 30000 | banh | sang | 22 |
| xoi-ga | Xôi gà | 30000 | nep | sang | 19 |
| xoi-man | Xôi mặn | 25000 | nep | sang | 16 |
| pho-ga | Phở gà | 45000 | nuoc | sang, trua | 74 |
| pho-bo | Phở bò | 45000 | nuoc | sang, trua | 53 |
| hu-tieu-muc | Hủ tiếu mực | 50000 | nuoc | sang, trua | 56 |
| cook-mi-trung | Mì gói trứng rau (tự nấu) | 10000 | nuoc | sang, trua, toi | — |
| cook-chao-trung | Cháo trắng trứng muối (tự nấu) | 10000 | chao | sang | — |
| cook-banh-mi-op-la | Bánh mì ốp la (tự làm) | 12000 | banh | sang | — |
| cook-com-trung | Cơm trứng chiên (tự nấu) | 12000 | com | trua, toi | — |
| cook-com-rau-xao | Cơm rau muống xào tỏi (tự nấu) | 12000 | com | trua, toi | — |
| cook-com-canh-dau | Cơm canh rau, đậu hũ sốt (tự nấu) | 15000 | com | trua, toi | — |
| cook-com-thit-kho | Cơm thịt kho trứng (tự nấu) | 18000 | com | trua, toi | — |
| cook-com-ca-kho | Cơm cá kho (tự nấu) | 20000 | com | trua, toi | — |
