document.getElementById('btn-shopee').addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const statusDiv = document.getElementById('status');
    statusDiv.style.display = 'block';

    if (!tab.url.includes("merchant.shopeefood.vn")) {
        statusDiv.innerText = "❌ Lỗi: Bạn đang không ở trang merchant.shopeefood.vn. Hãy mở tab của ShopeeFood và bấm lại.";
        return;
    }

    statusDiv.innerHTML = "⏳ <b>Đã kích hoạt lấy đơn ShopeeFood!</b><br>Extension đang lấy dữ liệu. Hãy đợi...";

    // TODO: Sẽ làm phần Auto Polling ShopeeFood sau, tạm thời giữ cơ chế cũ
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractShopeeData,
    }, async (injectionResults) => {
        if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]) {
            statusDiv.innerText = "❌ Lỗi khi trích xuất dữ liệu. Hãy tải lại trang ShopeeFood.";
            return;
        }
        
        const data = injectionResults[0].result;
        
        try {
            const res = await fetch("http://localhost:3000/api/sync-tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform: "shopee", data: data })
            });
            const json = await res.json();
            if(json.success) {
                statusDiv.innerHTML = "✅ <b>Thành công!</b> Đã gửi Token ShopeeFood về Server Rôm Rả.";
            } else {
                statusDiv.innerHTML = "❌ Lỗi từ server Rôm Rả: " + json.error;
            }
        } catch (e) {
            statusDiv.innerHTML = "❌ Lỗi kết nối đến Server Rôm Rả. Hãy chắc chắn web Rôm Rả đang chạy.";
        }
    });
});

document.getElementById('btn-grab').addEventListener('click', async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const statusDiv = document.getElementById('status');
    statusDiv.style.display = 'block';

    if (!tab.url.includes("merchant.grab.com")) {
        statusDiv.innerText = "❌ Lỗi: Bạn đang không ở trang merchant.grab.com. Hãy mở tab của Grab và bấm lại.";
        return;
    }
    
    statusDiv.innerHTML = "⏳ <b>Đã kích hoạt chế độ tự động nhận đơn Grab!</b><br>Extension sẽ âm thầm lấy đơn từ tab này mỗi khi có thay đổi. Xin đừng đóng tab Grab.";

    // Tiêm Listener vào môi trường ISOLATED
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: setupMessageRelay,
        world: "ISOLATED"
    });

    // Tiêm Interceptor trực tiếp vào não trang web (MAIN world) để né CSP của Grab
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: startGrabInterceptor,
        world: "MAIN"
    });
});

// Hàm này sẽ chạy trong môi trường riêng của Extension (Content Script)
function setupMessageRelay() {
    window.addEventListener("message", function(event) {
        if (event.source !== window || !event.data) return;
        
        if (event.data.type === "GRAB_INTERCEPTED") {
            console.log("Cầu nối nhận dữ liệu Grab:", event.data.payload);
            chrome.runtime.sendMessage({
                type: "SYNC_TO_SERVER",
                payload: event.data.payload
            }, function(response) {
                if(chrome.runtime.lastError) console.log("Lỗi gửi bg:", chrome.runtime.lastError);
            });
        } else if (event.data.type === "FETCH_GRAB_API") {
            console.log("Cầu nối đã nhận lệnh gửi cho Background đi lấy thịt đơn:", event.data.url);
            chrome.runtime.sendMessage({
                type: "FETCH_GRAB_API",
                url: event.data.url,
                headers: event.data.headers
            }, function(response) {
                if(chrome.runtime.lastError) console.log("Lỗi gửi bg:", chrome.runtime.lastError);
            });
        }
    });
}

// Hàm này sẽ Inject một đoạn code lồng thẳng vào não của trang Grab
function startGrabInterceptor() {
    if (window.romraInterceptorSetup) return;
    window.romraInterceptorSetup = true;

    console.log("🕵️ Gián điệp Rôm Rả Cà Phê đã lọt vào lõi Grab (Bypass CSP) + Săn XHR!");
    
    // --- BIẾN TOÀN CỤC ĐỂ LƯU HEADERS ---
    window.romraGrabHeaders = window.romraGrabHeaders || {};

    // --- 1. GHI ĐÈ HÀM FETCH ---
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        // Ăn cắp headers từ fetch
        if (args[1] && args[1].headers) {
            let h = args[1].headers;
            if (h instanceof Headers) {
                h.forEach((value, key) => window.romraGrabHeaders[key] = value);
            } else {
                Object.assign(window.romraGrabHeaders, h);
            }
        }
        
        const response = await originalFetch.apply(this, args);
        try {
            const url = args[0] instanceof Request ? args[0].url : (typeof args[0] === 'string' ? args[0] : args[0].toString());
            const detailMatch = url.match(/\/merchant\/v\d+\/orders\/([a-zA-Z0-9-]+)/);
            
            if (url.includes('orders-pagination') || url.includes('daily-pagination')) {
                console.log("🔥 [FETCH] Phát hiện Grab tải danh sách đơn từ:", url);
                response.clone().json().then(data => {
                    let ordersList = data.orders || (data.data ? data.data.orders : null) || data.statements || data.data || data;
                    if (Array.isArray(ordersList) && ordersList.length > 0) {
                        let pageTypeMatch = url.match(/PageType=([^&]+)/);
                        let pageType = pageTypeMatch ? pageTypeMatch[1] : (url.includes('daily-pagination') ? 'History' : 'Unknown');
                        console.log("🎉 BẮT ĐƯỢC BẰNG FETCH:", ordersList.length, "đơn", pageType);
                        
                        // --- TỰ ĐỘNG HÓA LẤY CHI TIẾT MÓN ĂN ---
                        window.romraFetchedOrders = window.romraFetchedOrders || new Set();
                        
                        ordersList.forEach((order, index) => {
                            let orderId = order.ID || order.orderID;
                            if (orderId && !window.romraFetchedOrders.has(orderId)) {
                                window.romraFetchedOrders.add(orderId);
                                
                                setTimeout(() => {
                                    console.log(`🤖 Bot đang tự động lấy đơn: ${orderId}`);
                                    
                                    // CHỈ LẤY CÁC HEADER BẢO MẬT CẦN THIẾT
                                    // Tránh lấy tất cả sẽ bị lỗi CORS Preflight do Grab không cho phép
                                    let safeHeaders = {};
                                    for (let key in window.romraGrabHeaders) {
                                        let lk = key.toLowerCase();
                                        if (lk.includes('auth') || lk.includes('token') || lk.includes('x-mts') || lk.includes('x-grab') || lk === 'merchantid' || lk === 'requestsource') {
                                            safeHeaders[key] = window.romraGrabHeaders[key];
                                        }
                                    }

                                    originalFetch.call(window, `https://api.grab.com/food/merchant/v3/orders/${orderId}`, {
                                        credentials: 'include',
                                        headers: safeHeaders
                                    }).then(res => res.json()).then(data => {
                                        let orderData = data.order || data.data || data;
                                        if (orderData && (orderData.ID || orderData.orderID || orderData.shortOrderNumber)) {
                                            console.log("🥩 BẮT ĐƯỢC THỊT BẰNG MAIN FETCH:", orderData.orderID || orderData.ID);
                                            window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: 'OrderDetails', orders: [orderData] } }, "*");
                                        } else {
                                            console.log("⚠️ Không tìm thấy ID đơn hàng trong dữ liệu V3!");
                                        }
                                    }).catch(e => console.log("Lỗi fetch chi tiết Grab:", e));

                                }, 500 + (index * 600));  
                            }
                        });
                        
                        window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: pageType, orders: ordersList } }, "*");
                    } else {
                        console.log("⚠️ Không tìm thấy đơn hàng trong dữ liệu Grab trả về.");
                    }
                }).catch(e => console.log("Lỗi đọc JSON Grab:", e));
            } else if (detailMatch && !url.includes('orders-pagination')) {
                // ... (GIỮ NGUYÊN PHẦN BẮT DETAIL CỦA FETCH) ...
                console.log("🔥 [FETCH] Phát hiện Grab tải CHI TIẾT ĐƠN:", detailMatch[1]);
                response.clone().json().then(data => {
                    let orderData = data.data || data;
                    if (orderData && (orderData.ID || orderData.orderID || orderData.shortOrderNumber)) {
                        console.log("🥩 ĐÃ LẤY ĐƯỢC THỊT (CHI TIẾT MÓN ĂN):", orderData.orderID || orderData.ID);
                        window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: 'OrderDetails', orders: [orderData] } }, "*");
                    }
                }).catch(e => console.log("Lỗi đọc JSON chi tiết đơn Grab:", e));
            }
        } catch (error) { console.error("Lỗi interceptor fetch:", error); }
        return response;
    };

    // --- 2. GHI ĐÈ HÀM XMLHttpRequest (XHR) ---
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        window.romraGrabHeaders[header] = value;
        return originalXHRSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.responseURL) {
                    const detailMatch = this.responseURL.match(/\/merchant\/v\d+\/orders\/([a-zA-Z0-9-]+)/);
                    
                    if (this.responseURL.includes('orders-pagination') || this.responseURL.includes('daily-pagination')) {
                        console.log("🔥 [XHR] Phát hiện Grab tải danh sách đơn từ:", this.responseURL);
                        if (this.responseText) {
                            let data = JSON.parse(this.responseText);
                            let ordersList = data.orders || (data.data ? data.data.orders : null) || data.statements || data.data || data;
                            
                            if (Array.isArray(ordersList) && ordersList.length > 0) {
                                let pageTypeMatch = this.responseURL.match(/PageType=([^&]+)/);
                                let pageType = pageTypeMatch ? pageTypeMatch[1] : (this.responseURL.includes('daily-pagination') ? 'History' : 'Unknown');
                                console.log("🎉 BẮT ĐƯỢC BẰNG XHR:", ordersList.length, "đơn", pageType);
                                
                                // --- TỰ ĐỘNG HÓA LẤY CHI TIẾT MÓN ĂN ---
                                window.romraFetchedOrders = window.romraFetchedOrders || new Set();
                                
                                // Tạm thời tải luôn chi tiết cho đơn History để test
                                ordersList.forEach((order, index) => {
                                    let orderId = order.ID || order.orderID;
                                    if (orderId && !window.romraFetchedOrders.has(orderId)) {
                                        window.romraFetchedOrders.add(orderId);
                                        setTimeout(() => {
                                            console.log(`🤖 Bot đang tự động lấy đơn (History): ${orderId}`);
                                            
                                            let safeHeaders = {};
                                            for (let key in window.romraGrabHeaders) {
                                                let lk = key.toLowerCase();
                                                if (lk.includes('auth') || lk.includes('token') || lk.includes('x-mts') || lk.includes('x-grab') || lk === 'merchantid' || lk === 'requestsource') {
                                                    safeHeaders[key] = window.romraGrabHeaders[key];
                                                }
                                            }

                                            originalFetch.call(window, `https://api.grab.com/food/merchant/v3/orders/${orderId}`, {
                                                credentials: 'include',
                                                headers: safeHeaders
                                            }).then(res => res.json()).then(data => {
                                                let orderData = data.order || data.data || data;
                                                if (orderData && (orderData.ID || orderData.orderID || orderData.shortOrderNumber)) {
                                                    console.log("🥩 BẮT ĐƯỢC THỊT BẰNG MAIN FETCH:", orderData.orderID || orderData.ID);
                                                    window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: 'OrderDetails', orders: [orderData] } }, "*");
                                                } else {
                                                    console.log("⚠️ Không tìm thấy ID đơn hàng trong dữ liệu V3!");
                                                }
                                            }).catch(e => console.log("Lỗi fetch chi tiết Grab:", e));

                                        }, 500 + (index * 600)); 
                                    }
                                });
                                
                                window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: pageType, orders: ordersList } }, "*");
                            } else {
                                console.log("⚠️ Không tìm thấy đơn hàng trong dữ liệu Grab trả về.");
                            }
                        }
                    } else if (detailMatch && !this.responseURL.includes('orders-pagination')) {
                        console.log("🔥 [XHR] Phát hiện Grab tải CHI TIẾT ĐƠN:", detailMatch[1]);
                        if (this.responseText) {
                            try {
                                let data = JSON.parse(this.responseText);
                                let orderData = data.data || data;
                                if (orderData && (orderData.ID || orderData.orderID || orderData.shortOrderNumber)) {
                                    console.log("🥩 ĐÃ LẤY ĐƯỢC THỊT (CHI TIẾT MÓN ĂN):", orderData.orderID || orderData.ID);
                                    window.postMessage({ type: "GRAB_INTERCEPTED", payload: { platform: 'grab', type: 'OrderDetails', orders: [orderData] } }, "*");
                                }
                            } catch (err) {
                                console.log("Lỗi parse JSON chi tiết:", err);
                            }
                        }
                    }
                }
            } catch (error) { console.error("Lỗi interceptor XHR:", error); }
        });
        return originalXHRSend.apply(this, arguments);
    };
}

// Hàm dành cho ShopeeFood
function extractShopeeData() {
    return {
        cookies: document.cookie, 
        localStorage: JSON.stringify(window.localStorage),
        sessionStorage: JSON.stringify(window.sessionStorage)
    };
}
