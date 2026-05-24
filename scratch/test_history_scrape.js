const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
            const bodyText = await page.locator('body').innerText().catch(() => '');
            console.log('\n📝 --- NỘI DUNG CHỮ TRÊN MÀN HÌNH (DEBUG) ---');
            console.log(bodyText.substring(0, 1500));
            console.log('-------------------------------------------\n');
            
            // Lưu screenshot để debug nếu cần
            await page.screenshot({ path: path.join(__dirname, 'history_error.png') });
            console.log('Đã lưu ảnh lỗi tại scratch/history_error.png để kiểm tra.');
            await browser.close();
            return;
        }

        await page.waitForTimeout(4000);
        const detailsPanel = page.locator('body');

        // 1. Lấy mã đơn ngắn
        const shortId = await page.locator('text=/^[A-Z0-9]+-[A-Z0-9]+$/').first().innerText().catch(() => 'Không rõ');

        // 2. Lấy Booking ID (Mã đặt hàng dài)
        const bookingIdStr = await detailsPanel.locator('text="Mã đặt hàng"').locator('..').innerText().catch(() => '');
        const bookingId = bookingIdStr.replace('Mã đặt hàng', '').trim() || shortId;

        // 3. Tên khách hàng
        const headerText = await detailsPanel.locator('text=/món cho /').first().innerText().catch(() => '');
        const customerName = headerText.split(' cho ')[1] || 'Khách Grab Lịch Sử';

        // 4. Trích xuất danh sách món ăn
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

        // 5. Cào các thông tin tài chính chi tiết
        const totalText = await detailsPanel.locator('text="Tổng cộng"').locator('..').innerText().catch(() => '0');
        const totalAmount = parseInt(totalText.replace(/\D/g, '')) || 0;

        const subtotalText = await detailsPanel.locator('text="Tạm tính"').or(detailsPanel.locator('text="Tổng tiền món"')).locator('..').innerText().catch(() => '');
        const subtotalAmount = parseInt(subtotalText.replace(/\D/g, '')) || totalAmount;

        const discountText = await detailsPanel.locator('text="Khuyến mại"').or(detailsPanel.locator('text="Giảm giá"')).locator('..').innerText().catch(() => '');
        const discountAmount = parseInt(discountText.replace(/\D/g, '')) || 0;

        const addressText = await detailsPanel.locator('text="Địa chỉ giao hàng"').or(detailsPanel.locator('text="Giao đến"')).locator('..').innerText().catch(() => '');
        const customerAddress = addressText.replace('Địa chỉ giao hàng', '').replace('Giao đến', '').trim() || 'Giao qua App';

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

    } catch (e) {
        console.error('❌ Lỗi xảy ra trong quá trình cào thử đơn lịch sử:', e.message);
    } finally {
        await browser.close();
        console.log('Trình duyệt đóng. Hoàn tất kiểm thử.');
    }
}

testHistoryScrape().catch(console.error);
