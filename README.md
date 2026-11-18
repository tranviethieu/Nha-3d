# Nhà 3D — tham quan nhà 9 × 14 m

Mô hình 3D ngôi nhà 9 × 14 m (Three.js) và trang web tham quan có nhân vật đi lại bên trong.

- `mo_hinh_3d_nha_ve_sinh_sen_lavabo.html` — mô hình gốc, mở trực tiếp bằng trình duyệt.
- `tham-quan-nha/` — ứng dụng React + TypeScript + Vite:
  - Màn tổng quan giống mô hình gốc (xem nhà vệ sinh, lavabo, bếp, vách tivi, mái, cửa, giá bát, phối cảnh).
  - Nút **Thăm quan**: điều khiển nhân vật cao 1,70 m đi vào nhà, mở cửa / cửa sổ, nằm lên giường.
  - Nút **Hiện kích thước**: kích thước tường, cửa sổ và diện tích từng phòng theo bản vẽ thực tế.
  - Hỗ trợ điện thoại (joystick cảm ứng).

## Chạy

```bash
cd tham-quan-nha
npm install
npm run dev          # máy tính
npm run dev:mobile   # mở trên điện thoại cùng Wi-Fi
npm run build        # build ra tham-quan-nha/dist
```

## Điều khiển (máy tính)

`W A S D` / mũi tên: đi · `Shift` chạy · `Space` nhảy · `E` tương tác · `V` góc nhìn · `R` mái · `K` kích thước · `H` về cửa chính · `Esc` thoát tham quan
