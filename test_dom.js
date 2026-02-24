const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', error => console.error('BROWSER ERROR:', error));

    const fileUrl = 'file://' + path.resolve(__dirname, 'public/index.html');
    console.log('Navigating to:', fileUrl);

    await page.goto(fileUrl, { waitUntil: 'load' });

    await page.waitForTimeout(1000); // give it a second to render

    const role = await page.evaluate(() => window.currentUserRole);
    console.log('Role is:', role);

    const isSidebarHidden = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        return sb ? sb.style.display === 'none' : 'not found';
    });
    console.log('Sidebar hidden:', isSidebarHidden);

    const isTopbarHidden = await page.evaluate(() => {
        const tb = document.getElementById('topbar-header');
        return tb ? tb.style.display === 'none' : 'not found';
    });
    console.log('Topbar hidden:', isTopbarHidden);

    const title = await page.evaluate(() => document.getElementById('page-title').innerText);
    console.log('Page Title:', title);

    const headerHTML = await page.evaluate(() => document.getElementById('topbar-header')?.outerHTML.substring(0, 100));
    console.log('Header HTML:', headerHTML);

    await browser.close();
})();
