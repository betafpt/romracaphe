global.WebSocket = require('ws');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- HÀM REDIRECT LOG DEBUG RA FILE TRÊN VPS ---
const logPath = path.join(__dirname, 'history_debug.log');
try { fs.writeFileSync(logPath, ''); } catch (e) {}
const originalLog = console.log;
function debugLog(...args) {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    const formatted = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
    originalLog(formatted);
    try {
        fs.appendFileSync(logPath, formatted + '\n');
    } catch (e) {}
}
console.log = debugLog;
console.error = debugLog;


// Cấu hình Supabase (fallback về giá trị mặc định của hệ thống Rôm Rả)
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- HÀM HELPER PARSE VÀ SYNC API GRABFOOD XỊN SÒ ---
function parseGrabOrder(order) {
    const shortId = order.shortOrderNumber || order.shortId || order.displayId || order.displayID || order.id || 'GF-UNKNOWN';
    const bookingId = order.orderID || order.bookingID || order.bookingCode || order.id || shortId;
    const bookingCode = order.bookingCode || order.bookingID || bookingId;
    
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
    
    let driverName = '';
    let driverPhone = '';
    if (order.driver) {
        driverName = order.driver.name || '';
        driverPhone = order.driver.mobileNumber || order.driver.phone || '';
    }

    let customerAddress = 'Giao qua App';
    if (order.customer && order.customer.address) {
        customerAddress = order.customer.address;
    } else if (order.address) {
        customerAddress = order.address;
    }
    
    let totalAmount = 0;
    let subtotalAmount = 0;
    let discountAmount = 0;
    
    if (order.price) {
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
    
    let status = 'pending';
    const orderState = order.orderState || order.status || order.state || '';
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
            optionsStr = item.modifiers.map(m => m.name).join(', ');
        } else if (item.modifierGroups && item.modifierGroups.length > 0) {
            const mods = [];
            for (const group of item.modifierGroups) {
                if (group.modifiers && group.modifiers.length > 0) {
                    for (const m of group.modifiers) {
                        mods.push(`${group.modifierGroupName}: ${m.modifierName}`);
                    }
                }
            }
            optionsStr = mods.join(', ');
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
        customerName: eaterName,
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

async function syncGrabOrders(ordersArray) {
    if (!ordersArray || !Array.isArray(ordersArray) || ordersArray.length === 0) {
        return;
    }

    console.log(`[LOG] 📡 Bắt đầu đồng bộ ${ordersArray.length} đơn hàng Grab từ JSON API Lịch sử...`);
    
    let processedCount = 0;
    for (const rawOrder of ordersArray) {
        try {
            const orderData = parseGrabOrder(rawOrder);
            const { shortId, bookingId, customerName, customerAddress, totalAmount, subtotalAmount, discountAmount, status, items } = orderData;

            // Kiểm tra xem đơn hàng đã tồn tại trong database chưa
            const { data: existingOrder, error: checkErr } = await supabase
                .from('orders')
                .select('id, status, total_amount, raw_payload')
                .eq('external_order_id', bookingId)
                .maybeSingle();

            if (checkErr) {
                console.error(`❌ Lỗi kiểm tra database cho đơn ${shortId}: ${checkErr.message}`);
                continue;
            }

            const updatedRawPayload = {
                orderID: bookingId,
                shortOrderNumber: shortId,
                bookingCode: orderData.bookingCode || bookingId,
                customerName: orderData.customerName || customerName,
                customerAddress: customerAddress,
                eaterName: orderData.eaterName || customerName,
                eaterPhone: orderData.eaterPhone || 'Không có số',
                driverName: orderData.driverName || '',
                driverPhone: orderData.driverPhone || '',
                subtotal: subtotalAmount,
                totalDiscount: discountAmount,
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

            let targetOrderId = null;

            if (existingOrder) {
                console.log(`ℹ️ Phát hiện đơn ${shortId} đã có sẵn trong database POS. Tiến hành cập nhật thông tin và trạng thái thực tế ("${status}")...`);
                
                const dbTotal = existingOrder.total_amount ? parseFloat(existingOrder.total_amount) : 0;
                const dbPayload = existingOrder.raw_payload || {};
                
                // Quyết định số tiền cập nhật: Không ghi đè 0 lên số tiền thật đã có
                let finalTotal = totalAmount;
                if (dbTotal > 0 && totalAmount === 0) {
                    finalTotal = dbTotal;
                }

                // Bảo lưu SĐT nếu đã có trước đó
                if (dbPayload.eaterPhone && dbPayload.eaterPhone !== 'Không có số' && updatedRawPayload.eaterPhone === 'Không có số') {
                    updatedRawPayload.eaterPhone = dbPayload.eaterPhone;
                }
                if (dbPayload.driverPhone && updatedRawPayload.driverPhone === '') {
                    updatedRawPayload.driverPhone = dbPayload.driverPhone;
                }
                if (dbPayload.driverName && updatedRawPayload.driverName === '') {
                    updatedRawPayload.driverName = dbPayload.driverName;
                }

                const updatePayload = {
                    total_amount: finalTotal,
                    raw_payload: updatedRawPayload,
                    note: JSON.stringify(updatedRawPayload)
                };

                // Cập nhật trạng thái nếu thay đổi
                if (existingOrder.status !== status) {
                    console.log(`🔄 Cập nhật trạng thái POS đơn ${shortId} (${bookingId}): "${existingOrder.status}" -> "${status}"`);
                    updatePayload.status = status;
                }

                const { error: updateErr } = await supabase
                    .from('orders')
                    .update(updatePayload)
                    .eq('id', existingOrder.id);

                if (updateErr) {
                    console.error(`❌ Lỗi cập nhật thông tin đơn ${shortId}: ${updateErr.message}`);
                    continue;
                }

                targetOrderId = existingOrder.id;
                console.log(`✅ Đã cập nhật thành công thông tin đơn hàng ${shortId}!`);

            } else {
                console.log(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD (API LỊCH SỬ): ${shortId}! Đang chèn vào database...`);
                
                const { data: insertedOrder, error: insertErr } = await supabase
                    .from('orders')
                    .insert({
                        payment_method: 'grab_pay',
                        total_amount: totalAmount,
                        status: status, // Lưu đúng trạng thái thực tế từ API (completed/cancelled...)
                        platform: 'grab',
                        external_order_id: bookingId,
                        external_short_id: shortId,
                        raw_payload: updatedRawPayload,
                        note: JSON.stringify(updatedRawPayload)
                    })
                    .select()
                    .single();

                if (insertErr) {
                    console.error(`❌ Lỗi khi chèn đơn mới ${shortId} vào database: ${insertErr.message}`);
                    continue;
                }

                targetOrderId = insertedOrder.id;
                console.log(`🎉 Đã chèn đơn hàng ${shortId} mới thành công! ID Đơn POS: ${insertedOrder.id}`);
            }

            processedCount++;

            // Đồng bộ lại chi tiết món ăn trong order_items
            if (targetOrderId) {
                // Xóa món cũ trước khi chèn lại để tránh trùng lặp
                await supabase.from('order_items').delete().eq('order_id', targetOrderId);
                
                for (const item of items) {
                    try {
                        let itemSize = '-';
                        if (item.note && item.note.includes('Size')) {
                            const match = item.note.match(/Size\s*[^:]*:\s*([a-zA-Z0-9]+)/i) || item.note.match(/Size:?\s*([a-zA-Z0-9]+)/i);
                            if (match) {
                                itemSize = (match[1] || match[0]).trim().toUpperCase();
                            }
                        }

                        // Tìm công thức và size tương ứng
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
                                order_id: targetOrderId,
                                recipe_id: recipeId,
                                quantity: item.quantity,
                                price: item.price
                            });
                    } catch (itemErr) {
                        console.error(`❌ Lỗi khi chèn món ${item.name} của đơn ${shortId}: ${itemErr.message}`);
                    }
                }
                console.log(`👉 Chi tiết món ăn của đơn hàng ${shortId} đã được đồng bộ chuẩn xác.`);
            }

        } catch (orderErr) {
            console.error(`❌ Lỗi xử lý một đơn hàng trong mảng API: ${orderErr.message}`);
        }
    }
    if (processedCount > 0) {
        console.log(`✅ Hoàn thành đồng bộ ${processedCount} đơn hàng qua API Lịch sử!`);
    }
}

// Tự động tìm kiếm file session cookie tồn tại thực tế
const pathsToTry = [
    path.join(__dirname, 'grab_session.json'),
    path.join(__dirname, 'grab_state.json'),
    path.join(__dirname, '..', 'grab_session.json'),
    path.join(__dirname, '..', 'grab_state.json')
];

let STORAGE_STATE = null;
for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
        STORAGE_STATE = p;
        break;
    }
}

if (!STORAGE_STATE) {
    STORAGE_STATE = path.join(__dirname, 'grab_session.json');
}

async function testHistoryScrape() {
    console.log('🚀 Bắt đầu cào thử nghiệm đơn hàng lịch sử Grab...');
    console.log('📂 Đang sử dụng session cookie tại:', STORAGE_STATE);
    
    if (!fs.existsSync(STORAGE_STATE)) {
        console.error('❌ Lỗi: Không tìm thấy file session cookie. Vui lòng đăng nhập trước.');
        process.exit(1);
    }

    let browser = null;

    // Tự động exit sau 90s để phòng ngừa treo tiến trình ngầm trên VPS 1GB
    const safetyTimeout = setTimeout(async () => {
        console.error('⚠️ Quá thời gian chờ (90 giây)! Tự động đóng trình duyệt và thoát để tránh treo VPS.');
        try {
            if (browser) {
                await browser.close().catch(() => {});
            }
        } catch (err) {}
        process.exit(1);
    }, 90000);

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
    ];

    browser = await chromium.launch({
        headless: true, // Chạy ẩn để thực thi trên VPS
        args: launchArgs
    });

    const context = await browser.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Thiết lập chặn ảnh, font và các file thừa để tiết kiệm RAM tối đa cho VPS 1GB
    await page.route('**/*', (route) => {
        const url = route.request().url();
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type) || url.includes('analytics') || url.includes('doubleclick') || url.includes('facebook') || url.includes('tracking') || url.includes('telemetry')) {
            route.abort();
        } else {
            route.continue();
        }
    });

    let dumpCount = 0;
    // Lắng nghe API Lịch sử và Đơn hàng thực tế
    page.on('response', async response => {
        try {
            const url = response.url();
            const status = response.status();
            
            // 1. Lắng nghe danh sách đơn hàng
            if (url.includes('daily-paginator') || url.includes('orders-pagination') || url.includes('orders')) {
                if (status === 200) {
                    const contentType = response.headers()['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        const json = await response.json();
                        dumpCount++;
                        
                        console.log(`\n📡 [API DETECTED #${dumpCount}] URL: ${url}`);
                        console.log(`🔑 JSON Keys: ${Object.keys(json).join(', ')}`);
                        
                        // Xử lý trực tiếp trong bộ nhớ RAM, không ghi file rác ra đĩa
                    }
                }
            }
            
            // 2. Lắng nghe CHI TIẾT đơn hàng lịch sử (Chứa thông tin món ăn, tên tài xế cực kỳ chuẩn)
            if (url.includes('/food/merchant/v3/orders/')) {
                if (status === 200) {
                    const contentType = response.headers()['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        const json = await response.json();
                        dumpCount++;
                        
                        console.log(`\n📡 [API DETECTED #${dumpCount}] Bắt được API chi tiết đơn hàng: ${url}`);
                        
                        // Xử lý trực tiếp trong bộ nhớ RAM, không ghi file rác ra đĩa
                        
                        if (json.order) {
                            console.log(`📡 [API Sync] Đang chuẩn bị đồng bộ đơn hàng thật ${json.order.displayID || json.order.orderID} qua API...`);
                            await syncGrabOrders([json.order]);
                        }
                    }
                }
            }
        } catch (e) {
            // Tránh crash
        }
    });

    try {
        console.log('🌐 Đang kết nối tới Grab Merchant Portal...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(5000);
        
        // Kiểm tra session có bị hết hạn không
        if (page.url().includes('login') || page.url().includes('auth')) {
            console.error('❌ Lỗi: Phiên đăng nhập (Session Cookie) của Grab đã hết hạn! Vui lòng đăng nhập lại.');
            await browser.close();
            process.exit(1);
        }

        console.log('✅ Kết nối thành công. Đang cố gắng chuyển sang tab Lịch sử đơn hàng...');
        
        // Tìm và click tab Lịch sử
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
                    console.log(`🔘 Tìm thấy tab lịch sử bằng selector: ${selector}. Đang click...`);
                    await tab.click();
                    foundTab = true;
                    break;
                }
            } catch (err) {}
        }

        if (!foundTab) {
            console.log('⚠️ Không tìm thấy nút tab Lịch sử bằng click trực tiếp. Thử điều hướng trực tiếp sang url lịch sử...');
            await page.goto('https://merchant.grab.com/order-history', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await page.goto('https://merchant.grab.com/portal/order-history', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        }

        await page.waitForTimeout(5000);
        console.log('📷 Đang kiểm tra danh sách đơn lịch sử hiển thị...');

        // Tính toán chuỗi ngày hôm nay của Grab (ví dụ: "T2, 25 Th05 2026") để click DatePicker
        try {
            const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            const months = ['Th01', 'Th02', 'Th03', 'Th04', 'Th05', 'Th06', 'Th07', 'Th08', 'Th09', 'Th10', 'Th11', 'Th12'];
            const today = new Date();
            
            const dayName = days[today.getDay()];
            const dateNum = String(today.getDate()).padStart(2, '0');
            const monthName = months[today.getMonth()];
            const year = today.getFullYear();
            
            const todayStr = `${dayName}, ${dateNum} ${monthName} ${year}`;
            console.log(`📅 Ngày hôm nay: "${todayStr}"`);
            
            // Định vị chính xác ô input DatePicker bằng placeholder "Chọn thời điểm" vừa tìm thấy!
            const dateInput = page.locator('input[placeholder="Chọn thời điểm"]').first();
            if (await dateInput.count() > 0) {
                console.log('🎯 Tìm thấy ô nhập liệu chọn ngày (input[placeholder="Chọn thời điểm"]). Đang click mở...');
                
                // Click bằng cả Playwright click lẫn DOM click để đảm bảo hoạt động trong headless mode
                await dateInput.click().catch(() => {});
                await dateInput.evaluate(el => el.click()).catch(() => {});
                await page.waitForTimeout(2000);
                
                // Click thêm vào thẻ cha của input nếu cần kích hoạt
                await dateInput.locator('..').first().evaluate(el => el.click()).catch(() => {});
                await page.waitForTimeout(1000);
                
                // Đọc tham số ngày truyền vào từ command line (ví dụ: --date 23)
                const dateArgIndex = process.argv.indexOf('--date');
                let targetDayNum = null;
                if (dateArgIndex !== -1 && process.argv[dateArgIndex + 1]) {
                    targetDayNum = process.argv[dateArgIndex + 1].trim();
                }
                
                let clickedRange = false;
                
                if (targetDayNum) {
                    console.log(`🎯 Người dùng yêu cầu lọc ngày cụ thể: ngày "${targetDayNum}"`);
                    
                    // Tìm ô chứa số ngày cụ thể trên lịch
                    const dayCell = page.locator(`span:has-text("${targetDayNum}"), div:has-text("${targetDayNum}")`).filter({ visible: true });
                    const cellCount = await dayCell.count().catch(() => 0);
                    
                    if (cellCount > 0) {
                        console.log(`🔘 Tìm thấy ô ngày "${targetDayNum}" trên lịch. Đang click chọn phạm vi...`);
                        // Click lần 1 chọn ngày bắt đầu
                        await dayCell.first().click().catch(() => {});
                        await page.waitForTimeout(1000);
                        // Click lần 2 chọn ngày kết thúc
                        await dayCell.first().click().catch(() => {});
                        await page.waitForTimeout(1000);
                        clickedRange = true;
                    } else {
                        console.log(`⚠️ Không tìm thấy ô chứa ngày "${targetDayNum}" trên lịch. Quay về bộ lọc mặc định.`);
                    }
                }
                
                if (!clickedRange) {
                    // Tìm các tùy chọn khoảng ngày nhanh (ưu tiên 7 ngày qua để chắc chắn có đơn test)
                    const rangeSelectors = [
                        'text="7 ngày qua"',
                        'text="Last 7 days"',
                        'text="Hôm qua"',
                        'text="Yesterday"'
                    ];
                    
                    for (const selector of rangeSelectors) {
                        const opt = page.locator(selector).filter({ visible: true }).first();
                        if (await opt.count() > 0) {
                            console.log(`🔘 Tìm thấy tùy chọn khoảng ngày nhanh bằng: ${selector}. Đang click...`);
                            await opt.click();
                            clickedRange = true;
                            break;
                        }
                    }
                    
                    if (!clickedRange) {
                        console.log('⚠️ Không thấy nút khoảng ngày nhanh. Thử click chọn số ngày hôm qua trên lịch...');
                        const yesterdayDate = new Date();
                        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                        const yesterdayDayNum = String(yesterdayDate.getDate());
                        const dayCell = page.locator(`span:has-text("${yesterdayDayNum}"), div:has-text("${yesterdayDayNum}")`).filter({ visible: true }).first();
                        if (await dayCell.count() > 0) {
                            await dayCell.click();
                            clickedRange = true;
                        }
                    }
                }
                
                // Click nút Áp dụng
                const applyBtn = page.locator('text="Áp dụng", text="Apply", button:has-text("Áp dụng"), button:has-text("Apply")').filter({ visible: true }).first();
                if (await applyBtn.count() > 0) {
                    console.log('🔘 Click nút Áp dụng bộ lọc ngày!');
                    await applyBtn.click();
                }
                await page.waitForTimeout(5000); // Chờ tải danh sách mới
            }
        } catch (err) {
            console.warn('⚠️ Lỗi khi cố gắng thay đổi bộ lọc ngày:', err.message);
        }

        // In ra danh sách tóm tắt tất cả đơn hàng lọc được trước khi click chi tiết
        try {
            const summaryCards = page.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').locator('..').locator('..');
            const summaryCount = await summaryCards.count().catch(() => 0);
            console.log(`\n📋 --- DANH SÁCH ĐƠN HÀNG LỌC ĐƯỢC TRÊN VPS (Tổng số: ${summaryCount} đơn) ---`);
            for (let k = 0; k < summaryCount; k++) {
                const cardText = await summaryCards.nth(k).innerText().catch(() => '');
                const cardLines = cardText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                console.log(`Đơn #${k + 1}: ${cardLines.join(' | ')}`);
            }
            console.log('-------------------------------------------------------------\n');
        } catch (err) {}

        // Lấy danh sách các đơn hàng Grab đang bị kẹt (pending/shipping) trên Web POS
        let pendingShortIds = [];
        try {
            const { data: pendingOrders } = await supabase
                .from('orders')
                .select('external_short_id')
                .eq('platform', 'grab')
                .in('status', ['pending', 'shipping']);
            
            pendingShortIds = (pendingOrders || []).map(o => o.external_short_id).filter(Boolean);
            console.log(`📋 Danh sách đơn Grab đang kẹt cần đồng bộ trên POS:`, pendingShortIds);
        } catch (dbErr) {
            console.warn('⚠️ Lỗi khi truy vấn danh sách đơn kẹt từ DB:', dbErr.message);
        }

        // Định vị các card đơn hàng trong danh sách lịch sử
        const orderSelectors = [
            'text="Đã hoàn tất"',
            'text="Đã giao"',
            'text="Đã hoàn thành"',
            'text="Delivered"',
            'text="Completed"',
            'text="Đã hủy"',
            'text="Cancelled"'
        ];

        let clickedOrder = false;
        for (const selector of orderSelectors) {
            try {
                const cards = page.locator(selector).locator('..').locator('..');
                const count = await cards.count().catch(() => 0);
                if (count > 0) {
                    console.log(`🎯 Phát hiện ${count} đơn hàng lịch sử bằng selector: ${selector}. Tiến hành cào thông minh...`);
                    for (let i = 0; i < count; i++) {
                        const cardText = await cards.nth(i).innerText().catch(() => '');
                        // Trích xuất mã đơn ngắn (ví dụ: GF-624)
                        const match = cardText.match(/GF-\d+/i) || cardText.match(/[A-Z0-9]+-[A-Z0-9]+/);
                        const shortId = match ? match[0].toUpperCase() : null;
                        
                        // Chỉ cào nếu đơn này đang bị kẹt trên POS, hoặc nếu không có danh sách kẹt nào thì cào tất cả để làm sạch DB
                        const shouldScrape = pendingShortIds.length === 0 || pendingShortIds.includes(shortId);
                        
                        if (shouldScrape) {
                            console.log(`🔘 Đang cào đơn thứ ${i + 1}/${count} (${shortId || 'Không rõ mã'})...`);
                            await cards.nth(i).click().catch(() => {});
                            await page.waitForTimeout(4000); // Chờ 4 giây giữa mỗi lần click để API tải chi tiết và đồng bộ
                            clickedOrder = true;
                        } else {
                            console.log(`skip Bỏ qua đơn ${shortId || 'Không rõ mã'} vì đã hoàn tất trên POS.`);
                        }
                    }
                    break;
                }
            } catch (err) {}
        }

        if (!clickedOrder) {
            console.log('❌ Không phát hiện bất kỳ đơn hàng nào trong lịch sử để cào.');
            
            // Lưu screenshot để debug nếu cần
            await page.screenshot({ path: path.join(__dirname, 'history_error.png') });
            console.log('Đã lưu ảnh lỗi tại scratch/history_error.png để kiểm tra.');
            await browser.close();
            return;
        }

        console.log('🎉 Hoàn tất cào và đồng bộ toàn bộ đơn hàng lịch sử thành công!');
        await browser.close();
        return;

        // 4. Trích xuất danh sách món ăn từ định dạng bảng lịch sử
        let itemsList = [];
        const orderSummaryHeader = 'Tóm tắt đơn hàng';
        const subtotalHeader = 'Tổng tạm tính';
        
        if (detailsText.includes(orderSummaryHeader)) {
            console.log('📝 Phát hiện bảng lịch sử đơn hàng dạng bảng. Đang bóc tách món ăn...');
            const part1 = detailsText.split(orderSummaryHeader)[1] || '';
            const summaryBody = part1.split(subtotalHeader)[0] || '';
            const lines = summaryBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const cleanLines = lines.filter(l => !l.includes('MÓN') && !l.includes('GIÁ') && !l.includes('SỐ LƯỢNG') && !l.includes('TỔNG SỐ TIỀN'));
            
            let currentItem = null;
            for (let i = 0; i < cleanLines.length; i++) {
                const line = cleanLines[i];
                // Regex khớp dòng số liệu: [Giá] + [Số lượng] + [Tổng tiền] (ví dụ: 39.000,00       2       78.000)
                const priceQtyMatch = line.match(/^([\d\.,\s]+?)\s+(\d+)\s+([\d\.,]+)$/);
                
                if (priceQtyMatch && currentItem) {
                    currentItem.price = parseInt(priceQtyMatch[1].replace(/\D/g, '')) || 0;
                    currentItem.quantity = parseInt(priceQtyMatch[2]) || 1;
                    // Xử lý nếu giá có phần thập phân ,00
                    if (priceQtyMatch[1].endsWith(',00') || priceQtyMatch[1].endsWith('.00')) {
                        currentItem.price = Math.round(currentItem.price / 100);
                    }
                } else if (line.startsWith('Chọn ')) {
                    const optionName = line.replace('Chọn ', '');
                    const optionVal = cleanLines[i + 1] || '';
                    if (currentItem && optionVal && !optionVal.startsWith('Chọn') && isNaN(optionVal.replace(/[\.,]/g, ''))) {
                        currentItem.note += `${optionName}: ${optionVal} | `;
                        i++; // Bỏ qua dòng giá trị tùy chọn đã xử lý
                    }
                } else if (isNaN(line.replace(/[\.,]/g, '')) && !line.includes('Tổng cộng') && !line.includes('thuế')) {
                    // Dòng chữ không phải là số -> Tên món ăn mới!
                    if (currentItem) {
                        currentItem.note = currentItem.note.replace(/\s*\|\s*$/, '').trim();
                        itemsList.push(currentItem);
                    }
                    currentItem = {
                        name: line,
                        quantity: 1,
                        price: 0,
                        note: ''
                    };
                }
            }
            if (currentItem) {
                currentItem.note = currentItem.note.replace(/\s*\|\s*$/, '').trim();
                itemsList.push(currentItem);
            }
        }

        // 5. Cào các thông tin tài chính chi tiết
        const totalTextMatch = detailsText.match(/Tổng cộng\s+([\d\.,\s]+?₫)/i) || detailsText.match(/Tổng cộng\s+([\d\.,]+)/i);
        const totalAmount = totalTextMatch ? parseInt(totalTextMatch[1].replace(/\D/g, '')) : 0;
        
        const subtotalTextMatch = detailsText.match(/Tổng tạm tính\s+([\d\.,\s]+?₫)/i) || detailsText.match(/Tổng tạm tính\s+([\d\.,]+)/i);
        const subtotalAmount = subtotalTextMatch ? parseInt(subtotalTextMatch[1].replace(/\D/g, '')) : totalAmount;

        const discountAmount = 0; // Đơn lịch sử tự tính khuyến mại hoặc mặc định 0
        const customerAddress = 'Giao qua App';

        // In văn bản chi tiết trên trang để phân tích cấu trúc hiển thị món ăn của đơn lịch sử
        try {
            const detailsText = await page.locator('body').innerText().catch(() => '');
            console.log('\n📝 --- CHI TIẾT VĂN BẢN ĐƠN HÀNG (DEBUG PHÂN TÍCH MÓN) ---');
            console.log(detailsText.substring(0, 2000));
            console.log('----------------------------------------------------------\n');
        } catch (err) {}

        // 6. Đóng gói kết quả
        const result = {
            status: "SUCCESS",
            shortOrderNumber: shortId,
            longOrderNumber: bookingId,
            customerName: customerName,
            customerAddress: customerAddress,
            subtotal: subtotalAmount,
            totalDiscount: discountAmount,
            totalAmount: totalAmount,
            items: itemsList
        };

        console.log('\n========================================================');
        console.log('🎉 KẾT QUẢ CÀO ĐƠN HÀNG LỊCH SỬ THỰC TẾ THÀNH CÔNG!');
        console.log(JSON.stringify(result, null, 4));
        console.log('========================================================\n');

        console.log(`📡 Đang chuẩn bị đồng bộ đơn lịch sử ${shortId} từ VPS vào Supabase...`);

        // Kiểm tra xem đơn đã tồn tại trong DB chưa
        const { data: existingOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('external_order_id', bookingId)
            .maybeSingle();

        if (existingOrder) {
            console.log(`ℹ️ Đơn hàng ${shortId} (${bookingId}) đã tồn tại trong database POS. Tiến hành xóa đi chèn lại để test chuông báo...`);
            await supabase.from('order_items').delete().eq('order_id', existingOrder.id);
            await supabase.from('orders').delete().eq('id', existingOrder.id);
        }

        const rawPayload = {
            shortOrderNumber: shortId,
            customerName: customerName,
            customerAddress: customerAddress,
            subtotal: subtotalAmount,
            totalDiscount: discountAmount,
            items: itemsList.map(i => {
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
                status: 'pending', // để pending để POS reo chuông và hiển thị Popup
                platform: 'grab',
                external_order_id: bookingId,
                external_short_id: shortId,
                raw_payload: rawPayload,
                note: JSON.stringify(rawPayload)
            })
            .select()
            .single();

        if (insertErr) {
            console.error('❌ Lỗi khi chèn đơn lịch sử vào database:', insertErr.message);
        } else {
            console.log(`🎉 Đã đồng bộ đơn hàng ${shortId} thành công! ID Đơn POS: ${insertedOrder.id}`);
            
            for (const item of itemsList) {
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
                    console.error(`❌ Lỗi khi chèn món ${item.name}:`, itemErr.message);
                }
            }
            console.log('👉 Web POS của quán sẽ reo chuông báo đơn mới!');
        }

    } catch (e) {
        console.error('❌ Lỗi xảy ra trong quá trình cào thử đơn lịch sử:', e.message);
    } finally {
        await browser.close();
        console.log('Trình duyệt đóng. Hoàn tất kiểm thử.');
        process.exit(0);
    }
}

testHistoryScrape().catch(console.error);
