const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function inspectGrabLogin() {
    console.log('🌐 Đang khởi động trình duyệt để phân tích trang đăng nhập Grab...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log('🌐 Đang truy cập https://merchant.grab.com/portal/login ...');
        await page.goto('https://merchant.grab.com/portal/login', { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(8000);

        console.log('📍 URL hiện tại:', page.url());

        // Chụp ảnh màn hình lưu ở local để kiểm tra trực quan
        const screenshotPath = path.join(__dirname, 'grab_login_inspect.png');
        await page.screenshot({ path: screenshotPath });
        console.log('📸 Đã chụp ảnh màn hình lưu tại:', screenshotPath);

        // In các thẻ input hiện có trong trang
        const inputs = await page.evaluate(() => {
            const list = Array.from(document.querySelectorAll('input, button'));
            return list.map(el => ({
                tagName: el.tagName,
                type: el.getAttribute('type') || '',
                name: el.getAttribute('name') || '',
                placeholder: el.getAttribute('placeholder') || '',
                id: el.getAttribute('id') || '',
                class: el.getAttribute('class') || '',
                text: el.innerText || el.textContent || ''
            }));
        });

        console.log('\n🔍 CÁC PHẦN TỬ INPUT & BUTTON TÌM THẤY TRÊN TRANG:');
        console.log(JSON.stringify(inputs, null, 2));

        // Kiểm tra xem có chứa từ khóa Cloudflare hay Captcha không
        const bodyText = await page.innerText('body').catch(() => '');
        if (bodyText.includes('Cloudflare') || bodyText.includes('DDoS') || bodyText.includes('CAPTCHA') || bodyText.includes('verify')) {
            console.log('\n⚠️ CẢNH BÁO: Phát hiện trang chặn bảo mật Cloudflare / CAPTCHA Challenge!');
        }

    } catch (e) {
        console.error('❌ Lỗi:', e.message);
    } finally {
        await browser.close();
        console.log('Trình duyệt đã đóng.');
    }
}

inspectGrabLogin().catch(console.error);
