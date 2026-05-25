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
            exec('curl -L -o /root/romra_scraper.js https://raw.githubusercontent.com/betafpt/romracaphe/main/romra_scraper.js', async (error, stdout, stderr) => {
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
            exec('curl -L -o /root/test_history_scrape.js https://raw.githubusercontent.com/betafpt/romracaphe/main/scratch/test_history_scrape.js', async (error, stdout, stderr) => {
                if (error) {
                    await sendTelegramAlert(`❌ Lỗi cập nhật cào lịch sử: <code>${error.message}</code>`);
                    return;
                }
                await sendTelegramAlert('✅ <b>CẬP NHẬT THÀNH CÔNG!</b>\nĐã tải đè bản cào lịch sử hoàn hảo mới nhất về `/root/test_history_scrape.js`.');
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
        
        exec(shellCmd, async (error, stdout, stderr) => {
            const output = stdout || stderr || 'Không có phản hồi đầu ra (Empty output).';
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

// --- CÁC HÀM HELPER XỬ LÝ API GRABFOOD (API INTERCEPTION) ---

// Hàm bóc tách đơn hàng thích ứng từ JSON API của Grab (tương thích nhiều phiên bản API)
function parseGrabOrder(order) {
    const shortId = order.shortOrderNumber || order.shortId || order.displayId || order.id || 'GF-UNKNOWN';
    const bookingId = order.orderID || order.bookingID || order.id || shortId;
    
    // Tên khách hàng
    let customerName = 'Khách Grab';
    if (order.customer && order.customer.name) {
        customerName = order.customer.name;
    } else if (order.customerName) {
        customerName = order.customerName;
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
    
    if (order.price) {
        totalAmount = order.price.total || order.price.totalAmount || 0;
        subtotalAmount = order.price.subtotal || order.price.subtotalAmount || totalAmount;
        discountAmount = order.price.discount || order.price.discountAmount || 0;
    } else {
        totalAmount = order.totalAmount || order.total || 0;
        subtotalAmount = order.subtotal || totalAmount;
        discountAmount = order.discount || order.discountAmount || 0;
    }
    
    // Trạng thái đơn hàng
    let status = 'pending'; // mặc định
    const orderState = order.orderState || order.status || '';
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
    const items = order.items || [];
    for (const item of items) {
        const name = item.name || '';
        const qty = item.quantity || 1;
        const price = item.price || 0;
        
        let note = item.notes || item.note || '';
        let optionsStr = '';
        if (item.modifiers && item.modifiers.length > 0) {
            optionsStr = item.modifiers.map(m => m.name).join(', ');
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
        customerName,
        customerAddress,
        totalAmount,
        subtotalAmount,
        discountAmount,
        status,
        items: itemsList
    };
}

// Hàm đồng bộ danh sách đơn hàng GrabFood từ JSON vào Supabase
async function syncGrabOrders(ordersArray) {
    if (!ordersArray || !Array.isArray(ordersArray) || ordersArray.length === 0) {
        return;
    }

    addToLogs(`📡 Bắt đầu đồng bộ ${ordersArray.length} đơn hàng Grab từ JSON API...`);
    
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
                // Đơn đã tồn tại -> Kiểm tra trạng thái xem có thay đổi không
                if (existingOrder.status !== status) {
                    addToLogs(`🔄 Cập nhật trạng thái đơn ${shortId} (${bookingId}): "${existingOrder.status}" -> "${status}"`);
                    const { error: updateErr } = await supabase
                        .from('orders')
                        .update({ status: status })
                        .eq('id', existingOrder.id);
                    
                    if (updateErr) {
                        addToLogs(`❌ Lỗi cập nhật trạng thái đơn ${shortId}: ${updateErr.message}`);
                    } else {
                        addToLogs(`🎉 Đã cập nhật trạng thái đơn ${shortId} thành công lên Supabase!`);
                    }
                }
                continue;
            }

            // Đơn mới chưa tồn tại -> Chèn vào database
            addToLogs(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD (API): ${shortId}! Đang chèn vào database...`);
            
            const rawPayload = {
                shortOrderNumber: shortId,
                customerName: customerName,
                customerAddress: customerAddress,
                subtotal: subtotalAmount,
                totalDiscount: discountAmount,
                items: items.map(i => {
                    let size = '-';
                    if (i.note && i.note.includes('Size')) {
                        const match = i.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                        if (match) {
                            size = match[1];
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
            for (const item of items) {
                try {
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
                        });
                } catch (itemErr) {
                    addToLogs(`❌ Lỗi khi chèn món ${item.name} của đơn ${shortId}: ${itemErr.message}`);
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
    activePage = page; // Lưu tham chiếu page toàn cục

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
                
                // Lắng nghe API danh sách đơn hàng Grab
                if (url.includes('/orders-pagination') || url.includes('/api/order/v1/orders') || url.includes('/api/merchant/v1/orders')) {
                    const status = response.status();
                    if (status === 200) {
                        try {
                            const json = await response.json();
                            let ordersArray = [];
                            
                            // Các API khác nhau có thể trả về định dạng mảng đơn hàng khác nhau
                            if (json.orders && Array.isArray(json.orders)) {
                                ordersArray = json.orders;
                            } else if (Array.isArray(json)) {
                                ordersArray = json;
                            } else if (json.data && Array.isArray(json.data)) {
                                ordersArray = json.data;
                            } else if (json.data && json.data.orders && Array.isArray(json.data.orders)) {
                                ordersArray = json.data.orders;
                            }
                            
                            if (ordersArray.length > 0) {
                                addToLogs(`📡 [API Intercept] Bắt được API đơn hàng: ${url} | Trạng thái: ${status} | Số lượng: ${ordersArray.length} đơn`);
                                // Gọi hàm đồng bộ ngầm
                                syncGrabOrders(ordersArray).catch(err => {
                                    addToLogs(`❌ Lỗi đồng bộ đơn hàng từ API: ${err.message}`);
                                });
                            }
                        } catch (jsonErr) {
                            // Bỏ qua nếu không parse được json
                        }
                    } else if (status === 401 || status === 403) {
                        addToLogs(`⚠️ API báo lỗi auth: ${url} | Status: ${status}`);
                    }
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
            
            // Kiểm tra xem bot có bị đá về trang đăng nhập ngầm không
            if (lastPageUrl.includes('/login') || lastPageUrl.includes('/auth')) {
                addToLogs('⚠️ Phát hiện phiên làm việc hết hạn (bị đá về trang Login)! Đang tự động đăng nhập ngầm lại...');
                if (grabConfig && grabConfig.username && grabConfig.password) {
                    const loginSuccess = await autoLoginGrab(page, grabConfig);
                    if (loginSuccess) {
                        await context.storageState({ path: STORAGE_STATE });
                        addToLogs('💾 Đã gia hạn session tự động thành công sau khi bị logout ngầm!');
                        await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
                        await page.waitForTimeout(5000);
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
            
            addToLogs('Đang làm mới trang để kích hoạt API quét đơn hàng Grab...');
            await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
            await page.waitForTimeout(3000);

            // Kiểm tra lại URL sau khi reload để phòng hờ bị redirect sau reload
            const postReloadUrl = page.url();
            if (postReloadUrl.includes('/login') || postReloadUrl.includes('/auth')) {
                addToLogs('⚠️ Phát hiện bị đá về trang Login sau khi reload! Bỏ qua chu kỳ quét này để chờ chu kỳ sau tự động login.');
                return;
            }

            addToLogs('Chu kỳ làm mới hoàn tất. Hệ thống API Interception tự động bắt và đồng bộ đơn hàng.');
        } catch (e) {
            addToLogs(`❌ Lỗi trong chu kỳ quét đơn: ${e.message}`);
        }
    }, 20000);
}

runScraper().catch(console.error);
