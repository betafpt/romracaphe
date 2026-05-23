// Built-in fetch will be used

async function testGrab() {
    try {
        // 1. Lấy token từ server nội bộ
        console.log("Đang lấy token từ Server Rôm Rả...");
        const resLocal = await fetch("http://localhost:3000/api/sync-tokens");
        const localData = await resLocal.json();
        
        if (!localData.data.grab || !localData.data.grab.cookies) {
            console.log("❌ Chưa có token Grab. Vui lòng bấm lấy token trên Extension trước.");
            return;
        }

        const grabCookies = localData.data.grab.cookies;
        
        // 2. Fetch Grab API
        console.log("Đang gọi API GrabFood...");
        const merchantID = "5-C7XTNBEUGLKHHA"; // Lấy từ hình ảnh của user
        const url = `https://api.grab.com/delv-platform-api/merchant/v4/orders-pagination?AutoAcceptGroup=1&merchantID=${merchantID}&PageType=Upcoming&searchToken=&size=50`;

        const grabRes = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'cookie': grabCookies,
                'merchantid': merchantID,
                'origin': 'https://merchant.grab.com',
                'referer': 'https://merchant.grab.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
            }
        });

        const text = await grabRes.text();
        console.log("HTTP Status:", grabRes.status);
        console.log("Raw Response:", text.substring(0, 1000));

    } catch (e) {
        console.error("Lỗi:", e);
    }
}

testGrab();
