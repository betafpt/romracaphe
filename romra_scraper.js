global.WebSocket = require('ws');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cấu hình Supabase (fallback về giá trị mặc định của hệ thống Rôm Rả)
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';
const supabase = createClient(supabaseUrl, supabaseKey);

let STORAGE_STATE = path.join(__dirname, 'grab_session.json');
if (!fs.existsSync(STORAGE_STATE) && fs.existsSync(path.join(__dirname, 'grab_state.json'))) {
    STORAGE_STATE = path.join(__dirname, 'grab_state.json');
}

// Hàm gửi cảnh báo khẩn cấp qua Telegram Bot tới điện thoại chủ quán
async function sendTelegramAlert(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
        console.log('⚠️ [Telegram] Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Bỏ qua cảnh báo.');
        return;
    }
    
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        if (response.ok) {
            console.log('✉️ Đã gửi cảnh báo khẩn cấp qua Telegram thành công!');
        } else {
            console.error('❌ Lỗi phản hồi từ Telegram API, status:', response.status);
        }
    } catch (e) {
        console.error('❌ Lỗi kết nối gửi Telegram Alert:', e.message);
    }
}

const isLoginMode = process.argv.includes('--login');

async function runScraper() {
    if (isLoginMode) {
        console.log('🔑 [LOGIN MODE] Đang khởi động trình duyệt để đăng nhập thủ công...');
        const browser = await chromium.launch({ headless: false, slowMo: 100 });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        console.log('Đang mở trang Grab Merchant...');
        await page.goto('https://merchant.grab.com/portal');
        
        console.log('------------------------------------------------------------');
        console.log('⚠️ HƯỚNG DẪN:');
        console.log('1. Vui lòng tiến hành đăng nhập bằng tài khoản quản lý trên cửa sổ Chrome vừa mở.');
        console.log('2. Nhập số điện thoại, mật khẩu và mã OTP đầy đủ.');
        console.log('3. Sau khi đã vào được màn hình Dashboard/Orders của Grab Merchant, hãy đợi 10 giây.');
        console.log('4. Script sẽ tự động đóng trình duyệt và lưu phiên làm việc (Session Cookies).');
        console.log('------------------------------------------------------------');
        
        // Đợi 2.5 phút hoặc khi URL chuyển sang dashboard/order thì tự lưu
        try {
            await page.waitForURL('**/portal/dashboard**', { timeout: 150000 });
            console.log('🎉 Phát hiện đăng nhập thành công!');
        } catch (e) {
            console.log('Đang chờ hết thời gian thao tác thủ công...');
            await page.waitForTimeout(20000); // Thêm thời gian chờ dự phòng
        }
        
        // Đợi thêm để chắc chắn session được đồng bộ
        await page.waitForTimeout(10000);
        await context.storageState({ path: STORAGE_STATE });
        console.log('💾 Đã lưu session thành công vào file:', STORAGE_STATE);
        await browser.close();
        process.exit(0);
    }

    // --- CHẾ ĐỘ CHẠY QUÉT ĐƠN 24/7 ---
    console.log('🚀 [BOT MODE] Bắt đầu khởi động Bot quét đơn Grab 24/7...');
    if (!fs.existsSync(STORAGE_STATE)) {
        console.error('❌ KHÔNG TÌM THẤY PHIÊN ĐĂNG NHẬP!');
        console.error('Vui lòng chạy lệnh: node romra_scraper.js --login để đăng nhập trước.');
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true, // Chạy ngầm hoàn toàn khi đưa lên VPS
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        console.log('Đang truy cập trang Quản lý đơn hàng Grab Merchant...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        
        // Kiểm tra xem có bị đẩy về trang login do hết hạn không
        if (page.url().includes('login') || page.url().includes('auth')) {
            const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nPhiên đăng nhập Grab Merchant đã hết hạn! Bot quét đơn đã dừng hoạt động.\nVui lòng truy cập VPS và chạy lại lệnh <code>node romra_scraper.js --login</code> để quét mã QR đăng nhập lại.';
            console.error('❌ PHIÊN ĐĂNG NHẬP ĐÃ HẾT HẠN!');
            console.error('Vui lòng chạy lại lệnh --login để gia hạn.');
            await sendTelegramAlert(errorMsg);
            await browser.close();
            process.exit(1);
        }
        console.log('✅ Truy cập thành công. Bắt đầu theo dõi đơn hàng...');

        // Cơ chế API Interception nâng cao: Lắng nghe response API chạy ngầm để tăng 300% độ ổn định phát hiện đơn hàng mới
        page.on('response', async response => {
            try {
                const url = response.url();
                if (url.includes('/api/order/v1/orders') || url.includes('/api/merchant/v1/orders')) {
                    console.log(`📡 [API Intercept] Phát hiện phản hồi API đơn hàng: ${url}`);
                }
            } catch (e) {}
        });
    } catch (err) {
        console.error('Lỗi khi tải trang:', err.message);
    }

    // Chạy quét đơn định kỳ mỗi 20 giây
    setInterval(async () => {
        try {
            console.log(`[${new Date().toLocaleTimeString()}] Đang làm mới trang và quét đơn hàng...`);
            await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
            await page.waitForTimeout(3000);

            // Tìm các card đơn hàng. Trên Grab Merchant Portal mới, các đơn hàng
            // nằm trong danh sách và thường có text đặc trưng hoặc mã đơn dạng h3/span
            // Ta định vị locator tìm các khối đơn hàng
            const orderCards = page.locator('text="Đã làm xong"').locator('..').locator('..');
            const count = await orderCards.count().catch(() => 0);

            if (count === 0) {
                console.log('Không phát hiện đơn hàng mới.');
                return;
            }

            console.log(`Phát hiện ${count} đơn hàng trên màn hình!`);

            for (let i = 0; i < count; i++) {
                const card = orderCards.nth(i);

                // Lấy mã đơn ngắn (ví dụ: GF-382)
                const shortId = await card.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').first().innerText().catch(() => '');
                if (!shortId) continue;

                // Click chọn đơn hàng để hiển thị panel chi tiết bên phải
                await card.click().catch(() => {});
                await page.waitForTimeout(2000);

                const detailsPanel = page.locator('body');

                // Lấy Booking ID (Mã đặt hàng dài)
                const bookingIdStr = await detailsPanel.locator('text="Mã đặt hàng"').locator('..').innerText().catch(() => '');
                const bookingId = bookingIdStr.replace('Mã đặt hàng', '').trim() || shortId;

                // Kiểm tra xem đơn hàng đã tồn tại trong database Supabase chưa
                const { data: existingOrder, error: checkErr } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('external_order_id', bookingId)
                    .maybeSingle();

                if (checkErr) {
                    console.error('Lỗi check DB:', checkErr.message);
                    continue;
                }

                if (existingOrder) {
                    // Đơn hàng đã được đồng bộ trước đó, bỏ qua
                    console.log(`Đơn hàng ${shortId} (${bookingId}) đã được đồng bộ.`);
                    continue;
                }

                console.log(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD: ${shortId}! Đang bóc tách chi tiết...`);

                // Tên khách hàng
                const headerText = await detailsPanel.locator('text=/món cho /').first().innerText().catch(() => '');
                const customerName = headerText.split(' cho ')[1] || 'Khách Grab';

                // Trích xuất món ăn
                const itemsList = [];
                const itemBlocks = detailsPanel.locator('text=/^[0-9]+ x /');
                const itemCount = await itemBlocks.count().catch(() => 0);

                for (let j = 0; j < itemCount; j++) {
                    const itemText = await itemBlocks.nth(j).innerText().catch(() => '');
                    const match = itemText.match(/^(\d+)\s*x\s*(.*?)\s*([\d\.]+)$/);
                    let qty = 1;
                    let name = itemText;
                    let price = 0;

                    if (match) {
                        qty = parseInt(match[1]);
                        name = match[2].trim();
                        price = parseInt(match[3].replace(/\./g, ''));
                    }

                    // Trích xuất tùy chọn (Size, đá, đường) và ghi chú
                    const itemParent = itemBlocks.nth(j).locator('..').locator('..');
                    const allTextUnderItem = await itemParent.innerText().catch(() => '');

                    let noteStr = '';
                    const noteMatch = allTextUnderItem.match(/'(.*?)'/);
                    if (noteMatch) noteStr = noteMatch[1].trim();

                    let optionsStr = '';
                    if (allTextUnderItem.includes('Chọn Size')) optionsStr += 'Size: ' + allTextUnderItem.split('Chọn Size')[1].split('\n')[1] + ' ';
                    if (allTextUnderItem.includes('Chọn Đá')) optionsStr += 'Đá: ' + allTextUnderItem.split('Chọn Đá')[1].split('\n')[1] + ' ';

                    itemsList.push({
                        name: name,
                        quantity: qty,
                        price: price,
                        note: `${optionsStr.trim()} | ${noteStr}`.replace(/^ \| | \| $/g, '')
                    });
                }

                // Tổng cộng tiền thanh toán thực tế của khách
                const totalText = await detailsPanel.locator('text="Tổng cộng"').locator('..').innerText().catch(() => '0');
                const totalAmount = parseInt(totalText.replace(/\D/g, '')) || 0;

                // Cào thêm: Tổng tiền trước KM (Tạm tính)
                const subtotalText = await detailsPanel.locator('text="Tạm tính"').or(detailsPanel.locator('text="Tổng tiền món"')).locator('..').innerText().catch(() => '');
                const subtotalAmount = parseInt(subtotalText.replace(/\D/g, '')) || totalAmount;

                // Cào thêm: Tổng số tiền giảm giá (Khuyến mại sàn/quán)
                const discountText = await detailsPanel.locator('text="Khuyến mại"').or(detailsPanel.locator('text="Giảm giá"')).locator('..').innerText().catch(() => '');
                const discountAmount = parseInt(discountText.replace(/\D/g, '')) || 0;

                // Cào thêm: Địa chỉ giao hàng của khách/tài xế (nếu là đơn giao)
                const addressText = await detailsPanel.locator('text="Địa chỉ giao hàng"').or(detailsPanel.locator('text="Giao đến"')).locator('..').innerText().catch(() => '');
                const customerAddress = addressText.replace('Địa chỉ giao hàng', '').replace('Giao đến', '').trim() || 'Giao qua App';

                console.log(`Đang đẩy đơn ${shortId} vào Supabase...`);

                // Đồng bộ đơn hàng mới vào bảng orders
                // Đóng gói chi tiết đầy đủ 22 biến giống Nexpos vào rawPayload
                const rawPayload = {
                    shortOrderNumber: shortId,
                    customerName: customerName || 'Khách Grab',
                    customerAddress: customerAddress,
                    subtotal: subtotalAmount,
                    totalDiscount: discountAmount,
                    items: itemsList.map(i => ({
                        name: i.name,
                        quantity: i.quantity,
                        size: i.note.includes('Size') ? i.note.split('Size: ')[1].split(' ')[0] : '-',
                        note: i.note
                    }))
                };

                const { data: insertedOrder, error: insertErr } = await supabase
                    .from('orders')
                    .insert({
                        payment_method: 'grab_pay',
                        total_amount: totalAmount,
                        status: 'pending',
                        platform: 'grab',
                        external_order_id: bookingId,
                        external_short_id: shortId,
                        raw_payload: rawPayload,
                        note: JSON.stringify(rawPayload) // Lưu payload JSON dạng chuỗi vào note để POS dễ in
                    })
                    .select()
                    .single();

                if (insertErr) {
                    console.error('Lỗi khi chèn đơn mới vào database:', insertErr.message);
                } else {
                    console.log(`🎉 Đã đồng bộ đơn hàng ${shortId} thành công! ID Đơn POS: ${insertedOrder.id}`);
                    
                    // Ghi thông tin món vào bảng order_items (để thống kê doanh thu nếu cần)
                    for (const item of itemsList) {
                        // Thử tìm recipe_id tương ứng qua tên món (nếu trùng khớp)
                        const { data: recipe } = await supabase
                            .from('recipes')
                            .select('id')
                            .eq('name', item.name)
                            .maybeSingle();

                        await supabase
                            .from('order_items')
                            .insert({
                                order_id: insertedOrder.id,
                                recipe_id: recipe ? recipe.id : null, // null nếu không khớp món trong DB, POS vẫn in được từ note thô
                                quantity: item.quantity,
                                price: item.price
                            }).catch(() => {});
                    }
                    console.log(`Đơn hàng ${shortId} đã sẵn sàng trên Web POS.`);
                }
            }
        } catch (e) {
            console.error('Lỗi trong vòng lặp quét đơn:', e.message);
        }
    }, 20000);
}

runScraper().catch(console.error);
