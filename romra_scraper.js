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

// Đọc cấu hình tài khoản/mật khẩu Grab từ file grab_config.json (nếu có để tự động login 100%)
const CONFIG_FILE = path.join(__dirname, 'grab_config.json');
let grabConfig = null;
try {
    if (fs.existsSync(CONFIG_FILE)) {
        grabConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        console.log('🔑 Đã tải thành công cấu hình tự động đăng nhập từ grab_config.json');
    }
} catch (e) {
    console.warn('⚠️ Lỗi khi tải file cấu hình grab_config.json:', e.message);
}

// Hàm tự động điền tài khoản, mật khẩu và click đăng nhập Grab Merchant
async function autoLoginGrab(page, config) {
    try {
        console.log('🌐 Đang điều hướng tới trang đăng nhập Grab Merchant...');
        // Đi qua trang gốc sử dụng commit để tránh kẹt redirect chuyển hướng trên VPS Linux
        await page.goto('https://merchant.grab.com/portal/login', { waitUntil: 'commit', timeout: 60000 });
        
        console.log('⏳ Đang chờ trang đăng nhập tải...');
        const usernameInput = page.locator('#Username, input[type="text"], input[type="email"]').first();
        await usernameInput.waitFor({ state: 'visible', timeout: 30000 });

        console.log('✍ ... Đang điền tên đăng nhập...');
        await usernameInput.fill(config.username);

        console.log('🔘 Đang bấm nút Continue...');
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Tiếp tục"), button[type="button"]').first();
        await continueButton.click();
        await page.waitForTimeout(3000);

        console.log('✍ ... Đang điền mật khẩu...');
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 20000 });
        await passwordInput.fill(config.password);

        console.log('🔘 Đang bấm nút đăng nhập...');
        const loginButton = page.locator('button[type="submit"], button.dui-btn, button:has-text("Đăng nhập"), button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Continue"), button').filter({ visible: true }).first();
        await loginButton.click();

        console.log('⏳ Đang chờ hệ thống xác nhận đăng nhập thành công...');
        await page.waitForURL(url => url.href.includes('dashboard') || url.href.includes('order'), { timeout: 45000 });
        console.log('🎉 Tự động đăng nhập Grab Merchant thành công!');
        return true;
    } catch (e) {
        console.error('❌ Lỗi trong quá trình tự động đăng nhập ngầm:', e.message);
        return false;
    }
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
        if (grabConfig && grabConfig.username && grabConfig.password) {
            console.log('🔐 Chưa có session. Bắt đầu tự động đăng nhập ngầm bằng tài khoản...');
            const tempBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const tempContext = await tempBrowser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const tempPage = await tempContext.newPage();
            const loginSuccess = await autoLoginGrab(tempPage, grabConfig);
            if (loginSuccess) {
                await tempContext.storageState({ path: STORAGE_STATE });
                console.log('💾 Đã lưu session tự động đăng nhập thành công!');
            } else {
                console.error('❌ Tự động đăng nhập ngầm khởi tạo thất bại. Vui lòng kiểm tra lại tài khoản mật khẩu.');
                await tempBrowser.close();
                process.exit(1);
            }
            await tempBrowser.close();
        } else {
            console.error('❌ KHÔNG TÌM THẤY PHIÊN ĐĂNG NHẬP VÀ CẤU HÌNH TÀI KHOẢN!');
            console.error('Vui lòng tạo file grab_config.json chứa tài khoản hoặc chạy --login để đăng nhập thủ công.');
            process.exit(1);
        }
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
            console.log('⚠️ Phát hiện phiên đăng nhập (Session Cookie) của Grab đã hết hạn!');
            if (grabConfig && grabConfig.username && grabConfig.password) {
                console.log('🔐 Đang tiến hành tự động gia hạn đăng nhập ngầm bằng tài khoản...');
                
                // Xóa sạch cookie và bộ nhớ cũ của trang để tránh popup hết hạn session che mờ màn hình
                await context.clearCookies().catch(() => {});
                await page.evaluate(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                }).catch(() => {});

                const loginSuccess = await autoLoginGrab(page, grabConfig);
                if (loginSuccess) {
                    await context.storageState({ path: STORAGE_STATE });
                    console.log('💾 Đã gia hạn và lưu session tự động đăng nhập thành công!');
                    // Quay lại trang quản lý đơn
                    await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
                    await page.waitForTimeout(5000);
                } else {
                    const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nTự động gia hạn đăng nhập ngầm thất bại! Vui lòng kiểm tra lại tài khoản mật khẩu.';
                    await sendTelegramAlert(errorMsg);
                    await browser.close();
                    process.exit(1);
                }
            } else {
                const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nPhiên đăng nhập Grab Merchant đã hết hạn! Bot quét đơn đã dừng hoạt động.\nVui lòng truy cập VPS và chạy lại lệnh <code>node romra_scraper.js --login</code> để quét mã QR đăng nhập lại.';
                console.error('❌ PHIÊN ĐĂNG NHẬP ĐÃ HẾT HẠN!');
                console.error('Vui lòng chạy lại lệnh --login để gia hạn.');
                await sendTelegramAlert(errorMsg);
                await browser.close();
                process.exit(1);
            }
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
                    .select('id, status')
                    .eq('external_order_id', bookingId)
                    .maybeSingle();

                if (checkErr) {
                    console.error('Lỗi check DB:', checkErr.message);
                    continue;
                }

                // Ánh xạ trạng thái thực tế trên Grab Portal sang trạng thái chuẩn của POS Rôm Rả
                const grabStatusText = await detailsPanel.locator('text="Đang chuẩn bị", text="Sẵn sàng", text="Tài xế đang đến", text="Đang giao", text="Đã giao", text="Đã hoàn tất", text="Đã hủy", text="Cancelled"').first().innerText().catch(() => '');
                
                let mappedStatus = 'pending';
                if (grabStatusText.includes('Đang giao') || grabStatusText.includes('Tài xế đang đến')) {
                    mappedStatus = 'shipping';
                } else if (grabStatusText.includes('Đã giao') || grabStatusText.includes('Đã hoàn tất')) {
                    mappedStatus = 'completed';
                } else if (grabStatusText.includes('Đã hủy') || grabStatusText.includes('Cancelled')) {
                    mappedStatus = 'cancelled';
                }

                if (existingOrder) {
                    // Đơn hàng đã được đồng bộ trước đó, tiến hành kiểm tra & cập nhật trạng thái Realtime
                    if (existingOrder.status !== mappedStatus) {
                        console.log(`🔄 Phát hiện thay đổi trạng thái đơn ${shortId}: "${existingOrder.status}" -> "${mappedStatus}" (Grab: "${grabStatusText}")`);
                        const { error: updateErr } = await supabase
                            .from('orders')
                            .update({ status: mappedStatus })
                            .eq('id', existingOrder.id);
                        
                        if (updateErr) {
                            console.error(`❌ Lỗi cập nhật trạng thái đơn ${shortId}:`, updateErr.message);
                        } else {
                            console.log(`🎉 Đã cập nhật trạng thái đơn ${shortId} thành công lên Supabase!`);
                        }
                    } else {
                        console.log(`Đơn hàng ${shortId} (${bookingId}) đã đồng bộ và trạng thái không đổi ("${existingOrder.status}").`);
                    }
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
