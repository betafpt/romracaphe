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

        <!-- Edit Menu Modal -->
        <div id="modal-edit-menu" class="fixed inset-0 items-center justify-center p-4 content-center" style="display: none; background-color: rgba(0,0,0,0.6); z-index: 9999;">
            <div class="brutal-card w-full max-w-lg p-6 flex flex-col gap-4 relative max-h-[90vh] overflow-y-auto">
                <button class="absolute top-4 right-4 text-black hover:text-red-600 active:scale-90" onclick="document.getElementById('modal-edit-menu').style.display='none'">
                    <span class="material-symbols-outlined text-3xl font-bold">close</span>
                </button>
                <h3 class="text-2xl font-heading uppercase border-b-4 border-black pb-2" id="menu-modal-title">Chỉnh Sửa Món</h3>
                
                <form id="form-edit-menu" onsubmit="window.saveAdminMenu(event)" class="flex flex-col gap-4 mt-2">
                    <input type="hidden" id="menu-id">
                    
                    <div>
                        <label class="font-bold text-sm block mb-1">Mô tả món (Cho khách xem)</label>
                        <textarea id="menu-description" class="brutal-input h-24 pt-2" placeholder="Ví dụ: Cà phê đâm đà, thơm béo..."></textarea>
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

        html += `
            <tr>
                <td class="w-20"><img src="${item.image || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&fm=jpg&fit=crop'}" class="w-12 h-12 object-cover border-2 border-black"></td>
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

window.openEditMenuModal = function (id) {
    const item = window.adminMenuData.find(x => x.id == id);
    if (!item) return;

    document.getElementById('menu-id').value = item.id;
    document.getElementById('menu-modal-title').innerText = `Sửa Món: ${item.name}`;
    document.getElementById('menu-description').value = item.description || '';
    document.getElementById('menu-is-best-seller').checked = item.is_best_seller || false;
    document.getElementById('menu-is-sold-out').checked = item.is_sold_out || false;

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
    const description = document.getElementById('menu-description').value;
    const is_best_seller = document.getElementById('menu-is-best-seller').checked;
    const is_sold_out = document.getElementById('menu-is-sold-out').checked;

    const existing = window.adminMenuData.find(x => x.id == id);
    if (!existing) return;

    const payload = {
        ...existing,
        description,
        is_best_seller,
        is_sold_out
    };

    try {
        const res = await fetch(`${API_URL}/recipes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (j.success) {
            if (typeof showToast === 'function') showToast("Đã lưu thông tin Menu thành công!");
            document.getElementById('modal-edit-menu').style.display = 'none';
            await window.loadAdminMenuData(); // Reload list
        } else {
            throw new Error(j.error);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message, "error");
    }
};
