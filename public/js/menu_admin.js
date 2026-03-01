// ================= MENU ADMIN DASHBOARD =================

window.renderAdminMenu = async function () {
    const role = window.currentUserRole;
    if (role === 'guest') {
        appContent.innerHTML = `<div class="p-6 text-red-600 font-bold border-4 border-black bg-white brutal-shadow-sm">Bạn không có quyền truy cập.</div>`;
        return;
    }

    appContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-heading uppercase tracking-tight">Quản Lý Thực Đơn</h2>
            <button class="brutal-btn brutal-btn-primary px-4 py-3 flex items-center gap-2 admin-only" onclick="window.openAddMenuModal()">
                <span class="material-symbols-outlined font-bold">add</span> THÊM MÓN
            </button>
        </div>

        <div class="brutal-table-container">
            <table class="brutal-table">
                <thead>
                    <tr>
                        <th class="w-20">Ảnh</th>
                        <th>Tên Món</th>
                        <th class="w-20 text-center">Size</th>
                        <th class="text-right">Giá Bán</th>
                        <th>Trạng Thái</th>
                        <th class="w-32 text-center">Thao Tác</th>
                    </tr>
                </thead>
                <tbody id="admin-menu-list">
                    <tr><td colspan="6" class="text-center italic">Đang tải dữ liệu...</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Form Add/Edit Menu Modal -->
        <div id="modal-edit-menu" class="fixed inset-0 items-center justify-center p-4 content-center" style="display: none; background-color: rgba(0,0,0,0.6); z-index: 9999;">
            <div class="brutal-card w-full max-w-lg p-6 flex flex-col gap-4 relative max-h-[90vh] overflow-y-auto">
                <button class="absolute top-4 right-4 text-black hover:text-red-600 active:scale-90" onclick="document.getElementById('modal-edit-menu').style.display='none'">
                    <span class="material-symbols-outlined text-3xl font-bold">close</span>
                </button>
                <h3 class="text-2xl font-heading uppercase border-b-4 border-black pb-2" id="menu-modal-title">Chỉnh Sửa Món</h3>
                
                <form id="form-edit-menu" onsubmit="window.saveAdminMenu(event)" class="flex flex-col gap-4 mt-2">
                    <input type="hidden" id="menu-id">
                    
                    <div class="flex flex-col gap-4">
                        <div class="w-full">
                            <label class="font-bold text-sm block mb-1 uppercase">Tên Món (Dùng chung cho các Size)</label>
                            <input type="text" id="menu-name" required class="brutal-input py-2" placeholder="Ví dụ: Cà phê sữa đá" oninput="document.getElementById('menu-original-name').value = this.value">
                            <input type="hidden" id="menu-original-name">
                        </div>
                        
                        <div class="flex flex-col gap-2 p-3 border-4 border-black bg-gray-50 shadow-[4px_4px_0_0_#000]">
                            <label class="font-black text-sm uppercase text-secondary">Cấu hình Size & Giá</label>
                            <div class="flex items-center gap-2">
                                <label class="font-bold flex items-center gap-1 w-20 cursor-pointer">
                                    <input type="checkbox" id="menu-has-s" class="w-5 h-5 border-2 border-black rounded-none outline-none accent-black"> Size S
                                </label>
                                <input type="text" id="menu-price-s" class="brutal-input py-1 flex-1 font-black text-right" placeholder="0" oninput="formatCurrencyInput(this)"> <span class="font-bold">đ</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <label class="font-bold flex items-center gap-1 w-20 cursor-pointer">
                                    <input type="checkbox" id="menu-has-m" class="w-5 h-5 border-2 border-black rounded-none outline-none accent-black"> Size M
                                </label>
                                <input type="text" id="menu-price-m" class="brutal-input py-1 flex-1 font-black text-right" placeholder="0" oninput="formatCurrencyInput(this)"> <span class="font-bold">đ</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <label class="font-bold flex items-center gap-1 w-20 cursor-pointer">
                                    <input type="checkbox" id="menu-has-l" class="w-5 h-5 border-2 border-black rounded-none outline-none accent-black"> Size L
                                </label>
                                <input type="text" id="menu-price-l" class="brutal-input py-1 flex-1 font-black text-right" placeholder="0" oninput="formatCurrencyInput(this)"> <span class="font-bold">đ</span>
                            </div>
                        </div>
                    </div>

                    <!-- Image Section -->
                    <div class="flex flex-col items-center justify-center border-b-2 border-black pb-4 relative group admin-only">
                        <label class="font-bold text-sm block w-full mb-1 uppercase">Ảnh đại diện</label>
                        <div class="w-full h-32 bg-gray-200 border-4 border-dashed border-black flex items-center justify-center relative overflow-hidden cursor-move transition-colors hover:border-blue-500" id="menu-preview-container" onmousedown="window.startDragMenuImage(event)" ontouchstart="window.startDragMenuImage(event)">
                            <img id="menu-preview-img" src="" class="absolute inset-0 w-full h-full object-cover hidden z-10 pointer-events-none">
                            <span class="material-symbols-outlined text-gray-500 text-4xl group-hover:scale-110 transition-transform pointer-events-none" id="menu-preview-icon">add_a_photo</span>
                        </div>
                        <input type="file" id="upload-menu-image" accept="image/*" class="hidden" onchange="window.handleMenuImageUpload(event)">
                        <div class="flex gap-2 w-full mt-2">
                            <button type="button" id="btn-trigger-menu-upload" class="flex-1 bg-black hover:bg-gray-800 transition-colors py-2 text-white font-bold text-xs" onclick="document.getElementById('upload-menu-image').click()">TẢI ẢNH MỚI</button>
                            <button type="button" title="Xóa Ảnh" class="w-10 bg-[#eb5757] hover:bg-red-600 transition-colors py-2 flex items-center justify-center text-white" onclick="window.removeMenuImage()"><span class="material-symbols-outlined text-sm font-bold">delete</span></button>
                        </div>
                        <span class="text-[10px] text-gray-500 mt-2 font-bold uppercase">(Kéo ảnh Lên/Xuống để canh giữa)</span>
                    </div>

                    <div>
                        <label class="font-bold text-sm block mb-1 uppercase">Mô tả món</label>
                        <textarea id="menu-description" class="brutal-input h-20 pt-2" placeholder="Ví dụ: Cà phê đậm đà, thơm béo..."></textarea>
                    </div>

                    <div class="flex items-center gap-4">
                        <label class="flex items-center gap-2 font-bold cursor-pointer select-none">
                            <input type="checkbox" id="menu-is-best-seller" class="w-6 h-6 border-4 border-black rounded-none outline-none accent-black">
                            <span class="material-symbols-outlined text-orange-500">local_fire_department</span> Bán Chạy (Best Seller)
                        </label>
                    </div>
                    
                    <div class="flex items-center gap-4">
                        <label class="flex items-center gap-2 font-bold cursor-pointer select-none">
                            <input type="checkbox" id="menu-is-sold-out" class="w-6 h-6 border-4 border-black rounded-none outline-none accent-black">
                            <span class="material-symbols-outlined text-slate-500">block</span> Hết Hàng (Tạm ẩn)
                        </label>
                    </div>

                    <div class="flex gap-2 mt-4">
                        <button type="button" class="brutal-btn py-3 flex-1 bg-gray-200 hover:bg-gray-300" onclick="document.getElementById('modal-edit-menu').style.display='none'">HỦY</button>
                        <button type="submit" class="brutal-btn brutal-btn-primary py-3 flex-1">LƯU LẠI</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    await window.loadAdminMenuData();
};

window.loadAdminMenuData = async function () {
    try {
        const res = await fetch(`${API_URL}/recipes`);
        const json = await res.json();

        if (!json.success) throw new Error(json.error);

        window.adminMenuData = json.data;
        window.renderAdminMenuList();
    } catch (e) {
        document.getElementById('admin-menu-list').innerHTML = `<tr><td colspan="6" class="text-center text-red-600 font-bold">Lỗi tải dữ liệu: ${e.message}</td></tr>`;
        if (typeof showToast === 'function') showToast(e.message, 'error');
    }
};

window.renderAdminMenuList = function () {
    const tbody = document.getElementById('admin-menu-list');
    if (!window.adminMenuData || window.adminMenuData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center font-bold">Chưa có món nào. Vui lòng thêm từ mục Công thức.</td></tr>`;
        return;
    }

    // Grouping by Name
    const grouped = {};
    window.adminMenuData.forEach(item => {
        const nameKey = item.name.trim().toLowerCase();
        if (!grouped[nameKey]) {
            grouped[nameKey] = {
                name: item.name.trim(),
                description: item.description,
                image: item.image,
                is_best_seller: item.is_best_seller,
                is_sold_out: item.is_sold_out,
                variants: []
            };
        }
        grouped[nameKey].variants.push(item);
    });

    let html = '';
    Object.values(grouped).forEach(g => {
        let statuses = [];
        if (g.is_best_seller) statuses.push(`<span class="bg-orange-100 text-orange-700 px-2 py-1 border-2 border-black text-xs font-black uppercase flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[14px]">local_fire_department</span> Best Seller</span>`);
        if (g.is_sold_out) statuses.push(`<span class="bg-slate-200 text-slate-700 px-2 py-1 border-2 border-black text-xs font-black uppercase flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[14px]">block</span> Hết Hàng</span>`);

        let statusHtml = statuses.length > 0 ? `<div class="flex flex-col gap-1">${statuses.join('')}</div>` : `<span class="text-green-600 font-bold text-sm">Đang bán</span>`;

        let displayImg = g.image || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&fm=jpg&fit=crop';
        let imgOffsetY = 50;
        if (displayImg && displayImg.includes('|')) {
            const parts = displayImg.split('|');
            displayImg = parts[0];
            imgOffsetY = parseFloat(parts[1]) || 50;
        }

        const sizeOrder = { 'S': 1, 'M': 2, 'L': 3 };
        g.variants.sort((a, b) => (sizeOrder[a.size] || 99) - (sizeOrder[b.size] || 99));

        const pricesHtml = g.variants.map(v => `<div class="text-sm font-bold flex justify-between gap-4 border-b border-gray-200 last:border-0 py-1"><span>Size ${v.size}</span><span class="text-primary font-black drop-shadow-[1px_1px_0_#000]">${Number(v.price).toLocaleString('vi-VN')}đ</span></div>`).join('');

        // Use the ID of the first variant (usually M) to edit the group
        const baseVariantId = g.variants.find(v => v.size === 'M')?.id || g.variants[0].id;

        html += `
            <tr>
                <td class="w-20"><img src="${displayImg}" style="object-position: center ${imgOffsetY}%" class="w-12 h-12 object-cover border-2 border-black bg-white"></td>
                <td>
                    <div class="font-bold text-lg">${g.name}</div>
                    <div class="text-xs text-gray-500 max-w-[200px] truncate">${g.description || 'Chưa có mô tả'}</div>
                </td>
                <td class="text-center font-black text-base" colspan="2">
                    <div class="flex flex-col items-end shrink-0 w-32 ml-auto">${pricesHtml}</div>
                </td>
                <td>${statusHtml}</td>
                <td class="text-center">
                    <div class="flex gap-1 justify-center">
                        <button class="brutal-btn brutal-btn-primary px-3 py-1 text-xs bg-yellow-300 flex items-center gap-1 active:scale-90" onclick="window.openEditMenuModalGroup('${encodeURIComponent(g.name)}')" title="Quản lý món">
                            <span class="material-symbols-outlined text-sm font-bold">edit</span> Quản lý món
                        </button>
                        <button class="brutal-btn px-3 py-1 text-xs bg-red-500 text-white flex items-center gap-1 active:scale-90" onclick="window.deleteMenuGroup('${encodeURIComponent(g.name)}')" title="Xóa món">
                            <span class="material-symbols-outlined text-sm font-bold text-white">delete</span> Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
};

window.openAddMenuModal = function () {
    document.getElementById('form-edit-menu').reset();
    document.getElementById('menu-id').value = '';
    document.getElementById('menu-original-name').value = '';

    // Default config
    document.getElementById('menu-has-s').checked = false;
    document.getElementById('menu-price-s').value = '';
    document.getElementById('menu-has-m').checked = true;
    document.getElementById('menu-price-m').value = '';
    document.getElementById('menu-has-l').checked = false;
    document.getElementById('menu-price-l').value = '';

    document.getElementById('menu-modal-title').innerText = 'Thêm Món Mới';
    document.getElementById('modal-edit-menu').style.display = 'flex';

    // Cài ảnh mặc định
    const previewImg = document.getElementById('menu-preview-img');
    const previewIcon = document.getElementById('menu-preview-icon');
    previewImg.src = '';
    previewImg.classList.add('hidden');
    previewIcon.classList.remove('hidden');
    window.currentMenuImageBase64 = null;
    window.currentMenuImageOffsetY = 50;
};

window.openEditMenuModalGroup = function (encodedName) {
    const rawName = decodeURIComponent(encodedName).trim().toLowerCase();

    // Find all variants for this name
    const variants = window.adminMenuData.filter(i => i.name.trim().toLowerCase() === rawName);
    if (!variants || variants.length === 0) return;

    // We will use the M size (or the first available) as the base for shared properties (image, description, etc)
    const baseItem = variants.find(v => v.size === 'M') || variants[0];

    document.getElementById('menu-id').value = baseItem.id;
    document.getElementById('menu-name').value = baseItem.name;
    document.getElementById('menu-original-name').value = baseItem.name;
    document.getElementById('menu-description').value = baseItem.description || '';
    document.getElementById('menu-is-best-seller').checked = baseItem.is_best_seller || false;
    document.getElementById('menu-is-sold-out').checked = baseItem.is_sold_out || false;

    // Reset size settings
    document.getElementById('menu-has-s').checked = false;
    document.getElementById('menu-price-s').value = '';
    document.getElementById('menu-has-m').checked = true; // M is the anchor, we assume it's always there, but if not we still show it as checked to allow creating one.
    document.getElementById('menu-price-m').value = '';
    document.getElementById('menu-has-l').checked = false;
    document.getElementById('menu-price-l').value = '';

    // Fill existing variants
    variants.forEach(v => {
        if (v.size === 'S') {
            document.getElementById('menu-has-s').checked = true;
            document.getElementById('menu-price-s').value = Number(v.price).toLocaleString('vi-VN');
        } else if (v.size === 'M') {
            document.getElementById('menu-price-m').value = Number(v.price).toLocaleString('vi-VN');
        } else if (v.size === 'L') {
            document.getElementById('menu-has-l').checked = true;
            document.getElementById('menu-price-l').value = Number(v.price).toLocaleString('vi-VN');
        }
    });

    document.getElementById('menu-modal-title').innerText = 'Quản Lý & Group Size';

    // Image logic
    window.currentMenuImageBase64 = baseItem.image || null;
    window.currentMenuImageOffsetY = 50;
    const previewImg = document.getElementById('menu-preview-img');
    const previewIcon = document.getElementById('menu-preview-icon');

    if (baseItem.image) {
        let imgUrl = baseItem.image;
        if (imgUrl.includes('|')) {
            const parts = imgUrl.split('|');
            imgUrl = parts[0];
            window.currentMenuImageOffsetY = parseFloat(parts[1]) || 50;
        }
        previewImg.src = imgUrl;
        previewImg.style.objectPosition = `center ${window.currentMenuImageOffsetY}%`;
        previewImg.classList.remove('hidden');
        previewIcon.classList.add('hidden');
    } else {
        previewImg.src = '';
        previewImg.classList.add('hidden');
        previewIcon.classList.remove('hidden');
    }

    document.getElementById('modal-edit-menu').style.display = 'flex';
};

window.saveAdminMenu = async function (event) {
    event.preventDefault();

    if (window.currentUserRole !== 'admin') {
        showToast("Chỉ Admin mới có quyền lưu thông tin Menu!", "error");
        return;
    }

    const originalName = document.getElementById('menu-original-name').value.trim().toLowerCase();
    const newName = document.getElementById('menu-name').value.trim();
    const description = document.getElementById('menu-description').value;
    const is_best_seller = document.getElementById('menu-is-best-seller').checked;
    const is_sold_out = document.getElementById('menu-is-sold-out').checked;

    const sizesConfig = [
        { size: 'S', active: document.getElementById('menu-has-s').checked, price: Number(document.getElementById('menu-price-s').value.replace(/\D/g, '')) || 0 },
        { size: 'M', active: document.getElementById('menu-has-m').checked, price: Number(document.getElementById('menu-price-m').value.replace(/\D/g, '')) || 0 },
        { size: 'L', active: document.getElementById('menu-has-l').checked, price: Number(document.getElementById('menu-price-l').value.replace(/\D/g, '')) || 0 }
    ];

    let finalImgString = window.currentMenuImageBase64;
    if (finalImgString) {
        if (finalImgString.includes('|')) {
            finalImgString = finalImgString.split('|')[0] + '|' + (window.currentMenuImageOffsetY || 50);
        } else {
            finalImgString = finalImgString + '|' + (window.currentMenuImageOffsetY || 50);
        }
    }

    // Get all existing variants for this original name
    const existingVariants = window.adminMenuData.filter(i => i.name.trim().toLowerCase() === originalName);

    // We need a base variant to copy ingredients/steps from if creating new sizes.
    const baseVariant = existingVariants.find(v => v.size === 'M') || existingVariants[0] || null;

    let defaultIngredients = baseVariant ? baseVariant.ingredients : '[]';
    let defaultSteps = baseVariant ? baseVariant.steps_detail : '[]';
    let defaultStepCount = baseVariant ? baseVariant.steps : 0;
    let defaultCogs = baseVariant ? baseVariant.cogs : 0;

    try {
        const btnSubmit = event.target.querySelector('button[type="submit"]');
        const oldText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = "ĐANG TẢI...";
        btnSubmit.disabled = true;

        for (const config of sizesConfig) {
            const existing = existingVariants.find(v => v.size === config.size);

            if (config.active) {
                const payload = {
                    name: newName,
                    size: config.size,
                    price: config.price,
                    description,
                    is_best_seller,
                    is_sold_out,
                    image: finalImgString,
                    ingredients: existing ? existing.ingredients : defaultIngredients,
                    steps_detail: existing ? existing.steps_detail : defaultSteps,
                    steps: existing ? existing.steps : defaultStepCount,
                    cogs: existing ? existing.cogs : defaultCogs
                };

                if (existing) {
                    await fetch(`${API_URL}/recipes/${existing.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...existing, ...payload })
                    });
                } else {
                    await fetch(`${API_URL}/recipes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
            } else {
                if (existing) {
                    await fetch(`${API_URL}/recipes/${existing.id}`, { method: 'DELETE' });
                }
            }
        }

        btnSubmit.innerHTML = oldText;
        btnSubmit.disabled = false;

        showToast("Lưu thông tin Menu thành công!");
        document.getElementById('modal-edit-menu').style.display = 'none';
        window.loadAdminMenuData();

    } catch (e) {
        showToast("Lỗi khi lưu dữ liệu!", "error");
    }
};

window.deleteMenuGroup = async function (encodedName) {
    const rawName = decodeURIComponent(encodedName).trim().toLowerCase();
    const variants = window.adminMenuData.filter(i => i.name.trim().toLowerCase() === rawName);

    if (variants.length === 0) return;

    if (!confirm('Bạn có chắc chắn muốn xóa món: ' + variants[0].name + '? Cả các size của món này sẽ bị xóa.')) {
        return;
    }

    try {
        for (const v of variants) {
            await fetch(`${API_URL}/recipes/${v.id}`, { method: 'DELETE' });
        }
        showToast("Đã xóa món thành công!");
        window.loadAdminMenuData();
    } catch (e) {
        console.error("Delete menu error:", e);
        showToast("Lỗi kết nối khi xóa món!", "error");
    }
};

// ================= IMAGE UPLOAD LOGIC IN MENU ADMIN =================
window.currentMenuImageBase64 = null;
window.currentMenuImageOffsetY = 50;

window.removeMenuImage = function () {
    window.currentMenuImageBase64 = null;
    window.currentMenuImageOffsetY = 50;
    const previewImg = document.getElementById('menu-preview-img');
    const previewIcon = document.getElementById('menu-preview-icon');
    if (previewImg) {
        previewImg.src = '';
        previewImg.classList.add('hidden');
    }
    if (previewIcon) previewIcon.classList.remove('hidden');
};

window.handleMenuImageUpload = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const previewImg = document.getElementById('menu-preview-img');
    const previewIcon = document.getElementById('menu-preview-icon');
    const uploadBtn = document.getElementById('btn-trigger-menu-upload');
    const ogText = uploadBtn ? uploadBtn.innerText : 'TẢI ẢNH MỚI';

    if (uploadBtn) {
        uploadBtn.innerText = 'ĐANG XỬ LÝ...';
        uploadBtn.disabled = true;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; // Nén ảnh
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) {
                    if (typeof showToast === 'function') showToast('Lỗi xử lý ảnh!', 'error');
                    if (uploadBtn) { uploadBtn.innerText = ogText; uploadBtn.disabled = false; }
                    return;
                }

                if (!window.SupabaseStorage) {
                    if (typeof showToast === 'function') showToast('Mất kết nối Storage! F5 thử lại', 'error');
                    if (uploadBtn) { uploadBtn.innerText = ogText; uploadBtn.disabled = false; }
                    return;
                }

                const fileName = `menu_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
                if (uploadBtn) uploadBtn.innerText = 'ĐANG TẢI LÊN...';

                window.SupabaseStorage.from('recipes').upload(fileName, blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg'
                }).then(({ data, error }) => {
                    if (error) {
                        if (typeof showToast === 'function') showToast('Lỗi tải ảnh lên: ' + error.message, 'error');
                        if (uploadBtn) { uploadBtn.innerText = ogText; uploadBtn.disabled = false; }
                    } else {
                        const { data: publicUrlData } = window.SupabaseStorage.from('recipes').getPublicUrl(fileName);
                        const downloadURL = publicUrlData.publicUrl;

                        window.currentMenuImageBase64 = downloadURL;
                        window.currentMenuImageOffsetY = 50;

                        if (previewImg) {
                            previewImg.src = downloadURL;
                            previewImg.style.objectPosition = `center 50%`;
                            previewImg.classList.remove('hidden');
                            if (previewIcon) previewIcon.classList.add('hidden');
                        }

                        if (uploadBtn) { uploadBtn.innerText = ogText; uploadBtn.disabled = false; }
                    }
                }).catch(err => {
                    if (uploadBtn) { uploadBtn.innerText = ogText; uploadBtn.disabled = false; }
                });
            }, 'image/jpeg', 0.8);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// Drag Image positioning
let isMenuDraggingImg = false;
let startMenuYDrag = 0;
let initialMenuOffsetY = 50;

window.startDragMenuImage = function (e) {
    if (!window.currentMenuImageBase64) {
        document.getElementById('upload-menu-image').click();
        return;
    }
    isMenuDraggingImg = true;
    startMenuYDrag = e.touches ? e.touches[0].clientY : e.clientY;
    initialMenuOffsetY = window.currentMenuImageOffsetY || 50;
};

window.addEventListener('mousemove', (e) => {
    if (!isMenuDraggingImg) return;
    const clientY = e.clientY;
    const delta = clientY - startMenuYDrag;
    let newOffsetY = initialMenuOffsetY - (delta * 0.5);
    newOffsetY = Math.max(0, Math.min(100, newOffsetY));
    window.currentMenuImageOffsetY = newOffsetY;
    const img = document.getElementById('menu-preview-img');
    if (img) img.style.objectPosition = `center ${newOffsetY}%`;
});

window.addEventListener('mouseup', () => { isMenuDraggingImg = false; });

window.addEventListener('touchmove', (e) => {
    if (!isMenuDraggingImg) return;
    const clientY = e.touches[0].clientY;
    const delta = clientY - startMenuYDrag;
    let newOffsetY = initialMenuOffsetY - (delta * 0.5);
    newOffsetY = Math.max(0, Math.min(100, newOffsetY));
    window.currentMenuImageOffsetY = newOffsetY;
    const img = document.getElementById('menu-preview-img');
    if (img) img.style.objectPosition = `center ${newOffsetY}%`;
}, { passive: false });

window.addEventListener('touchend', () => { isMenuDraggingImg = false; });
