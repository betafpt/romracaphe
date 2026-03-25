# ROMRA CAFE & WORKSPACE - AI SYSTEM CONTEXT
*(DO NOT DELETE - Tệp này do hệ thống AI tự động sinh ra để ghi nhớ ngữ cảnh dự án khi chuyển nền tảng/máy tính)*
**Thời gian đồng bộ cuối cùng:** Ngày 26 tháng 3 năm 2026

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
- Tên dự án: Hệ thống quản lý và vận hành Romra Cafe & Workspace.
- Trạng thái hiện tại: Ổn định và Đã triển khai Production (`romra.cafe`).
- Nền tảng triển khai vòng đời cuối (Hosting): **Vercel** (Frontend + Backend Node.js liền khối).
- Cơ sở dữ liệu: **Supabase** (PostgreSQL) phục vụ Real-time + Quản lý ảnh trên Storage.

## 2. KIẾN TRÚC & CÔNG NGHỆ (TECH STACK)
- Frontend: Vanilla HTML/JS, Tailwind CSS, Javascript (Xử lý DOM trực tiếp, không dùng FrameWork như React/Vue).
- Backend: `server.js` Node.js + Express (Quản lý routing, auth, cổng PayOS).
- Database: Supabase PostgreSQL (`supabase_schema.sql` đang gánh toàn bộ dữ liệu, có hỗ trợ PGCrypto mã hóa UUID).
- CSS Nổi bật: Phong cách "Brutalism" (viền đen dày `border-4 border-black`, thả bóng shadow đen `shadow-[4px_4px_0_0_#000]`, sử dụng phông chữ siêu đậm).

## 3. LỊCH SỬ CÁC TÍNH NĂNG ĐÃ TÍCH HỢP GẦN NHẤT
### A. Tích hợp thanh toán PayOS (Mới nhất)
- Đổi từ SePay sang PayOS SDK v2 (thanh toán QR động App-to-app).
- **Tuy nhiên**, do cơ chế một số ứng dụng ngân hàng bị kén thiết bị (quên lệnh sau khi mở m.me hoặc vân tay) nên chủ quán đã yêu cầu **tạm ẩn luồng tự động PayOS** trên màn hình giao dịch (thẻ `<option value="payos">` đang set `display: none` và `disabled`).
- Thay thế bởi bộ tính năng **VietQR Thủ công (Techcombank)** kèm nút **[TẢI MÃ QR]** tự động lưu blob nội dung hóa đơn xuống máy điện thoại khách hàng (được làm tại file `public/index.html`). 

### B. UI Cải tiến (Admin Dashboard)
- Chỉnh sửa lỗi vỡ Layout Header Admin: Các thuộc tính chống chèn và `flex-shrink`, `min-w` đã được gắn cho `searchbox` và các Navigation bên phải.
- **Logo hệ thống:** Đã chèn logo Trắng (`brightness-0 invert`, size `h-24 w-full`) nổi bật cực lớn ở thanh Sidebar trái cùng bg xanh bộ nhận diện (`bg-secondary`).
- Nút CTA Chat Messenger góc dưới bên phải giờ có thêm Tooltip **"Chat với quán"** chữ tĩnh có hiệu ứng đập nhịp và xoay góc nghiêng.

### C. Nâng cấp bộ não AI (Supabase Skills)
- Đã cài đặt qua CLI: `npx skills add supabase/agent-skills -y -g`.
- Từ giờ AI được kế thừa trọn bộ "Agent-skills Postgres Best Practices" để phục vụ các yêu cầu thao tác sâu về DB.

## 4. TIẾN TRÌNH TIẾP THEO KHI MỞ MÁY
*(Dành cho phiên hỗ trợ tự động ở máy tính khác)*
Chào bạn (người đồng nghiệp AI). Hãy review lại tài liệu này. 
Toàn bộ source code đã được tối ưu nhất với cấu hình Vercel, Supabase Schema. Nếu có yêu cầu mới của User, cứ mở file `public/index.html` hoặc `server.js` hoặc file JS bất kỳ ở `<thư_mục_gốc>/public/js` để xem qua nhé. Mọi thứ đã quy hoạch rất gọn. Hạn chế dùng Framework khác can thiệp vì User thích sự thuần tủy và nhẹ nhàng với Vanilla JS.

> *Note to User: Anh chỉ cần yêu cầu "Em đọc file AI_MEMORY.md ở thư mục gốc để biết mình đang làm gì nhé" khi anh qua máy tính mới hoặc mở app code ở điện thoại!*
