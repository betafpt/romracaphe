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


// Cấu hình Supabase
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

function getGrabRealtimeStatus(order) {
    const state = String(order.state || order.orderState || order.status || '').toUpperCase();
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

async function syncGrabOrders(ordersArray) {
    if (!ordersArray || !Array.isArray(ordersArray) || ordersArray.length === 0) {
        return;
    }

    console.log(`[LOG] 📡 Bắt đầu đồng bộ ${ordersArray.length} đơn hàng Grab từ JSON API...`);
    
    let processedCount = 0;
    for (const rawOrder of ordersArray) {
        try {
            const orderData = parseGrabOrder(rawOrder);
            const { shortId, bookingId, customerName, customerAddress, totalAmount, subtotalAmount, discountAmount, status, items } = orderData;

            // Xóa đơn cũ cùng ID dài đi để test đồng bộ
            const { data: existingOrder } = await supabase
                .from('orders')
                .select('id')
                .eq('external_order_id', bookingId)
                .maybeSingle();

            if (existingOrder) {
                console.log(`ℹ️ Phát hiện đơn ${shortId} đã có sẵn. Tiến hành xóa đơn cũ đi để chèn lại đơn mới cực chuẩn...`);
                await supabase.from('order_items').delete().eq('order_id', existingOrder.id);
                await supabase.from('orders').delete().eq('id', existingOrder.id);
            }

            console.log(`📣 PHÁT HIỆN ĐƠN MỚI CỦA GRABFOOD (API): ${shortId}! Đang chèn vào database...`);
            
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
                items: items.map(i => {
                    let size = '-';
                    if (i.note && i.note.includes('Size')) {
                        // Regex bóc tách size thông minh đã sửa đổi
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
                    status: status, // Sử dụng trạng thái thực tế bóc tách được (pending/completed/cancelled)
                    platform: 'grab',
                    external_order_id: bookingId,
                    external_short_id: shortId,
                    raw_payload: rawPayload,
                    note: JSON.stringify(rawPayload)
                })
                .select()
                .single();

            if (insertErr) {
                console.error(`❌ Lỗi khi chèn đơn mới ${shortId} vào database: ${insertErr.message}`);
                continue;
            }

            console.log(`🎉 Đã chèn đơn hàng ${shortId} thành công! ID Đơn POS: ${insertedOrder.id}`);
            processedCount++;

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
                    console.error(`❌ Lỗi khi chèn món ${item.name} của đơn ${shortId}: ${itemErr.message}`);
                }
            }
            console.log(`Đơn hàng ${shortId} đã sẵn sàng trên Web POS.`);

        } catch (orderErr) {
            console.error(`❌ Lỗi xử lý một đơn hàng trong mảng API: ${orderErr.message}`);
        }
    }
    if (processedCount > 0) {
        console.log(`✅ Hoàn thành đồng bộ ${processedCount} đơn hàng mới qua API!`);
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

async function dismissWelcomeTour(page) {
    try {
        const closeTourBtn = page.getByRole('button', { name: 'Đóng', exact: true })
            .or(page.getByRole('button', { name: 'Close', exact: true }))
            .filter({ visible: true })
            .first();
        if (await closeTourBtn.count() > 0) {
            console.log('🎯 [Playwright] Phát hiện popup chào mừng (Welcome Tour). Đang click "Đóng" để tắt...');
            await closeTourBtn.click();
            await page.waitForTimeout(2000);
        }
    } catch (e) {
        console.warn('⚠️ Lỗi khi tắt popup chào mừng:', e.message);
    }
}

async function testSpecificOrderScrape() {
    // Đọc mã đơn cần tìm kiếm từ đối số dòng lệnh hoặc mặc định là 'GF-692'
    const targetShortId = process.argv[2] || 'GF-692';
    
    console.log(`🚀 Bắt đầu cào thử nghiệm đơn hàng lịch sử Grab cụ thể: ${targetShortId}...`);
    console.log('📂 Đang sử dụng session cookie tại:', STORAGE_STATE);
    
    if (!fs.existsSync(STORAGE_STATE)) {
        console.error('❌ Lỗi: Không tìm thấy file session cookie. Vui lòng đăng nhập trước.');
        process.exit(1);
    }

    let browser = null;
    
    // Tự động exit sau 60s để phòng ngừa treo tiến trình ngầm trên VPS 1GB
    const safetyTimeout = setTimeout(async () => {
        console.error('⚠️ Quá thời gian chờ (60 giây)! Tự động đóng trình duyệt và thoát để tránh treo VPS.');
        try {
            if (browser) {
                await browser.close().catch(() => {});
            }
        } catch (err) {}
        process.exit(1);
    }, 60000);

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

    let syncedSuccess = false;
    let dumpCount = 0;

    // Lắng nghe API chi tiết đơn hàng
    page.on('response', async response => {
        try {
            const url = response.url();
            const status = response.status();
            
            if (url.includes('/food/merchant/v3/orders/')) {
                if (status === 200) {
                    const contentType = response.headers()['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        const json = await response.json();
                        dumpCount++;
                        
                        console.log(`\n📡 [API DETECTED #${dumpCount}] Bắt được API chi tiết đơn hàng: ${url}`);
                        
                        // Lưu file dump JSON thật
                        const savePathDetail = path.join(__dirname, `grab_api_specific_dump_${targetShortId}.json`);
                        fs.writeFileSync(savePathDetail, JSON.stringify(json, null, 2), 'utf-8');
                        
                        if (json.order) {
                            const orderId = json.order.shortOrderNumber || json.order.shortId || json.order.displayId || json.order.displayID || '';
                            console.log(`📡 Phát hiện thông tin chi tiết đơn hàng: ${orderId}`);
                            
                            // Log ra thông tin của tài xế và khách hàng
                            console.log('\n--- THÔNG TIN CHI TIẾT ĐƠN HÀNG BẮT ĐƯỢC ---');
                            console.log(`Mã đơn: ${orderId}`);
                            console.log(`Mã booking: ${json.order.bookingCode || json.order.orderID}`);
                            console.log(`Tài xế: ${json.order.driver ? json.order.driver.name : 'Không có'}`);
                            console.log(`SĐT Tài xế: ${json.order.driver ? json.order.driver.mobileNumber : 'Không có'}`);
                            console.log(`Khách hàng: ${json.order.eater ? json.order.eater.name : 'Không có'}`);
                            console.log(`SĐT Khách: ${json.order.eater ? json.order.eater.mobileNumber : 'Không có'}`);
                            console.log('Món ăn:');
                            const items = json.order.items || (json.order.itemInfo && json.order.itemInfo.items) || [];
                            items.forEach((item, idx) => {
                                console.log(`  ${idx + 1}. ${item.name} x${item.quantity}`);
                                if (item.modifierGroups) {
                                    item.modifierGroups.forEach(g => {
                                        if (g.modifiers) {
                                            g.modifiers.forEach(m => {
                                                console.log(`     - [${g.modifierGroupName}] ${m.modifierName}`);
                                            });
                                        }
                                    });
                                }
                            });
                            console.log('-------------------------------------------\n');

                            console.log(`📡 [API Sync] Đang chuẩn bị đồng bộ đơn hàng thật ${orderId} qua API...`);
                            await syncGrabOrders([json.order]);
                            syncedSuccess = true;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('❌ Lỗi listener response:', e.message);
        }
    });

    try {
        console.log('🌐 Đang kết nối tới Grab Merchant Portal...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(5000);
        await dismissWelcomeTour(page);
        
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

        // BƯỚC 1: Quét xem đơn hàng có sẵn trên trang Hôm Nay không
        console.log(`🎯 [Bước 1] Tìm kiếm đơn hàng chứa text "${targetShortId}" trong ngày hôm nay...`);
        let orderLocator = page.locator(`text="${targetShortId}"`).first();
        let orderCount = await orderLocator.count().catch(() => 0);
        let foundAndClicked = false;

        if (orderCount > 0) {
            console.log(`🎉 Tìm thấy đơn hàng ${targetShortId} ngay trên trang Hôm Nay!`);
            await orderLocator.click().catch(async () => {
                await orderLocator.evaluate(el => el.click()).catch(() => {});
            });
            foundAndClicked = true;
        } else {
            console.log(`ℹ️ Không tìm thấy đơn hàng ${targetShortId} trong ngày hôm nay. Tiến hành chuyển sang ngày hôm qua...`);
            
            // BƯỚC 2: Mở DatePicker và chọn ngày Hôm Qua
            try {
                const dateInput = page.locator('input[placeholder="Chọn thời điểm"]').first();
                if (await dateInput.count() > 0) {
                    console.log('🎯 Tìm thấy ô chọn ngày. Đang click mở lịch...');
                    await dateInput.click().catch(() => {});
                    await dateInput.evaluate(el => el.click()).catch(() => {});
                    await page.waitForTimeout(1000);
                    
                    // Click thêm vào thẻ cha của input để chắc chắn mở popup lịch
                    await dateInput.locator('..').first().click().catch(() => {});
                    await dateInput.locator('..').first().evaluate(el => el.click()).catch(() => {});
                    await page.waitForTimeout(2000);

                    // Tính ngày hôm qua
                    const yesterdayDate = new Date();
                    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                    const yesterdayDayNum = String(yesterdayDate.getDate());
                    
                    console.log(`🎯 Đang click chọn ngày hôm qua: ngày "${yesterdayDayNum}" trên popup lịch...`);
                    
                    // Sử dụng selector siêu chính xác nhắm thẳng vào cell-inner của cả dui-picker lẫn ant-picker, hỗ trợ fallback getByText visible
                    const dayCellStart = page.locator('.dui-picker-dropdown .dui-picker-cell-in-view .dui-picker-cell-inner')
                        .or(page.locator('.ant-picker-dropdown .ant-picker-cell-in-view .ant-picker-cell-inner'))
                        .getByText(yesterdayDayNum, { exact: true }).first()
                        .or(page.getByText(yesterdayDayNum, { exact: true }).filter({ visible: true }).first());
                        
                    if (await dayCellStart.count() > 0) {
                        await dayCellStart.click().catch(() => {});
                        console.log(`🔘 Đã click chọn ngày hôm qua (${yesterdayDayNum}) thành công!`);
                        
                        console.log('⏳ Chờ 5 giây để trang tải danh sách đơn ngày hôm qua...');
                        await page.waitForTimeout(5000);
                        
                        // Quét lại danh sách đơn của ngày hôm qua
                        console.log(`🎯 [Bước 2] Tìm kiếm đơn hàng chứa text "${targetShortId}" trong ngày hôm qua...`);
                        orderLocator = page.locator(`text="${targetShortId}"`).first();
                        orderCount = await orderLocator.count().catch(() => 0);
                        
                        if (orderCount > 0) {
                            console.log(`🎉 Tìm thấy đơn hàng ${targetShortId} trong danh sách đơn ngày hôm qua!`);
                            await orderLocator.click().catch(async () => {
                                await orderLocator.evaluate(el => el.click()).catch(() => {});
                            });
                            foundAndClicked = true;
                        }
                    } else {
                        console.log(`⚠️ Không tìm thấy ô chứa ngày hôm qua (${yesterdayDayNum}) trên lịch.`);
                    }
                }
            } catch (err) {
                console.warn('⚠️ Lỗi khi đổi bộ lọc sang ngày hôm qua:', err.message);
            }
        }

        // BƯỚC 3: Đồng bộ đơn hàng nếu tìm thấy và click thành công
        if (foundAndClicked) {
            // Nếu không phản hồi, thử click vào parent card của nó
            await page.waitForTimeout(1000);
            const parentCard = orderLocator.locator('..').locator('..').locator('..').first();
            if (await parentCard.count() > 0) {
                console.log('🔘 Click vào thẻ bao chứa của đơn hàng để kích hoạt tải chi tiết...');
                await parentCard.click().catch(() => {});
                await parentCard.evaluate(el => el.click()).catch(() => {});
            }

            console.log('⏳ Đang chờ 10 giây để API tải thông tin chi tiết và đồng bộ...');
            await page.waitForTimeout(10000);
            
            if (syncedSuccess) {
                console.log(`🎉 KẾT QUẢ CÀO ĐƠN HÀNG LỊCH SỬ THỰC TẾ THÀNH CÔNG!`);
                console.log(`✅ Đồng bộ đơn hàng ${targetShortId} thành công mỹ mãn qua API!`);
            } else {
                console.warn(`⚠️ Đã click nhưng không bắt được API chi tiết của đơn ${targetShortId}.`);
            }
        } else {
            console.error(`❌ Không phát hiện đơn hàng ${targetShortId} trong danh sách hiển thị của cả Hôm Nay và Hôm Qua.`);
            
            // In danh sách các đơn hàng hiện có để người dùng biết
            try {
                const bodyText = await page.innerText('body').catch(() => '');
                console.log('\n--- DANH SÁCH CHỮ TRÊN TRANG (ĐỂ KIỂM TRA MÃ ĐƠN CÓ SẴN) ---');
                const lines = bodyText.split('\n').filter(l => l.includes('GF-') || l.includes('Đã'));
                console.log(lines.slice(0, 20).join('\n'));
                console.log('-----------------------------------------------------------\n');
            } catch (e) {}

            // Chụp ảnh màn hình để debug
            const screenshotPath = path.join(__dirname, `specific_order_not_found_${targetShortId}.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`Đã lưu ảnh màn hình lỗi tại scratch/specific_order_not_found_${targetShortId}.png`);
        }

    } catch (e) {
        console.error('❌ Lỗi xảy ra trong quá trình kiểm thử:', e.message);
    } finally {
        clearTimeout(safetyTimeout);
        if (browser) {
            await browser.close().catch(() => {});
        }
        console.log('Trình duyệt đóng. Hoàn tất kiểm thử.');
        process.exit(0);
    }
}

testSpecificOrderScrape().catch(console.error);
