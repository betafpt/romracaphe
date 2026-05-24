# ROMRA CAFE & WORKSPACE - AI SYSTEM CONTEXT
*(DO NOT DELETE - Tệp này do hệ thống AI tự động sinh ra để ghi nhớ ngữ cảnh dự án khi chuyển nền tảng/máy tính)*
**Thời gian đồng bộ cuối cùng:** Ngày 24 tháng 5 năm 2026 (Cập nhật lúc 11:35)

## ⚠️ QUY TẮC LÀM VIỆC NGHIÊM NGẶT & TRIẾT LÝ SUPERPOWERS (MỚI NHẤT)
Hệ thống AI làm việc trên dự án này bắt buộc phải áp dụng triết lý phát triển phần mềm **Superpowers** (`obra/superpowers`) nhằm đảm bảo tính kỷ luật và chất lượng kỹ thuật cao nhất:

1. **Quy tắc tuyệt đối về Lập kế hoạch (Planning):** Trước khi chỉnh sửa bất kỳ tệp tin mã nguồn nào hoặc thực hiện thay đổi nào trên hệ thống, bắt buộc phải tạo bản kế hoạch triển khai (`implementation_plan.md`) gửi cho Người dùng duyệt. Chỉ khi nhận được sự xác nhận của Người dùng mới được tiến hành viết/sửa code.
2. **Quy trình Phát triển Superpowers:**
   * **Brainstorming (Động não):** Không bao giờ vội vã sửa code ngay khi nhận yêu cầu phức tạp. Phải đặt các câu hỏi Socratic để thảo luận và làm rõ mục tiêu thiết kế với Người dùng.
   * **Planning (Lập kế hoạch chi tiết):** Chia nhỏ dự án thành các nhiệm vụ cực nhỏ (2-5 phút), xác định rõ ràng đường dẫn các file cần chỉnh sửa/tạo mới và phương án kiểm thử cụ thể cho từng phần.
   * **TDD (Phát triển hướng kiểm thử):** Đối với các tính năng logic phức tạp, AI phải viết kiểm thử (test) bị lỗi trước (Red), sau đó mới viết mã nguồn để vượt qua kiểm thử đó (Green), và cuối cùng là tối ưu hóa mã nguồn (Refactor).
   * **Subagent-driven (Điều phối Agent phụ):** Chia nhỏ công việc độc lập cho các subagent thực hiện để duy trì sự tập trung cao nhất vào ngữ cảnh công việc và tránh bị loãng hoặc mất ngữ cảnh.
   * **Review & Verification (Đánh giá & Xác thực):** Tự động kiểm tra, chạy thử và xác thực kỹ lượng kết quả, viết báo cáo nghiệm thu (`walkthrough.md`) trước khi thông báo hoàn tất công việc.
3. **Quy tắc giao tiếp & Phát hành:**
   * Luôn luôn trả lời Người dùng bằng Tiếng Việt.
   * Luôn hỏi ý kiến Người dùng trước khi thực hiện tải mã nguồn (push code) lên GitHub.

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
- Tên dự án: Hệ thống quản lý và vận hành Romra Cafe & Workspace.
- Trạng thái hiện tại: Ổn định và Đã triển khai Production (`romra.cafe`).
- Nền tảng triển khai vòng đời cuối (Hosting): **Vercel** (Frontend + Backend Node.js liền khối).
- Cơ sở dữ liệu: **Supabase** (PostgreSQL) phục vụ Real-time + Quản lý ảnh trên Storage.

## 2. KIẾN TRÚC & CÔNG NGHỆ (TECH STACK)
- Frontend: Vanilla HTML/JS, Tailwind CSS, Javascript (Xử lý DOM trực tiếp, không dùng FrameWork như React/Vue).
- Backend: `server.js` Node.js + Express (Quản lý routing, auth, cổng PayOS, API in tem bằng Playwright).
- Database: Supabase PostgreSQL (`supabase_schema.sql` đang gánh toàn bộ dữ liệu, có cột `note` mới ở bảng `order_items` để lưu ghi chú chi tiết từng món).
- CSS Nổi bật: Phong cách "Brutalism" (viền đen dày `border-4 border-black`, thả bóng shadow đen `shadow-[4px_4px_0_0_#000]`, sử dụng phông chữ siêu đậm).

## 3. LỊCH SỬ CÁC TÍNH NĂNG ĐÃ TÍCH HỢP GẦN NHẤT
### A. Nâng cấp Tem in & Ghi chú riêng cho từng món (Mới nhất - 23/05/2026)
- **Ngày/Năm trên tem dán ly**: Thêm ngày và năm đầy đủ vào bên cạnh giờ in trên tem (định dạng `HH:MM DD/MM/YYYY`, ví dụ: `15:29 23/05/2026`). Tương ứng cập nhật trên khung canvas kéo thả thiết kế trực quan tại frontend (`settings.js`).
- **Ghi chú riêng cho từng món**:
  * Thay thế ô nhập ghi chú chung của đơn hàng bằng các ô nhập ghi chú riêng biệt ngay bên dưới mỗi món ăn trong giỏ hàng (`public/index.html`).
  * Lưu trữ ghi chú của từng món vào cột `note` của bảng `order_items` trong database Supabase.
  * Hiển thị dòng ghi chú riêng màu đỏ nổi bật ngay dưới tên món ăn trên màn hình **POS Live** để nhân viên pha chế dễ theo dõi.
  * Khi in hóa đơn và in tem dán ly, hệ thống tự động hiển thị ghi chú riêng biệt của từng ly tương ứng.
- **Cải tiến thuật toán in lẻ**: Khi in lẻ tem từng món, hệ thống tự động tính toán và giữ nguyên số thứ tự thực của ly trong đơn hàng gốc ban đầu (ví dụ: ly thứ 2 trong đơn 3 món khi in lẻ sẽ ra đúng số thứ tự `2/3` thay vì bị đổi thành `1/1`).
- **Sửa lỗi `chromium is not defined`**: Khắc phục lỗi thiếu import `chromium` từ `playwright` ở đầu file `server.js` phục vụ vẽ tem canvas ngầm.

### B. Tích hợp thanh toán PayOS
- Đổi từ SePay sang PayOS SDK v2 (thanh toán QR động App-to-app).
- **Tuy nhiên**, do cơ chế một số ứng dụng ngân hàng bị kén thiết bị nên chủ quán đã yêu cầu **tạm ẩn luồng tự động PayOS** trên màn hình giao dịch (thẻ `<option value="payos">` đang set `display: none` và `disabled`).
- Thay thế bởi bộ tính năng **VietQR Thủ công (Techcombank)** kèm nút **[TẢI MÃ QR]** tự động lưu blob nội dung hóa đơn xuống máy điện thoại khách hàng (được làm tại file `public/index.html`). 

### C. UI Cải tiến (Admin Dashboard)
- Chỉnh sửa lỗi vỡ Layout Header Admin: Các thuộc tính chống chèn và `flex-shrink`, `min-w` đã được gắn cho `searchbox` và các Navigation bên phải.
- **Logo hệ thống:** Đã chèn logo Trắng (`brightness-0 invert`, size `h-24 w-full`) nổi bật cực lớn ở thanh Sidebar trái cùng bg xanh bộ nhận diện (`bg-secondary`).
- Nút CTA Chat Messenger góc dưới bên phải giờ có thêm Tooltip **"Chat với quán"** chữ tĩnh có hiệu ứng đập nhịp và xoay góc nghiêng.

### D. Nâng cấp bộ não AI (Supabase Skills)
- Đã cài đặt qua CLI: `npx skills add supabase/agent-skills -y -g`.
- Từ giờ AI được kế thừa trọn bộ "Agent-skills Postgres Best Practices" để phục vụ các yêu cầu thao tác sâu về DB.

## 4. TIẾN TRÌNH TIẾP THEO KHI MỞ MÁY
*(Dành cho phiên hỗ trợ tự động ở máy tính khác)*
Chào bạn (người đồng nghiệp AI). Hãy review lại tài liệu này. 
Toàn bộ source code đã được tối ưu nhất với cấu hình Vercel, Supabase Schema. Nếu có yêu cầu mới của User, cứ mở file `public/index.html` hoặc `server.js` hoặc file JS bất kỳ ở `<thư_mục_gốc>/public/js` để xem qua nhé. Mọi thứ đã quy hoạch rất gọn. Hạn chế dùng Framework khác can thiệp vì User thích sự thuần tủy và nhẹ nhàng với Vanilla JS.

> *Note to User: Anh chỉ cần yêu cầu "Em đọc file AI_MEMORY.md ở thư mục gốc để biết mình đang làm gì nhé" khi anh qua máy tính mới hoặc mở app code ở điện thoại!*
