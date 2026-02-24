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
                        <th>Giá Bán</th>
                        <th>Trạng Thái</th>
                        <th class="w-32 text-center">Thao Tác</th>
                    </tr>
                </thead>
                <tbody id="admin-menu-list">
                    <tr><td colspan="5" class="text-center italic">Đang tải dữ liệu...</td></tr>
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
                    
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="font-bold text-sm block mb-1 uppercase">Tên Món</label>
                            <input type="text" id="menu-name" required class="brutal-input py-2" placeholder="Ví dụ: Cà phê sữa đá">
                        </div>
                        <div class="w-1/3">
                            <label class="font-bold text-sm block mb-1 uppercase">Giá Bán</label>
                            <input type="number" id="menu-price" required class="brutal-input py-2" placeholder="0">
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
        document.getElementById('admin-menu-list').innerHTML = `<tr><td colspan="5" class="text-center text-red-600 font-bold">Lỗi tải dữ liệu: ${e.message}</td></tr>`;
        if (typeof showToast === 'function') showToast(e.message, 'error');
    }
};

window.renderAdminMenuList = function () {
    const tbody = document.getElementById('admin-menu-list');
    if (!window.adminMenuData || window.adminMenuData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center font-bold">Chưa có món nào. Vui lòng thêm từ mục Công thức.</td></tr>`;
        return;
    }

    let html = '';
    window.adminMenuData.forEach(item => {
        let statuses = [];
        if (item.is_best_seller) statuses.push(`<span class="bg-orange-100 text-orange-700 px-2 py-1 border-2 border-black text-xs font-black uppercase flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[14px]">local_fire_department</span> Best Seller</span>`);
        if (item.is_sold_out) statuses.push(`<span class="bg-slate-200 text-slate-700 px-2 py-1 border-2 border-black text-xs font-black uppercase flex items-center gap-1 w-max"><span class="material-symbols-outlined text-[14px]">block</span> Hết Hàng</span>`);

        let statusHtml = statuses.length > 0 ? `<div class="flex flex-col gap-1">${statuses.join('')}</div>` : `<span class="text-green-600 font-bold text-sm">Đang bán</span>`;

        let displayImg = item.image || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&fm=jpg&fit=crop';
        let imgOffsetY = 50;
        if (displayImg && displayImg.includes('|')) {
            const parts = displayImg.split('|');
            displayImg = parts[0];
            imgOffsetY = parseFloat(parts[1]) || 50;
        }

        html += `
            <tr>
                <td class="w-20"><img src="${displayImg}" style="object-position: center ${imgOffsetY}%" class="w-12 h-12 object-cover border-2 border-black bg-white"></td>
                <td>
                    <div class="font-bold text-lg">${item.name}</div>
                    <div class="text-xs text-gray-500 max-w-[200px] truncate">${item.description || 'Chưa có mô tả'}</div>
                </td>
                <td class="font-black text-lg">${Number(item.price).toLocaleString('vi-VN')}đ</td>
                <td>${statusHtml}</td>
                <td class="text-center">
                    <button class="brutal-btn brutal-btn-primary px-3 py-1 text-sm bg-yellow-300" onclick="window.openEditMenuModal(${item.id})" title="Sửa thông tin Menu">
                        <span class="material-symbols-outlined text-base">edit</span> Sửa
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
};

window.openAddMenuModal = function () {
    document.getElementById('form-edit-menu').reset();
    document.getElementById('menu-id').value = '';
    document.getElementById('menu-modal-title').innerText = 'Thêm Món Mới';
    window.removeMenuImage(); // Reset image preview
    document.getElementById('modal-edit-menu').style.display = 'flex';
};

window.openEditMenuModal = function (id) {
    const item = window.adminMenuData.find(x => x.id == id);
    if (!item) return;

    document.getElementById('menu-id').value = item.id;
    document.getElementById('menu-modal-title').innerText = `Sửa Món: ${item.name}`;
    document.getElementById('menu-name').value = item.name || '';
    document.getElementById('menu-price').value = item.price || 0;
    document.getElementById('menu-description').value = item.description || '';
    document.getElementById('menu-is-best-seller').checked = item.is_best_seller || false;
    document.getElementById('menu-is-sold-out').checked = item.is_sold_out || false;

    window.currentMenuImageBase64 = item.image || null;
    window.currentMenuImageOffsetY = 50;
    const previewImg = document.getElementById('menu-preview-img');
    const previewIcon = document.getElementById('menu-preview-icon');
    if (previewImg) {
        if (item.image) {
            let imgUrl = item.image;
            if (imgUrl.includes('|')) {
                const parts = imgUrl.split('|');
                imgUrl = parts[0];
                window.currentMenuImageOffsetY = parseFloat(parts[1]) || 50;
            }
            previewImg.src = imgUrl;
            previewImg.style.objectPosition = `center ${window.currentMenuImageOffsetY}%`;
            previewImg.classList.remove('hidden');
            if (previewIcon) previewIcon.classList.add('hidden');
        } else {
            previewImg.src = '';
            previewImg.classList.add('hidden');
            if (previewIcon) previewIcon.classList.remove('hidden');
        }
    }

    document.getElementById('modal-edit-menu').style.display = 'flex';
};

window.saveAdminMenu = async function (event) {
    event.preventDefault();

    // Check role, must be admin to edit
    if (window.currentUserRole !== 'admin') {
        showToast("Chỉ Admin mới có quyền lưu thông tin Menu!", "error");
        return;
    }

    const id = document.getElementById('menu-id').value;
    const name = document.getElementById('menu-name').value.trim();
    const price = Number(document.getElementById('menu-price').value) || 0;
    const description = document.getElementById('menu-description').value;
    const is_best_seller = document.getElementById('menu-is-best-seller').checked;
    const is_sold_out = document.getElementById('menu-is-sold-out').checked;

    let finalImgString = window.currentMenuImageBase64;
    if (finalImgString) {
        if (finalImgString.includes('|')) {
            finalImgString = finalImgString.split('|')[0] + '|' + (window.currentMenuImageOffsetY || 50);
        } else {
            finalImgString = finalImgString + '|' + (window.currentMenuImageOffsetY || 50);
        }
    }

    let payload = {};
    let url = `${API_URL}/recipes`;
    let method = 'POST';

    if (id) { // Cập nhật
        const existing = window.adminMenuData.find(x => x.id == id);
        if (!existing) return;
        payload = {
            ...existing,
            name,
            price,
            description,
            is_best_seller,
            is_sold_out,
            image: finalImgString
        };
        url = `${API_URL}/recipes/${id}`;
        method = 'PUT';
    } else { // Thêm mới
        payload = {
            name,
            price,
            size: 'M',
            steps: 0,
            cogs: 0,
            description,
            is_best_seller,
            is_sold_out,
            image: finalImgString,
            ingredients: [],
            steps_detail: []
        };
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (j.success) {
            if (typeof showToast === 'function') showToast("Đã lưu thông tin Menu thành công!");
            document.getElementById('modal-edit-menu').style.display = 'none';
            await window.loadAdminMenuData(); // Reload list
            if (typeof window.loadRecipes === 'function') {
                window.loadRecipes(); // also reload for recipes tab sync
            }
        } else {
            throw new Error(j.error);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message, "error");
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
