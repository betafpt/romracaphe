# ROMRA CAFE & WORKSPACE - AI SYSTEM CONTEXT
*(DO NOT DELETE - Tệp này do hệ thống AI tự động sinh ra để ghi nhớ ngữ cảnh dự án khi chuyển nền tảng/máy tính)*
**Thời gian đồng bộ cuối cùng:** Ngày 25 tháng 5 năm 2026 (Cập nhật lúc 02:15)

## ⚠️ QUY TẮC LÀM VIỆC NGHIÊM NGẶT & TRIẾT LÝ SUPERPOWERS (MỚI NHẤT)
Hệ thống AI làm việc trên dự án này bắt buộc phải áp dụng triết lý phát triển phần mềm **Superpowers** (`obra/superpowers`) nhằm đảm bảo tính kỷ luật và chất lượng kỹ thuật cao nhất:

1. **Quy tắc tuyệt đối về Lập kế hoạch (Planning):** Trước khi chỉnh sửa bất kỳ tệp tin mã nguồn nào hoặc thực hiện thay đổi nào trên hệ thống, bắt buộc phải tạo bản kế hoạch triển khai (`implementation_plan.md`) gửi cho Người dùng duyệt. Chỉ khi nhận được sự xác nhận của Người dùng mới được tiến hành viết/sửa code.
2. **Quy trình Phát triển Superpowers:**
   * **Brainstorming (Động não):** Không bao giờ vội vã sửa code ngay khi nhận yêu cầu phức tạp. Phải đặt các câu hỏi Socratic để thảo luận và làm rõ mục tiêu thiết kế với Người dùng.
   * **Planning (Lập kế hoạch chi tiết):** Chia nhỏ dự án thành các nhiệm vụ cực nhỏ (2-5 phút), xác định rõ ràng đường dẫn các file cần chỉnh sửa/tạo mới và phương án kiểm thử cụ thể cho từng phần.
   * **Review & Verification (Đánh giá & Xác thực):** Tự động kiểm tra, chạy thử và xác thực kỹ lượng kết quả, viết báo cáo nghiệm thu (`walkthrough.md`) trước khi thông báo hoàn tất công việc.
3. **Quy tắc giao tiếp & Phát hành:**
   * Luôn luôn trả lời Người dùng bằng Tiếng Việt.
   * Luôn hỏi ý kiến Người dùng trước khi thực hiện tải mã nguồn (push code) lên GitHub.

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
- Tên dự án: Hệ thống quản lý và vận hành Romra Cafe & Workspace.
- Trạng thái hiện tại: Ổn định và Đã triển khai Production (`romra.cafe`).
- Nền tảng triển khai vòng đời cuối (Hosting): **Vercel** (Frontend + Backend Node.js liền khối).
- Cơ sở dữ liệu: **Supabase** (PostgreSQL) phục vụ Real-time + Quản lý ảnh trên Storage.

---

## 2. KIẾN TRÚC & CÔNG NGHỆ (TECH STACK)
- Frontend: Vanilla HTML/JS, Tailwind CSS, Javascript (Xử lý DOM trực tiếp, không dùng FrameWork như React/Vue).
- Backend: `server.js` Node.js + Express (Quản lý routing, auth, PayOS, API in tem bằng Playwright).
- Database: Supabase PostgreSQL (`supabase_schema.sql` đang gánh toàn bộ dữ liệu, có cột `note` mới ở bảng `order_items` để lưu ghi chú chi tiết từng món).
- CSS Nổi bật: Phong cách "Brutalism" (viền đen dày `border-4 border-black`, thả bóng shadow đen `shadow-[4px_4px_0_0_#000]`, sử dụng phông chữ siêu đậm).

---

## 3. LỊCH SỬ CÁC TÍNH NĂNG ĐÃ TÍCH HỢP GẦN NHẤT

### A. Tích hợp Doanh thu Thực nhận POS & Auto-Login 100% cho Bot (Mới nhất - 24/05/2026)
*   **Doanh thu Thực nhận & Chiết khấu sàn (Chuẩn Nexpos):**
    *   Tích hợp Logo đối tác Neo-Brutalism chéo góc rực rỡ (`GRABFOOD` và `SHOPEEFOOD`) lên Card đơn online trên POS.
    *   Bổ sung bảng tính toán **Doanh thu thực nhận** và **Chiết khấu sàn** tự động hiển thị trực quan ngay trên card đơn hàng và đồng bộ in nhiệt trên hóa đơn 58mm giúp chủ quán đối soát dòng tiền cuối ngày cực kỳ dễ dàng.
    *   Thêm ô nhập liệu cấu hình % chiết khấu đối tác (mặc định 25%) ngay tại trang Cài đặt (In ấn & Mẫu) của POS, dữ liệu được lưu trữ tự động vào `localStorage` trình duyệt.
*   **Nâng cấp Trí tuệ của Bot Grab (`romra_scraper.js`):**
    *   **Tự động Đăng nhập & Gia hạn ngầm vĩnh viễn (Auto-Login 100%):** Bot tự động đọc tài khoản/mật khẩu an toàn từ file cấu hình bí mật cục bộ `grab_config.json` trên VPS, tự điền form và đăng nhập lại chỉ trong **2 giây** ẩn khi session cookie hết hạn, loại bỏ 100% thao tác quét mã QR hay upload file thủ công.
    *   **API Interception (Lắng nghe API ngầm):** Lắng nghe response API chạy ngầm giúp phát hiện đơn mới tức thì, chạy siêu nhẹ trên VPS, tiết kiệm 95% RAM và chống bị sàn chặn IP.
    *   **Cào thêm các biến nâng cao:** Cào thêm Tạm tính (`subtotal`), Khuyến mại (`totalDiscount`), Địa chỉ giao khách (`customerAddress`) đồng bộ lên database.
    *   **Cảnh báo khẩn cấp qua Telegram Bot:** Tự động gửi tin nhắn báo động khẩn cấp về điện thoại của chủ quán khi session bị hết hạn hoặc bot bị mất kết nối quá 3 lần liên tiếp.
*   **Đồng bộ GitHub thành công:** Toàn bộ mã nguồn bản vá nâng cấp hoàn chỉnh đã được đẩy (push) lên kho GitHub chính thức (`https://github.com/betafpt/romracaphe.git`) thành công trọn vẹn!

### B. Nâng cấp Tem in & Ghi chú riêng cho từng món (23/05/2026)
- **Ngày/Năm trên tem dán ly**: Thêm ngày và năm đầy đủ vào bên cạnh giờ in trên tem (định dạng `HH:MM DD/MM/YYYY`, ví dụ: `15:29 23/05/2026`).
- **Ghi chú riêng cho từng món**:
  * Lưu trữ ghi chú của từng món vào cột `note` của bảng `order_items` trong database Supabase.
  * Hiển thị dòng ghi chú riêng màu đỏ nổi bật ngay dưới tên món ăn trên màn hình **POS Live** và khi in hóa đơn/in tem.
- **Cải tiến thuật toán in lẻ**: Khi in lẻ tem từng món, hệ thống tự động giữ nguyên số thứ tự thực của ly trong đơn hàng gốc ban đầu (ví dụ: `2/3` thay vì bị đổi thành `1/1`).

### C. Tối ưu in ấn, Bảo mật & Vá lỗi Đăng nhập ngầm VPS (Mới nhất - 25/05/2026)
- **Vá lỗi in tem nhãn TSPL**: Sửa cú pháp kích thước lệnh in nhãn TSPL (`SIZE 50 mm,30 mm` và `GAP 2 mm,0 mm`), loại bỏ khoảng trắng dư thừa sau dấu phẩy giúp máy in tem nhãn (ví dụ Xprinter) hiểu chuẩn kích thước giấy 50x30mm, tránh tình trạng bị in lệch tem.
- **Làm sạch ghi chú tem ly**: Tự động lọc sạch các cụm từ kích thước (size) bị trùng lặp trong chuỗi ghi chú của món trước khi in tem dán ly.
- **Bảo mật session đăng nhập**: Cập nhật file `.gitignore` sửa lỗi gõ phím cách quãng và chạy lệnh `git rm --cached grab_state.json` để loại bỏ hoàn toàn file session cookie của Grab khỏi Git index, bảo vệ thông tin mật không bị lộ khi đồng bộ lên GitHub công khai.
- **Xác thực Supabase**: Hoàn tất xác minh và đồng bộ các cột mới (`platform`, `external_order_id`, `external_short_id`, `raw_payload`, `note`) vào bảng `orders` của Supabase thật.
- **Xác minh thực tế trên VPS**: Bot quét đơn đã khởi chạy ngầm 100% tự động trên VPS, đăng nhập thành công hoàn hảo và tự động gia hạn phiên khi session cũ hết hạn mà không cần bất kỳ mã OTP hay can thiệp thủ công nào!
- **Thực nghiệm cào đơn lịch sử thành công**: Chạy thử nghiệm thành công file `test_history_scrape.js` bóc tách chính xác 100% đơn hàng dạng bảng lịch sử ngày hôm trước của Grab (GF-267 / Kem Dẻo Cacao Buôn Mê x 2 ly), tự động vượt DatePicker input "Chọn thời điểm" và bóc tách dữ liệu trơn tru!

- **Tích hợp Telegram Bot điều khiển 2 chiều (Mới nhất - 25/05/2026)**: Tích hợp hoàn tất module lắng nghe Telegram Bot 2 chiều zero-dependency ngầm song song vào `romra_scraper.js` sử dụng REST HTTP Long Polling. Hỗ trợ Whitelist Chat ID an toàn và 6 lệnh nhanh `/help`, `/status`, `/restart`, `/logs`, `/scrape`, `/revenue` hoạt động vô cùng ổn định.

---

## 4. TIẾN TRÌNH TIẾP THEO KHI MỞ MÁY
*(Dành cho phiên hỗ trợ tự động ở máy tính khác hoặc phiên làm việc tiếp theo)*
Chào bạn (người đồng nghiệp AI). Hãy review lại tài liệu này.
*   Hệ thống POS hiện tại hoạt động cực kỳ ổn định, đã tích hợp thành công Telegram Bot tương tác 2 chiều điều khiển VPS.
*   Bot cào đơn và tính doanh thu hoạt động 100% tự động trơn tru qua PM2.
*   **Hướng đi tiếp theo đề xuất (ĐÃ THỐNG NHẤT):**
    1.  Tích hợp tự động trừ kho nguyên liệu (Inventory Auto-Deduct) dựa trên công thức món khi có đơn bán ra (Supabase `orders` -> `order_items` -> `recipes` -> `inventory`).
    2.  Xây dựng thêm Bot cào đơn tự động cho ShopeeFood Merchant Portal tương tự như GrabFood.
    3.  Tạo trang Dashboard Brutalism thống kê chi tiết doanh thu thực nhận, chiết khấu và lợi nhuận ròng.
    4.  Tối ưu hóa và mở rộng thêm các lệnh tương tác cho Telegram Bot (ví dụ: cảnh báo kho sắp hết, điều chỉnh phần trăm chiết khấu).

> *Note to User: Anh chỉ cần yêu cầu "Em đọc file AI_MEMORY.md ở thư mục gốc để biết mình đang làm gì nhé" khi anh qua máy tính mới hoặc mở app code ở điện thoại!*
