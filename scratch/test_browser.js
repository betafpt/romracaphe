const { chromium } = require('playwright');
const path = require('path');

async function run() {
    console.log('Starting browser test for LIVE POS Dashboard (Online Tab)...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Lắng nghe console log từ trình duyệt
    page.on('console', msg => {
        console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Lắng nghe các lỗi uncaught exception trong trình duyệt
    page.on('pageerror', err => {
        console.error('[BROWSER ERROR]', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
    });

    try {
        console.log('Navigating to http://localhost:3000 to set domain context...');
        await page.goto('http://localhost:3000');
        
        console.log('Setting admin credentials in localStorage...');
        await page.evaluate(() => {
            localStorage.setItem('user_role', 'admin');
            localStorage.setItem('user_name', 'Giang Nguyen');
            localStorage.setItem('sidebar_collapsed', 'false');
        });
        
        console.log('Performing hard reload to apply localStorage credentials...');
        await page.evaluate(() => {
            window.location.reload();
        });
        
        console.log('Waiting for network to become idle after reload...');
        await page.waitForLoadState('networkidle');
        
        console.log('Navigating to LIVE POS route...');
        await page.evaluate(() => {
            if (typeof navigate === 'function') {
                navigate('pos');
            } else {
                console.error('navigate function not found!');
            }
        });
        
        console.log('Waiting 3 seconds for LIVE POS data load...');
        await page.waitForTimeout(3000);
        
        console.log('Switching POS tab to App/Online orders...');
        await page.evaluate(() => {
            if (typeof window.switchPOSTab === 'function') {
                window.switchPOSTab('app');
            } else {
                console.error('switchPOSTab function not found!');
            }
        });
        
        console.log('Waiting 5 seconds for Online orders rendering...');
        await page.waitForTimeout(5000);

        const screenshotPath = path.join('C:\\Users\\Giang Nguyen\\.gemini\\antigravity-ide\\brain\\a85856f9-36da-4f2f-b766-c4dd9137ccb3', 'browser_test_screenshot.png');
        console.log(`Taking screenshot of LIVE POS (Online Tab) and saving to: ${screenshotPath}`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('Screenshot taken successfully.');

    } catch (error) {
        console.error('Error during browser testing:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

run();
