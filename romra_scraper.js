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

// --- BIẾN TOÀN CỤC & HỆ THỐNG LOGS NỘI BỘ (RAM) ---
const localLogs = [];
let lastScanTime = '';
let lastPageUrl = '';
let sessionScrapedCount = 0;

function addToLogs(message) {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    const logLine = `[${timeStr}] ${message}`;
    console.log(logLine);
    localLogs.push(logLine);
    if (localLogs.length > 50) {
        localLogs.shift();
    }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const dDisplay = d > 0 ? d + "d " : "";
    const hDisplay = h > 0 ? h + "h " : "";
    const mDisplay = m > 0 ? m + "m " : "";
    const sDisplay = s > 0 ? s + "s" : "0s";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

// Đọc cấu hình tài khoản/mật khẩu Grab từ file grab_config.json (nếu có để tự động login 100%)
const CONFIG_FILE = path.join(__dirname, 'grab_config.json');
let grabConfig = null;
try {
    if (fs.existsSync(CONFIG_FILE)) {
        grabConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        addToLogs('🔑 Đã tải thành công cấu hình tự động đăng nhập từ grab_config.json');
    }
} catch (e) {
    console.warn('⚠️ Lỗi khi tải file cấu hình grab_config.json:', e.message);
}

// Hàm tự động điền tài khoản, mật khẩu và click đăng nhập Grab Merchant
async function autoLoginGrab(page, config) {
    try {
        addToLogs('🌐 Đang điều hướng tới trang đăng nhập Grab Merchant...');
        await page.goto('https://merchant.grab.com/portal/login', { waitUntil: 'commit', timeout: 60000 });
        
        addToLogs('⏳ Đang chờ trang đăng nhập tải...');
        const usernameInput = page.locator('#Username, input[type="text"], input[type="email"]').first();
        await usernameInput.waitFor({ state: 'visible', timeout: 30000 });

        addToLogs('✍ ... Đang điền tên đăng nhập...');
        await usernameInput.fill(config.username);

        addToLogs('🔘 Đang bấm nút Continue...');
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Tiếp tục"), button[type="button"]').first();
        await continueButton.click();
        await page.waitForTimeout(3000);

        addToLogs('✍ ... Đang điền mật khẩu...');
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 20000 });
        await passwordInput.fill(config.password);

        addToLogs('🔘 Đang bấm nút đăng nhập...');
        const loginButton = page.locator('button[type="submit"], button.dui-btn, button:has-text("Đăng nhập"), button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Continue"), button').filter({ visible: true }).first();
        await loginButton.click();

        addToLogs('⏳ Đang chờ hệ thống xác nhận đăng nhập thành công...');
        await page.waitForURL(url => url.href.includes('dashboard') || url.href.includes('order'), { timeout: 45000 });
        addToLogs('🎉 Tự động đăng nhập Grab Merchant thành công!');
        return true;
    } catch (e) {
        addToLogs(`❌ Lỗi trong quá trình tự động đăng nhập ngầm: ${e.message}`);
        return false;
    }
}

// Hàm gửi cảnh báo khẩn cấp qua Telegram Bot (hỗ trợ customChatId để phản hồi riêng lẻ)
async function sendTelegramAlert(message, customChatId = null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = customChatId || process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
        console.log('⚠️ [Telegram] Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Bỏ qua gửi tin nhắn.');
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
        if (!response.ok) {
            console.error('❌ Lỗi phản hồi từ Telegram API, status:', response.status);
        }
    } catch (e) {
        console.error('❌ Lỗi kết nối gửi Telegram Alert:', e.message);
    }
}

// --- MODULE XỬ LÝ TELEGRAM BOT TƯƠNG TÁC 2 CHIỀU (LONG POLLING) ---
let telegramOffset = 0;

async function handleTelegramCommand(text) {
    const command = text.split(' ')[0].toLowerCase();
    const args = text.split(' ').slice(1);
    
    addToLogs(`📥 [Telegram CMD] Nhận lệnh: ${text}`);
    
    if (command === '/start' || command === '/help') {
        const helpMsg = `🤖 <b>HỆ THỐNG ĐIỀU KHIỂN RÔM RẢ BOT</b>\n\n` +
            `Anh có thể sử dụng các lệnh nhanh sau:\n` +
            `🔹 <b>/status</b> - Xem trạng thái hoạt động của Bot.\n` +
            `🔹 <b>/restart</b> - Khởi động lại Bot quét đơn (qua PM2 auto-restart).\n` +
            `🔹 <b>/logs</b> - Xem 15 dòng nhật ký logs gần nhất.\n` +
            `🔹 <b>/scrape [ngày]</b> - Ra lệnh cào lịch sử (Ví dụ: <code>/scrape 23</code>).\n` +
            `🔹 <b>/revenue</b> - Thống kê doanh thu hôm nay từ Supabase.`;
        await sendTelegramAlert(helpMsg);
    } 
    else if (command === '/status') {
        const uptime = Math.round(process.uptime());
        const uptimeStr = formatUptime(uptime);
        const grabSessionExists = fs.existsSync(STORAGE_STATE);
        
        let statusMsg = `📊 <b>TRẠNG THÁI RÔM RẢ BOT</b>\n\n` +
            `• <b>Uptime:</b> ${uptimeStr}\n` +
            `• <b>Trình duyệt:</b> Playwright Chromium (Headless)\n` +
            `• <b>Grab Session:</b> ${grabSessionExists ? '🟢 Đang hoạt động' : '🔴 Chưa đăng nhập'}\n` +
            `• <b>Lần cuối quét:</b> ${lastScanTime || 'Chưa quét lần nào'}\n` +
            `• <b>URL trang:</b> <code>${lastPageUrl || 'N/A'}</code>\n` +
            `• <b>Tổng số đơn quét trong phiên:</b> ${sessionScrapedCount} đơn`;
        await sendTelegramAlert(statusMsg);
    } 
    else if (command === '/restart') {
        await sendTelegramAlert('🔄 <b>[RÔM RẢ BOT]</b> Đang tiến hành tắt tiến trình... PM2 sẽ tự khởi động lại bot ngay lập tức.');
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    } 
    else if (command === '/logs') {
        const logsToShow = localLogs.slice(-15).join('\n');
        const logsMsg = `📝 <b>15 DÒNG NHẬT KÝ GẦN NHẤT:</b>\n\n<pre>${logsToShow || 'Chưa có nhật ký nào.'}</pre>`;
        await sendTelegramAlert(logsMsg);
    } 
    else if (command === '/scrape') {
        const dateArg = args[0];
        if (!dateArg) {
            await sendTelegramAlert('⚠️ Vui lòng cung cấp ngày cần cào lịch sử.\nVí dụ: <code>/scrape 23</code>');
            return;
        }
        
        await sendTelegramAlert(`⏳ <b>[RÔM RẢ BOT]</b> Đang cào đơn lịch sử ngày <b>${dateArg}</b> ngầm trên VPS... Vui lòng đợi trong giây lát.`);
        
        const { exec } = require('child_process');
        let scriptPath = path.join(__dirname, 'scratch', 'test_history_scrape.js');
        if (!fs.existsSync(scriptPath)) {
            scriptPath = path.join(__dirname, 'test_history_scrape.js');
        }
        
        exec(`node "${scriptPath}" --date ${dateArg}`, async (error, stdout, stderr) => {
            if (error) {
                console.error('Lỗi chạy cào lịch sử:', error.message);
                await sendTelegramAlert(`❌ <b>Lỗi khi cào đơn lịch sử ngày ${dateArg}:</b>\n<code>${error.message}</code>`);
                return;
            }
            
            const resultMatch = stdout.match(/🎉 KẾT QUẢ CÀO ĐƠN HÀNG LỊCH SỬ THỰC TẾ THÀNH CÔNG![\s\S]*?({[\s\S]*?})/);
            if (resultMatch) {
                try {
                    const orderData = JSON.parse(resultMatch[1]);
                    const successMsg = `✅ <b>CÀO ĐƠN LỊCH SỬ THÀNH CÔNG!</b>\n\n` +
                        `• <b>Mã đơn ngắn:</b> ${orderData.shortOrderNumber}\n` +
                        `• <b>Mã Grab dài:</b> <code>${orderData.longOrderNumber}</code>\n` +
                        `• <b>Khách hàng:</b> ${orderData.customerName}\n` +
                        `• <b>Doanh thu:</b> ${orderData.totalAmount.toLocaleString('vi-VN')}đ\n` +
                        `• <b>Món ăn:</b>\n` +
                        orderData.items.map(item => `  - ${item.name} x${item.quantity} (${item.price.toLocaleString('vi-VN')}đ)`).join('\n');
                    await sendTelegramAlert(successMsg);
                } catch (parseErr) {
                    await sendTelegramAlert(`✅ <b>Cào đơn lịch sử hoàn tất!</b>\n\n<pre>${stdout.slice(-500)}</pre>`);
                }
            } else {
                if (stdout.includes('Không phát hiện đơn hàng')) {
                    await sendTelegramAlert(`ℹ️ <b>Kết quả cào lịch sử ngày ${dateArg}:</b> Không tìm thấy đơn hàng lịch sử nào.`);
                } else {
                    await sendTelegramAlert(`ℹ️ <b>Kết quả cào lịch sử ngày ${dateArg}:</b>\n<pre>${stdout.slice(-500)}</pre>`);
                }
            }
        });
    } 
    else if (command === '/revenue') {
        await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tính toán doanh thu hôm nay từ Supabase...');
        try {
            const today = new Date();
            today.setHours(today.getHours() + 7);
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            startOfDay.setHours(startOfDay.getHours() - 7);
            
            const { data: orders, error: dbErr } = await supabase
                .from('orders')
                .select('total_amount, platform')
                .gte('created_at', startOfDay.toISOString());
                
            if (dbErr) throw dbErr;
            
            if (!orders || orders.length === 0) {
                await sendTelegramAlert('📊 <b>DOANH THU HÔM NAY:</b>\nHôm nay chưa ghi nhận đơn hàng nào trên hệ thống.');
                return;
            }
            
            let total = 0, grabTotal = 0, localTotal = 0;
            let grabCount = 0, localCount = 0;
            
            for (const order of orders) {
                const amt = parseFloat(order.total_amount) || 0;
                total += amt;
                if (order.platform === 'grab') {
                    grabTotal += amt;
                    grabCount++;
                } else {
                    localTotal += amt;
                    localCount++;
                }
            }
            
            const revMsg = `📊 <b>THỐNG KÊ DOANH THU HÔM NAY</b>\n` +
                `<i>(Từ 00:00 đến hiện tại)</i>\n\n` +
                `🔹 <b>Tổng doanh thu:</b> <code>${total.toLocaleString('vi-VN')}đ</code>\n` +
                `• Tổng số đơn: <b>${orders.length} đơn</b>\n\n` +
                `🛵 <b>Kênh GrabFood:</b>\n` +
                `• Doanh thu: <code>${grabTotal.toLocaleString('vi-VN')}đ</code>\n` +
                `• Số lượng: <b>${grabCount} đơn</b>\n\n` +
                `🏠 <b>Bán tại quán (POS):</b>\n` +
                `• Doanh thu: <code>${localTotal.toLocaleString('vi-VN')}đ</code>\n` +
                `• Số lượng: <b>${localCount} đơn</b>`;
            await sendTelegramAlert(revMsg);
        } catch (e) {
            console.error('Lỗi tính doanh thu:', e.message);
            await sendTelegramAlert(`❌ Lỗi truy vấn doanh thu từ DB: ${e.message}`);
        }
    } 
    else {
        await sendTelegramAlert('❓ Lệnh không hợp lệ. Gõ <b>/help</b> để xem các lệnh được hỗ trợ.');
    }
}

async function startTelegramBot() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
        addToLogs('⚠️ [Telegram Bot 2-way] Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Không khởi chạy bot Telegram.');
        return;
    }
    
    addToLogs('🤖 [Telegram Bot 2-way] Đang khởi động tiến trình lắng nghe Telegram 2 chiều...');
    await sendTelegramAlert('🟢 <b>[RÔM RẢ BOT]</b> Hệ thống đã khởi động trực tuyến và sẵn sàng nhận lệnh từ anh!');
    
    (async () => {
        while (true) {
            try {
                const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${telegramOffset}&timeout=30`;
                const response = await fetch(url).catch(() => null);
                
                if (!response) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                
                if (!response.ok) {
                    if (response.status === 409) {
                        addToLogs('⚠️ [Telegram Bot] Phát hiện xung đột kết nối Long Polling (Conflict 409). Đang thử lại sau 15 giây...');
                        await new Promise(resolve => setTimeout(resolve, 15000));
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                    continue;
                }
                
                const data = await response.json();
                if (data.ok && data.result.length > 0) {
                    for (const update of data.result) {
                        telegramOffset = update.update_id + 1;
                        
                        const message = update.message;
                        if (!message || !message.text) continue;
                        
                        const senderChatId = message.chat.id.toString();
                        const text = message.text.trim();
                        
                        if (senderChatId !== chatId.toString()) {
                            addToLogs(`🔒 [Telegram Bot] Chặn tin nhắn từ Chat ID lạ: ${senderChatId} (Tin nhắn: "${text}")`);
                            await sendTelegramAlert('❌ <b>Quyền truy cập bị từ chối!</b>\nBạn không có quyền ra lệnh cho Bot này.', senderChatId);
                            continue;
                        }
                        
                        await handleTelegramCommand(text);
                    }
                }
            } catch (e) {
                console.error('❌ Lỗi trong tiến trình Telegram Long Polling:', e.message);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    })();
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
        
        try {
            await page.waitForURL('**/portal/dashboard**', { timeout: 150000 });
            console.log('🎉 Phát hiện đăng nhập thành công!');
        } catch (e) {
            console.log('Đang chờ hết thời gian thao tác thủ công...');
            await page.waitForTimeout(20000);
        }
        
        await page.waitForTimeout(10000);
        await context.storageState({ path: STORAGE_STATE });
        console.log('💾 Đã lưu session thành công vào file:', STORAGE_STATE);
        await browser.close();
        process.exit(0);
    }

    // --- CHẾ ĐỘ CHẠY QUÉT ĐƠN 24/7 ---
    addToLogs('🚀 [BOT MODE] Bắt đầu khởi động Bot quét đơn Grab 24/7...');
    if (!fs.existsSync(STORAGE_STATE)) {
        if (grabConfig && grabConfig.username && grabConfig.password) {
            addToLogs('🔐 Chưa có session. Bắt đầu tự động đăng nhập ngầm bằng tài khoản...');
            const tempBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const tempContext = await tempBrowser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const tempPage = await tempContext.newPage();
            const loginSuccess = await autoLoginGrab(tempPage, grabConfig);
            if (loginSuccess) {
                await tempContext.storageState({ path: STORAGE_STATE });
                addToLogs('💾 Đã lưu session tự động đăng nhập thành công!');
            } else {
                addToLogs('❌ Tự động đăng nhập ngầm khởi tạo thất bại. Vui lòng kiểm tra lại tài khoản mật khẩu.');
                await tempBrowser.close();
                process.exit(1);
            }
            await tempBrowser.close();
        } else {
            addToLogs('❌ KHÔNG TÌM THẤY PHIÊN ĐĂNG NHẬP VÀ CẤU HÌNH TÀI KHOẢN!');
            console.error('Vui lòng tạo file grab_config.json chứa tài khoản hoặc chạy --login để đăng nhập thủ công.');
            process.exit(1);
        }
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        addToLogs('Đang truy cập trang Quản lý đơn hàng Grab Merchant...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        
        if (page.url().includes('login') || page.url().includes('auth')) {
            addToLogs('⚠️ Phát hiện phiên đăng nhập (Session Cookie) của Grab đã hết hạn!');
            if (grabConfig && grabConfig.username && grabConfig.password) {
                addToLogs('🔐 Đang tiến hành tự động gia hạn đăng nhập ngầm bằng tài khoản...');
                
                await context.clearCookies().catch(() => {});
                await page.evaluate(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                }).catch(() => {});

                const loginSuccess = await autoLoginGrab(page, grabConfig);
                if (loginSuccess) {
                    await context.storageState({ path: STORAGE_STATE });
                    addToLogs('💾 Đã gia hạn và lưu session tự động đăng nhập thành công!');
                    await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
                    await page.waitForTimeout(5000);
                } else {
                    const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nTự động gia hạn đăng nhập ngầm thất bại! Vui lòng kiểm tra lại tài khoản mật khẩu.';
                    await sendTelegramAlert(errorMsg);
                    await browser.close();
                    process.exit(1);
                }
            } else {
                const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nPhiên đăng nhập Grab Merchant đã hết hạn! Bot quét đơn đã dừng hoạt động.\nVui lòng truy cập VPS và chạy lại lệnh <code>node romra_scraper.js --login</code> để đăng nhập lại.';
                addToLogs('❌ PHIÊN ĐĂNG NHẬP ĐÃ HẾT HẠN!');
                await sendTelegramAlert(errorMsg);
                await browser.close();
                process.exit(1);
            }
        }
        addToLogs('✅ Truy cập thành công. Bắt đầu theo dõi đơn hàng...');

        page.on('response', async response => {
            try {
                const url = response.url();
                if (url.includes('/api/order/v1/orders') || url.includes('/api/merchant/v1/orders')) {
                    addToLogs(`📡 [API Intercept] Phát hiện phản hồi API đơn hàng: ${url}`);
                }
            } catch (e) {}
        });
    } catch (err) {
        addToLogs(`❌ Lỗi khi tải trang: ${err.message}`);
    }

    // Khởi chạy Telegram Bot điều khiển 2 chiều ngầm song song
    await startTelegramBot();

    // Chạy quét đơn định kỳ mỗi 20 giây
    setInterval(async () => {
        try {
            lastScanTime = new Date().toLocaleTimeString('vi-VN');
            lastPageUrl = page.url();
            
            addToLogs('Đang làm mới trang và quét đơn hàng...');
            await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
            await page.waitForTimeout(3000);

            const orderCards = page.locator('text="Đã làm xong"').locator('..').locator('..');
            const count = await orderCards.count().catch(() => 0);

            if (count === 0) {
                addToLogs('Không phát hiện đơn hàng mới.');
                return;
            }

            addToLogs(`Phát hiện ${count} đơn hàng trên màn hình!`);

            for (let i = 0; i < count; i++) {
                const card = orderCards.nth(i);

                const shortId = await card.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').first().innerText().catch(() => '');
                if (!shortId) continue;

                await card.click().catch(() => {});
                await page.waitForTimeout(2000);

                const detailsPanel = page.locator('body');

                const bookingIdStr = await detailsPanel.locator('text="Mã đặt hàng"').locator('..').innerText().catch(() => '');
                const bookingId = bookingIdStr.replace('Mã đặt hàng', '').trim() || shortId;

                const { data: existingOrder, error: checkErr } = await supabase
                    .from('orders')
                    .select('id, status')
                    .eq('external_order_id', bookingId)
                    .maybeSingle();

                if (checkErr) {
                    addToLogs(`❌ Lỗi check DB: ${checkErr.message}`);
                    continue;
                }

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
                    if (existingOrder.status !== mappedStatus) {
                        addToLogs(`🔄 Phát hiện thay đổi trạng thái đơn ${shortId}: "${existingOrder.status}" -> "${mappedStatus}" (Grab: "${grabStatusText}")`);
                        const { error: updateErr } = await supabase
                            .from('orders')
                            .update({ status: mappedStatus })
                            .eq('id', existingOrder.id);
                        
                        if (updateErr) {
                            addToLogs(`❌ Lỗi cập nhật trạng thái đơn ${shortId}: ${updateErr.message}`);
                        } else {
                            addToLogs(`🎉 Đã cập nhật trạng thái đơn ${shortId} thành công lên Supabase!`);
                        }
                    } else {
                        addToLogs(`Đơn hàng ${shortId} (${bookingId}) đã đồng bộ và trạng thái không đổi ("${existingOrder.status}").`);
                    }
                    continue;
                }

                addToLogs(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD: ${shortId}! Đang bóc tách chi tiết...`);

                const headerText = await detailsPanel.locator('text=/món cho /').first().innerText().catch(() => '');
                const customerName = headerText.split(' cho ')[1] || 'Khách Grab';

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

                const totalText = await detailsPanel.locator('text="Tổng cộng"').locator('..').innerText().catch(() => '0');
                const totalAmount = parseInt(totalText.replace(/\D/g, '')) || 0;

                const subtotalText = await detailsPanel.locator('text="Tạm tính"').or(detailsPanel.locator('text="Tổng tiền món"')).locator('..').innerText().catch(() => '');
                const subtotalAmount = parseInt(subtotalText.replace(/\D/g, '')) || totalAmount;

                const discountText = await detailsPanel.locator('text="Khuyến mại"').or(detailsPanel.locator('text="Giảm giá"')).locator('..').innerText().catch(() => '');
                const discountAmount = parseInt(discountText.replace(/\D/g, '')) || 0;

                const addressText = await detailsPanel.locator('text="Địa chỉ giao hàng"').or(detailsPanel.locator('text="Giao đến"')).locator('..').innerText().catch(() => '');
                const customerAddress = addressText.replace('Địa chỉ giao hàng', '').replace('Giao đến', '').trim() || 'Giao qua App';

                addToLogs(`Đang đẩy đơn ${shortId} vào Supabase...`);

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
                        note: JSON.stringify(rawPayload)
                    })
                    .select()
                    .single();

                if (insertErr) {
                    addToLogs(`❌ Lỗi khi chèn đơn mới vào database: ${insertErr.message}`);
                } else {
                    addToLogs(`🎉 Đã đồng bộ đơn hàng ${shortId} thành công! ID Đơn POS: ${insertedOrder.id}`);
                    sessionScrapedCount++;
                    
                    for (const item of itemsList) {
                        const { data: recipe } = await supabase
                            .from('recipes')
                            .select('id')
                            .eq('name', item.name)
                            .maybeSingle();

                        await supabase
                            .from('order_items')
                            .insert({
                                order_id: insertedOrder.id,
                                recipe_id: recipe ? recipe.id : null,
                                quantity: item.quantity,
                                price: item.price
                            }).catch(() => {});
                    }
                    addToLogs(`Đơn hàng ${shortId} đã sẵn sàng trên Web POS.`);
                }
            }
        } catch (e) {
            addToLogs(`❌ Lỗi trong vòng lặp quét đơn: ${e.message}`);
        }
    }, 20000);
}

runScraper().catch(console.error);
