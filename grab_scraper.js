const { chromium } = require('playwright');
const fs = require('fs');

// Đường dẫn file lưu state (cookie, localStorage)
const STORAGE_STATE = 'grab_state.json';

async function runGrabScraper() {
    console.log('Khởi động Bot Quét Đơn Grab...');

    // Mở Chrome ở chế độ hiển thị (không phải headless) để bạn có thể đăng nhập tay lần đầu
    const browser = await chromium.launch({
        headless: false, // Để bạn nhìn thấy trình duyệt và nhập số điện thoại / OTP
        slowMo: 100 // Làm chậm các thao tác để giống người thật hơn
    });

    const context = await browser.newContext({
        // Nếu đã từng đăng nhập trước đó và lưu trạng thái, load lại trạng thái đó
        storageState: fs.existsSync(STORAGE_STATE) ? STORAGE_STATE : undefined,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Mở trang Đơn Hàng của Grab Merchant
    console.log('Đang truy cập Grab Merchant...');
    await page.goto('https://merchant.grab.com/portal');

    // Chờ 1 chút để xem có yêu cầu đăng nhập không
    await page.waitForTimeout(5000);

    // Kiểm tra xem hiện tại đang ở trang Login hay trang Dashboard
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('auth')) {
        console.log('⚠️ BẠN CẦN ĐĂNG NHẬP THỦ CÔNG!');
        console.log('Vui lòng nhập Tên Đăng Nhập, Mật Khẩu và OTP trên cửa sổ Chrome vừa mở.');
        console.log('Script sẽ chờ tối đa 3 phút để bạn thao tác xong...');

        // Chờ đến khi đổi sang URL của trang chính (ví dụ: dashboard hoặc orders)
        try {
            await page.waitForTimeout(180_000); // Đợi 3 phút để bạn thao tác thủ công
        } catch (e) {
            console.log('Hết thời gian chờ đăng nhập');
        }
    }

    // Lưu lại bộ Cookie và LocalStorage để lần sau chạy không cần đăng nhập lại
    console.log('Đang lưu thông tin đăng nhập (Session)...');
    await context.storageState({ path: STORAGE_STATE });
    console.log('Đã lưu phiên đăng nhập thành công vào file', STORAGE_STATE);

    console.log('==============================================');
    console.log('BẮT ĐẦU VÒNG LẶP QUÉT ĐƠN HÀNG (Mỗi 15 giây)');
    console.log('==============================================');

    // Chuyển sang tab Orders (nếu chưa chuyển sang)
    try {
        await page.goto('https://merchant.grab.com/order');
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('Lỗi khi truy cập trang order', e);
    }

    // === VÒNG LẶP QUÉT ĐƠN ===
    setInterval(async () => {
        try {
            console.log(`[${new Date().toLocaleTimeString()}] Đang quét trang Đang Chuẩn Bị...`);

            // Đảm bảo trang đã tải xong
            await page.reload({ waitUntil: 'networkidle' });

            // Lấy danh sách tất cả các thẻ đơn hàng đang hiển thị (Cần cập nhật selector thực tế của Grab)
            // Giả sử thẻ đơn hàng có class là '.order-card' hoặc tìm các thẻ chứa chữ "Sẵn sàng trong"
            const orderCards = page.locator('text="Sẵn sàng trong"').locator('..').locator('..');
            const count = await orderCards.count();

            if (count === 0) {
                console.log('Không có đơn hàng mới nào đang chuẩn bị.');
                return;
            }

            console.log(`Phát hiện ${count} đơn hàng đang chuẩn bị!`);

            for (let i = 0; i < count; i++) {
                const card = orderCards.nth(i);

                // --- Trích xuất Dữ liệu Cơ bản ---
                // Giả định: Mã ngắn (GF-825) nằm trong thẻ <h3> hoặc có font chữ to
                const shortId = await card.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').first().innerText().catch(() => 'UNKNOWN');

                // Click vào thẻ để mở chi tiết đơn hàng ở panel bên phải
                await card.click();
                await page.waitForTimeout(2000); // Đợi panel chi tiết tải

                // --- Trích xuất Chi tiết Đơn hàng (từ Panel bên phải) ---
                // Giả sử panel bên phải có class '.order-details-panel'
                const detailsPanel = page.locator('body'); // Tạm thời tìm trên toàn trang nếu không rõ class

                // Tên khách hàng (VD: "4 món cho Lily" -> lấy "Lily")
                const headerText = await detailsPanel.locator('text=/món cho /').first().innerText().catch(() => '');
                const customerName = headerText.split(' cho ')[1] || 'Khách Grab';

                // Mã đặt hàng dài (Booking ID)
                const bookingIdStr = await detailsPanel.locator('text="Mã đặt hàng"').locator('..').innerText().catch(() => '');
                const bookingId = bookingIdStr.replace('Mã đặt hàng', '').trim() || shortId;

                // Thời gian làm xong
                const prepTime = await detailsPanel.locator('text="Làm xong đơn trong"').locator('..').innerText().catch(() => '');

                // --- Trích xuất Danh sách Món ---
                // Cần cẩn thận ở đây, cấu trúc bảng HTML sẽ chứa các dòng Món ăn (VD: 1 x Cacao Muối)
                const itemsList = [];
                // Chọn tất cả các block chứa dấu ' x ' (số lượng x tên món)
                const itemBlocks = detailsPanel.locator('text=/^[0-9]+ x /');
                const itemCount = await itemBlocks.count();

                for (let j = 0; j < itemCount; j++) {
                    const itemText = await itemBlocks.nth(j).innerText();
                    // Parse "1 x Cacao Muối 37.000"
                    const match = itemText.match(/^(\d+)\s*x\s*(.*?)\s*([\d\.]+)$/);
                    let qty = 1;
                    let name = itemText;
                    let price = 0;

                    if (match) {
                        qty = parseInt(match[1]);
                        name = match[2].trim();
                        price = parseInt(match[3].replace(/\./g, ''));
                    }

                    // Tìm Options và Notes ngay dưới món đó (Giả định nằm trong elements anh em/con)
                    // Vì không có HTML thật, nên ta mô phỏng việc bóc tách chuỗi
                    const itemParent = itemBlocks.nth(j).locator('..').locator('..');
                    const allTextUnderItem = await itemParent.innerText();

                    let noteStr = '';
                    const noteMatch = allTextUnderItem.match(/'(.*?)'/);
                    if (noteMatch) noteStr = noteMatch[1].trim(); // Lấy chữ trong ngoặc nháy đơn (VD: ' ít ngọt ')

                    let optionsStr = '';
                    // Rút trích Option như "Chọn Size\nM\nChọn Đá..."
                    if (allTextUnderItem.includes('Chọn Size')) optionsStr += 'Size: ' + allTextUnderItem.split('Chọn Size')[1].split('\n')[1] + ' ';
                    if (allTextUnderItem.includes('Chọn Đá')) optionsStr += 'Đá: ' + allTextUnderItem.split('Chọn Đá')[1].split('\n')[1] + ' ';

                    itemsList.push({
                        name: name,
                        quantity: qty,
                        price: price,
                        note: `${optionsStr.trim()} - ${noteStr}`.replace(/^ - | - $/g, ''), // Gộp option và note vào 1 chuỗi để dễ in trên Label
                        original_options: optionsStr,
                        original_note: noteStr
                    });
                }

                // Tổng tiền
                const totalText = await detailsPanel.locator('text="Tổng cộng"').locator('..').innerText().catch(() => '0đ');
                const totalAmount = parseInt(totalText.replace(/\D/g, '')) || 0;

                const orderData = {
                    platform: 'grab',
                    short_id: shortId,
                    booking_id: bookingId,
                    customer_name: customerName,
                    prep_time: prepTime,
                    total_amount: totalAmount,
                    items: itemsList
                };

                console.log('--- ĐÃ TÌM THẤY ĐƠN HÀNG MỚI ---');
                console.log(JSON.stringify(orderData, null, 2));

                // TODO: Gửi dữ liệu này về Backend API (POST /api/orders)
                const fetch = require('node-fetch');
                try {
                    const response = await fetch('http://localhost:3000/api/orders', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            platform: 'grab',
                            total_amount: orderData.total_amount,
                            status: 'pending',
                            items: orderData.items.map(i => ({
                                // Đây là chỗ cần cẩn thận: Map Item của Grab với Database cục bộ.
                                // Tạm thời dùng Item Name giả nếu không khớp ID
                                recipe_id: null,
                                name: i.name, // Thêm property tự do hoặc phải tạo Recipe "Món Tùy Chọn" trong DB
                                quantity: i.quantity,
                                price: i.price,
                                note: i.note
                            }))
                        })
                    });

                    if (response.ok) {
                        console.log(`Đã đồng bộ đơn ${shortId} lên hệ thống POS thành công!`);
                        // TODO: Phải click nút "Xác Nhận" trên Grab để đơn không bị quét lại
                    }
                } catch (apiErr) {
                    console.error('Lỗi khi đẩy lên Localhost:', apiErr.message);
                }
            }

        } catch (err) {
            console.error('Lỗi trong khi quét:', err.message);
        }
    }, 15000); // 15 giây quét 1 lần
}

runGrabScraper().catch(console.error);
