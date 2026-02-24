# Rôm Rả Cà Phê - Hướng dẫn Sử dụng Menu Khách Hàng (Mã QR)

Chức năng Menu dành cho khách hàng đã được hoàn thiện và triển khai thành công lên **[Vercel](https://rom-ra-ca-phe.vercel.app)**. Dưới đây là tóm tắt các tính năng chính và cách hoạt động:

## Các Thay Đổi Lớn

### 1. Phân chia Quyền (Role)
Hệ thống hiện tại phân chia rõ ràng giữa khách (GUEST) và nhân viên/quản trị viên (ADMIN/STAFF).
- **Guest:** Khi người dùng truy cập lần đầu hoặc không đăng nhập, họ sẽ chỉ thấy Màn hình Chào mừng và Thực đơn đồ uống.
- **Admin/Staff:** Chỉ những người này mới có thể thấy Menu Sidebar màu vàng và các trang quản trị (Tổng quan, Kho, Phân quyền, v.v.).

### 2. Giao Diện Chào Mừng (Welcome Screen)
Giao diện Brutalist mạnh mẽ, hiển thị tự động khi khách hàng quét mã QR. 
- Nhấn **XEM MENU ĐỒ UỐNG** để đi tới màn hình chọn món.
- Ở góc trên cùng bên phải, có một **nút hình cái khiên ẩn** (hoặc icon admin) để nhân viên bấm vào và tiến hành Đăng nhập nội bộ.

### 3. Giao Diện Chọn Món (Customer Menu)
- **Lưới hiển thị món (Grid):** Hiển thị danh sách đồ uống được lấy trực tiếp từ Supabase Database thông qua API `/api/recipes`.
- **Tìm kiếm & Lọc:** Khách hàng có thể tìm món bằng chữ và lọc đồ uống theo **Kích cỡ (Size)** (S, M, L).
- Nút bấm và card giữ nguyên phong cách Brutal (viền đen dày, bóng đổ cứng).

---

## Bạn Cần Kiểm Tra Gì?
1. Mở link [Thực Tế Vercel](https://rom-ra-ca-phe.vercel.app) trên điện thoại và máy tính.
2. Kiểm tra thao tác tìm kiếm, lọc size tại Màn hình Menu đồ uống.
3. Nhập mật khẩu nội bộ thông qua biểu tượng khiên admin ở góc màn hình Welcome để vào Dashboard.

---

### Kết quả Kiểm tra Thực tế (Automated Live Testing)

Dưới đây là hình ảnh chụp trực tiếp từ trình duyệt Test tự động truy cập vào Vercel:

**Màn hình Chào mừng (Welcome Screen)**
![Welcome Screen](C:\Users\Giang Nguyen\.gemini\antigravity\brain\7a0e5581-8f63-4435-b4c2-050df967ba86\welcome_screen_blue_bg_1771872203256.png)

**Màn hình Thực đơn Customer (User Menu)**
![Customer Menu](C:\Users\Giang Nguyen\.gemini\antigravity\brain\7a0e5581-8f63-4435-b4c2-050df967ba86\user_menu_screen_1771871897065.png)

### 4. Quản Lý Thực Đơn (Menu Management)
Tính năng mới cho phép Admin quản lý hiển thị các món trên Menu khách hàng:
- Cập nhật Mô tả (Description) hấp dẫn cho món uống.
- Đánh dấu trạng thái **BEST SELLER** (Bán Chạy).
- Đánh dấu trạng thái **HẾT HÀNG** (Sold Out). Nếu bật hết hàng, món sẽ hiển thị mờ đi (Grayscale) và có tem HẾT HÀNG che lên để khách không chọn nhầm.

**Màn hình Public Menu hiển thị trạng thái HẾT HÀNG và Mô tả**
![Public Menu Feature Verification](C:\Users\Giang Nguyen\.gemini\antigravity\brain\7a0e5581-8f63-4435-b4c2-050df967ba86\public_menu_final_1771896648471.png)
