// settings.js - Handling Print Template Configuration

function getPrintConfig() {
    const defaultConf = {
        storeName: "RÔM RẢ CÀ PHÊ",
        address: "Địa chỉ: ...... ",
        phone: "SĐT: 09xxxxx",
        footerMsg: "-- Cảm ơn Quý Khách --",
        receiptFontSize: 12,
        showLogo: true,
        logoUrl: "/img/logo.png",
        labelShowTime: true,
        labelShowStoreInfo: true,
        labelFontSize: 12,
        labelBaseFontSize: 9,
        labelSizeFontSize: 11,
        labelFontFamily: 'sans-serif'
    };
    try {
        const saved = localStorage.getItem('romra_print_config');
        if (saved) return { ...defaultConf, ...JSON.parse(saved) };
    } catch (e) { console.error("Could not parse print config", e); }
    return defaultConf;
}

function savePrintConfig() {
    const config = {
        storeName: document.getElementById('cfg-storeName').value,
        address: document.getElementById('cfg-address').value,
        phone: document.getElementById('cfg-phone').value,
        footerMsg: document.getElementById('cfg-footerMsg').value,
        receiptFontSize: document.getElementById('cfg-receiptFontSize').value || 12,
        showLogo: document.getElementById('cfg-showLogo').checked,
        logoUrl: document.getElementById('cfg-logoUrl').value || '/img/logo.png',
        labelShowTime: document.getElementById('cfg-labelShowTime').checked,
        labelShowStoreInfo: document.getElementById('cfg-labelShowStoreInfo').checked,
        labelFontSize: document.getElementById('cfg-labelFontSize').value || 12,
        labelBaseFontSize: document.getElementById('cfg-labelBaseFontSize').value || 9,
        labelSizeFontSize: document.getElementById('cfg-labelSizeFontSize').value || 11,
        labelFontFamily: document.getElementById('cfg-labelFontFamily').value || 'sans-serif'
    };
    localStorage.setItem('romra_print_config', JSON.stringify(config));
    if (typeof showToast === 'function') showToast("Đã lưu Cài đặt In ấn!");
    updateLivePreview(); // Refresh preview explicitly just in case
}

window.updateLivePreview = function () {
    // Collect immediate values
    const storeName = document.getElementById('cfg-storeName').value || 'RÔM RẢ CÀ PHÊ';
    const address = document.getElementById('cfg-address').value;
    const phone = document.getElementById('cfg-phone').value;
    const footerMsg = document.getElementById('cfg-footerMsg').value || '-- Cảm ơn Quý Khách --';
    const receiptFontSize = Number(document.getElementById('cfg-receiptFontSize').value || 12);
    const showLogo = document.getElementById('cfg-showLogo').checked;
    const logoUrl = document.getElementById('cfg-logoUrl').value || '/img/logo.png';
    const labelShowTime = document.getElementById('cfg-labelShowTime').checked;
    const labelShowStoreInfo = document.getElementById('cfg-labelShowStoreInfo').checked;
    const labelFontSize = Number(document.getElementById('cfg-labelFontSize').value || 12);
    const labelBaseFontSize = Number(document.getElementById('cfg-labelBaseFontSize').value || 9);
    const labelSizeFontSize = Number(document.getElementById('cfg-labelSizeFontSize').value || 11);
    const labelFontFamily = document.getElementById('cfg-labelFontFamily').value || 'sans-serif';

    // MOCK DATA for preview
    const mockTimeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const mockPlatformName = 'LOCAL';

    // ============================================
    // PREVIEW: HÓA ĐƠN 58MM
    // ============================================
    const previewReceipt = document.getElementById('preview-receipt-content');
    if (previewReceipt) {
        // Build mock items
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

    // ============================================
    // PREVIEW: TEM DÁN LY 50X30MM
    // ============================================
    const previewLabel = document.getElementById('preview-label-content');
    if (previewLabel) {
        let storeDisplay = labelShowStoreInfo ? `<span style="float: left;">${storeName} - ${mockPlatformName}</span>` : `<span style="float: left;">${mockPlatformName}</span>`;

        const labelHtml = `
            <div style="font-family: ${labelFontFamily}; display: flex; flex-direction: column; position: relative; width: 100%; height: 100%; padding: 2px; box-sizing: border-box; color: #000; background: #fff;">
                <div style="font-weight: bold; font-size: ${labelBaseFontSize + 1}px; border-bottom: 1px solid #000; padding-bottom: 1px; margin-bottom: 2px;">
                    ${storeDisplay}
                    <span style="float: right;">#1234</span>
                    <div style="clear: both;"></div>
                </div>
                <div style="font-weight: 900; font-size: ${labelFontSize}px; line-height: 1.1; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Bạc Xỉu</div>
                <div style="font-size: ${labelSizeFontSize}px; font-weight: bold; margin-bottom: 1px;">
                    <span>Size: M</span>
                    <span style="float: right;">1<sub>/2</sub></span>
                    <div style="clear: both;"></div>
                </div>
                <div style="font-size: ${labelBaseFontSize - 1}px; font-style: italic; overflow: hidden;">Ghi chú: Ít đá xíu</div>
                ${labelShowTime ? `<div style="font-size: ${labelBaseFontSize - 2}px; position: absolute; bottom: 2px; right: 3px;">${mockTimeStr}</div>` : ''}
            </div>
        `;
        previewLabel.innerHTML = labelHtml;
    }
}

function renderSettings() {
    const appContent = document.getElementById('app-content');
    const conf = getPrintConfig();

    appContent.innerHTML = `
    <div class="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 w-full animate-fade-in pb-12">
        <!-- FORM CẤU HÌNH -->
        <div class="flex-1 brutal-card bg-white p-6 border-4 border-black shadow-[8px_8px_0_0_#000]">
            <h2 class="text-3xl font-heading mb-6 border-b-4 border-black pb-2 flex items-center gap-2 uppercase">
                <span class="material-symbols-outlined text-4xl">print</span> Cấu Hình In Ấn Mẫu
            </h2>
            
            <!-- THÔNG TIN QUÁN -->
            <div class="mb-8 p-4 bg-yellow-50 border-4 border-black shadow-[4px_4px_0_0_#000]">
                <h3 class="font-bold text-xl mb-4 font-heading uppercase flex items-center gap-2"><span class="material-symbols-outlined">storefront</span> Hóa đơn 58mm (Receipt)</h3>
                <div class="flex flex-col gap-4">
                    <label class="flex items-center gap-3 cursor-pointer select-none border-2 border-black p-3 bg-white hover:bg-yellow-100 transition-colors">
                        <input type="checkbox" id="cfg-showLogo" class="w-6 h-6 border-4 border-black bg-white accent-black" ${conf.showLogo ? 'checked' : ''} onchange="updateLivePreview()">
                        <span class="font-bold">Nhúng Logo vào đầu hóa đơn</span>
                    </label>
                    <div>
                        <label class="block font-bold mb-1">Đường dẫn Logo (Tùy chọn)</label>
                        <input type="text" id="cfg-logoUrl" value="${conf.logoUrl}" oninput="updateLivePreview()" class="brutal-input text-sm w-full font-bold bg-white" placeholder="/img/logo.png">
                    </div>
                    <div>
                        <label class="block font-bold mb-1">Tên Thương Hiệu (In to đầu bill)</label>
                        <input type="text" id="cfg-storeName" value="${conf.storeName}" oninput="updateLivePreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: Rôm Rả Cà Phê">
                    </div>
                    <div>
                        <label class="block font-bold mb-1">Địa chỉ</label>
                        <input type="text" id="cfg-address" value="${conf.address}" oninput="updateLivePreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: Số 123 Đường Nhựa">
                    </div>
                    <div>
                        <label class="block font-bold mb-1">Số điện thoại</label>
                        <input type="text" id="cfg-phone" value="${conf.phone}" oninput="updateLivePreview()" class="brutal-input w-full font-bold bg-white" placeholder="VD: SĐT: 0987.654.321">
                    </div>
                    <div>
                        <label class="block font-bold mb-1">Lời chào (cuối hóa đơn)</label>
                        <textarea id="cfg-footerMsg" oninput="updateLivePreview()" class="brutal-input w-full font-bold h-20 bg-white" placeholder="Cám ơn Quý khách rất nhiều!">${conf.footerMsg}</textarea>
                    </div>
                    <div>
                        <label class="block font-bold mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">text_fields</span> Cỡ chữ cơ sở (px) - Khuyên dùng: 12</label>
                        <input type="number" id="cfg-receiptFontSize" value="${conf.receiptFontSize}" oninput="updateLivePreview()" class="brutal-input w-32 font-bold text-center bg-white" min="8" max="24">
                    </div>
                </div>
            </div>

            <!-- CẤU HÌNH TEM DÁN LY -->
            <div class="mb-8 p-4 bg-blue-50 border-4 border-black shadow-[4px_4px_0_0_#000]">
                <h3 class="font-bold text-xl mb-4 font-heading uppercase flex items-center gap-2"><span class="material-symbols-outlined">label</span> Tem Dán Ly (50x30mm)</h3>
                <div class="flex flex-col gap-4 font-bold">
                    <label class="flex items-center gap-3 cursor-pointer select-none border-2 border-black p-3 bg-white hover:bg-blue-100 transition-colors">
                        <input type="checkbox" id="cfg-labelShowStoreInfo" class="w-6 h-6 border-4 border-black bg-white accent-black" ${conf.labelShowStoreInfo ? 'checked' : ''} onchange="updateLivePreview()">
                        <span>Hiển thị "Tên Thương Hiệu" góc trên Tem</span>
                    </label>
                    <label class="flex items-center gap-3 cursor-pointer select-none border-2 border-black p-3 bg-white hover:bg-blue-100 transition-colors">
                        <input type="checkbox" id="cfg-labelShowTime" class="w-6 h-6 border-4 border-black bg-white accent-black" ${conf.labelShowTime ? 'checked' : ''} onchange="updateLivePreview()">
                        <span>Hiển thị "Giờ đặt hàng" góc dưới Tem</span>
                    </label>
                    <div class="pt-2">
                        <label class="block mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">font_download</span> Font Chữ Của Tem</label>
                        <select id="cfg-labelFontFamily" onchange="updateLivePreview()" class="brutal-input w-full font-bold bg-white mb-3">
                            <option value="sans-serif" ${conf.labelFontFamily === 'sans-serif' ? 'selected' : ''}>Mặc định (Sans-Serif)</option>
                            <option value="monospace" ${conf.labelFontFamily === 'monospace' ? 'selected' : ''}>Máy đánh chữ (Monospace)</option>
                            <option value="Arial, Helvetica, sans-serif" ${conf.labelFontFamily === 'Arial, Helvetica, sans-serif' ? 'selected' : ''}>Arial</option>
                            <option value="'Courier New', Courier, monospace" ${conf.labelFontFamily === "'Courier New', Courier, monospace" ? 'selected' : ''}>Courier New</option>
                            <option value="'Times New Roman', Times, serif" ${conf.labelFontFamily === "'Times New Roman', Times, serif" ? 'selected' : ''}>Times New Roman</option>
                        </select>
                        <div class="flex gap-4 mb-2">
                            <div class="flex-1">
                                <label class="block mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">text_fields</span> Cỡ chữ Cơ Bản (px) - Khuyên dùng: 9</label>
                                <input type="number" id="cfg-labelBaseFontSize" value="${conf.labelBaseFontSize || 9}" oninput="updateLivePreview()" class="brutal-input w-full font-bold text-center bg-white" min="6" max="16">
                            </div>
                            <div class="flex-1">
                                <label class="block mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">text_fields</span> Cỡ chữ Tên Món (px) - Khuyên dùng: 12</label>
                                <input type="number" id="cfg-labelFontSize" value="${conf.labelFontSize}" oninput="updateLivePreview()" class="brutal-input w-full font-bold text-center bg-white" min="8" max="24">
                            </div>
                        </div>
                        <div class="w-full">
                            <label class="block mb-1 text-blue-800"><span class="material-symbols-outlined align-middle text-sm">text_fields</span> Cỡ chữ "Size" & "Số Lượng" (px) - Khuyên dùng: 11</label>
                            <input type="number" id="cfg-labelSizeFontSize" value="${conf.labelSizeFontSize || 11}" oninput="updateLivePreview()" class="brutal-input w-full font-bold text-center bg-white" min="8" max="24">
                        </div>
                    </div>
                </div>
            </div>

            <button onclick="savePrintConfig()" class="brutal-btn py-4 w-full text-xl flex items-center justify-center gap-2 bg-[#58D68D] text-black">
                <span class="material-symbols-outlined font-black">save</span> LƯU LẠI CÀI ĐẶT
            </button>
            <p class="text-sm font-bold text-gray-500 mt-4 text-center border-t-2 border-dashed border-gray-300 pt-3">
                <span class="material-symbols-outlined align-middle text-sm">info</span> Cấu hình này chỉ lưu nội bộ trên máy bạn. Hoàn toàn cá nhân hóa cho từng quầy!
            </p>
        </div>
        
        <!-- BẢN XEM TRƯỚC (LIVE PREVIEW) -->
        <div class="w-full md:w-[350px] shrink-0 sticky top-20 self-start flex flex-col gap-6">
            
            <!-- MÔ PHỎNG TEM 50X30MM (189x113px) -->
            <div class="brutal-card bg-gray-200 p-4 border-4 border-black flex flex-col items-center">
                <div class="w-full flex justify-between items-center mb-4 border-b-2 border-dashed border-gray-400 pb-2">
                    <span class="font-bold text-sm uppercase text-gray-600">Bản mô phỏng Tem 50x30</span>
                </div>
                
                <div class="bg-white border-2 border-gray-300 relative shadow-md overflow-hidden" 
                     style="width: 189px; height: 113px; transform-origin: top center; transform: scale(1.1);">
                    <div id="preview-label-content" class="w-full h-full"></div>
                </div>
            </div>

            <!-- MÔ PHỎNG BILL 58MM -->
            <div class="brutal-card bg-gray-200 p-4 border-4 border-black flex flex-col items-center">
                <div class="w-full flex justify-between items-center mb-4 border-b-2 border-dashed border-gray-400 pb-2">
                    <span class="font-bold text-sm uppercase text-gray-600">Bản mô phỏng Bill 58mm</span>
                </div>
                
                <div class="bg-white border-2 border-gray-300 shadow-xl" 
                     style="width: 220px; padding: 10px; min-height: 250px;">
                    <div id="preview-receipt-content" class="w-full h-full"></div>
                </div>
            </div>
            
        </div>
    </div>
    `;

    // Gọi lần đầu để init preview
    setTimeout(() => {
        updateLivePreview();
    }, 50);
}

// Global Exports
window.renderSettings = renderSettings;
window.getPrintConfig = getPrintConfig;
