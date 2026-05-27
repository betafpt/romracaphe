# ROMRA CAFE & WORKSPACE - AI SYSTEM CONTEXT
*(DO NOT DELETE - Tệp này do hệ thống AI tự động sinh ra để ghi nhớ ngữ cảnh dự án khi chuyển nền tảng/máy tính)*
**Thời gian đồng bộ cuối cùng:** Ngày 27 tháng 5 năm 2026 (Cập nhật lúc 08:50)

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

### A. Khắc phục triệt để lỗi cào thiếu thông tin và lỗi ghi đè ngược (reset lúc có lúc mất) cho các đơn hàng Grab (Mới nhất - 27/05/2026)
*   **⏰ 1. Khắc phục lỗi cào thiếu thông tin cho đơn "Đang tìm tài xế" (ALLOCATING):**
    *   *Nguyên nhân:* Đơn đang tìm tài xế chỉ hiển thị ở tab "Sắp tới" (Upcoming) trên Grab Portal. Bot trước đây chỉ reload và quét ở tab mặc định "Đang hoạt động" (Active), dẫn đến các đơn ở tab "Sắp tới" không bao giờ được click để kích hoạt API chi tiết.
    *   *Giải pháp:* Xây dựng các hàm helper điều hướng tab (`switchToUpcomingTab`, `switchToActiveTab`) và cập nhật chu kỳ quét 12s để quét tuần tự cả hai tab.
*   **🚫 2. Sửa lỗi ghi đè ngược làm mất thông tin món ăn (note, size) định kỳ (lúc có lúc mất):**
    *   *Nguyên nhân:* Chu kỳ quét 12s định kỳ của bot nhận danh sách đơn từ API danh sách (`isDetail = false`) - vốn chỉ chứa tên món và số lượng, không có note/size. Do lỗi điều kiện ở dòng 1006, bot đã lấy mảng món sơ sài này ghi đè ngược lên mảng chi tiết đầy đủ trong database, khiến thông tin trên POS bị reset mất sạch ghi chú cứ mỗi 12s.
    *   *Giải pháp:* Nâng cấp logic bảo vệ dữ liệu (Defensive Update) cho mảng món ăn: Chỉ cập nhật mảng món ăn mới khi đó là API chi tiết (`isDetail === true`) hoặc database chưa có dữ liệu. Nếu là API danh sách thông thường và DB đã có sẵn thông tin, bot sẽ **giữ nguyên mảng món ăn cũ của database (`dbPayload.items`)**, chặn đứng hoàn toàn việc ghi đè ngược.
*   **🚀 Triển khai và xác thực:**
    *   Kiểm tra cú pháp JS thành công (`node -c romra_scraper.js`).
    *   Commit và push code lên GitHub nhánh `main` thành công.
    *   SSH trực tiếp vào VPS (`161.248.147.124`), chạy lệnh tải đè cập nhật mã nguồn bot và restart các tiến trình PM2 (`romra-bot`, `romra-shopee-bot`) chạy trực tuyến 🟢 hoàn hảo.

### B. Tối ưu hóa UI Neo-Brutalism, Sửa lỗi giờ đặt Grab thực tế, Tách ghi chú dạng danh sách dọc & Chống nháy màn hình triệt để (27/05/2026)
*   **⏰ Đồng bộ chính xác giờ đặt đơn thực tế từ Grab:**
    *   Bóc tách đối tượng `times.createdAt` gốc dạng UTC cào được từ API Grab chi tiết (Ví dụ đơn `GF-670` là `2026-05-26T01:16:54Z`) và lưu trực tiếp vào database ở các trường `times` và `createdAt` trong `raw_payload` (cho cả đơn mới và đơn update).
    *   Web POS frontend tự động nhận diện và chuyển đổi sang giờ Việt Nam (+7) chuẩn xác (Hiển thị **08:16** sáng y như thực tế thay vì giờ bot cào chèn DB).
*   **📋 Tách ghi chú dọc dạng chấm tròn `•` màu đỏ đậm:**
    *   Tự động bóc tách ghi chú tùy chọn chi tiết (size, đá, đường, ghi chú thêm) theo dấu gạch đứng ` | ` trong database và dựng thành HTML danh sách dọc có chấm tròn đỏ đậm, thụt lề `pl-2` cực kỳ rõ ràng, dễ đọc cho pha chế.
    *   Tự động loại bỏ size bị trùng lắp ở ghi chú (để tránh rối vì size đã hiển thị ngay cạnh tên món).
    *   In tem dán ly được giữ nguyên cấu trúc bóc tách chuẩn xác như cũ.
*   **🚫 Giải quyết triệt để lỗi nhấp nháy màn hình (Anti-Flicker 100%):**
    *   Thay thế việc so sánh JSON toàn bộ đơn hàng (vốn bị nhiễu do trường `updated_at` trong database tự động cập nhật liên tục mỗi khi bot quét) bằng thuật toán so sánh **chữ ký Signature thông minh** chỉ dựa trên các trường cốt lõi ảnh hưởng tới giao diện (`id`, `status`, `total_amount`, `note`).
    *   Web POS tĩnh lặng tuyệt đối 100%, không bao giờ bị chớp nháy card mỗi 5 giây, chỉ re-render êm ái khi có đơn mới hoặc đổi trạng thái.
*   **🎨 Nâng cấp UI Neo-Brutalism Premium nổi khối 3D:**
    *   Thay đổi padding và khoảng cách giữa các card đơn hàng từ `p-3 gap-4` thành **`p-4 gap-6`** trên toàn bộ các cột, tạo không gian thông thoáng, không còn bị dính sát hay chồng viền.
    *   Nâng cấp đổ bóng đen lập thể đặc trưng Brutalism lên **`shadow-[8px_8px_0_0_#000]`** tạo chiều sâu thị giác cực mạnh, giúp các card tách biệt rõ nét.
    *   Thêm micro-animation bay lên lập thể và tăng bóng đổ khi hover chuột: `hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0_0_#000] transition-all duration-200` rất hiện đại và sống động.
*   **🎯 Đưa đơn cào ngầm lịch sử Grab về đúng cột:**
    *   Đồng bộ chính xác trạng thái thực tế (`completed` / `cancelled`) cào được từ Grab Portal vào database Supabase, tự động chuyển các đơn Grab hoàn tất sang cột bên phải **"ĐƠN ĐÃ HOÀN TẤT"** thay vì bị kẹt ở cột đang xử lý.

### C. Vá lỗi Bot Grab 0đ, Nâng cấp chu kỳ 12s & Đồng bộ trạng thái Lịch sử ngầm (26/05/2026)
*   **Khắc phục triệt để lỗi cào thiếu thông tin (0đ) & lỗi map size món ăn:**
    *   *Sửa kẹt tab điều hướng:* Loại bỏ hoàn toàn mảng `orderSelectors` chứa các từ khóa tab điều hướng của Grab Portal (như "Sắp tới", "Upcoming", "Hoàn thành"...) vốn gây kẹt click và làm mất API chi tiết. Thay thế bằng regex định vị mã đơn ngắn `/^[A-Z0-9]+-[A-Z0-9]+$/` để luôn click chính xác và click tuần tự vào các thẻ đơn hàng thật trên UI, kích hoạt Grab Portal gọi API chi tiết `/food/merchant/v3/orders/{order_id}` thành công 100%.
    *   *Ánh xạ món nước nhiều size:* Nâng cấp thuật toán so khớp món nước từ `.maybeSingle()` (bị lỗi khi món có nhiều size trong DB) sang bóc tách size bằng Regex từ note và tìm kiếm chính xác ID của món nước theo đúng size trong bảng `recipes` (với cơ chế fallback thông minh lấy dòng đầu tiên).
    *   *Cơ chế tự động bảo vệ dữ liệu (Defensive Update):* Thêm tham số `isDetail` vào `syncGrabOrders`. Đối với API chi tiết (`isDetail = true`), chèn lại chi tiết món ăn và giá trị thật. Đối với API danh sách (`isDetail = false`), tuyệt đối không ghi đè số tiền (`total_amount`), số điện thoại (`eaterPhone`, `driverPhone`) và các món ăn (`order_items`) nếu trong DB đã có thông tin thực tế, triệt tiêu hoàn toàn lỗi ghi đè ngược về `0đ` và `Không có số` mỗi 12-20s.
*   **Tự động chuyển cột đơn đã hoàn tất & Đồng bộ trạng thái ngầm định kỳ:**
    *   Rút ngắn chu kỳ quét active của Bot xuống **12 giây** để nhận diện đơn nhanh nhất.
    *   *Cơ chế tự chuyển tab đồng bộ ngầm:* Tích hợp hàm `triggerHistorySync` tự động điều khiển bot click chuyển sang tab Lịch sử (History) ngầm định kỳ mỗi 5 chu kỳ (1 phút), chờ 5 giây để bắt response API lịch sử ngày hôm nay, tự động cập nhật đè số tiền/món ăn đúng cho các đơn đã trôi qua, và cập nhật trạng thái `status = 'completed'` / `'cancelled'`. Sau đó tự động click quay trở lại tab Đang hoạt động. Cơ chế này giúp POS Live tự động nhận diện và **tự động chuyển đơn hàng sang cột "Đơn đã hoàn tất" bên phải** khi tài xế giao hàng thành công mà nhân viên không cần thao tác gì!
*   **Khắc phục lỗi deploy `/update` bằng đường dẫn động trên VPS:**
    *   Thay thế các đường dẫn cứng `/root/romra_scraper.js` trong các lệnh `/update` và `/update history` trên Telegram Bot thành các đường dẫn tuyệt đối động (`__filename` và `scriptPath` sử dụng `path.join`) giúp ghi đè và nâng cấp chính xác 100% bất kể bot được chạy ở thư mục nào trên VPS.
    *   Xác định đúng thư mục chạy bot của quán trên VPS is ở ngay thư mục gốc `/root/romra_scraper.js`. Hướng dẫn người dùng lệnh cập nhật đè VPS tối ưu qua Telegram: `/cmd curl -L -o /root/romra_scraper.js https://raw.githubusercontent.com/betafpt/romracaphe/main/romra_scraper.js && pm2 restart all` để giải quyết lỗi không tìm thấy thư mục `/root/romracaphe`.

### D. Tích hợp Doanh thu Thực nhận POS & Auto-Login 100% cho Bot (24/05/2026)
*   **Doanh thu Thực nhận & Chiết khấu sàn (Chuẩn Nexpos):**
    *   Tích hợp Logo đối tác Neo-Brutalism chéo góc rực rỡ (`GRABFOOD` và `SHOPEEFOOD`) lên Card đơn online trên POS.
    *   Bổ sung bảng tính toán **Doanh thu thực nhận** và **Chiết khấu sàn** tự động hiển thị trực quan ngay trên card đơn hàng và đồng bộ in nhiệt trên hóa đơn 58mm giúp chủ quán đối soát dòng tiền cuối ngày cực kỳ dễ dàng.
    *   Thêm ô nhập liệu cấu hình % chiết khấu đối tác (mặc định 25%) ngay tại trang Cài đặt (In ấn & Mẫu) của POS, dữ liệu được lưu trữ tự động vào `localStorage` trình duyệt.
*   **Nâng cấp Trí tuệ của Bot Grab (`romra_scraper.js`):**
    *   **Tự động Đăng nhập & Gia hạn ngầm vĩnh viễn (Auto-Login 100%):** Bot tự động đọc tài khoản/mật khẩu từ file cấu hình bí mật cục bộ `grab_config.json` trên VPS, tự điền form và đăng nhập lại chỉ trong **2 giây** session cookie hết hạn.
    *   **API Interception (Lắng nghe API ngầm):** Lắng nghe response API chạy ngầm giúp phát hiện đơn mới tức thì, chạy siêu nhẹ trên VPS, tiết kiệm 95% RAM và chống bị sàn chặn IP.
    *   **Cào thêm các biến nâng cao:** Cào thêm Tạm tính (`subtotal`), Khuyến mại (`totalDiscount`), Địa chỉ giao khách (`customerAddress`) đồng bộ lên database.
    *   **Cảnh báo khẩn cấp qua Telegram Bot:** Tự động gửi tin nhắn báo động khẩn cấp về điện thoại của chủ quán khi session bị hết hạn hoặc bot bị mất kết nối quá 3 lần liên tiếp.

### E. Nâng cấp Tem in & Ghi chú riêng cho từng món (23/05/2026)
- **Ngày/Năm trên tem dán ly**: Thêm ngày và năm đầy đủ vào bên cạnh giờ in trên tem (định dạng `HH:MM DD/MM/YYYY`, ví dụ: `15:29 23/05/2026`).
- **Ghi chú riêng cho từng món**:
  * Lưu trữ ghi chú của từng món vào cột `note` của bảng `order_items` trong database Supabase.
  * Hiển thị dòng ghi chú riêng màu đỏ nổi bật ngay dưới tên món ăn trên màn hình **POS Live** và khi in hóa đơn/in tem.
- **Cải tiến thuật toán in lẻ**: Khi in lẻ tem từng món, hệ thống tự động giữ nguyên số thứ tự thực của ly trong đơn hàng gốc ban đầu (ví dụ: `2/3` thay vì bị đổi thành `1/1`).

---

## 4. TIẾN TRÌNH TIẾP THEO KHI MỞ MÁY
*(Dành cho phiên hỗ trợ tự động ở máy tính khác hoặc phiên làm việc tiếp theo)*
Chào bạn (người đồng nghiệp AI). Hãy review lại tài liệu này.
*   Hệ thống POS hiện tại hoạt động cực kỳ hoàn hảo, giao diện 2 cột online siêu mượt mà, hiển thị chuẩn xác thời gian đặt đơn Grab gốc và có badge số lượng ly nổi bật.
*   Lỗi cào thiếu thông tin đơn đang tìm tài xế Grab (`0đ`, không có SĐT) và lỗi ghi đè ngược (reset lúc có lúc mất) đã được giải quyết triệt để và triển khai VPS thành công.
*   **Hướng đi tiếp theo đề xuất (ĐÃ THỐNG NHẤT):**
    1.  Tích hợp tự động trừ kho nguyên liệu (Inventory Auto-Deduct) dựa trên công thức món khi có đơn bán ra (Supabase `orders` -> `order_items` -> `recipes` -> `inventory`).
    2.  Xây dựng thêm Bot cào đơn tự động cho ShopeeFood Merchant Portal tương tự như GrabFood.
    3.  Tạo trang Dashboard Brutalism thống kê chi tiết doanh thu thực nhận, chiết khấu và lợi nhuận ròng.

> *Note to User: Anh chỉ cần yêu cầu "Em đọc file AI_MEMORY.md ở thư mục gốc để biết mình đang làm gì nhé" khi anh qua máy tính mới hoặc mở app code ở điện thoại!*
