# Hệ thống Template In Tem POS Tùy Biến (Custom HTML POS Label Engine)

## 1. Mục Tiêu
Cho phép cấu hình giao diện in tem (Label 50x30mm) trực tiếp thông qua giao diện POS, thay vì hardcode trong mã nguồn, giúp chủ quán linh hoạt điều chỉnh font chữ, bố cục cho GrabFood, ShopeeFood.

## 2. Các Tập Tin Chỉnh Sửa Chính
- `public/js/settings.js`: Xử lý giao diện cấu hình, Editor HTML (`#cfg-labelTemplate`), và Live Preview (`updateLivePreview`).
- `public/index.html`: Chứa hàm `printOrderLabel` và `printReceipt` thực thi render HTML dựa vào biến cấu hình trong `localStorage`.
- `server.js`: Nơi webhook API nhận đơn, map dữ liệu `toppings` (Array) và `note` (String) từ App.

## 3. Hệ Thống Biến Hỗ Trợ (Template Variables)
Các từ khóa sau được parse và thay thế trực tiếp trong lúc in lệnh:
- `{storeName}`: Tên cửa hàng
- `{platformName}`: Tên App (GRAB, SHOPEE, LOCAL...)
- `{displayId}`: Mã đơn hàng (VD: GF-123)
- `{itemName}`: Tên món ăn
- `{size}`: Khối HTML chứa kích cỡ món (`<li>Size: L</li>`)
- `{itemIndex}`: Số thứ tự ly hiện tại (Tính liên tục trên TỔNG các món của đơn)
- `{itemQuantity}`: Tổng số ly của toàn bộ đơn hàng
- `{note}`: Khối HTML chứa topping và ghi chú (tách theo `<li>`)
- `{timeStr}`: Thời gian đơn đổ về (giờ:phút)
- Các biến Font: `{labelBaseFontSize}`, `{labelSizeFontSize}`, `{labelFontSize}`.

## 4. Các Vấn Đề Kỹ Thuật Đã Giải Quyết
### 4.1. Ghi chú (Note) chứa dấu phẩy
- **Vấn đề ban đầu:** `index.html` ghép mảng Topping và Note bằng dấu `, ` rồi sau đó lại `split(', ')` để in từng gạch đầu dòng. Điều này khiến các ghi chú của khách như `"ít ngọt, ít đá"` bị vỡ thành nhiều dòng.
- **Giải pháp:** Thay đổi logic ghép chuỗi thành dấu pipe `|` (`notesArray.join('|')`) và chỉ `split('|')` lúc render HTML. Điều này đảm bảo chuỗi ghi chú của khách được giữ nguyên vẹn trên một dòng (`<li>Ghi chú: ít ngọt, ít đá</li>`).
- **Ghi chú hóa đơn bill 58mm:** Trong `printReceipt`, sử dụng `<br/>*` khi `split('|')` để các topping xuống dòng với dấu `*` ở đầu.

### 4.2. Logic đếm tổng số ly (`itemIndex`/`itemQuantity`)
- **Vấn đề ban đầu:** Biến vòng lặp chỉ đếm số lượng cho *từng* món riêng biệt (VD: Bạc xỉu 1/1, Đen đá 1/1).
- **Giải pháp:** 
  - Tính `totalQuantity = printItems.reduce((acc, oi) => acc + (parseInt(oi.quantity) || 1), 0);`
  - Đặt `currentItemIndex = 1` bên ngoài vòng lặp món.
  - Tăng `currentItemIndex++` qua mỗi ly được render. Điều này giúp các tem có số thứ tự nối tiếp nhau xuyên suốt đơn hàng (1/2, 2/2).

### 4.3. Layout Tem Mặc Định Mới Nhất
- Tên nền tảng (Platform) và Mã đơn hiển thị trên một dòng, căn trái (`GRAB #GF-123`).
- Định dạng đếm ly sử dụng text ngang `1/2` thay cho thẻ `<sub>` để căn lề dưới dễ nhìn hơn.
- "Ghi chú:" được chèn vào trước `i.note` tự động (nếu chưa có) và không bị biểu thức regex cắt bỏ nữa.

## 5. Lưu Ý Tương Lai
- Bất cứ khi nào cập nhật bố cục mặc định, cần phải sửa chuỗi HTML cứng ở hàm `onclick` của nút **"Khôi phục HTML gốc"** trong `public/js/settings.js`.
- Cần dặn dò người dùng cập nhật (Khôi phục) lại HTML để áp dụng layout mới nhất do cấu hình cũ lưu cứng trong `localStorage`.
