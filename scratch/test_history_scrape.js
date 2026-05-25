const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cấu hình Supabase (fallback về giá trị mặc định của hệ thống Rôm Rả)
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';
const supabase = createClient(supabaseUrl, supabaseKey);

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

    const browser = await chromium.launch({
        headless: true, // Chạy ẩn để thực thi trên VPS
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        storageState: STORAGE_STATE,
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        console.log('🌐 Đang kết nối tới Grab Merchant Portal...');
        await page.goto('https://merchant.grab.com/order', { waitUntil: 'networkidle', timeout: 60000 });
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
            await page.goto('https://merchant.grab.com/order-history', { waitUntil: 'networkidle' }).catch(() => {});
            await page.goto('https://merchant.grab.com/portal/order-history', { waitUntil: 'networkidle' }).catch(() => {});
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

        // Định vị các card đơn hàng trong danh sách lịch sử
        // Đơn hàng đã hoàn thành thường có text trạng thái là "Đã giao", "Đã hoàn thành", "Delivered", "Completed" hoặc "Đã hủy", "Cancelled"
        const orderSelectors = [
            'text="Đã giao"',
            'text="Đã hoàn thành"',
            'text="Delivered"',
            'text="Completed"',
            'text="Đã hủy"',
            'text="Cancelled"',
            'text=/^[A-Z0-9]+-[A-Z0-9]+$/'
        ];

        let clickedOrder = false;
        for (const selector of orderSelectors) {
            try {
                const cards = page.locator(selector).locator('..').locator('..');
                const count = await cards.count().catch(() => 0);
                if (count > 0) {
                    console.log(`🎯 Phát hiện ${count} đơn hàng lịch sử bằng selector: ${selector}. Tiến hành cào đơn đầu tiên...`);
                    await cards.first().click();
                    clickedOrder = true;
                    break;
                }
            } catch (err) {}
        }

        if (!clickedOrder) {
            console.log('❌ Không phát hiện bất kỳ đơn hàng nào trong lịch sử để cào thử.');
            
            // Quét và in ra danh sách tất cả phần tử có khả năng tương tác trên trang để tìm DatePicker thực sự
            try {
                const elementsInfo = await page.evaluate(() => {
                    const elms = Array.from(document.querySelectorAll('button, div[role="button"], input, a'));
                    return elms.map(el => ({
                        tag: el.tagName,
                        text: (el.innerText || '').trim().substring(0, 100),
                        class: el.className || '',
                        placeholder: el.placeholder || '',
                        type: el.type || '',
                        role: el.getAttribute('role') || ''
                    }));
                });
                console.log('\n📝 --- DANH SÁCH PHẦN TỬ CLICKABLE TRÊN TRANG (DEBUG) ---');
                console.log(JSON.stringify(elementsInfo, null, 2));
                console.log('-----------------------------------------------------------\n');
            } catch (err) {
                console.warn('⚠️ Lỗi khi quét phần tử:', err.message);
            }
            
            // Lưu screenshot để debug nếu cần
            await page.screenshot({ path: path.join(__dirname, 'history_error.png') });
            console.log('Đã lưu ảnh lỗi tại scratch/history_error.png để kiểm tra.');
            await browser.close();
            return;
        }

        await page.waitForTimeout(4000);
        const detailsText = await page.locator('body').innerText().catch(() => '');

        // 1. Lấy mã đơn ngắn bằng regex thông minh trên văn bản thô (ví dụ: GF-463)
        const shortIdMatch = detailsText.match(/GF-\d+/);
        const shortId = shortIdMatch ? shortIdMatch[0] : 'Không rõ';

        // 2. Lấy Booking ID (Mã đặt hàng dài) bằng regex trên văn bản thô
        const bookingIdMatch = detailsText.match(/Mã đặt hàng\s+([A-Z0-9\-]+)/i);
        const bookingId = bookingIdMatch ? bookingIdMatch[1] : shortId;

        // 3. Tên khách hàng
        const customerNameMatch = detailsText.match(/Khách hàng\s+([^\n]+)/i);
        const customerName = customerNameMatch && customerNameMatch[1].trim() !== '***' ? customerNameMatch[1].trim() : 'Khách Grab Lịch Sử';

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
    }
}

testHistoryScrape().catch(console.error);
