chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SYNC_TO_SERVER") {
        console.log("Background nhận được lệnh gửi server:", request.payload);
        fetch("http://localhost:3000/api/orders/sync-from-grab", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.payload)
        })
        .then(res => res.json())
        .then(data => console.log("Gửi thành công tới localhost:", data))
        .catch(err => console.log("Lỗi gửi localhost:", err));
        
        sendResponse({status: "ok"});
    } else if (request.type === "FETCH_GRAB_API") {
        console.log("Background đang tự động tải chi tiết đơn Grab:", request.url);
        
        // Lọc bỏ một số header cấm mà Chrome không cho gửi trong fetch
        let safeHeaders = {};
        for (let key in request.headers) {
            let lowerKey = key.toLowerCase();
            if (!['origin', 'referer', 'host', 'accept-encoding'].includes(lowerKey)) {
                safeHeaders[key] = request.headers[key];
            }
        }
        
        fetch(request.url, {
            headers: safeHeaders,
            credentials: 'include' // Bắt buộc phải có để đính kèm Cookies từ Chrome vào request
        })
        .then(async res => {
            const text = await res.text();
            if (!res.ok) {
                console.log(`❌ Lỗi HTTP ${res.status} từ Grab API:`, text);
                return null;
            }
            try {
                return JSON.parse(text);
            } catch(e) {
                console.log("❌ LỖI KHÔNG PHẢI JSON. Dữ liệu thô:", text);
                return null;
            }
        })
        .then(data => {
            if (!data) return;
            let orderData = data.data || data;
            if (orderData && (orderData.ID || orderData.orderID || orderData.shortOrderNumber)) {
                console.log("🥩 Background ĐÃ LẤY ĐƯỢC THỊT:", orderData.orderID || orderData.ID);
                // Gửi thẳng về Server
                fetch("http://localhost:3000/api/orders/sync-from-grab", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ platform: 'grab', type: 'OrderDetails', orders: [orderData] })
                });
            }
        })
        .catch(err => console.log("Lỗi fetch API Grab từ background:", err));
        
        sendResponse({status: "ok"});
    }
    return true;
});
