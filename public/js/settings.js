// settings.js - Handling Visual Label Template Designer with Grid, Snap, Align, Google Fonts, and Line Styles

const defaultLayout = {
    printerIP: "192.168.50.12",
    fontFamily: "Inter", // Default Google Font
    leftMargin: 0, // Physical left margin offset
    title: { x: 20, y: 20, fontSize: 24, fontWeight: "bold", fontStyle: "normal", visible: true, label: "Tiêu đề đơn" },
    divider: { x: 20, y: 48, width: 360, height: 3, style: "solid", visible: true, label: "Vạch kẻ" },
    itemName: { x: 20, y: 60, fontSize: 28, fontWeight: "bold", fontStyle: "normal", visible: true, label: "Tên món ăn" },
    size: { x: 20, y: 120, fontSize: 20, fontWeight: "bold", fontStyle: "normal", visible: true, label: "Size món" },
    note: { x: 20, y: 150, fontSize: 16, fontWeight: "normal", fontStyle: "normal", visible: true, label: "Ghi chú/Topping" },
    timeStr: { x: 20, y: 200, fontSize: 18, fontWeight: "bold", fontStyle: "normal", visible: true, label: "Giờ/Ngày in" },
    indexStr: { x: 310, y: 200, fontSize: 18, fontWeight: "bold", fontStyle: "normal", visible: true, label: "Thứ tự tem" }
};

function getPrintConfig() {
    const defaultConf = {
        storeName: "RÔM RẢ CÀ PHÊ",
        address: "Địa chỉ: ...... ",
        phone: "SĐT: 09xxxxx",
        footerMsg: "-- Cảm ơn Quý Khách --",
        receiptFontSize: 12,
        showLogo: true,
        logoUrl: "/img/logo.png",
        layout: { ...defaultLayout }
    };
    try {
        const saved = localStorage.getItem('romra_print_config_v4');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.layout) {
                parsed.layout = { ...defaultLayout, ...parsed.layout };
            }
            return { ...defaultConf, ...parsed };
        }
    } catch (e) { console.error("Could not parse print config", e); }
    return defaultConf;
}

let currentLayout = null;
let selectedElementId = null;

function renderSettings() {
    const appContent = document.getElementById('app-content');
    const conf = getPrintConfig();
    currentLayout = conf.layout;

    appContent.innerHTML = `
    <div class="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 w-full animate-fade-in pb-12 px-4">
        <!-- FORM CẤU HÌNH IP VÀ HÓA ĐƠN BILL -->
        <div class="flex-1 flex flex-col gap-6">
            <div class="brutal-card bg-white p-6 border-4 border-black shadow-[8px_8px_0_0_#000]">
                <h2 class="text-3xl font-heading mb-6 border-b-4 border-black pb-2 flex items-center gap-2 uppercase">
                    <span class="material-symbols-outlined text-4xl">print</span> Cài Đặt Cấu Hình
                </h2>
                
                <!-- ĐỊA CHỈ IP MÁY IN & BÙ LỀ TRÁI -->
                <div class="mb-6 p-4 bg-red-50 border-4 border-black shadow-[4px_4px_0_0_#000]">
                    <h3 class="font-bold text-xl mb-3 font-heading uppercase flex items-center gap-2 text-red-900">
                        <span class="material-symbols-outlined">settings_ethernet</span> Máy in & Cấu hình tem
                    </h3>
                    <div class="flex flex-col gap-4">
                        <div>
                            <label class="block font-black text-sm mb-1 uppercase">Địa chỉ IP Máy In Tem (Cổng 9100)</label>
                            <input type="text" id="cfg-printerIP" value="${currentLayout.printerIP || '192.168.50.12'}" class="brutal-input w-full font-mono font-bold bg-white text-lg border-3 tracking-wide" placeholder="Ví dụ: 192.168.50.12">
                            <p class="text-xs text-gray-500 mt-1 font-bold">IP máy in của quán hiện tại: 192.168.50.12. Bạn có thể thay đổi ở đây nếu IP máy in bị nhảy.</p>
                        </div>
                        <div class="border-t border-dashed border-red-300 pt-3">
                            <label class="block font-black text-sm mb-1 uppercase flex items-center gap-1">
                                <span class="material-symbols-outlined text-sm align-middle">margin</span> Thụt lề trái bản in tem (px)
                            </label>
                            <div class="flex items-center border-2 border-black w-40">
                                <button onclick="changeLeftMargin(-5)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-r-2 border-black">-</button>
                                <input type="number" id="cfg-leftMargin" value="${currentLayout.leftMargin || 0}" oninput="updateLeftMargin(this.value)" class="w-16 text-center font-bold bg-white text-base py-1 outline-none">
                                <button onclick="changeLeftMargin(5)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-l-2 border-black">+</button>
                            </div>
                            <p class="text-xs text-gray-500 mt-1 font-bold">Bù khoảng cách cách lề bên trái nếu tem in ra thực tế bị lệch sát mép. Thường từ 10 đến 30px. Khi tăng, chữ trên tem thiết kế sẽ tự động dịch sang phải.</p>
                        </div>
                        <div class="border-t border-dashed border-red-300 pt-3">
                            <label class="flex items-center gap-3 cursor-pointer select-none border-2 border-black p-3 bg-white hover:bg-red-100 transition-colors">
                                <input type="checkbox" id="cfg-autoPrintOnline" class="w-6 h-6 border-4 border-black bg-white accent-black" ${localStorage.getItem('romra_auto_print_online') === 'true' ? 'checked' : ''}>
                                <span class="font-black text-sm uppercase text-red-950 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-base">print_connect</span> Tự động in tem đơn Online (Grab/Shopee)
                                </span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1 font-bold">Nếu bật, khi có đơn hàng Grab/Shopee mới đổ về, máy in sẽ tự động in tem dán cốc ngay lập tức. Nếu tắt, bạn phải click nút "In Tem" thủ công trên Popup báo đơn.</p>
                        </div>
                        <!-- Loai bo cac checkbox RawBT va NokoPrint cu vi da co tinh nang in Native xuyen thau cuc ky on dinh tu App APK -->
                    </div>
                </div>

                <!-- CẤU HÌNH HÓA ĐƠN BILL -->
                <div class="mb-6 p-4 bg-yellow-50 border-4 border-black shadow-[4px_4px_0_0_#000]">
                    <h3 class="font-bold text-xl mb-4 font-heading uppercase flex items-center gap-2"><span class="material-symbols-outlined">storefront</span> Hóa đơn 58mm (Receipt)</h3>
                    <div class="flex flex-col gap-4 font-bold">
                        <label class="flex items-center gap-3 cursor-pointer select-none border-2 border-black p-3 bg-white hover:bg-yellow-100 transition-colors">
                            <input type="checkbox" id="cfg-showLogo" class="w-6 h-6 border-4 border-black bg-white accent-black" ${conf.showLogo ? 'checked' : ''} onchange="updateReceiptPreview()">
                            <span class="font-bold">Nhúng Logo vào đầu hóa đơn</span>
                        </label>
                        <div>
                            <label class="block font-bold mb-1">Đường dẫn Logo (Tùy chọn)</label>
                            <input type="text" id="cfg-logoUrl" value="${conf.logoUrl}" oninput="updateReceiptPreview()" class="brutal-input text-sm w-full font-bold bg-white" placeholder="/img/logo.png">
                        </div>
                        <div>
                            <label class="block font-bold mb-1">Tên Thương Hiệu (In to bill)</label>
                            <input type="text" id="cfg-storeName" value="${conf.storeName}" oninput="updateReceiptPreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: Rôm Rả Cà Phê">
                        </div>
                        <div>
                            <label class="block font-bold mb-1">Địa chỉ</label>
                            <input type="text" id="cfg-address" value="${conf.address}" oninput="updateReceiptPreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: Số 123 Đường Nhựa">
                        </div>
                        <div>
                            <label class="block font-bold mb-1">Số điện thoại</label>
                            <input type="text" id="cfg-phone" value="${conf.phone}" oninput="updateReceiptPreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: SĐT: 0987.654.321">
                        </div>
                        <div>
                            <label class="block font-bold mb-1">Lời chào (cuối hóa đơn)</label>
                            <textarea id="cfg-footerMsg" oninput="updateReceiptPreview()" class="brutal-input w-full font-bold h-20 bg-white" placeholder="Cám ơn Quý khách rất nhiều!">${conf.footerMsg}</textarea>
                        </div>
                        <div>
                            <label class="block font-bold mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">text_fields</span> Cỡ chữ cơ sở (px)</label>
                            <input type="number" id="cfg-receiptFontSize" value="${conf.receiptFontSize}" oninput="updateReceiptPreview()" class="brutal-input w-32 font-bold text-center bg-white" min="8" max="24">
                        </div>
                    </div>
                </div>

                <!-- CẤU HÌNH CHIẾT KHẤU ĐƠN ONLINE -->
                <div class="mb-6 p-4 bg-blue-50 border-4 border-black shadow-[4px_4px_0_0_#000]">
                    <h3 class="font-bold text-xl mb-4 font-heading uppercase flex items-center gap-2 text-blue-900">
                        <span class="material-symbols-outlined">percent</span> Chiết khấu đơn online
                    </h3>
                    <div class="flex flex-col gap-4 font-bold">
                        <div>
                            <label class="block font-bold mb-1">Tỷ lệ chiết khấu GrabFood (%)</label>
                            <input type="number" id="cfg-commissionGrab" value="${localStorage.getItem('romra_commission_grab') || 25}" class="brutal-input w-32 font-bold text-center bg-white" min="0" max="100">
                            <p class="text-xs text-gray-500 mt-1 font-bold">Tỷ lệ hoa hồng Grab thu của quán. Dùng để tính toán doanh thu thực nhận ước tính trên POS và Hóa đơn.</p>
                        </div>
                        <div class="border-t border-dashed border-blue-300 pt-3">
                            <label class="block font-bold mb-1">Tỷ lệ chiết khấu ShopeeFood (%)</label>
                            <input type="number" id="cfg-commissionShopee" value="${localStorage.getItem('romra_commission_shopee') || 25}" class="brutal-input w-32 font-bold text-center bg-white" min="0" max="100">
                            <p class="text-xs text-gray-500 mt-1 font-bold">Tỷ lệ hoa hồng ShopeeFood thu của quán.</p>
                        </div>
                    </div>
                </div>

                <button onclick="saveVisualPrintConfig()" class="brutal-btn py-4 w-full text-xl flex items-center justify-center gap-2 bg-[#58D68D] text-black">
                    <span class="material-symbols-outlined font-black">save</span> LƯU LẠI CÀI ĐẶT
                </button>
            </div>
        </div>
        
        <!-- BẢN THIẾT KẾ TEM KÉO THẢ TRỰC QUAN (VISUAL LABELS STUDIO) -->
        <div class="w-full lg:w-[460px] shrink-0 flex flex-col gap-6">
            
            <div class="brutal-card bg-gray-100 p-5 border-4 border-black flex flex-col items-center shadow-[8px_8px_0_0_#000]">
                <h3 class="font-heading text-2xl mb-2 uppercase border-b-3 border-black pb-1 w-full flex items-center justify-between font-black">
                    <span>🎨 Thiết kế tem mẫu</span>
                    <span class="text-xs bg-black text-white px-2 py-0.5 rounded-none font-bold">50x30mm</span>
                </h3>
                
                <!-- CHỌN FONT CHỮ TIẾNG VIỆT TỪ GOOGLE FONTS -->
                <div class="w-full mb-4 font-bold text-left">
                    <label class="block mb-1 text-sm text-blue-900 uppercase flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm align-middle">font_download</span> Phông chữ tem (Google Fonts)
                    </label>
                    <select id="cfg-labelFontFamily" onchange="updateLabelFontFamily(this.value)" class="brutal-input w-full font-bold bg-white border-2">
                        <option value="Inter" ${currentLayout.fontFamily === 'Inter' ? 'selected' : ''}>Inter (Mặc định hiện đại)</option>
                        <option value="Montserrat" ${currentLayout.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat (Siêu đậm đà)</option>
                        <option value="Outfit" ${currentLayout.fontFamily === 'Outfit' ? 'selected' : ''}>Outfit (Hình học sang trọng)</option>
                        <option value="Roboto" ${currentLayout.fontFamily === 'Roboto' ? 'selected' : ''}>Roboto (Quốc dân rõ nét)</option>
                        <option value="Comfortaa" ${currentLayout.fontFamily === 'Comfortaa' ? 'selected' : ''}>Comfortaa (Tròn trịa đáng yêu)</option>
                    </select>
                </div>
                
                <!-- CONTAINER TEM IN MÔ PHỎNG (VẼ LƯỚI GRID MỜ CHỮ ĐEN NỀN TRẮNG) -->
                <div class="bg-white border-4 border-black relative shadow-lg overflow-hidden select-none mb-4" 
                     style="width: 400px; height: 240px; background-image: linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px); background-size: 10px 10px;" id="designer-canvas-box">
                     
                     <div id="item-left-margin-shield" class="absolute top-0 bottom-0 left-0 bg-red-500/10 border-r-2 border-dashed border-red-500 pointer-events-none z-20 ${currentLayout.leftMargin > 0 ? '' : 'hidden'}" style="width: ${currentLayout.leftMargin || 0}px;"></div>
                     
                     <div id="item-title" class="designer-element absolute" style="cursor: move;">LOCAL #102</div>
                     <div id="item-divider" class="designer-element absolute" style="cursor: move;"></div>
                     <div id="item-itemName" class="designer-element absolute uppercase" style="cursor: move;">Cà Phê Kem Dẻo Buôn Mê</div>
                     <div id="item-size" class="designer-element absolute" style="cursor: move;">Size: M</div>
                     <div id="item-note" class="designer-element absolute text-xs text-left" style="cursor: move;">Ghi chú: Ít đường | Thạch sương sáo</div>
                     <div id="item-timeStr" class="designer-element absolute" style="cursor: move;">15:29 23/05/2026</div>
                     <div id="item-indexStr" class="designer-element absolute" style="cursor: move;">1/1</div>
                </div>

                <!-- BẢNG ĐIỀU KHIỂN THUỘC TÍNH CỦA THÀNH PHẦN ĐANG CHỌN -->
                <div id="properties-panel" class="w-full bg-white border-3 border-black p-4 mb-4 font-bold flex flex-col gap-3">
                    <div class="text-sm text-gray-500 uppercase border-b-2 border-dashed border-gray-300 pb-1">Chưa chọn phần tử nào</div>
                    <div class="text-xs text-gray-500 font-normal">Hãy click chọn trực tiếp một phần tử trên khung tem để căn lề và đổi cỡ chữ!</div>
                </div>

                <!-- CÁC NÚT ĐIỀU KHIỂN NHANH -->
                <div class="w-full flex gap-3">
                    <button onclick="resetLabelLayoutToDefault()" class="flex-1 brutal-btn py-2 text-sm bg-gray-300 text-black hover:bg-gray-400 font-bold uppercase flex items-center justify-center gap-1">
                        <span class="material-symbols-outlined text-sm font-bold">restart_alt</span> Khôi Phục Gốc
                    </button>
                </div>
            </div>

            <!-- BẢN XEM TRƯỚC HÓA ĐƠN BILL -->
            <div class="brutal-card bg-gray-100 p-5 border-4 border-black flex flex-col items-center shadow-[8px_8px_0_0_#000]">
                <h3 class="font-heading text-xl mb-4 border-b-3 border-black pb-1 w-full flex items-center justify-between font-black">
                    <span>🧾 Bản mô phỏng Bill 58mm</span>
                </h3>
                <div class="bg-white border-2 border-gray-300 shadow-xl w-full" style="padding: 12px; min-height: 250px;">
                    <div id="preview-receipt-content" class="w-full h-full"></div>
                </div>
            </div>
            
        </div>
    </div>
    `;

    // Khởi tạo
    initVisualTemplateDesigner();
    updateReceiptPreview();
}

function initVisualTemplateDesigner() {
    const designerBox = document.getElementById('designer-canvas-box');
    if (!designerBox) return;

    // Áp dụng font family động của tem cho toàn bộ khung canvas thiết kế
    updateLabelFontFamily(currentLayout.fontFamily || 'Inter', false);

    // Setup shield ban đầu
    const shield = document.getElementById('item-left-margin-shield');
    if (shield) {
        const margin = currentLayout.leftMargin || 0;
        shield.style.width = `${margin}px`;
        if (margin > 0) shield.classList.remove('hidden');
        else shield.classList.add('hidden');
    }

    Object.keys(currentLayout).forEach(key => {
        if (key === 'printerIP' || key === 'fontFamily' || key === 'leftMargin') return;
        const el = document.getElementById(`item-${key}`);
        if (!el) return;

        const layoutItem = currentLayout[key];
        
        // Vị trí
        el.style.left = `${layoutItem.x}px`;
        el.style.top = `${layoutItem.y}px`;
        
        // Cỡ chữ và kiểu dáng vạch kẻ
        if (key === 'divider') {
            el.style.width = `${layoutItem.width || 360}px`;
            el.style.height = `0px`; // border-top gánh chiều cao nét vẽ
            const thickness = layoutItem.height || 3;
            const style = layoutItem.style || 'solid';
            el.style.borderTop = `${thickness}px ${style} black`;
        } else {
            el.style.fontSize = `${layoutItem.fontSize}px`;
            el.style.fontWeight = layoutItem.fontWeight === 'bold' ? 'bold' : 'normal';
            el.style.fontStyle = layoutItem.fontStyle === 'italic' ? 'italic' : 'normal';
        }

        // Trạng thái hiển thị (Bật tắt ẩn hiện)
        if (layoutItem.visible) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }

        // Kéo thả và sự kiện
        setupDraggingElement(el, key);
        
        el.onclick = (e) => {
            e.stopPropagation();
            selectElementForEdit(key);
        };
    });

    // Click ra ngoài canvas để hủy chọn
    designerBox.onclick = () => {
        deselectAllElements();
    };
}

function updateLabelFontFamily(font, save = true) {
    if (save) currentLayout.fontFamily = font;
    const designerBox = document.getElementById('designer-canvas-box');
    if (designerBox) {
        designerBox.style.fontFamily = `"${font}", sans-serif`;
    }
}

function setupDraggingElement(el, key) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let elemStartX = 0, elemStartY = 0;

    const onMouseDown = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        
        isDragging = true;
        el.style.zIndex = 100;
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        startX = clientX;
        startY = clientY;
        elemStartX = parseInt(el.style.left) || 0;
        elemStartY = parseInt(el.style.top) || 0;

        const onMouseMove = (ev) => {
            if (!isDragging) return;
            ev.preventDefault();
            
            const moveX = ev.type === 'touchmove' ? ev.touches[0].clientX : ev.clientX;
            const moveY = ev.type === 'touchmove' ? ev.touches[0].clientY : ev.clientY;
            
            const dx = moveX - startX;
            const dy = moveY - startY;
            
            let newX = elemStartX + dx;
            let newY = elemStartY + dy;
            
            // HÚT DÍNH (SNAP) VÀO LƯỚI GRID 10PX TỰ ĐỘNG
            newX = Math.round(newX / 10) * 10;
            newY = Math.round(newY / 10) * 10;
            
            // Giới hạn kéo thả trong phạm vi khung tem 400x240px
            const maxW = key === 'divider' ? (currentLayout.divider.width || 360) : el.offsetWidth;
            newX = Math.max(0, Math.min(400 - maxW, newX));
            newY = Math.max(0, Math.min(240 - el.offsetHeight, newY));
            
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
            
            // Cập nhật cấu hình layout tạm
            currentLayout[key].x = newX;
            currentLayout[key].y = newY;
            
            // Cập nhật bảng thuộc tính
            if (selectedElementId === key) {
                const labelX = document.getElementById('prop-x');
                const labelY = document.getElementById('prop-y');
                if (labelX) labelX.innerText = newX;
                if (labelY) labelY.innerText = newY;
            }
        };

        const onMouseUp = () => {
            isDragging = false;
            el.style.zIndex = '';
            
            if (e.type === 'mousedown') {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            } else {
                document.removeEventListener('touchmove', onMouseMove);
                document.removeEventListener('touchend', onMouseUp);
            }
        };

        if (e.type === 'mousedown') {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else {
            document.addEventListener('touchmove', onMouseMove, { passive: false });
            document.addEventListener('touchend', onMouseUp);
        }
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('touchstart', onMouseDown, { passive: true });
}

function selectElementForEdit(key) {
    selectedElementId = key;
    
    deselectAllElements(false);

    // Thêm viền đỏ nét đứt Brutalism nổi bật phần tử đang chọn
    const activeEl = document.getElementById(`item-${key}`);
    if (activeEl) {
        activeEl.classList.add('ring-2', 'ring-red-500', 'ring-offset-2', 'bg-red-50/50');
    }

    const panel = document.getElementById('properties-panel');
    if (!panel) return;

    const item = currentLayout[key];
    const isDivider = key === 'divider';

    // Tạo form chỉnh sửa thuộc tính cho phần tử
    panel.innerHTML = `
        <div class="text-base text-red-600 border-b-2 border-red-500 pb-1 flex justify-between items-center">
            <span>⚙️ ĐANG CHỌN: <span class="font-heading">${item.label.toUpperCase()}</span></span>
            <span class="text-xs text-gray-500 font-mono">(X: <span id="prop-x">${item.x}</span>, Y: <span id="prop-y">${item.y}</span>)</span>
        </div>
        
        <div class="flex flex-col gap-3 font-bold mt-1 text-sm">
            <!-- 1. BẬT TẮT HIỂN THỊ -->
            <label class="flex items-center gap-2 cursor-pointer py-1 select-none">
                <input type="checkbox" id="prop-visible" ${item.visible ? 'checked' : ''} onchange="updatePropVisible('${key}', this.checked)" class="w-5 h-5 border-2 border-black bg-white accent-black">
                <span>Hiển thị thuộc tính này trên tem</span>
            </label>
            
            <!-- 2. CỠ CHỮ / ĐỘ DÀY CỦA VẠCH -->
            <div class="flex items-center justify-between gap-4">
                <span>${isDivider ? 'Độ dày vạch (px)' : 'Cỡ chữ (font-size)'}:</span>
                <div class="flex items-center border-2 border-black">
                    <button onclick="changePropSize('${key}', -1)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-r-2 border-black">-</button>
                    <input type="number" id="prop-size" value="${isDivider ? (item.height || 3) : item.fontSize}" oninput="updatePropSize('${key}', this.value)" class="w-16 text-center font-bold bg-white text-base py-1 outline-none">
                    <button onclick="changePropSize('${key}', 1)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-l-2 border-black">+</button>
                </div>
            </div>
            
            ${isDivider ? `
            <!-- 3. ĐỘ RỘNG CỦA VẠCH KẺ -->
            <div class="flex items-center justify-between gap-4">
                <span>Chiều rộng vạch kẻ (px):</span>
                <div class="flex items-center border-2 border-black">
                    <button onclick="changePropWidth(-10)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-r-2 border-black">-</button>
                    <input type="number" id="prop-width" value="${item.width || 360}" oninput="updatePropWidth(this.value)" class="w-16 text-center font-bold bg-white text-base py-1 outline-none">
                    <button onclick="changePropWidth(10)" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 font-bold border-l-2 border-black">+</button>
                </div>
            </div>
            
            <!-- 4. KIỂU DÁNG NÉT VẼ VẠCH KẺ (SOLID, DASHED, DOTTED) -->
            <div class="flex items-center justify-between gap-4">
                <span>Kiểu nét vẽ vạch kẻ:</span>
                <select id="prop-line-style" onchange="updatePropLineStyle(this.value)" class="brutal-input py-1 px-2 text-xs w-40 bg-white border-2">
                    <option value="solid" ${item.style === 'solid' ? 'selected' : ''}>Nét liền (Solid)</option>
                    <option value="dashed" ${item.style === 'dashed' ? 'selected' : ''}>Nét đứt (Dashed)</option>
                    <option value="dotted" ${item.style === 'dotted' ? 'selected' : ''}>Nét chấm (Dotted)</option>
                </select>
            </div>
            ` : `
            <!-- 3. ĐỘ ĐẬM NHẠT (CHỮ) -->
            <div class="flex items-center justify-between gap-4">
                <span>Độ đậm nhạt (font-weight):</span>
                <div class="flex border-2 border-black">
                    <button id="btn-weight-normal" onclick="updatePropWeight('${key}', 'normal')" class="px-3 py-1 text-xs ${item.fontWeight === 'normal' ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200 text-black'} border-r-2 border-black">NORMAL</button>
                    <button id="btn-weight-bold" onclick="updatePropWeight('${key}', 'bold')" class="px-3 py-1 text-xs ${item.fontWeight === 'bold' ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200 text-black'}">BOLD</button>
                </div>
            </div>
            
            <!-- 3.1 KIỂU DÁNG CHỮ (THẲNG / NGHIÊNG) -->
            <div class="flex items-center justify-between gap-4">
                <span>Kiểu dáng chữ (font-style):</span>
                <div class="flex border-2 border-black">
                    <button id="btn-style-normal" onclick="updatePropStyle('${key}', 'normal')" class="px-3 py-1 text-xs ${item.fontStyle === 'italic' ? 'bg-gray-100 hover:bg-gray-200 text-black' : 'bg-black text-white'} border-r-2 border-black">THẲNG</button>
                    <button id="btn-style-italic" onclick="updatePropStyle('${key}', 'italic')" class="px-3 py-1 text-xs ${item.fontStyle === 'italic' ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200 text-black'}">NGHIÊNG</button>
                </div>
            </div>
            `}
            
            <!-- 5. BỘ CĂN LỀ NHANH (ALIGNMENT TOOLS) -->
            <div class="flex items-center justify-between gap-2 border-t border-dashed border-gray-300 pt-2 mt-1">
                <span>Canh lề nhanh:</span>
                <div class="flex border-2 border-black text-xs font-heading">
                    <button onclick="alignSelectedElement('left')" class="px-2 py-1 bg-white hover:bg-gray-100 border-r-2 border-black flex items-center gap-0.5" title="Canh Trái">⬅️ TRÁI</button>
                    <button onclick="alignSelectedElement('center')" class="px-2 py-1 bg-white hover:bg-gray-100 border-r-2 border-black flex items-center gap-0.5" title="Canh Giữa">↔️ GIỮA</button>
                    <button onclick="alignSelectedElement('right')" class="px-2 py-1 bg-white hover:bg-gray-100 flex items-center gap-0.5" title="Canh Phải">➡️ PHẢI</button>
                </div>
            </div>
        </div>
    `;
}

function deselectAllElements(resetPanel = true) {
    Object.keys(currentLayout).forEach(k => {
        if (k === 'printerIP' || k === 'fontFamily' || k === 'leftMargin') return;
        const el = document.getElementById(`item-${k}`);
        if (el) el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2', 'bg-red-50/50');
    });
    
    if (resetPanel) {
        selectedElementId = null;
        const panel = document.getElementById('properties-panel');
        if (panel) {
            panel.innerHTML = `
                <div class="text-sm text-gray-500 uppercase border-b-2 border-dashed border-gray-300 pb-1">Chưa chọn phần tử nào</div>
                <div class="text-xs text-gray-500 font-normal">Hãy click chọn trực tiếp một phần tử trên khung tem để căn lề và đổi cỡ chữ!</div>
            `;
        }
    }
}

window.alignSelectedElement = function(alignment) {
    if (!selectedElementId) return;
    const key = selectedElementId;
    const el = document.getElementById(`item-${key}`);
    if (!el) return;

    const maxW = key === 'divider' ? (currentLayout.divider.width || 360) : el.offsetWidth;
    let newX = currentLayout[key].x;

    if (alignment === 'left') {
        newX = 20; // Lề trái chuẩn
    } else if (alignment === 'center') {
        // Căn giữa tem (rộng 400px) và snap theo lưới 10px
        newX = Math.round((400 - maxW) / 2 / 10) * 10;
    } else if (alignment === 'right') {
        // Căn phải tem (rộng 400px, lề phải chuẩn 380px)
        newX = Math.round((380 - maxW) / 10) * 10;
    }

    // Giới hạn an toàn
    newX = Math.max(0, Math.min(400 - maxW, newX));

    el.style.left = `${newX}px`;
    currentLayout[key].x = newX;

    // Cập nhật tọa độ X trên bảng thuộc tính
    const labelX = document.getElementById('prop-x');
    if (labelX) labelX.innerText = newX;
};

window.updatePropLineStyle = function(style) {
    if (!currentLayout.divider) return;
    currentLayout.divider.style = style;
    
    const el = document.getElementById('item-divider');
    if (el) {
        const thickness = currentLayout.divider.height || 3;
        el.style.borderTop = `${thickness}px ${style} black`;
    }
};

window.updatePropVisible = function(key, isChecked) {
    currentLayout[key].visible = isChecked;
    const el = document.getElementById(`item-${key}`);
    if (el) {
        if (isChecked) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
};

window.changePropSize = function(key, offset) {
    const input = document.getElementById('prop-size');
    if (!input) return;
    let val = parseInt(input.value) || 12;
    val = Math.max(2, Math.min(80, val + offset));
    input.value = val;
    window.updatePropSize(key, val);
};

window.updatePropSize = function(key, val) {
    const size = parseInt(val) || 12;
    const el = document.getElementById(`item-${key}`);
    if (!el) return;

    if (key === 'divider') {
        currentLayout.divider.height = size;
        const style = currentLayout.divider.style || 'solid';
        el.style.borderTop = `${size}px ${style} black`;
    } else {
        currentLayout[key].fontSize = size;
        el.style.fontSize = `${size}px`;
    }
};

window.changePropWidth = function(offset) {
    const input = document.getElementById('prop-width');
    if (!input) return;
    let val = parseInt(input.value) || 360;
    val = Math.max(10, Math.min(400, val + offset));
    input.value = val;
    window.updatePropWidth(val);
};

window.updatePropWidth = function(val) {
    const w = parseInt(val) || 360;
    currentLayout.divider.width = w;
    const el = document.getElementById('item-divider');
    if (el) {
        el.style.width = `${w}px`;
        // Snap lề phải khi đổi rộng vạch kẻ để đảm bảo nằm gọn trong khung
        const x = parseInt(el.style.left) || 0;
        if (x + w > 400) {
            const newX = Math.max(0, Math.round((400 - w) / 10) * 10);
            el.style.left = `${newX}px`;
            currentLayout.divider.x = newX;
            const labelX = document.getElementById('prop-x');
            if (labelX) labelX.innerText = newX;
        }
    }
};

window.updatePropWeight = function(key, weight) {
    currentLayout[key].fontWeight = weight;
    const el = document.getElementById(`item-${key}`);
    if (el) el.style.fontWeight = weight === 'bold' ? 'bold' : 'normal';

    const btnNormal = document.getElementById('btn-weight-normal');
    const btnBold = document.getElementById('btn-weight-bold');
    if (btnNormal && btnBold) {
        if (weight === 'normal') {
            btnNormal.className = "px-3 py-1 text-xs bg-black text-white border-r-2 border-black";
            btnBold.className = "px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-black";
        } else {
            btnBold.className = "px-3 py-1 text-xs bg-black text-white";
            btnNormal.className = "px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-black border-r-2 border-black";
        }
    }
};

window.updatePropStyle = function(key, style) {
    currentLayout[key].fontStyle = style;
    const el = document.getElementById(`item-${key}`);
    if (el) el.style.fontStyle = style === 'italic' ? 'italic' : 'normal';

    const btnNormal = document.getElementById('btn-style-normal');
    const btnItalic = document.getElementById('btn-style-italic');
    if (btnNormal && btnItalic) {
        if (style === 'normal') {
            btnNormal.className = "px-3 py-1 text-xs bg-black text-white border-r-2 border-black";
            btnItalic.className = "px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-black";
        } else {
            btnItalic.className = "px-3 py-1 text-xs bg-black text-white";
            btnNormal.className = "px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-black border-r-2 border-black";
        }
    }
};

window.changeLeftMargin = function(offset) {
    const input = document.getElementById('cfg-leftMargin');
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, Math.min(100, val + offset));
    input.value = val;
    window.updateLeftMargin(val);
};

window.updateLeftMargin = function(val) {
    const margin = parseInt(val) || 0;
    const oldMargin = currentLayout.leftMargin || 0;
    currentLayout.leftMargin = margin;

    const shield = document.getElementById('item-left-margin-shield');
    if (shield) {
        shield.style.width = `${margin}px`;
        if (margin > 0) shield.classList.remove('hidden');
        else shield.classList.add('hidden');
    }

    // Tự động tịnh tiến (dịch chuyển) tọa độ x của các phần tử sang phải theo hiệu số chênh lệch
    const diff = margin - oldMargin;
    if (diff !== 0) {
        Object.keys(currentLayout).forEach(key => {
            if (key === 'printerIP' || key === 'fontFamily' || key === 'leftMargin') return;
            const el = document.getElementById(`item-${key}`);
            if (el) {
                const item = currentLayout[key];
                const maxW = key === 'divider' ? (currentLayout.divider.width || 360) : el.offsetWidth;
                let newX = item.x + diff;
                newX = Math.max(0, Math.min(400 - maxW, newX));
                item.x = newX;
                el.style.left = `${newX}px`;
            }
        });
        
        // Cập nhật giá trị hiển thị X trên properties panel nếu đang chọn phần tử
        if (selectedElementId) {
            const labelX = document.getElementById('prop-x');
            if (labelX) labelX.innerText = currentLayout[selectedElementId].x;
        }
    }
};

window.resetLabelLayoutToDefault = function() {
    if (confirm("Bạn có chắc chắn muốn khôi phục vị trí kéo thả và cỡ chữ tem về mặc định gốc không?")) {
        currentLayout = { ...defaultLayout };
        initVisualTemplateDesigner();
        deselectAllElements(true);
        if (typeof showToast === 'function') showToast("Đã khôi phục thiết kế tem mặc định!");
    }
};

function saveVisualPrintConfig() {
    const config = {
        storeName: document.getElementById('cfg-storeName').value,
        address: document.getElementById('cfg-address').value,
        phone: document.getElementById('cfg-phone').value,
        footerMsg: document.getElementById('cfg-footerMsg').value,
        receiptFontSize: document.getElementById('cfg-receiptFontSize').value || 12,
        showLogo: document.getElementById('cfg-showLogo').checked,
        logoUrl: document.getElementById('cfg-logoUrl').value || '/img/logo.png',
        
        layout: {
            ...currentLayout,
            printerIP: document.getElementById('cfg-printerIP').value || '192.168.50.12',
            leftMargin: parseInt(document.getElementById('cfg-leftMargin').value) || 0
        }
    };
    
    localStorage.setItem('romra_printer_ip', config.layout.printerIP);
    localStorage.setItem('romra_print_config_v4', JSON.stringify(config));
    
    // Luu tuy chon tu dong in don hang online
    const autoPrintOnline = document.getElementById('cfg-autoPrintOnline').checked;
    localStorage.setItem('romra_auto_print_online', autoPrintOnline ? 'true' : 'false');
    
    // Luu tuy chon chiet khau don online
    const commissionGrab = document.getElementById('cfg-commissionGrab').value || 25;
    const commissionShopee = document.getElementById('cfg-commissionShopee').value || 25;
    localStorage.setItem('romra_commission_grab', commissionGrab);
    localStorage.setItem('romra_commission_shopee', commissionShopee);
    
    // Luon dat false cho cac tuy chon in giay/in giat de luon in native qua APK
    localStorage.setItem('romra_direct_lan_print', 'false');
    localStorage.setItem('romra_system_print_label', 'false');
    
    if (typeof showToast === 'function') showToast("Đã lưu Cài đặt In ấn & Thiết kế Tem!");
    updateReceiptPreview();
}

window.updateReceiptPreview = function() {
    const storeName = document.getElementById('cfg-storeName').value || 'RÔM RẢ CÀ PHÊ';
    const address = document.getElementById('cfg-address').value;
    const phone = document.getElementById('cfg-phone').value;
    const footerMsg = document.getElementById('cfg-footerMsg').value || '-- Cảm ơn Quý Khách --';
    const receiptFontSize = Number(document.getElementById('cfg-receiptFontSize').value || 12);
    const showLogo = document.getElementById('cfg-showLogo').checked;
    const logoUrl = document.getElementById('cfg-logoUrl').value || '/img/logo.png';

    const mockTimeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const mockPlatformName = 'LOCAL';

    const previewReceipt = document.getElementById('preview-receipt-content');
    if (previewReceipt) {
        const mockItemsHtml = `
            <div style="margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px;">
                <div style="font-size: ${receiptFontSize + 4}px; font-weight: bold;">2 x Bạc Xỉu</div>
                <div style="font-size: ${receiptFontSize + 1}px;">Size: M | Giá: 30.000đ</div>
                <div style="font-size: ${receiptFontSize}px; font-style: italic;">*Ít đá xíu</div>
            </div>
            <div style="margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px;">
                <div style="font-size: ${receiptFontSize + 4}px; font-weight: bold;">1 x Cà phê Đen</div>
                <div style="font-size: ${receiptFontSize + 1}px;">Size: S | Giá: 25.000đ</div>
            </div>`;

        let logoHtml = showLogo ? `<div style="text-align: center; margin-bottom: 10px;"><img style="max-width: 80%; display: block; margin: 0 auto; filter: grayscale(100%) contrast(1.2);" src="${logoUrl}" alt="Logo" onerror="this.style.display='none'"></div>` : '';

        const receiptHtml = `
            <div style="font-family: monospace; width: 100%; color: #000; font-size: ${receiptFontSize}px; line-height: 1.2;">
                ${logoHtml}
                <div style="text-align: center; margin: 0 0 10px 0; font-size: ${receiptFontSize + 6}px; border-bottom: 2px solid #000; padding-bottom: 5px; font-weight: bold;">${storeName}</div>
                ${address ? `<div style="text-align: center; margin-bottom: 10px; font-size: ${receiptFontSize - 2}px;">${address}</div>` : ''}
                ${phone ? `<div style="text-align: center; margin-bottom: 10px; font-size: ${receiptFontSize - 2}px;">${phone}</div>` : ''}
                <div style="text-align: center; margin-bottom: 10px; border-top: 1px dashed #000; padding-top: 5px;">
                    <strong>ĐƠN ${mockPlatformName} #1234</strong><br/>
                    <span style="font-size: ${receiptFontSize - 2}px;">${mockTimeStr}</span>
                </div>
                <div style="margin-bottom: 10px; text-align: left;">
                    ${mockItemsHtml}
                </div>
                <div style="text-align: center; font-size: ${receiptFontSize + 2}px; margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; font-weight: bold;">
                    TỔNG CỘNG:<br/>85.000đ
                </div>
                <div style="text-align: center; font-size: ${receiptFontSize - 2}px; margin-top:20px; white-space: pre-wrap;">${footerMsg}</div>
            </div>`;
        previewReceipt.innerHTML = receiptHtml;
    }
};

// Global Exports
window.renderSettings = renderSettings;
window.getPrintConfig = getPrintConfig;
window.saveVisualPrintConfig = saveVisualPrintConfig;
