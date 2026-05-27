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
let activePage = null; // Lưu tham chiếu page của Playwright để chụp màn hình từ Telegram
let globalBrowser = null;
let globalContext = null;
let isBotSleeping = false;
let scanCycleCount = 0;

function getVietnamHour() {
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false };
    const hourStr = new Intl.DateTimeFormat('en-US', options).format(new Date());
    return parseInt(hourStr, 10);
}

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
    const botToken = process.env.TELEGRAM_BOT_TOKEN || (grabConfig && grabConfig.telegram_bot_token);
    const chatId = customChatId || process.env.TELEGRAM_CHAT_ID || (grabConfig && grabConfig.telegram_chat_id);
    
    if (!botToken || !chatId) {
        console.log('⚠️ [Telegram] Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID. Bỏ qua gửi tin nhắn.');
        return;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Hủy fetch nếu quá 8 giây
    
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error('❌ Lỗi phản hồi từ Telegram API, status:', response.status);
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('❌ Lỗi kết nối gửi Telegram Alert:', e.message);
    }
}

// --- MODULE XỬ LÝ TELEGRAM BOT TƯƠNG TÁC 2 CHIỀU (LONG POLLING) ---
let telegramOffset = 0;

// --- HÀM GỬI ẢNH TELEGRAM (FORM DATA ZERO-DEPENDENCY) ---
async function sendTelegramPhoto(photoPath, caption = '') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || (grabConfig && grabConfig.telegram_bot_token);
    const chatId = process.env.TELEGRAM_CHAT_ID || (grabConfig && grabConfig.telegram_chat_id);
    
    if (!botToken || !chatId || !fs.existsSync(photoPath)) return;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 giây cho gửi ảnh
    
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        
        const fileBuffer = fs.readFileSync(photoPath);
        const fileBlob = new Blob([fileBuffer], { type: 'image/png' });
        formData.append('photo', fileBlob, 'screenshot.png');
        if (caption) {
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');
        }
        
        const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error('❌ Lỗi phản hồi gửi ảnh Telegram, status:', response.status);
        }
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('❌ Lỗi gửi ảnh Telegram:', e.message);
    }
}



async function handleTelegramCommand(text) {
    const command = text.split(' ')[0].toLowerCase();
    const args = text.split(' ').slice(1);
    
    addToLogs(`📥 [Telegram CMD] Nhận lệnh: ${text}`);
    
    if (command === '/start' || command === '/help') {
        const helpMsg = `🤖 <b>HỆ THỐNG ĐIỀU KHIỂN RÔM RẢ BOT</b>\n` +
            `<i>(Giải phóng 100% việc gõ CMD)</i>\n\n` +
            `📊 <b>GIÁM SÁT & BÁO CÁO:</b>\n` +
            `• <b>/status</b> - Xem trạng thái hoạt động thực tế của Bot.\n` +
            `• <b>/logs</b> - Xem 15 dòng nhật ký hoạt động gần nhất trên VPS.\n` +
            `• <b>/screenshot</b> - Chụp màn hình Chromium ngầm của Grab thực tế.\n` +
            `• <b>/revenue</b> - Doanh thu realtime hôm nay.\n` +
            `• <b>/revenue_yesterday</b> - Doanh thu đối soát hôm qua.\n` +
            `• <b>/revenue_month</b> - Doanh thu tổng hợp tháng này.\n\n` +
            `📦 <b>KHO & THỰC ĐƠN:</b>\n` +
            `• <b>/stock</b> - Xem tồn kho nguyên liệu & Cảnh báo sắp hết.\n` +
            `• <b>/addstock [tên] [SL]</b> - Nhập nhanh kho (Ví dụ: <code>/addstock "Sữa đặc" 24</code>).\n` +
            `• <b>/menu</b> - Xem danh sách món nước & Trạng thái hết món.\n` +
            `• <b>/toggle_soldout [món]</b> - Đổi trạng thái Hết/Còn món (Ví dụ: <code>/toggle_soldout "Bạc Xỉu"</code>).\n\n` +
            `⚙️ <b>QUẢN TRỊ HỆ THỐNG VPS:</b>\n` +
            `• <b>/scrape [ngày]</b> - Ra lệnh cào lịch sử (Ví dụ: <code>/scrape 23</code>).\n` +
            `• <b>/update</b> - Tự cập nhật tải bản Bot mới nhất từ GitHub & reload.\n` +
            `• <b>/update history</b> - Cập nhật script cào lịch sử từ GitHub.\n` +
            `• <b>/restart</b> - Khởi động lại Bot quét đơn Grab.\n` +
            `• <b>/cmd [lệnh]</b> - Chạy Terminal Linux tối cao (Ví dụ: <code>/cmd pm2 status</code>).`;
        await sendTelegramAlert(helpMsg);
    } 
    else if (command === '/status') {
        const uptime = Math.round(process.uptime());
        const uptimeStr = formatUptime(uptime);
        const grabSessionExists = fs.existsSync(STORAGE_STATE);
        
        let statusMsg = `📊 <b>TRẠNG THÁI RÔM RẢ BOT</b>\n\n` +
            `• <b>Uptime:</b> ${uptimeStr}\n` +
            `• <b>Trạng thái:</b> ${isBotSleeping ? '💤 Đang ngủ đêm (23:00 - 06:00)' : '🟢 Đang hoạt động bình thường'}\n` +
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
    else if (command === '/debug') {
        let debugLogPath = path.join(__dirname, 'scratch', 'history_debug.log');
        if (!fs.existsSync(debugLogPath)) {
            debugLogPath = path.join(__dirname, 'history_debug.log');
        }
        
        if (fs.existsSync(debugLogPath)) {
            try {
                const content = fs.readFileSync(debugLogPath, 'utf8');
                const lines = content.split('\n').filter(l => l.trim().length > 0).slice(-25).join('\n');
                await sendTelegramAlert(`📋 <b>NHẬT KÝ DEBUG CÀO LỊCH SỬ GẦN NHẤT:</b>\n\n<pre>${lines || 'File log trống.'}</pre>`);
            } catch (err) {
                await sendTelegramAlert(`❌ Lỗi đọc file debug log: ${err.message}`);
            }
        } else {
            await sendTelegramAlert(`ℹ️ Chưa có file debug log nào được tạo tại: <code>${debugLogPath}</code>.\nHãy thử chạy /scrape trước.`);
        }
    } 
    else if (command === '/scrape') {
        const dateArg = args[0];
        if (!dateArg) {
            await sendTelegramAlert('⚠️ Vui lòng cung cấp ngày hoặc mã đơn cần cào.\nVí dụ:\n• Cào ngày: <code>/scrape 26</code>\n• Cào đơn cụ thể: <code>/scrape GF-670</code>');
            return;
        }
        
        const { exec } = require('child_process');
        let scriptPath;
        let execCmd;
        const argUpper = dateArg.toUpperCase();
        
        if (argUpper.startsWith('GF-')) {
            scriptPath = path.join(__dirname, 'scratch', 'test_specific_order.js');
            if (!fs.existsSync(scriptPath)) {
                scriptPath = path.join(__dirname, 'test_specific_order.js');
            }
            
            // Tự động tải test_specific_order.js từ GitHub về VPS nếu chưa có
            if (!fs.existsSync(scriptPath)) {
                await sendTelegramAlert(`⏳ Không tìm thấy script cào cưỡng bức trên VPS. Đang tự động tải <code>test_specific_order.js</code> từ GitHub...`);
                const destDir = fs.existsSync(path.join(__dirname, 'scratch')) ? path.join(__dirname, 'scratch') : __dirname;
                scriptPath = path.join(destDir, 'test_specific_order.js');
                
                await new Promise((resolve) => {
                    exec(`curl -L -o "${scriptPath}" https://raw.githubusercontent.com/betafpt/romracaphe/main/scratch/test_specific_order.js`, () => {
                        resolve();
                    });
                });
            }
            
            execCmd = `node "${scriptPath}" ${argUpper}`;
            await sendTelegramAlert(`⏳ <b>[RÔM RẢ BOT]</b> Đang cào cưỡng bức chi tiết đơn hàng <b>${argUpper}</b> ngầm trên VPS... Vui lòng đợi.`);
        } else {
            scriptPath = path.join(__dirname, 'scratch', 'test_history_scrape.js');
            if (!fs.existsSync(scriptPath)) {
                scriptPath = path.join(__dirname, 'test_history_scrape.js');
            }
            execCmd = `node "${scriptPath}" --date ${dateArg}`;
            await sendTelegramAlert(`⏳ <b>[RÔM RẢ BOT]</b> Đang cào đơn lịch sử ngày <b>${dateArg}</b> ngầm trên VPS... Vui lòng đợi trong giây lát.`);
        }
        
        exec(execCmd, async (error, stdout, stderr) => {
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
    else if (command === '/revenue_yesterday') {
        await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tính toán doanh thu hôm qua từ Supabase...');
        try {
            const today = new Date();
            today.setHours(today.getHours() + 7);
            const startOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
            startOfYesterday.setHours(startOfYesterday.getHours() - 7);
            const endOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            endOfYesterday.setHours(endOfYesterday.getHours() - 7);
            
            const { data: orders, error: dbErr } = await supabase
                .from('orders')
                .select('total_amount, platform')
                .gte('created_at', startOfYesterday.toISOString())
                .lt('created_at', endOfYesterday.toISOString());
                
            if (dbErr) throw dbErr;
            
            if (!orders || orders.length === 0) {
                await sendTelegramAlert('📊 <b>DOANH THU HÔM QUA:</b>\nHôm qua không ghi nhận đơn hàng nào trên hệ thống.');
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
            
            const revMsg = `📊 <b>THỐNG KÊ DOANH THU HÔM QUA</b>\n` +
                `<i>(Từ 00:00 đến 23:59 hôm qua)</i>\n\n` +
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
            console.error('Lỗi tính doanh thu hôm qua:', e.message);
            await sendTelegramAlert(`❌ Lỗi truy vấn doanh thu từ DB: ${e.message}`);
        }
    } 
    else if (command === '/revenue_month') {
        await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tính tổng doanh thu tháng này...');
        try {
            const today = new Date();
            today.setHours(today.getHours() + 7);
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            startOfMonth.setHours(startOfMonth.getHours() - 7);
            
            const { data: orders, error: dbErr } = await supabase
                .from('orders')
                .select('total_amount, platform')
                .gte('created_at', startOfMonth.toISOString());
                
            if (dbErr) throw dbErr;
            
            if (!orders || orders.length === 0) {
                await sendTelegramAlert('📊 <b>DOANH THU THÁNG NÀY:</b>\nChưa ghi nhận đơn hàng nào trong tháng.');
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
            
            const monthNames = ["tháng 1", "tháng 2", "tháng 3", "tháng 4", "tháng 5", "tháng 6", "tháng 7", "tháng 8", "tháng 9", "tháng 10", "tháng 11", "tháng 12"];
            const currentMonthName = monthNames[today.getMonth()];
            
            const revMsg = `📊 <b>DOANH THU TÍCH LŨY ${currentMonthName.toUpperCase()}</b>\n` +
                `<i>(Từ ngày 01 đến hiện tại)</i>\n\n` +
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
            console.error('Lỗi tính doanh thu tháng:', e.message);
            await sendTelegramAlert(`❌ Lỗi truy vấn doanh thu từ DB: ${e.message}`);
        }
    }
    else if (command === '/stock') {
        await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang đọc danh sách tồn kho từ Supabase...');
        try {
            const { data: stockItems, error: dbErr } = await supabase
                .from('inventory')
                .select('name, stock, unit')
                .order('name', { ascending: true });
                
            if (dbErr) throw dbErr;
            
            if (!stockItems || stockItems.length === 0) {
                await sendTelegramAlert('📦 <b>TỒN KHO HỆ THỐNG:</b>\nKhông có nguyên liệu nào được lưu trong kho.');
                return;
            }
            
            let stockMsg = `📦 <b>TỒN KHO NGUYÊN LIỆU REALTIME:</b>\n\n`;
            for (const item of stockItems) {
                const stock = parseFloat(item.stock) || 0;
                let warnSign = '';
                
                // Ngưỡng cảnh báo sắp hết nguyên liệu
                if (item.name.includes('Robusta') && stock < 10) warnSign = ' ⚠️ <b>(Sắp hết!)</b>';
                else if (item.name.includes('Arabica') && stock < 5) warnSign = ' ⚠️ <b>(Sắp hết!)</b>';
                else if (item.name.includes('Sữa đặc') && stock < 20) warnSign = ' ⚠️ <b>(Sắp hết!)</b>';
                else if (item.name.includes('Đường') && stock < 5) warnSign = ' ⚠️ <b>(Sắp hết!)</b>';
                else if (stock <= 3) warnSign = ' ⚠️ <b>(Sắp hết!)</b>';
                
                stockMsg += `• ${item.name}: <b>${stock}</b> ${item.unit || ''}${warnSign}\n`;
            }
            await sendTelegramAlert(stockMsg);
        } catch (e) {
            console.error('Lỗi lấy tồn kho:', e.message);
            await sendTelegramAlert(`❌ Lỗi truy vấn kho: ${e.message}`);
        }
    }
    else if (command === '/addstock') {
        const qtyStr = args.pop();
        const qty = parseFloat(qtyStr);
        const nameArg = args.join(' ').replace(/"/g, '').trim();
        
        if (!nameArg || isNaN(qty)) {
            await sendTelegramAlert('⚠️ Vui lòng nhập đúng cú pháp.\nVí dụ: <code>/addstock "Sữa đặc" 24</code>');
            return;
        }
        
        await sendTelegramAlert(`⏳ Đang tìm kiếm và cộng kho nguyên liệu <b>"${nameArg}"</b>...`);
        try {
            const { data: stockItems } = await supabase
                .from('inventory')
                .select('id, name, stock');
                
            let matchedItem = null;
            if (stockItems && stockItems.length > 0) {
                // Thử tìm kiếm khớp chính xác hoặc khớp gần đúng
                matchedItem = stockItems.find(item => item.name.toLowerCase() === nameArg.toLowerCase()) ||
                              stockItems.find(item => item.name.toLowerCase().includes(nameArg.toLowerCase()));
            }
            
            if (!matchedItem) {
                await sendTelegramAlert(`❌ Không tìm thấy nguyên liệu nào khớp gần đúng với tên <b>"${nameArg}"</b>!`);
                return;
            }
            
            const newStock = (parseFloat(matchedItem.stock) || 0) + qty;
            const { error: updateErr } = await supabase
                .from('inventory')
                .update({ stock: newStock })
                .eq('id', matchedItem.id);
                
            if (updateErr) throw updateErr;
            
            // Ghi nhận lịch sử biến động kho
            await supabase.from('inventory_history').insert({
                inventory_id: matchedItem.id,
                action_type: 'TELEGRAM',
                quantity_changed: qty
            }).catch(() => {});
            
            await sendTelegramAlert(`✅ <b>NHẬP KHO THÀNH CÔNG!</b>\n\n• Nguyên liệu: <b>${matchedItem.name}</b>\n• Số lượng vừa cộng: <b>+${qty}</b>\n• Tồn kho mới: <b>${newStock}</b>`);
        } catch (e) {
            console.error('Lỗi cộng kho:', e.message);
            await sendTelegramAlert(`❌ Lỗi cập nhật kho: ${e.message}`);
        }
    }
    else if (command === '/menu') {
        await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tải thực đơn của quán...');
        try {
            const { data: recipes, error: dbErr } = await supabase
                .from('recipes')
                .select('name, size, price, is_sold_out')
                .order('name', { ascending: true });
                
            if (dbErr) throw dbErr;
            
            if (!recipes || recipes.length === 0) {
                await sendTelegramAlert('☕ <b>THỰC ĐƠN DỰ ÁN:</b>\nKhông có món ăn nào được ghi nhận trên database.');
                return;
            }
            
            let menuMsg = `☕ <b>THỰC ĐƠN DỰ ÁN REALTIME:</b>\n\n`;
            for (const r of recipes) {
                const statusStr = r.is_sold_out ? '🔴 <i>(Hết hàng)</i>' : '🟢 <i>(Đang bán)</i>';
                menuMsg += `• ${r.name} (${r.size || 'M'}): <b>${(parseFloat(r.price) || 0).toLocaleString('vi-VN')}đ</b> - ${statusStr}\n`;
            }
            await sendTelegramAlert(menuMsg);
        } catch (e) {
            console.error('Lỗi lấy thực đơn:', e.message);
            await sendTelegramAlert(`❌ Lỗi truy vấn thực đơn: ${e.message}`);
        }
    }
    else if (command === '/toggle_soldout') {
        const nameArg = args.join(' ').replace(/"/g, '').trim();
        if (!nameArg) {
            await sendTelegramAlert('⚠️ Vui lòng cung cấp tên món cần đổi trạng thái.\nVí dụ: <code>/toggle_soldout "Bạc Xỉu"</code>');
            return;
        }
        
        await sendTelegramAlert(`⏳ Đang điều chỉnh trạng thái bán của món <b>"${nameArg}"</b>...`);
        try {
            const { data: recipes } = await supabase
                .from('recipes')
                .select('id, name, is_sold_out');
                
            let matchedRecipe = null;
            if (recipes && recipes.length > 0) {
                matchedRecipe = recipes.find(r => r.name.toLowerCase() === nameArg.toLowerCase()) ||
                                recipes.find(r => r.name.toLowerCase().includes(nameArg.toLowerCase()));
            }
            
            if (!matchedRecipe) {
                await sendTelegramAlert(`❌ Không tìm thấy món ăn nào khớp gần đúng với tên <b>"${nameArg}"</b>!`);
                return;
            }
            
            const newStatus = !matchedRecipe.is_sold_out;
            const { error: updateErr } = await supabase
                .from('recipes')
                .update({ is_sold_out: newStatus })
                .eq('id', matchedRecipe.id);
                
            if (updateErr) throw updateErr;
            
            await sendTelegramAlert(`✅ <b>ĐÃ ĐỔI TRẠNG THÁI MÓN!</b>\n\n• Tên món: <b>${matchedRecipe.name}</b>\n• Trạng thái mới: ${newStatus ? '🔴 <b>Đã chuyển sang HẾT HÀNG (SOLD OUT)</b>' : '🟢 <b>Đã mở bán lại thành công</b>'}`);
        } catch (e) {
            console.error('Lỗi toggle sold out:', e.message);
            await sendTelegramAlert(`❌ Lỗi cập nhật thực đơn: ${e.message}`);
        }
    }
    else if (command === '/screenshot') {
        if (!activePage) {
            await sendTelegramAlert('❌ Trình duyệt quét đơn Playwright hiện đang offline hoặc chưa khởi chạy!');
            return;
        }
        
        await sendTelegramAlert('📸 <b>[RÔM RẢ BOT]</b> Đang tiến hành chụp ảnh màn hình Chromium ngầm thực tế... Vui lòng đợi trong 3 giây.');
        try {
            const screenshotPath = path.join(__dirname, 'screenshot.png');
            // Giảm timeout xuống 5000ms để tránh treo vô hạn nếu trình duyệt bị đơ
            await activePage.screenshot({ path: screenshotPath, timeout: 5000 });
            
            if (fs.existsSync(screenshotPath)) {
                await sendTelegramPhoto(screenshotPath, '📷 Giao diện làm việc thực tế của Grab Portal trên VPS!');
                fs.unlinkSync(screenshotPath); // Xóa file tạm
            } else {
                await sendTelegramAlert('❌ Không thể chụp được màn hình Chromium. Có thể trang đang reload hoặc kẹt mạng.');
            }
        } catch (err) {
            addToLogs(`❌ Lỗi chụp ảnh VPS: ${err.message}`);
            await sendTelegramAlert(`❌ Lỗi chụp ảnh VPS: <code>${err.message}</code>`);
        }
    }
    else if (command === '/update') {
        const target = args[0] ? args[0].toLowerCase() : 'bot';
        const { exec } = require('child_process');
        
        if (target === 'bot') {
            await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tải bản nâng cấp <code>romra_scraper.js</code> mới nhất trực tiếp từ GitHub về VPS...');
            exec('curl -L -o "' + __filename + '" https://raw.githubusercontent.com/betafpt/romracaphe/main/romra_scraper.js', async (error, stdout, stderr) => {
                if (error) {
                    await sendTelegramAlert(`❌ Lỗi cập nhật bot: <code>${error.message}</code>`);
                    return;
                }
                await sendTelegramAlert('✅ <b>CẬP NHẬT THÀNH CÔNG!</b>\nĐang tự động khởi động lại bot chỉ sau 1 giây qua PM2 để áp dụng code mới...');
                setTimeout(() => {
                    process.exit(0); // Thoát tiến trình, PM2 sẽ tự restart bot
                }, 1000);
            });
        } 
        else if (target === 'history') {
            await sendTelegramAlert('⏳ <b>[RÔM RẢ BOT]</b> Đang tải bản nâng cấp script cào đơn lịch sử <code>test_history_scrape.js</code> từ GitHub...');
            let scriptPath = path.join(__dirname, 'scratch', 'test_history_scrape.js');
            if (!fs.existsSync(scriptPath)) {
                scriptPath = path.join(__dirname, 'test_history_scrape.js');
            }
            exec('curl -L -o "' + scriptPath + '" https://raw.githubusercontent.com/betafpt/romracaphe/main/scratch/test_history_scrape.js', async (error, stdout, stderr) => {
                if (error) {
                    await sendTelegramAlert(`❌ Lỗi cập nhật cào lịch sử: <code>${error.message}</code>`);
                    return;
                }
                await sendTelegramAlert(`✅ <b>CẬP NHẬT THÀNH CÔNG!</b>\nĐã tải đè bản cào lịch sử hoàn hảo mới nhất về <code>${scriptPath}</code>.`);
            });
        }
    }
    else if (command === '/cmd') {
        const shellCmd = args.join(' ');
        if (!shellCmd) {
            await sendTelegramAlert('⚠️ Vui lòng nhập lệnh Terminal cần chạy.\nVí dụ: <code>/cmd pm2 status</code>');
            return;
        }
        
        await sendTelegramAlert(`⏳ <b>[RÔM RẢ BOT]</b> Đang thực thi lệnh tối cao trên VPS:\n<code>${shellCmd}</code>...`);
        const { exec } = require('child_process');
        
        // Thêm cấu hình timeout: 15000 (15 giây) để ngăn chặn các lệnh treo vô hạn (như pm2 logs) làm treo bot
        exec(shellCmd, { timeout: 15000 }, async (error, stdout, stderr) => {
            const output = stdout || stderr || (error && error.signal === 'SIGTERM' ? '⚠️ Tiến trình bị hủy do quá thời gian chờ 15s (lệnh chạy vô hạn).' : 'Không có phản hồi đầu ra (Empty output).');
            const formattedOutput = output.length > 3500 ? output.slice(0, 3500) + '\n\n...(Output truncated due to length)...' : output;
            await sendTelegramAlert(`💻 <b>KẾT QUẢ CMD VPS:</b>\n\n<pre>${formattedOutput}</pre>`);
        });
    }
    else {
        await sendTelegramAlert('❓ Lệnh không hợp lệ. Gõ <b>/help</b> để xem các lệnh được hỗ trợ.');
    }
}

async function startTelegramBot() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || (grabConfig && grabConfig.telegram_bot_token);
    const chatId = process.env.TELEGRAM_CHAT_ID || (grabConfig && grabConfig.telegram_chat_id);
    
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

function getGrabRealtimeStatus(order) {
    const state = String(order.state || order.orderState || order.status || order.deliveryStatus || '').toUpperCase();
    const delivery = String(order.deliveryTaskpoolStatus || '').toUpperCase();

    if (state === 'CANCELLED') return 'Đã hủy đơn';
    if (state === 'COMPLETED' || state === 'DELIVERED') return 'Đã giao thành công';
    
    if (delivery === 'ALLOCATING' || delivery === 'UNALLOCATED') {
        return 'Đang tìm tài xế';
    }
    if (delivery === 'ALLOCATED' || delivery === 'ASSIGNED') {
        return 'Tài xế đang đến quán';
    }
    if (delivery === 'ARRIVED') {
        return 'Tài xế đã đến quán';
    }
    if (delivery === 'PICKED_UP' || delivery === 'DELIVERING') {
        return 'Tài xế đang giao hàng';
    }

    if (state === 'ACCEPTED') return 'Đã nhận đơn';
    if (state === 'PREPARING') return 'Đang chuẩn bị món';
    if (state === 'READY') return 'Món ăn đã sẵn sàng';

    return 'Đang xử lý';
}

// --- CÁC HÀM HELPER XỬ LÝ API GRABFOOD (API INTERCEPTION) ---

// Hàm bóc tách đơn hàng thích ứng từ JSON API của Grab (tương thích cả đơn đang chạy và đơn lịch sử)
function parseGrabOrder(order) {
    const shortId = order.shortOrderNumber || order.shortId || order.displayId || order.displayID || order.id || order.ID || 'GF-UNKNOWN';
    const bookingId = order.orderID || order.id || order.ID || order.bookingID || order.bookingCode || shortId;
    const bookingCode = order.bookingCode || order.bookingID || bookingId;
    
    // Tên và SĐT khách hàng
    let eaterName = 'Khách Grab';
    let eaterPhone = 'Không có số';
    
    if (order.eater) {
        eaterName = order.eater.name || eaterName;
        eaterPhone = order.eater.mobileNumber || eaterPhone;
    } else if (order.customer) {
        eaterName = order.customer.name || eaterName;
        eaterPhone = order.customer.mobileNumber || order.customer.phone || eaterPhone;
    } else if (order.customerName) {
        eaterName = order.customerName;
    }
    
    // Tài chế
    let driverName = '';
    let driverPhone = '';
    if (order.driver) {
        driverName = order.driver.name || '';
        driverPhone = order.driver.mobileNumber || order.driver.phone || '';
    }

    // Địa chỉ khách hàng
    let customerAddress = 'Giao qua App';
    if (order.customer && order.customer.address) {
        customerAddress = order.customer.address;
    } else if (order.address) {
        customerAddress = order.address;
    }
    
    // Tài chính
    let totalAmount = 0;
    let subtotalAmount = 0;
    let discountAmount = 0;
    
    if (order.priceDisplay) {
        totalAmount = parseFloat(String(order.priceDisplay).replace(/\./g, '')) || 0;
        subtotalAmount = totalAmount;
    } else if (order.orderEarningsInMinorUnit !== undefined) {
        totalAmount = order.orderEarningsInMinorUnit;
        subtotalAmount = totalAmount;
    } else if (order.price) {
        totalAmount = order.price.total || order.price.totalAmount || 0;
        subtotalAmount = order.price.subtotal || order.price.subtotalAmount || totalAmount;
        discountAmount = order.price.discount || order.price.discountAmount || 0;
    } else if (order.fare) {
        totalAmount = order.fare.priceFloat || (order.fare.totalInCent ? order.fare.totalInCent / 100 : 0) || parseFloat(String(order.fare.totalDisplay || '0').replace(/\./g, '')) || 0;
        subtotalAmount = order.fare.priceFloat || parseFloat(String(order.fare.subTotalDisplay || '0').replace(/\./g, '')) || totalAmount;
        discountAmount = parseFloat(String(order.fare.promotionDisplay || '0').replace(/\./g, '')) || 0;
    } else {
        totalAmount = order.totalAmount || order.total || 0;
        subtotalAmount = order.subtotal || totalAmount;
        discountAmount = order.discount || order.discountAmount || 0;
    }
    
    // Trạng thái đơn hàng
    let status = 'pending'; // mặc định
    const orderState = order.orderState || order.status || order.state || order.deliveryStatus || '';
    const stateStr = String(orderState).toLowerCase();
    if (stateStr.includes('preparing') || stateStr.includes('upcoming') || stateStr.includes('accepted')) {
        status = 'pending';
    } else if (stateStr.includes('shipping') || stateStr.includes('delivering') || stateStr.includes('driver')) {
        status = 'shipping';
    } else if (stateStr.includes('completed') || stateStr.includes('delivered') || stateStr.includes('finished') || stateStr.includes('done')) {
        status = 'completed';
    } else if (stateStr.includes('cancelled') || stateStr.includes('canceled')) {
        status = 'cancelled';
    }

    // Danh sách món ăn
    const itemsList = [];
    const rawItems = order.items || (order.itemInfo && order.itemInfo.items) || [];
    
    for (const item of rawItems) {
        const name = item.name || '';
        const qty = item.quantity || 1;
        
        let price = 0;
        if (item.price !== undefined) {
            price = item.price;
        } else if (item.fare && item.fare.priceFloat !== undefined) {
            price = item.fare.priceFloat;
        }
        
        let note = item.notes || item.note || item.comment || '';
        let optionsStr = '';
        
        if (item.modifiers && item.modifiers.length > 0) {
            optionsStr = item.modifiers.map(m => m.name).join(' | ');
        } else if (item.modifierGroups && item.modifierGroups.length > 0) {
            const mods = [];
            for (const group of item.modifierGroups) {
                if (group.modifiers && group.modifiers.length > 0) {
                    for (const m of group.modifiers) {
                        mods.push(`${group.modifierGroupName}: ${m.modifierName}`);
                    }
                }
            }
            optionsStr = mods.join(' | ');
        }
        
        const fullNote = `${optionsStr} | ${note}`.replace(/^ \| | \| $/g, '').trim();
        
        itemsList.push({
            name: name,
            quantity: qty,
            price: price,
            note: fullNote
        });
    }

    return {
        shortId,
        bookingId,
        bookingCode,
        customerName: eaterName, // Giữ tương thích ngược
        customerAddress,
        eaterName,
        eaterPhone,
        driverName,
        driverPhone,
        totalAmount,
        subtotalAmount,
        discountAmount,
        status,
        items: itemsList
    };
}

// Hàm đồng bộ danh sách đơn hàng GrabFood từ JSON vào Supabase
async function syncGrabOrders(ordersArray, isDetail = false) {
    if (!ordersArray || !Array.isArray(ordersArray) || ordersArray.length === 0) {
        return;
    }

    addToLogs(`📡 Bắt đầu đồng bộ ${ordersArray.length} đơn hàng Grab từ JSON API (Detail: ${isDetail})...`);
    
    let processedCount = 0;
    for (const rawOrder of ordersArray) {
        try {
            const orderData = parseGrabOrder(rawOrder);
            const { shortId, bookingId, customerName, customerAddress, totalAmount, subtotalAmount, discountAmount, status, items } = orderData;

            // Kiểm tra xem đơn hàng đã tồn tại trong database chưa
            const { data: existingOrder, error: checkErr } = await supabase
                .from('orders')
                .select('id, status')
                .eq('external_order_id', bookingId)
                .maybeSingle();

            if (checkErr) {
                addToLogs(`❌ Lỗi kiểm tra database cho đơn ${shortId}: ${checkErr.message}`);
                continue;
            }

            if (existingOrder) {
                // Đơn đã tồn tại -> Cập nhật thông tin tài xế và trạng thái Grab Realtime mới nhất
                const grabRealtimeStatus = getGrabRealtimeStatus(rawOrder);
                
                // Đọc dữ liệu hiện tại từ database để đối soát trước khi cập nhật
                const { data: dbOrder } = await supabase
                    .from('orders')
                    .select('total_amount, raw_payload')
                    .eq('id', existingOrder.id)
                    .maybeSingle();
                
                const dbTotal = dbOrder ? parseFloat(dbOrder.total_amount) : 0;
                const dbPayload = dbOrder?.raw_payload || {};
                
                // Quyết định số tiền cập nhật: Không ghi đè 0 lên số tiền thật đã có
                let finalTotal = totalAmount;
                if (!isDetail && dbTotal > 0 && totalAmount === 0) {
                    finalTotal = dbTotal;
                }
                
                // Quyết định SĐT khách: Không ghi đè "Không có số" lên SĐT thật đã có
                let finalEaterPhone = orderData.eaterPhone || 'Không có số';
                if (!isDetail && dbPayload.eaterPhone && dbPayload.eaterPhone !== 'Không có số' && finalEaterPhone === 'Không có số') {
                    finalEaterPhone = dbPayload.eaterPhone;
                }
                
                // Quyết định SĐT tài xế
                let finalDriverPhone = orderData.driverPhone || '';
                if (!isDetail && dbPayload.driverPhone && finalDriverPhone === '') {
                    finalDriverPhone = dbPayload.driverPhone;
                }

                // Quyết định Tên khách hàng: Không ghi đè "Khách Grab" hoặc "***" lên tên thật đã có
                let finalCustomerName = orderData.customerName || customerName;
                if (!isDetail && dbPayload.customerName && dbPayload.customerName !== 'Khách Grab' && dbPayload.customerName !== '***' && (finalCustomerName === 'Khách Grab' || finalCustomerName === '***')) {
                    finalCustomerName = dbPayload.customerName;
                }

                let finalEaterName = orderData.eaterName || customerName;
                if (!isDetail && dbPayload.eaterName && dbPayload.eaterName !== 'Khách Grab' && dbPayload.eaterName !== '***' && (finalEaterName === 'Khách Grab' || finalEaterName === '***')) {
                    finalEaterName = dbPayload.eaterName;
                }

                const updatedRawPayload = {
                    orderID: bookingId,
                    shortOrderNumber: shortId,
                    bookingCode: orderData.bookingCode || bookingId,
                    customerName: finalCustomerName,
                    customerAddress: customerAddress,
                    eaterName: finalEaterName,
                    eaterPhone: finalEaterPhone,
                    driverName: orderData.driverName || dbPayload.driverName || '',
                    driverPhone: finalDriverPhone,
                    grabStatus: grabRealtimeStatus,
                    subtotal: subtotalAmount > 0 ? subtotalAmount : (dbPayload.subtotal || 0),
                    totalDiscount: discountAmount > 0 ? discountAmount : (dbPayload.totalDiscount || 0),
                    times: rawOrder.times || dbPayload.times || null,
                    createdAt: rawOrder.times ? rawOrder.times.createdAt : (dbPayload.createdAt || null),
                    items: isDetail || !dbPayload.items || dbPayload.items.length === 0 ? items.map(i => {
                        let size = '-';
                        if (i.note && i.note.includes('Size')) {
                            const match = i.note.match(/Size\s*[^:]*:\s*([a-zA-Z0-9]+)/i) || i.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                            if (match) {
                                size = (match[1] || match[0]).trim();
                            }
                        }
                        return {
                            name: i.name,
                            quantity: i.quantity,
                            size: size,
                            note: i.note
                        };
                    }) : dbPayload.items
                };

                // CHỈ cập nhật lại món ăn chi tiết nếu là API Chi tiết (isDetail === true)
                if (isDetail) {
                    addToLogs(`⚡ [API Detail] Tiến hành chèn lại chi tiết món ăn và giá tiền thực tế cho đơn ${shortId}...`);
                    await supabase.from('order_items').delete().eq('order_id', existingOrder.id);
                    for (const item of items) {
                        try {
                            let itemSize = '-';
                            if (item.note && item.note.includes('Size')) {
                                const match = item.note.match(/Size\s*[^:]*:\s*([a-zA-Z0-9]+)/i) || item.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                                if (match) {
                                    itemSize = (match[1] || match[0]).trim().toUpperCase();
                                }
                            }

                            const { data: recipesList, error: recipeErr } = await supabase
                                .from('recipes')
                                .select('id, size')
                                .eq('name', item.name);

                            let recipeId = null;
                            if (!recipeErr && recipesList && recipesList.length > 0) {
                                if (recipesList.length === 1) {
                                    recipeId = recipesList[0].id;
                                } else {
                                    const matched = recipesList.find(r => String(r.size || '').trim().toUpperCase() === itemSize);
                                    recipeId = matched ? matched.id : recipesList[0].id;
                                }
                            }

                            await supabase
                                .from('order_items')
                                .insert({
                                    order_id: existingOrder.id,
                                    recipe_id: recipeId,
                                    quantity: item.quantity,
                                    price: item.price
                                });
                        } catch (itemErr) {
                            addToLogs(`❌ Lỗi khi chèn lại món ${item.name} của đơn ${shortId}: ${itemErr.message}`);
                        }
                    }
                }

                const updatePayload = {
                    total_amount: finalTotal,
                    raw_payload: updatedRawPayload,
                    note: JSON.stringify(updatedRawPayload)
                };

                // Kiểm tra trạng thái POS
                if (existingOrder.status !== status) {
                    addToLogs(`🔄 Cập nhật trạng thái POS đơn ${shortId} (${bookingId}): "${existingOrder.status}" -> "${status}"`);
                    updatePayload.status = status;
                }

                const { error: updateErr } = await supabase
                    .from('orders')
                    .update(updatePayload)
                    .eq('id', existingOrder.id);
                
                if (updateErr) {
                    addToLogs(`❌ Lỗi cập nhật thông tin đơn ${shortId}: ${updateErr.message}`);
                } else {
                    addToLogs(`🎉 Đã cập nhật realtime (Tài xế: "${orderData.driverName || dbPayload.driverName}", Trạng thái: "${grabRealtimeStatus}") cho đơn ${shortId}`);
                }
                continue;
            }

            // Đơn mới chưa tồn tại -> Chèn vào database
            if (!items || items.length === 0) {
                addToLogs(`ℹ️ Bỏ qua chèn đơn mới ${shortId} từ API tóm tắt vì không có chi tiết món ăn.`);
                continue;
            }
            
            addToLogs(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD (API): ${shortId}! Đang chèn vào database...`);
            
            const rawPayload = {
                orderID: bookingId,
                shortOrderNumber: shortId,
                bookingCode: orderData.bookingCode || bookingId,
                customerName: orderData.customerName || customerName,
                customerAddress: customerAddress,
                eaterName: orderData.eaterName || customerName,
                eaterPhone: orderData.eaterPhone || 'Không có số',
                driverName: orderData.driverName || '',
                driverPhone: orderData.driverPhone || '',
                grabStatus: getGrabRealtimeStatus(rawOrder),
                subtotal: subtotalAmount,
                totalDiscount: discountAmount,
                times: rawOrder.times || null,
                createdAt: rawOrder.times ? rawOrder.times.createdAt : null,
                items: items.map(i => {
                    let size = '-';
                    if (i.note && i.note.includes('Size')) {
                        const match = i.note.match(/Size\s*[^:]*:\s*([a-zA-Z0-9]+)/i) || i.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                        if (match) {
                            size = (match[1] || match[0]).trim();
                        }
                    }
                    return {
                        name: i.name,
                        quantity: i.quantity,
                        size: size,
                        note: i.note
                    };
                })
            };

            const { data: insertedOrder, error: insertErr } = await supabase
                .from('orders')
                .insert({
                    payment_method: 'grab_pay',
                    total_amount: totalAmount,
                    status: status,
                    platform: 'grab',
                    external_order_id: bookingId,
                    external_short_id: shortId,
                    raw_payload: rawPayload,
                    note: JSON.stringify(rawPayload)
                })
                .select()
                .single();

            if (insertErr) {
                addToLogs(`❌ Lỗi khi chèn đơn mới ${shortId} vào database: ${insertErr.message}`);
                continue;
            }

            addToLogs(`🎉 Đã chèn đơn hàng ${shortId} thành công! ID Đơn POS: ${insertedOrder.id}`);
            sessionScrapedCount++;
            processedCount++;

            // Chèn các món ăn chi tiết
            let calculatedTotal = 0;
            const updatedPayloadItems = [];

            for (const item of items) {
                try {
                    // Bóc tách size từ note của món ăn để so khớp chính xác trong recipes
                    let itemSize = '-';
                    if (item.note && item.note.includes('Size')) {
                        const match = item.note.match(/Size\s*[^:]*:\s*([a-zA-Z0-9]+)/i) || item.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                        if (match) {
                            itemSize = (match[1] || match[0]).trim().toUpperCase();
                        }
                    }

                    // Lấy tất cả các món ăn khớp tên (lấy thêm price để áp giá tạm tính)
                    const { data: recipesList, error: recipeErr } = await supabase
                        .from('recipes')
                        .select('id, size, price')
                        .eq('name', item.name);

                    let recipeId = null;
                    let recipePrice = 0;
                    if (!recipeErr && recipesList && recipesList.length > 0) {
                        let matched = recipesList[0];
                        if (recipesList.length > 1) {
                            const found = recipesList.find(r => String(r.size || '').trim().toUpperCase() === itemSize);
                            if (found) matched = found;
                        }
                        recipeId = matched.id;
                        recipePrice = parseFloat(matched.price) || 0;
                    }

                    // Áp giá thực tế từ thực đơn nếu giá cào từ API danh sách bằng 0
                    const finalPrice = item.price > 0 ? item.price : (recipePrice || 35000);
                    calculatedTotal += finalPrice * item.quantity;

                    updatedPayloadItems.push({
                        name: item.name,
                        quantity: item.quantity,
                        size: itemSize !== '-' ? itemSize : (recipesList && recipesList[0] ? recipesList[0].size || '-' : '-'),
                        note: item.note || '',
                        price: finalPrice
                    });

                    await supabase
                        .from('order_items')
                        .insert({
                            order_id: insertedOrder.id,
                            recipe_id: recipeId,
                            quantity: item.quantity,
                            price: finalPrice
                        });
                } catch (itemErr) {
                    addToLogs(`❌ Lỗi khi chèn món ${item.name} của đơn ${shortId}: ${itemErr.message}`);
                }
            }

            // Nếu đơn cào ban đầu bị 0đ, tự động cập nhật lại tổng tiền thực tế từ thực đơn recipes
            if (totalAmount === 0 && calculatedTotal > 0) {
                addToLogs(`⚡ [Auto Price Recovery] Tính toán lại tổng tiền cho đơn mới ${shortId}: ${calculatedTotal}đ. Đang cập nhật database...`);
                
                const finalRawPayload = {
                    ...rawPayload,
                    subtotal: calculatedTotal,
                    items: updatedPayloadItems
                };

                const { error: recoveryErr } = await supabase
                    .from('orders')
                    .update({
                        total_amount: calculatedTotal,
                        raw_payload: finalRawPayload,
                        note: JSON.stringify(finalRawPayload)
                    })
                    .eq('id', insertedOrder.id);
                
                if (recoveryErr) {
                    addToLogs(`❌ Lỗi cập nhật giá tự động cho đơn ${shortId}: ${recoveryErr.message}`);
                }
            }

            addToLogs(`Đơn hàng ${shortId} đã sẵn sàng trên Web POS.`);

        } catch (orderErr) {
            addToLogs(`❌ Lỗi xử lý một đơn hàng trong mảng API: ${orderErr.message}`);
        }
    }
    if (processedCount > 0) {
        addToLogs(`✅ Hoàn thành đồng bộ ${processedCount} đơn hàng mới!`);
    }
}

// Thiết lập lắng nghe lệnh tương tác từ Web POS qua Supabase Realtime
function setupBotCommandsListener(page) {
    addToLogs('📡 Đang thiết lập kênh lắng nghe lệnh Realtime từ POS...');
    
    // Hủy channel cũ nếu có để tránh trùng lặp
    try {
        supabase.removeAllChannels();
    } catch(e) {}

    supabase.channel('grab-bot-commands')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'bot_commands' 
        }, async (payload) => {
            const cmd = payload.new;
            if (cmd && cmd.status === 'pending') {
                addToLogs(`📣 Nhận được lệnh mới từ Web POS: ${cmd.command_type} cho đơn ${cmd.short_id}`);
                await executeBotCommand(cmd, page);
            }
        })
        .subscribe((status) => {
            addToLogs(`🔌 Trạng thái kết nối kênh lệnh Realtime: ${status}`);
        });
}

// Thiết lập lắng nghe phản hồi API của Grab ngầm
function setupPageResponseListener(pageInstance) {
    pageInstance.on('response', async response => {
        try {
            const url = response.url();
            const status = response.status();
            
            // Debug mọi request API Grab nhận được để phát hiện chính xác URL ở local
            if (url.includes('api.grab.com') || url.includes('merchant') || url.includes('orders') || url.includes('paginator')) {
                addToLogs(`🔍 [API DEBUG] Bắt URL: ${url.substring(0, 150)}... | Status: ${status}`);
            }
            
            // 1. Lắng nghe API danh sách đơn hàng Grab (Active & Lịch sử) - Hỗ trợ cả daily-pagination mới
            if (url.includes('/orders-pagination') || url.includes('/api/order/v1/orders') || url.includes('/api/merchant/v1/orders') || url.includes('daily-paginator') || url.includes('daily-pagination') || url.includes('/reports/daily-pagination')) {
                if (status === 200) {
                    try {
                        const headers = response.headers();
                        const contentType = headers['content-type'] || headers['Content-Type'] || '';
                        if (contentType.includes('application/json')) {
                            const json = await response.json();
                            
                            let ordersArray = [];
                            
                            if (json.orders && Array.isArray(json.orders)) {
                                ordersArray = json.orders;
                            } else if (Array.isArray(json)) {
                                ordersArray = json;
                            } else if (json.data && Array.isArray(json.data)) {
                                ordersArray = json.data;
                            } else if (json.data && json.data.orders && Array.isArray(json.data.orders)) {
                                ordersArray = json.data.orders;
                            } else if (json.dailyReport && Array.isArray(json.dailyReport.orders)) {
                                ordersArray = json.dailyReport.orders;
                            } else if (json.dailyReport && Array.isArray(json.dailyReport)) {
                                ordersArray = json.dailyReport;
                            } else if (json.statements && Array.isArray(json.statements)) {
                                ordersArray = json.statements;
                            }
                            
                            if (ordersArray.length > 0) {
                                addToLogs(`📡 [API Intercept] Bắt được danh sách đơn hàng: ${url.split('?')[0]} | Số lượng: ${ordersArray.length} đơn`);
                                syncGrabOrders(ordersArray, false).catch(err => {
                                    addToLogs(`❌ Lỗi đồng bộ danh sách đơn từ API: ${err.message}`);
                                });
                            }
                        }
                    } catch (jsonErr) {
                        addToLogs(`⚠️ Lỗi parse JSON danh sách đơn hàng: ${jsonErr.message}`);
                    }
                }
            }
            
            // 2. Lắng nghe API CHI TIẾT đơn hàng (Chứa 100% Tên và SĐT thật của khách hàng & tài xế)
            // Hỗ trợ tổng quát cho cả v3, v4 và các phiên bản tương lai của Grab API
            if (url.includes('/orders/') && !url.includes('pagination') && !url.includes('paginator') && !url.includes('history') && !url.includes('summary')) {
                if (status === 200) {
                    try {
                        const headers = response.headers();
                        const contentType = headers['content-type'] || headers['Content-Type'] || '';
                        if (contentType.includes('application/json')) {
                            const json = await response.json();
                            if (json.order) {
                                addToLogs(`📡 [API Intercept] Bắt được chi tiết đơn hàng ${json.order.displayID || json.order.orderID} chứa Tên & SĐT thật!`);
                                syncGrabOrders([json.order], true).catch(err => {
                                    addToLogs(`❌ Lỗi đồng bộ chi tiết đơn từ API: ${err.message}`);
                                });
                            }
                        }
                    } catch (jsonErr) {
                        addToLogs(`⚠️ Lỗi parse JSON chi tiết đơn hàng: ${jsonErr.message}`);
                    }
                }
            }
        } catch (e) {
            addToLogs(`❌ Lỗi trong page.on('response'): ${e.message}`);
        }
    });
}

async function dismissWelcomeTour(page) {
    try {
        const closeTourBtn = page.getByRole('button', { name: 'Đóng', exact: true })
            .or(page.getByRole('button', { name: 'Close', exact: true }))
            .filter({ visible: true })
            .first();
        if (await closeTourBtn.count() > 0) {
            addToLogs('🎯 [Playwright] Phát hiện popup chào mừng (Welcome Tour). Đang click "Đóng" để tắt...');
            await closeTourBtn.click();
            await page.waitForTimeout(2000);
        }
    } catch (e) {
        addToLogs(`⚠️ Lỗi khi tắt popup chào mừng: ${e.message}`);
    }
}

// Khởi tạo trình duyệt Playwright ngầm và đăng nhập Grab
async function initPlaywright() {
    addToLogs('🌐 Đang khởi tạo trình duyệt Playwright ngầm...');
    
    // Đảm bảo session cookie tồn tại
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
                throw new Error('Tự động đăng nhập ngầm khởi tạo thất bại');
            }
            await tempBrowser.close();
        } else {
            addToLogs('❌ KHÔNG TÌM THẤY PHIÊN ĐĂNG NHẬP VÀ CẤU HÌNH TÀI KHOẢN!');
            throw new Error('Chưa cấu hình phiên đăng nhập hoặc tài khoản Grab');
        }
    }

    const browserInstance = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const contextInstance = await browserInstance.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const pageInstance = await contextInstance.newPage();
    
    try {
        addToLogs('Đang truy cập trang Quản lý đơn hàng Grab Merchant...');
        await pageInstance.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await pageInstance.waitForTimeout(5000);
        await dismissWelcomeTour(pageInstance);
        
        if (pageInstance.url().includes('login') || pageInstance.url().includes('auth')) {
            addToLogs('⚠️ Phát hiện phiên đăng nhập (Session Cookie) của Grab đã hết hạn!');
            if (grabConfig && grabConfig.username && grabConfig.password) {
                addToLogs('🔐 Đang tiến hành tự động gia hạn đăng nhập ngầm bằng tài khoản...');
                
                await contextInstance.clearCookies().catch(() => {});
                await pageInstance.evaluate(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                }).catch(() => {});

                const loginSuccess = await autoLoginGrab(pageInstance, grabConfig);
                if (loginSuccess) {
                    await contextInstance.storageState({ path: STORAGE_STATE });
                    addToLogs('💾 Đã gia hạn và lưu session tự động đăng nhập thành công!');
                    await pageInstance.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await pageInstance.waitForTimeout(5000);
                } else {
                    const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nTự động gia hạn đăng nhập ngầm thất bại! Vui lòng kiểm tra lại tài khoản mật khẩu.';
                    await sendTelegramAlert(errorMsg);
                    await browserInstance.close();
                    throw new Error('Gia hạn đăng nhập tự động thất bại');
                }
            } else {
                const errorMsg = '❌ <b>[RÔM RẢ BOT] CẢNH BÁO KHẨN CẤP:</b>\nPhiên đăng nhập Grab Merchant đã hết hạn! Bot quét đơn đã dừng hoạt động.\nVui lòng truy cập VPS và chạy lại lệnh <code>node romra_scraper.js --login</code> để đăng nhập lại.';
                addToLogs('❌ PHIÊN ĐĂNG NHẬP ĐÃ HẾT HẠN!');
                await sendTelegramAlert(errorMsg);
                await browserInstance.close();
                throw new Error('Phiên đăng nhập hết hạn và thiếu grab_config.json');
            }
        }
        addToLogs('✅ Truy cập thành công. Bắt đầu theo dõi đơn hàng...');

        // Đăng ký các listener
        setupBotCommandsListener(pageInstance);
        setupPageResponseListener(pageInstance);

        return { browser: browserInstance, context: contextInstance, page: pageInstance };
    } catch (err) {
        addToLogs(`❌ Lỗi khi tải trang hoặc khởi tạo: ${err.message}`);
        await browserInstance.close().catch(() => {});
        throw err;
    }
}

// Hàm thực thi lệnh giả lập Playwright từ POS gửi xuống
async function executeBotCommand(cmd, page) {
    const { id, booking_id, short_id, command_type, payload } = cmd;
    addToLogs(`⚙️ Bắt đầu thực thi lệnh ${command_type} cho đơn ${short_id || booking_id}...`);
    
    // 1. Cập nhật trạng thái thành processing
    await supabase.from('bot_commands').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id);
    
    try {
        // 2. Định vị đơn hàng trên UI
        // Chúng ta cần tìm thẻ đơn hàng có chứa mã đơn ngắn (ví dụ GF-557 hoặc #GF-557)
        let orderSelector = '';
        if (short_id) {
            orderSelector = `text="${short_id}"`;
        } else {
            orderSelector = `text="${booking_id.substring(0, 8)}"` ; // Dự phòng
        }
        
        addToLogs(`🔍 Đang tìm đơn hàng trên màn hình: ${orderSelector}`);
        
        // Thử tìm thẻ đơn hàng dựa trên text mã đơn
        const orderCard = page.locator(orderSelector).locator('..').locator('..').first();
        const cardCount = await orderCard.count().catch(() => 0);
        
        if (cardCount === 0) {
            throw new Error(`Không tìm thấy thẻ đơn hàng trên màn hình cho mã đơn: ${short_id}`);
        }
        
        addToLogs(`🔘 Đã tìm thấy thẻ đơn hàng. Click để mở chi tiết đơn hàng...`);
        await orderCard.click();
        await page.waitForTimeout(3000); // Chờ 3 giây để Details Panel load
        
        // 3. Thực thi hành động cụ thể
        if (command_type === 'ACCEPT') {
            addToLogs(`👉 Thực hiện lệnh CHẤP NHẬN ĐƠN (ACCEPT)...`);
            
            // Tìm nút Xác nhận/Chấp nhận/Nhận đơn
            const acceptBtn = page.locator('button:has-text("Xác nhận"), button:has-text("Nhận đơn"), button:has-text("Accept"), button:has-text("Accept order")').filter({ visible: true }).first();
            const btnCount = await acceptBtn.count().catch(() => 0);
            
            if (btnCount === 0) {
                throw new Error("Không tìm thấy nút Xác nhận (Accept) trên Details Panel. Có thể đơn đã được xác nhận trước đó.");
            }
            
            await acceptBtn.click();
            addToLogs('🔘 Đã click nút Xác nhận. Chờ xác nhận popup nếu có...');
            await page.waitForTimeout(2000);
            
            // Nếu có popup xác nhận thời gian (Ví dụ nút "Xác nhận", "Confirm", "Tiếp tục" trong popup thời gian)
            const confirmPopupBtn = page.locator('button:has-text("Xác nhận"), button:has-text("Confirm"), button:has-text("Đồng ý"), button:has-text("Tiếp tục")').filter({ visible: true });
            const popupCount = await confirmPopupBtn.count().catch(() => 0);
            if (popupCount > 0) {
                addToLogs('🔘 Phát hiện popup xác nhận thời gian. Click xác nhận...');
                await confirmPopupBtn.first().click();
                await page.waitForTimeout(3000);
            }
            
        } else if (command_type === 'CANCEL') {
            addToLogs(`👉 Thực hiện lệnh HỦY ĐƠN (CANCEL)...`);
            
            // Tìm nút Hủy đơn/Từ chối
            const cancelBtn = page.locator('button:has-text("Từ chối"), button:has-text("Hủy đơn"), button:has-text("Cancel"), button:has-text("Reject"), button:has-text("Decline")').filter({ visible: true }).first();
            const btnCount = await cancelBtn.count().catch(() => 0);
            
            if (btnCount === 0) {
                throw new Error("Không tìm thấy nút Từ chối/Hủy đơn trên Details Panel.");
            }
            
            await cancelBtn.click();
            addToLogs('🔘 Đã click nút Hủy đơn. Chờ popup chọn lý do hủy...');
            await page.waitForTimeout(2500);
            
            // Chọn lý do hủy đơn (Radio button đầu tiên hoặc lý do chỉ định)
            const radioOption = page.locator('input[type="radio"], .dui-radio, text="Hết món", text="Hết nguyên liệu", text="Quán đóng cửa"').first();
            await radioOption.click();
            addToLogs('🔘 Đã chọn lý do hủy đơn.');
            await page.waitForTimeout(1000);
            
            // Click nút xác nhận hủy cuối cùng trong popup
            const confirmCancelBtn = page.locator('button:has-text("Hủy đơn"), button:has-text("Xác nhận hủy"), button:has-text("Xác nhận từ chối"), button:has-text("Confirm cancel"), button:has-text("Confirm reject")').filter({ visible: true }).first();
            await confirmCancelBtn.click();
            addToLogs('🔘 Đã click xác nhận hủy đơn hoàn tất.');
            await page.waitForTimeout(4000);
            
        } else if (command_type === 'CHANGE_PREP_TIME') {
            const minutes = payload.minutes || 10;
            addToLogs(`👉 Thực hiện lệnh TĂNG THỜI GIAN CHUẨN BỊ (CHANGE_PREP_TIME) thêm ${minutes} phút...`);
            
            // Tìm nút sửa/tăng thời gian chuẩn bị món (Ví dụ: nút "Tăng thời gian", "Sửa thời gian", hoặc nút "+" / "Edit")
            const editTimeBtn = page.locator('button:has-text("Tăng thời gian"), button:has-text("Sửa thời gian"), button:has-text("Edit time"), button:has-text("Prep time")').filter({ visible: true }).first();
            const btnCount = await editTimeBtn.count().catch(() => 0);
            
            if (btnCount === 0) {
                throw new Error("Không tìm thấy nút Tăng/Sửa thời gian trên Details Panel.");
            }
            
            await editTimeBtn.click();
            await page.waitForTimeout(2000);
            
            // Chọn thời gian tăng thêm (thường là click vào nút + hoặc chọn option)
            const plusBtn = page.locator('button:has-text("+"), button:has-text("+ 5"), button:has-text("+ 10")').first();
            await plusBtn.click();
            await page.waitForTimeout(1000);
            
            // Bấm nút lưu lại
            const saveTimeBtn = page.locator('button:has-text("Xác nhận"), button:has-text("Lưu"), button:has-text("Save"), button:has-text("Confirm")').filter({ visible: true }).first();
            await saveTimeBtn.click();
            addToLogs('🔘 Đã click xác nhận tăng thời gian thành công.');
            await page.waitForTimeout(3000);
        } else {
            throw new Error(`Loại lệnh không hỗ trợ: ${command_type}`);
        }
        
        // 4. Chụp ảnh màn hình làm bằng chứng
        const screenshotDir = path.join(__dirname, 'scratch');
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
        const screenshotPath = path.join(screenshotDir, `grab_action_${id}.png`);
        await page.screenshot({ path: screenshotPath });
        
        // 5. Cập nhật DB thành success
        await supabase.from('bot_commands').update({ status: 'success', updated_at: new Date().toISOString() }).eq('id', id);
        addToLogs(`🎉 Thực thi lệnh ${command_type} cho đơn ${short_id} THÀNH CÔNG!`);
        
        // 6. Gửi báo cáo kèm screenshot qua Telegram cho chủ quán
        const caption = `✅ <b>[GRAB BOT COMMAND SUCCESS]</b>\n\n• Loại lệnh: <code>${command_type}</code>\n• Mã đơn: <b>${short_id || 'N/A'}</b>\n• ID ngoại sàn: <code>${booking_id}</code>\n• Trạng thái: <b>THÀNH CÔNG</b>`;
        await sendTelegramPhoto(screenshotPath, caption);
        
        // Reload lại trang sau 3 giây để cập nhật lại danh sách sạch sẽ
        setTimeout(async () => {
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        }, 3000);

    } catch (err) {
        addToLogs(`❌ Thực thi lệnh ${command_type} thất bại: ${err.message}`);
        
        // Cập nhật DB thành failed kèm error_message
        await supabase.from('bot_commands').update({ 
            status: 'failed', 
            error_message: err.message,
            updated_at: new Date().toISOString() 
        }).eq('id', id);
        
        // Chụp ảnh màn hình lỗi
        try {
            const screenshotDir = path.join(__dirname, 'scratch');
            const screenshotPath = path.join(screenshotDir, `grab_error_${id}.png`);
            await page.screenshot({ path: screenshotPath });
            
            const caption = `❌ <b>[GRAB BOT COMMAND FAILED]</b>\n\n• Loại lệnh: <code>${command_type}</code>\n• Mã đơn: <b>${short_id || 'N/A'}</b>\n• Lỗi: <code>${err.message}</code>\n• Trạng thái: <b>THẤT BẠI</b>`;
            await sendTelegramPhoto(screenshotPath, caption);
        } catch (screenErr) {
            console.error("Lỗi chụp ảnh lỗi:", screenErr);
            // Gửi alert text nếu chụp ảnh lỗi thất bại
            await sendTelegramAlert(`❌ <b>[GRAB BOT COMMAND FAILED]</b>\n\n• Loại lệnh: <code>${command_type}</code>\n• Mã đơn: <b>${short_id || 'N/A'}</b>\n• Lỗi: <code>${err.message}</code>`);
        }
    }
}

// Hàm tự động chuyển tab Lịch sử ngầm để trigger gọi API lịch sử ngày hôm nay
async function triggerHistorySync(page) {
    addToLogs('🔄 [Realtime Status Sync] Đang chuyển sang tab Lịch sử để đồng bộ trạng thái đơn hàng...');
    
    const historyTabSelectors = [
        'text="Lịch sử đơn hàng"',
        'text="Lịch sử"',
        'text="Order History"',
        'text="History"',
        'a[href*="history"]',
        'button:has-text("Lịch sử")',
        'button:has-text("History")'
    ];
    
    let foundTab = false;
    for (const selector of historyTabSelectors) {
        try {
            const tab = page.locator(selector).filter({ visible: true }).first();
            if (await tab.count() > 0) {
                addToLogs(`🔘 Click tab Lịch sử bằng selector: ${selector}`);
                await tab.click();
                foundTab = true;
                break;
            }
        } catch (err) {}
    }

    if (!foundTab) {
        // Fallback điều hướng trực tiếp bằng URL nếu không click được tab Lịch sử trên UI
        addToLogs('⚠️ Không tìm thấy nút tab Lịch sử bằng click. Tiến hành điều hướng trực tiếp qua URL...');
        try {
            await page.goto('https://merchant.grab.com/order/history', { waitUntil: 'domcontentloaded', timeout: 30000 });
            foundTab = true;
        } catch (gotoErr) {
            addToLogs(`❌ Điều hướng trực tiếp sang Lịch sử thất bại: ${gotoErr.message}`);
            return;
        }
    }

    // Chờ 5 giây để API Lịch sử tải xong và hệ thống tự động bắt API đồng bộ
    await page.waitForTimeout(5000);

    addToLogs('🔄 [Realtime Status Sync] Đang click quay trở lại tab Đang hoạt động...');
    const activeTabSelectors = [
        'text="Đơn hàng đang hoạt động"',
        'text="Đang hoạt động"',
        'text="Active orders"',
        'text="Active"',
        'button:has-text("Đang hoạt động")',
        'button:has-text("Active")'
    ];

    let foundActiveTab = false;
    for (const selector of activeTabSelectors) {
        try {
            const tab = page.locator(selector).filter({ visible: true }).first();
            if (await tab.count() > 0) {
                addToLogs(`🔘 Click tab Đang hoạt động bằng selector: ${selector}`);
                await tab.click();
                foundActiveTab = true;
                break;
            }
        } catch (err) {}
    }

    if (!foundActiveTab) {
        // Fallback quay lại trang Đang hoạt động trực tiếp bằng URL
        addToLogs('⚠️ Không tìm thấy nút tab Đang hoạt động để quay lại. Đang điều hướng trực tiếp bằng URL...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    } else {
        await page.waitForTimeout(2000);
    }
}

// Hàm click tuần tự các thẻ đơn hàng hiển thị trên tab hiện tại để kích hoạt API chi tiết
async function clickVisibleOrderCards(page) {
    try {
        // Định vị các thẻ đơn hàng thực tế thông qua regex mã đơn ngắn (ví dụ: GF-570 hoặc các mã ngắn có gạch ngang)
        const cards = page.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').locator('..').locator('..');
        const count = await cards.count().catch(() => 0);
        
        if (count > 0) {
            addToLogs(`🔘 Phát hiện ${count} thẻ đơn hàng trên tab hiện tại. Tiến hành click tuần tự...`);
            for (let i = 0; i < count; i++) {
                await cards.nth(i).click().catch(() => {});
                await page.waitForTimeout(2000); // Chờ 2 giây để API chi tiết tải xong và bot bắt được response
            }
            return count;
        } else {
            addToLogs('ℹ️ Hiện tại không có thẻ đơn hàng nào hiển thị trên tab hiện tại.');
            return 0;
        }
    } catch (err) {
        addToLogs(`⚠️ Lỗi khi click thẻ đơn hàng để trigger API: ${err.message}`);
        return 0;
    }
}

// Hàm chuyển đổi sang tab "Sắp tới" (Upcoming / Đơn mới)
async function switchToUpcomingTab(page) {
    const upcomingTabSelectors = [
        'text="Sắp tới"',
        'text="Upcoming"',
        'text="Đơn mới"',
        'text="New orders"',
        'text="New"',
        'button:has-text("Sắp tới")',
        'button:has-text("Upcoming")',
        'button:has-text("Đơn mới")'
    ];
    
    for (const selector of upcomingTabSelectors) {
        try {
            const tab = page.locator(selector).filter({ visible: true }).first();
            if (await tab.count() > 0) {
                addToLogs(`🔘 Chuyển sang tab Sắp tới bằng selector: ${selector}`);
                await tab.click();
                return true;
            }
        } catch (err) {}
    }
    return false;
}

// Hàm chuyển đổi sang tab "Đang hoạt động" (Active / Đang chuẩn bị)
async function switchToActiveTab(page) {
    const activeTabSelectors = [
        'text="Đơn hàng đang hoạt động"',
        'text="Đang hoạt động"',
        'text="Active orders"',
        'text="Active"',
        'button:has-text("Đang hoạt động")',
        'button:has-text("Active")'
    ];
    
    for (const selector of activeTabSelectors) {
        try {
            const tab = page.locator(selector).filter({ visible: true }).first();
            if (await tab.count() > 0) {
                addToLogs(`🔘 Chuyển sang tab Đang hoạt động bằng selector: ${selector}`);
                await tab.click();
                return true;
            }
        } catch (err) {}
    }
    return false;
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
            // Chờ URL chuyển hướng chính xác (chứa dashboard hoặc order thực tế, loại trừ trang portal gốc và trang login)
            await page.waitForURL(url => {
                const href = url.href;
                return href.includes('dashboard') || href.includes('/order');
            }, { timeout: 150000 });
            console.log('🎉 Phát hiện đăng nhập thành công!');
        } catch (e) {
            console.log('Đang chờ hết thời gian thao tác thủ công...');
            await page.waitForTimeout(10000);
        }
        
        await page.waitForTimeout(5000);
        await context.storageState({ path: STORAGE_STATE });
        console.log('💾 Đã lưu session thành công vào file:', STORAGE_STATE);
        await browser.close();
        process.exit(0);
    }

    // --- CHẾ ĐỘ CHẠY QUÉT ĐƠN 24/7 ---
    addToLogs('🚀 [BOT MODE] Bắt đầu khởi động Bot quét đơn Grab 24/7...');
    
    // Kiểm tra xem có nên bật chế độ ngủ đêm ngay lập tức không (khi bot start trong khung giờ ngủ)
    const initHour = getVietnamHour();
    if (initHour >= 23 || initHour < 6) {
        isBotSleeping = true;
        addToLogs('💤 Đang trong khoảng thời gian nghỉ đêm (23:00 - 06:00). Bot sẽ khởi động ở chế độ ngủ (Sleep Mode)...');
        await sendTelegramAlert('🤖 <b>[RÔM RẢ BOT]</b> Bot vừa được khởi động lại nhưng đang trong khung giờ nghỉ đêm (23:00 - 06:00). Trạng thái ngủ 💤 đã được bật để tiết kiệm tài nguyên VPS.');
    } else {
        try {
            const instances = await initPlaywright();
            globalBrowser = instances.browser;
            globalContext = instances.context;
            activePage = instances.page;
        } catch (e) {
            addToLogs(`❌ Khởi tạo bot thất bại: ${e.message}. Bot sẽ thử khởi tạo lại ở chu kỳ quét tiếp theo.`);
        }
    }

    // Khởi chạy Telegram Bot điều khiển 2 chiều ngầm song song
    await startTelegramBot();

    // Chạy quét đơn định kỳ mỗi 20 giây
    setInterval(async () => {
        try {
            const localHour = getVietnamHour();
            const shouldSleep = (localHour >= 23 || localHour < 6);

            if (shouldSleep) {
                // CHẾ ĐỘ NGỦ ĐÊM
                if (!isBotSleeping) {
                    isBotSleeping = true;
                    addToLogs('💤 [Sleep Mode] Đến giờ nghỉ đêm (23:00 - 06:00). Đang đóng trình duyệt ngầm Playwright...');
                    if (globalBrowser) {
                        await globalBrowser.close().catch(e => addToLogs(`⚠️ Lỗi khi đóng browser: ${e.message}`));
                        globalBrowser = null;
                        globalContext = null;
                        activePage = null;
                    }
                    await sendTelegramAlert('🤖 <b>[RÔM RẢ BOT]</b> Đã chuyển sang chế độ ngủ đêm an toàn (23:00 - 06:00) 💤\n• Trình duyệt Playwright đã đóng để giải phóng RAM & CPU VPS.\n• Tài khoản Grab được bảo vệ tránh quét hoạt động 24/7.');
                }
                // Trong khi ngủ, bỏ qua hoàn toàn các thao tác quét đơn
                return;
            } else {
                // CHẾ ĐỘ THỨC GIẤC & QUÉT ĐƠN BÌNH THƯỜNG
                if (isBotSleeping) {
                    isBotSleeping = false;
                    addToLogs('☀️ [Wake Up] Đã đến 06:00 sáng. Đang đánh thức bot quét đơn Grab...');
                    await sendTelegramAlert('🤖 <b>[RÔM RẢ BOT]</b> Chào buổi sáng! Đã đến 06:00 sáng, Bot đang tự động thức dậy... ☀️\n• Đang khởi động lại trình duyệt ngầm Playwright...\n• Tự động khôi phục phiên đăng nhập và tiếp tục quét đơn Grab.');
                    
                    try {
                        const instances = await initPlaywright();
                        globalBrowser = instances.browser;
                        globalContext = instances.context;
                        activePage = instances.page;
                    } catch (e) {
                        addToLogs(`❌ Không thể đánh thức trình duyệt: ${e.message}. Sẽ thử lại ở chu kỳ tiếp theo.`);
                        isBotSleeping = true; // Set lại là sleeping để chu kỳ sau chạy lại logic đánh thức
                        return;
                    }
                }

                // Nếu vì lý do gì đó trình duyệt chưa được khởi tạo (ví dụ khởi động bot lúc có lỗi mạng)
                if (!globalBrowser || !activePage) {
                    addToLogs('⚠️ Phát hiện trình duyệt chưa được khởi tạo. Đang tiến hành khởi tạo lại...');
                    try {
                        const instances = await initPlaywright();
                        globalBrowser = instances.browser;
                        globalContext = instances.context;
                        activePage = instances.page;
                    } catch (e) {
                        addToLogs(`❌ Khởi tạo lại trình duyệt thất bại: ${e.message}. Sẽ thử lại ở chu kỳ tiếp theo.`);
                        return;
                    }
                }

                // Thực hiện quét đơn hàng bình thường
                const page = activePage;
                const context = globalContext;

                lastScanTime = new Date().toLocaleTimeString('vi-VN');
                lastPageUrl = page.url();
                
                // Kiểm tra xem bot có bị đá về trang đăng nhập ngầm không
                if (lastPageUrl.includes('/login') || lastPageUrl.includes('/auth')) {
                    addToLogs('⚠️ Phát hiện phiên làm việc hết hạn (bị đá về trang Login)! Đang tự động đăng nhập ngầm lại...');
                    if (grabConfig && grabConfig.username && grabConfig.password) {
                        const loginSuccess = await autoLoginGrab(page, grabConfig);
                        if (loginSuccess) {
                            await context.storageState({ path: STORAGE_STATE });
                            addToLogs('💾 Đã gia hạn session tự động thành công sau khi bị logout ngầm!');
                            await page.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForTimeout(5000);
                            await dismissWelcomeTour(page);
                            lastPageUrl = page.url(); // Cập nhật lại URL
                        } else {
                            addToLogs('❌ Tự động đăng nhập ngầm lại thất bại. Sẽ thử lại ở chu kỳ tiếp theo.');
                            return;
                        }
                    } else {
                        addToLogs('❌ Không thể tự động đăng nhập lại do thiếu cấu hình tài khoản/mật khẩu.');
                        return;
                    }
                }
                
                // Chỉ reload trang sau mỗi 15 chu kỳ quét (~ 3 phút một lần) để tránh Target crashed và tiết kiệm CPU
                if (scanCycleCount === 0 || scanCycleCount % 15 === 0) {
                    addToLogs('🔄 [Periodic Reload] Đang làm mới trang để giải phóng bộ nhớ và kích hoạt API Grab...');
                    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                    await page.waitForTimeout(4000);

                    // Kiểm tra lại URL sau khi reload để phòng hờ bị redirect sau reload
                    const postReloadUrl = page.url();
                    if (postReloadUrl.includes('/login') || postReloadUrl.includes('/auth')) {
                        addToLogs('⚠️ Phát hiện bị đá về trang Login sau khi reload! Bỏ qua chu kỳ quét này để chờ chu kỳ sau tự động login.');
                        return;
                    }
                } else {
                    addToLogs(`⚡ [Quick Scan] Quét nhanh chu kỳ #${scanCycleCount} (Không reload)...`);
                }

                                // 1. Quét và click cào đơn ở tab Đang hoạt động hiện tại (mặc định mở sau reload)
                addToLogs('👉 Tiến hành quét và cào đơn ở tab Đang hoạt động...');
                await clickVisibleOrderCards(page);

                // 2. Chuyển sang tab "Sắp tới" (Upcoming) để quét và click cào các đơn đang tìm tài xế
                addToLogs('👉 Thử chuyển sang tab Sắp tới (Upcoming) để kiểm tra đơn mới...');
                const switched = await switchToUpcomingTab(page);
                if (switched) {
                    await page.waitForTimeout(2000); // Chờ 2 giây để tab Sắp tới tải xong
                    
                    // Click cào các đơn hàng ở tab Sắp tới (ví dụ các đơn "Đang tìm tài xế")
                    await clickVisibleOrderCards(page);
                    
                    // Quay trở lại tab Đang hoạt động để sẵn sàng cho chu kỳ sau
                    addToLogs('👉 Quay trở lại tab Đang hoạt động...');
                    const returned = await switchToActiveTab(page);
                    if (returned) {
                        await page.waitForTimeout(2000); // Chờ 2 giây để tab Đang hoạt động tải xong
                    } else {
                        addToLogs('⚠️ Không thể quay lại tab Đang hoạt động bằng click. Sẽ reload trang ở chu kỳ sau.');
                    }
                } else {
                    addToLogs('ℹ️ Không tìm thấy nút tab Sắp tới trên giao diện (hoặc đã ở sẵn tab đó).');
                }

                addToLogs('Chu kỳ làm mới hoàn tất. Hệ thống API Interception tự động bắt và đồng bộ đơn hàng.');
                
                // Tăng biến đếm chu kỳ
                scanCycleCount++;
                
                // Cứ mỗi 5 chu kỳ quét (khoảng 1 phút với chu kỳ 12s), tự động chuyển tab Lịch sử ngầm để đồng bộ trạng thái
                if (scanCycleCount % 5 === 0) {
                    await triggerHistorySync(page).catch(e => addToLogs(`⚠️ Lỗi khi tự động đồng bộ trạng thái từ Lịch sử: ${e.message}`));
                }
            }
        } catch (e) {
            addToLogs(`❌ Lỗi trong chu kỳ quét đơn: ${e.message}`);
        }
    }, 12000);
}

runScraper().catch(console.error);
