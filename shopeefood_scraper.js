global.WebSocket = require('ws');
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cấu hình Supabase (fallback về giá trị mặc định của hệ thống Rôm Rả)
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';
const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_STATE = path.join(__dirname, 'shopee_session.json');
const CONFIG_FILE = path.join(__dirname, 'shopee_config.json');

const localLogs = [];
let lastScanTime = '';
let lastPageUrl = '';
let sessionScrapedCount = 0;
let activePage = null; 
let globalBrowser = null;
let globalContext = null;
let isBotSleeping = false;
let scanCycleCount = 0;
let telegramOffset = 0;

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

// Tải cấu hình tài khoản/mật khẩu ShopeeFood từ shopee_config.json
let shopeeConfig = null;
try {
    if (fs.existsSync(CONFIG_FILE)) {
        shopeeConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        addToLogs('🔑 Đã tải thành công cấu hình ShopeeFood từ shopee_config.json');
    }
} catch (e) {
    console.warn('⚠️ Lỗi khi tải file cấu hình shopee_config.json:', e.message);
}

// --- TELEGRAM BOT UTILS ---
async function sendTelegramAlert(text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || (shopeeConfig && shopeeConfig.telegram_bot_token);
    const chatId = process.env.TELEGRAM_CHAT_ID || (shopeeConfig && shopeeConfig.telegram_chat_id);
    if (!botToken || !chatId) return;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (err) {
        console.error('Lỗi gửi Telegram Alert:', err.message);
    }
}

async function sendTelegramPhoto(photoPath, caption) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || (shopeeConfig && shopeeConfig.telegram_bot_token);
    const chatId = process.env.TELEGRAM_CHAT_ID || (shopeeConfig && shopeeConfig.telegram_chat_id);
    if (!botToken || !chatId) return;

    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', fs.createReadStream(photoPath));
        if (caption) {
            form.append('caption', caption);
            form.append('parse_mode', 'HTML');
        }

        await new Promise((resolve, reject) => {
            form.submit(url, (err, res) => {
                if (err) reject(err);
                else {
                    res.resume();
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('Lỗi gửi ảnh Telegram:', err.message);
    }
}

// --- ĐĂNG NHẬP SHOPEEFOOD WEB PORTAL TỰ ĐỘNG ---
async function autoLoginShopee(page, config) {
    try {
        addToLogs('🌐 Đang điều hướng tới trang đăng nhập Shopee Partner...');
        await page.goto('https://partner.shopeefood.shopee.vn/account/login', { waitUntil: 'commit', timeout: 60000 });
        await page.waitForTimeout(3000);
        
        // Điền tên đăng nhập
        const usernameInput = page.locator('input[placeholder*="Số điện thoại"], input[type="text"], input[name="username"]').first();
        await usernameInput.waitFor({ state: 'visible', timeout: 30000 });
        await usernameInput.fill(config.username);
        
        // Điền mật khẩu
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        await passwordInput.fill(config.password);
        
        // Bấm nút Đăng nhập
        const loginBtn = page.locator('button:has-text("Đăng nhập"), button[type="submit"]').first();
        await loginBtn.click();
        
        addToLogs('⏳ Đang chờ hệ thống xác nhận hoặc kiểm tra OTP...');
        await page.waitForTimeout(5000);
        
        // Kiểm tra xem có bị dính OTP không
        const isOtpPage = page.url().includes('otp') || await page.locator('text=/Nhập mã xác thực|Mã OTP|Verification Code/i').count() > 0;
        
        if (isOtpPage) {
            addToLogs('⚠️ PHÁT HIỆN YÊU CẦU MÃ OTP TỪ SHOPEEFOOD!');
            
            // Chụp ảnh màn hình OTP gửi Telegram
            const tempOtpPath = path.join(__dirname, 'scratch', 'shopee_otp_prompt.png');
            await page.screenshot({ path: tempOtpPath }).catch(() => {});
            
            const caption = `🔑 <b>[SHOPEEFOOD OTP REQUIRED]</b>\n\n• Hệ thống phát hiện tài khoản yêu cầu mã OTP.\n• Vui lòng nhắn tin cú pháp <code>/shopee_otp &lt;mã_otp&gt;</code> tại đây để bot điền tiếp!`;
            await sendTelegramPhoto(tempOtpPath, caption);
            
            // Vòng lặp chờ người dùng gửi OTP qua Telegram
            let otpCode = '';
            const botToken = process.env.TELEGRAM_BOT_TOKEN || config.telegram_bot_token;
            
            addToLogs('⏳ Đang chờ mã OTP từ Telegram Bot...');
            const startTime = Date.now();
            while (Date.now() - startTime < 120000) { // Chờ tối đa 2 phút
                const getUpdatesUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${telegramOffset}&timeout=5`;
                const response = await fetch(getUpdatesUrl).catch(() => null);
                if (response && response.ok) {
                    const data = await response.json();
                    if (data.ok && data.result.length > 0) {
                        let gotOtp = false;
                        for (const update of data.result) {
                            telegramOffset = update.update_id + 1;
                            const msg = update.message;
                            if (msg && msg.text && msg.text.startsWith('/shopee_otp')) {
                                const parts = msg.text.split(' ');
                                if (parts.length > 1) {
                                    otpCode = parts[1].trim();
                                    gotOtp = true;
                                    break;
                                }
                            }
                        }
                        if (gotOtp) break;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            if (otpCode) {
                addToLogs(`✍ Đang tiến hành điền mã OTP: ${otpCode}...`);
                const otpInput = page.locator('input[type="number"], input[placeholder*="xác thực"], input[placeholder*="OTP"]').first();
                await otpInput.fill(otpCode);
                
                const confirmOtpBtn = page.locator('button:has-text("Xác nhận"), button:has-text("Tiếp tục"), button[type="submit"]').first();
                await confirmOtpBtn.click();
                await page.waitForTimeout(5000);
            } else {
                addToLogs('❌ Quá thời gian chờ nhập mã OTP. Hủy đăng nhập.');
                return false;
            }
        }
        
        // Chờ điều hướng vào trang quản lý chính
        await page.waitForURL(url => url.href.includes('dashboard') || url.href.includes('order') || url.href.includes('merchant'), { timeout: 45000 });
        addToLogs('🎉 Tự động đăng nhập Shopee Partner thành công!');
        return true;
    } catch (e) {
        addToLogs(`❌ Lỗi khi tự động đăng nhập Shopee Partner: ${e.message}`);
        return false;
    }
}

// --- ĐỒNG BỘ ĐƠN HÀNG SHOPEEFOOD VÀO SUPABASE ---
async function syncShopeeOrders(ordersArray) {
    if (!ordersArray || !Array.isArray(ordersArray) || ordersArray.length === 0) return;
    
    addToLogs(`📡 [Shopee API] Đang đồng bộ ${ordersArray.length} đơn hàng ShopeeFood vào database...`);
    
    for (const rawOrder of ordersArray) {
        try {
            // Chuẩn hóa cấu trúc đơn hàng Shopee
            const bookingId = rawOrder.order_id || rawOrder.id || rawOrder.booking_id;
            const shortId = rawOrder.short_id || rawOrder.display_id || ('SF-' + String(bookingId).slice(-4));
            
            let customerName = rawOrder.customer_name || rawOrder.eater_name || 'Khách Shopee';
            let customerPhone = rawOrder.customer_phone || rawOrder.eater_phone || 'Không có số';
            let driverName = rawOrder.driver_name || (rawOrder.driver && rawOrder.driver.name) || 'Chưa có tài xế';
            let driverPhone = rawOrder.driver_phone || (rawOrder.driver && rawOrder.driver.phone) || 'Không có số';
            let customerAddress = rawOrder.customer_address || rawOrder.address || 'Giao qua App';
            
            let totalAmount = rawOrder.total_amount || rawOrder.total || 0;
            let subtotalAmount = rawOrder.subtotal || totalAmount;
            let discountAmount = rawOrder.discount || 0;
            
            // Ánh xạ trạng thái
            let status = 'pending';
            const rawStatus = String(rawOrder.status || '').toLowerCase();
            if (rawStatus.includes('complete') || rawStatus.includes('deliver') || rawStatus.includes('finished')) {
                status = 'completed';
            } else if (rawStatus.includes('cancel') || rawStatus.includes('fail')) {
                status = 'cancelled';
            } else if (rawStatus.includes('delivering') || rawStatus.includes('shipping')) {
                status = 'shipping';
            }
            
            const rawItems = rawOrder.items || [];
            const itemsList = [];
            
            for (const item of rawItems) {
                const name = item.name || '';
                const qty = item.quantity || 1;
                const price = item.price || 0;
                let note = item.note || item.notes || '';
                let options = '';
                
                if (item.options && item.options.length > 0) {
                    options = item.options.map(o => o.name).join(', ');
                }
                
                const fullNote = `${options} | ${note}`.replace(/^ \| | \| $/g, '').trim();
                itemsList.push({
                    name: name,
                    quantity: qty,
                    price: price,
                    note: fullNote
                });
            }
            
            const rawPayload = {
                orderID: bookingId,
                shortOrderNumber: shortId,
                bookingCode: bookingId,
                customerName: customerName,
                customerAddress: customerAddress,
                eaterName: customerName,
                eaterPhone: customerPhone,
                driverName: driverName,
                driverPhone: driverPhone,
                grabStatus: status === 'completed' ? 'Đã giao thành công' : (status === 'shipping' ? 'Đang giao hàng' : 'Đang chuẩn bị'),
                subtotal: subtotalAmount,
                totalDiscount: discountAmount,
                items: itemsList.map(i => {
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

            // 1. Kiểm tra đơn hàng trong DB
            const { data: existingOrder } = await supabase
                .from('orders')
                .select('id, status')
                .eq('external_order_id', bookingId)
                .maybeSingle();
                
            if (existingOrder) {
                // Đơn đã tồn tại -> Cập nhật trạng thái
                const updatePayload = {
                    raw_payload: rawPayload,
                    note: JSON.stringify(rawPayload)
                };
                if (existingOrder.status !== status) {
                    addToLogs(`🔄 Cập nhật trạng thái đơn Shopee ${shortId}: "${existingOrder.status}" -> "${status}"`);
                    updatePayload.status = status;
                }
                
                await supabase.from('orders').update(updatePayload).eq('id', existingOrder.id);
            } else {
                // Đơn mới -> Chèn vào DB
                addToLogs(`📣 PHÁT HIỆN ĐƠN HÀNG SHOPEEFOOD MỚI: ${shortId}!`);
                const { data: insertedOrder, error: insertErr } = await supabase
                    .from('orders')
                    .insert({
                        payment_method: 'shopee_pay',
                        total_amount: totalAmount,
                        status: status,
                        platform: 'shopee',
                        external_order_id: bookingId,
                        external_short_id: shortId,
                        raw_payload: rawPayload,
                        note: JSON.stringify(rawPayload)
                    })
                    .select()
                    .single();
                    
                if (!insertErr && insertedOrder) {
                    // Chèn món ăn chi tiết
                    for (const item of itemsList) {
                        // So khớp recipe
                        let recipeId = null;
                        const { data: recipeList } = await supabase.from('recipes').select('id').eq('name', item.name);
                        if (recipeList && recipeList.length > 0) recipeId = recipeList[0].id;
                        
                        await supabase.from('order_items').insert({
                            order_id: insertedOrder.id,
                            recipe_id: recipeId,
                            quantity: item.quantity,
                            price: item.price
                        }).catch(() => {});
                    }
                    sessionScrapedCount++;
                }
            }
        } catch (err) {
            addToLogs(`❌ Lỗi xử lý đồng bộ đơn hàng Shopee: ${err.message}`);
        }
    }
}

// --- THIẾT LẬP ĐÁNH CHẶN MẠNG GỐC CỦA SHOPEE (API INTERCEPTION) ---
function setupPageResponseListener(page) {
    page.on('response', async (response) => {
        try {
            const url = response.url();
            const status = response.status();
            
            // Bắt các cuộc gọi lấy danh sách đơn của Shopee Partner Portal
            if (url.includes('/orders') || url.includes('/jobs') || url.includes('/merchant/v2/orders')) {
                if (status === 200) {
                    const headers = response.headers();
                    const contentType = headers['content-type'] || headers['Content-Type'] || '';
                    
                    if (contentType.includes('application/json')) {
                        const json = await response.json();
                        
                        // Lấy mảng đơn hàng từ response JSON
                        const orders = json.orders || json.data || (Array.isArray(json) ? json : null);
                        if (orders && Array.isArray(orders) && orders.length > 0) {
                            await syncShopeeOrders(orders);
                        }
                    }
                }
            }
        } catch (e) {
            // Bỏ qua lỗi parse của các request không phải JSON
        }
    });
}

// --- KHỞI CHẠY TRÌNH DUYỆT PLAYWRIGHT NGẦM ---
async function initPlaywright() {
    addToLogs('🌐 Đang khởi tạo trình duyệt Playwright ngầm cho ShopeeFood...');
    
    if (!fs.existsSync(STORAGE_STATE)) {
        if (shopeeConfig && shopeeConfig.username && shopeeConfig.password) {
            addToLogs('🔐 Chưa có session. Đăng nhập tự động bằng tài khoản Shopee Partner...');
            const tempBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const tempContext = await tempBrowser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const tempPage = await tempContext.newPage();
            const loginSuccess = await autoLoginShopee(tempPage, shopeeConfig);
            if (loginSuccess) {
                await tempContext.storageState({ path: STORAGE_STATE });
                addToLogs('💾 Đã lưu session đăng nhập ShopeeFood thành công!');
            }
            await tempBrowser.close();
        } else {
            addToLogs('❌ KHÔNG TÌM THẤY TÀI KHOẢN SHOPEEFOOD TRONG CONFIG!');
            throw new Error('Chưa cấu hình shopee_config.json');
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
        addToLogs('Đang truy cập trang Quản lý Shopee Partner...');
        await pageInstance.goto('https://partner.shopeefood.shopee.vn/merchant/order', { waitUntil: 'networkidle', timeout: 60000 });
        await pageInstance.waitForTimeout(5000);
        
        if (pageInstance.url().includes('login') || pageInstance.url().includes('account')) {
            addToLogs('⚠️ Phiên đăng nhập Shopee Partner đã hết hạn! Đang đăng nhập tự động lại...');
            const loginSuccess = await autoLoginShopee(pageInstance, shopeeConfig);
            if (loginSuccess) {
                await contextInstance.storageState({ path: STORAGE_STATE });
                addToLogs('💾 Đã gia hạn session Shopee thành công!');
                await pageInstance.goto('https://partner.shopeefood.shopee.vn/merchant/order', { waitUntil: 'networkidle', timeout: 60000 });
                await pageInstance.waitForTimeout(5000);
            } else {
                throw new Error('Gia hạn session Shopee thất bại');
            }
        }
        
        setupPageResponseListener(pageInstance);
        addToLogs('✅ Kết nối thành công. Bắt đầu lắng nghe đơn hàng ShopeeFood...');
        return { browser: browserInstance, context: contextInstance, page: pageInstance };
    } catch (err) {
        addToLogs(`❌ Lỗi khởi tạo: ${err.message}`);
        await browserInstance.close().catch(() => {});
        throw err;
    }
}

async function runScraper() {
    const initHour = getVietnamHour();
    if (initHour >= 23 || initHour < 6) {
        isBotSleeping = true;
        addToLogs('💤 Đang trong khung giờ nghỉ đêm (23:00 - 06:00). Shopee Bot sẽ khởi động ở chế độ ngủ...');
    } else {
        try {
            const instances = await initPlaywright();
            globalBrowser = instances.browser;
            globalContext = instances.context;
            activePage = instances.page;
        } catch (e) {
            addToLogs(`❌ Khởi tạo bot thất bại: ${e.message}`);
        }
    }

    // Vòng lặp định kỳ mỗi 15 giây để reload lấy đơn mới (Shopee cập nhật đơn active)
    setInterval(async () => {
        try {
            const localHour = getVietnamHour();
            const shouldSleep = (localHour >= 23 || localHour < 6);

            if (shouldSleep) {
                if (!isBotSleeping) {
                    isBotSleeping = true;
                    addToLogs('💤 [Sleep Mode] Đóng trình duyệt Shopee để ngủ đêm...');
                    if (globalBrowser) {
                        await globalBrowser.close().catch(() => {});
                        globalBrowser = null;
                        globalContext = null;
                        activePage = null;
                    }
                }
                return;
            } else {
                if (isBotSleeping) {
                    isBotSleeping = false;
                    addToLogs('☀️ [Wake Up] Đánh thức bot quét đơn ShopeeFood...');
                    const instances = await initPlaywright();
                    globalBrowser = instances.browser;
                    globalContext = instances.context;
                    activePage = instances.page;
                }

                if (!globalBrowser || !activePage) {
                    const instances = await initPlaywright();
                    globalBrowser = instances.browser;
                    globalContext = instances.context;
                    activePage = instances.page;
                }

                const page = activePage;
                lastScanTime = new Date().toLocaleTimeString('vi-VN');
                
                addToLogs('Đang làm mới trang quản lý Shopee để quét đơn hàng mới...');
                await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
                await page.waitForTimeout(5000);
            }
        } catch (e) {
            addToLogs(`❌ Lỗi trong chu kỳ quét đơn: ${e.message}`);
        }
    }, 15000);
}

runScraper().catch(console.error);
