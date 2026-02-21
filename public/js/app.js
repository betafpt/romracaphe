// Global State
const API_URL = 'http://localhost:3000/api';
const appContent = document.getElementById('app-content');
const pageTitle = document.getElementById('page-title');

// Route definitions (Views)
const routes = {
    dashboard: {
        title: 'Tổng quan',
        render: renderDashboard
    },
    inventory: {
        title: 'Kho nguyên liệu',
        render: renderInventory
    },
    roles: {
        title: 'Phân quyền',
        render: renderRoles
    },
    recipes: {
        title: 'Công thức pha chế',
        render: renderRecipes
    },
    reports: {
        title: 'Báo cáo',
        render: () => { appContent.innerHTML = `<h2 class="text-xl">Tính năng Báo cáo đang phát triển...</h2>` }
    }
};

// ================= ROUTING LOGIC =================

function navigate(route) {
    if (!routes[route]) route = 'dashboard';

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.route === route) el.classList.add('active');
    });

    // Close mobile drawer if open
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('-translate-x-full') && window.innerWidth < 768) {
        toggleDrawer();
    }

    // Update Title & Content
    pageTitle.innerText = routes[route].title;
    appContent.innerHTML = `<div class="flex items-center gap-2"><span class="material-symbols-outlined animate-spin">refresh</span> Đang tải dữ liệu...</div>`;

    // Call render function
    routes[route].render();
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const route = e.currentTarget.dataset.route;
            navigate(route);
        });
    });

    // Default route
    navigate('dashboard');
});

// ================= VIEWS RENDERERS =================

// --- 1. DASHBOARD ---
async function renderDashboard() {
    try {
        const [invRes, recipesRes, usersRes] = await Promise.all([
            fetch(`${API_URL}/inventory`),
            fetch(`${API_URL}/recipes`),
            fetch(`${API_URL}/users`)
        ]);

        const invData = await invRes.json();
        const recipesData = await recipesRes.json();
        const usersData = await usersRes.json();

        const stockItems = invData.data || [];
        const lowStock = stockItems.filter(i => i.stock < 10).length;
        const totalCapital = stockItems.reduce((sum, i) => sum + (i.price * i.stock), 0);

        appContent.innerHTML = `
            <div class="mb-8">
                <h1 class="text-3xl md:text-5xl font-heading mb-2 leading-tight uppercase font-black tracking-tighter">KIỂM SOÁT PHA CHẾ &<br>CHI PHÍ KHÔNG SAI SÓT.</h1>
                <p class="text-slate-600 font-bold border-l-4 border-secondary pl-4 text-lg">Dashboard tổng hợp dữ liệu thời gian thực</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="brutal-card p-6 flex flex-col gap-2">
                    <span class="material-symbols-outlined text-4xl text-secondary">payments</span>
                    <span class="text-sm font-bold text-slate-500 uppercase">Tồn kho trị giá</span>
                    <span class="text-3xl font-heading">${totalCapital.toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="brutal-card p-6 flex flex-col gap-2">
                    <span class="material-symbols-outlined text-4xl text-primary">local_cafe</span>
                    <span class="text-sm font-bold text-slate-500 uppercase">Tổng Công thức</span>
                    <span class="text-3xl font-heading">${recipesData.data ? recipesData.data.length : 0}</span>
                </div>
                <div class="brutal-card p-6 flex flex-col gap-2 ${lowStock > 0 ? 'bg-red-50' : ''}">
                    <span class="material-symbols-outlined text-4xl ${lowStock > 0 ? 'text-red-600' : 'text-green-600'}">warning</span>
                    <span class="text-sm font-bold text-slate-500 uppercase">Nguyên liệu sắp hết</span>
                    <span class="text-3xl font-heading ${lowStock > 0 ? 'text-red-600' : ''}">${lowStock}</span>
                </div>
                <div class="brutal-card p-6 flex flex-col gap-2">
                    <span class="material-symbols-outlined text-4xl text-blue-500">group</span>
                    <span class="text-sm font-bold text-slate-500 uppercase">Tài khoản</span>
                    <span class="text-3xl font-heading">${usersData.data ? usersData.data.length : 0}</span>
                </div>
            </div>
            
            <div class="mt-8 flex gap-4">
                <button class="brutal-btn brutal-btn-primary px-8 py-4 text-lg flex items-center gap-2" onclick="navigate('recipes')">
                    <span class="material-symbols-outlined">add</span> TẠO CÔNG THỨC
                </button>
                <button class="brutal-btn brutal-btn-secondary px-8 py-4 text-lg flex items-center gap-2" onclick="navigate('inventory')">
                    <span class="material-symbols-outlined">inventory</span> NHẬP KHO
                </button>
            </div>
        `;
    } catch (e) {
        appContent.innerHTML = `<div class="p-6 bg-red-100 brutal-border text-red-900 font-bold">Lỗi tải Dashboard: ${e.message}</div>`;
    }
}

// --- 2. INVENTORY ---
async function renderInventory() {
    appContent.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h2 class="text-3xl font-heading uppercase">Kho Nguyên Liệu</h2>
            <div class="flex gap-2 w-full sm:w-auto">
                <button class="brutal-btn brutal-btn-secondary px-4 py-3 flex-1 sm:flex-none flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined">upload_file</span> IMPORT
                </button>
                <button class="brutal-btn brutal-btn-primary px-4 py-3 flex-1 sm:flex-none flex items-center justify-center gap-2" id="btn-add-inv">
                    <span class="material-symbols-outlined">add</span> THÊM MỚI
                </button>
            </div>
        </div>
        
        <div class="brutal-table-container">
            <table class="brutal-table">
                <thead>
                    <tr>
                        <th class="w-12 text-center">ID</th>
                        <th>Tên Nguyên Liệu</th>
                        <th class="text-center">Số Lượng</th>
                        <th class="text-center">Đơn Vị</th>
                        <th class="text-right">Giá vốn</th>
                        <th class="text-right">Tổng Mức Nhập</th>
                        <th class="w-16 text-center"></th>
                    </tr>
                </thead>
                <tbody id="inventory-list">
                    <tr><td colspan="6" class="text-center italic">Đang tải...</td></tr>
                </tbody>
            </table>
        </div>
        
        <!-- Add Inv Form Modal (Hidden by default) -->
        <div id="modal-inv" class="fixed inset-0 items-center justify-center p-4 content-center" style="display: none; background-color: rgba(0,0,0,0.6); z-index: 9999;">
            <div class="brutal-card w-full max-w-md p-6 flex flex-col gap-4">
                <h3 class="text-2xl font-heading uppercase border-b-4 border-black pb-2">Nhập kho mới</h3>
                <input type="text" id="inv-name" placeholder="Tên nguyên liệu" class="brutal-input">
                <div class="flex gap-4">
                    <input type="number" id="inv-stock" placeholder="Số lượng" class="brutal-input flex-1">
                    <input type="text" id="inv-unit" placeholder="Đơn vị" class="brutal-input w-24">
                </div>
                <input type="number" id="inv-price" placeholder="Đơn giá" class="brutal-input">
                <div class="flex gap-2 mt-4">
                    <button class="brutal-btn brutal-btn-secondary py-3 flex-1" onclick="document.getElementById('modal-inv').style.display='none'">HỦY</button>
                    <button class="brutal-btn brutal-btn-primary py-3 flex-1" id="btn-save-inv">XÁC NHẬN</button>
                </div>
            </div>
        </div>
    `;

    const loadData = async () => {
        try {
            const res = await fetch(`${API_URL}/inventory`);
            const json = await res.json();
            const tbody = document.getElementById('inventory-list');
            if (!json.success || json.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center">Chưa có dữ liệu</td></tr>`;
                return;
            }

            tbody.innerHTML = json.data.map(item => {
                const isLow = item.stock < 10;
                return `
                <tr class="${isLow ? 'bg-red-100 text-red-900 border-b-4 border-black' : ''}">
                    <td class="text-center">#${item.id}</td>
                    <td>
                        <div class="flex items-center gap-2">
                            ${isLow ? '<span class="material-symbols-outlined text-red-600">warning</span>' : ''}
                            ${item.name}
                        </div>
                    </td>
                    <td class="text-center font-black ${isLow ? 'text-xl' : ''}">${item.stock}</td>
                    <td class="text-center">${item.unit}</td>
                    <td class="text-right">${item.price.toLocaleString('vi-VN')} đ</td>
                    <td class="text-right font-black text-secondary">${(item.price * item.stock).toLocaleString('vi-VN')} đ</td>
                    <td class="text-center">
                        <button class="text-red-500 hover:text-red-700 active:scale-90 transition-transform p-1" onclick="window.deleteInventory(${item.id})" title="Xóa Nguyên Liệu">
                            <span class="material-symbols-outlined font-bold text-xl">delete</span>
                        </button>
                    </td>
                </tr>
            `}).join('');
        } catch (e) {
            showToast("Lỗi tải kho: " + e.message, "error");
        }
    };

    await loadData();

    // Event hooks
    document.getElementById('btn-add-inv').onclick = () => document.getElementById('modal-inv').style.display = 'flex';

    document.getElementById('btn-save-inv').onclick = async () => {
        const payload = {
            name: document.getElementById('inv-name').value,
            stock: document.getElementById('inv-stock').value,
            unit: document.getElementById('inv-unit').value,
            price: document.getElementById('inv-price').value
        };
        try {
            const res = await fetch(`${API_URL}/inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const j = await res.json();
            if (j.success) {
                document.getElementById('modal-inv').style.display = 'none';
                showToast("Nhập kho thành công!");
                loadData();
            } else {
                showToast(j.error, "error");
            }
        } catch (e) {
            showToast("Lỗi lưu DB", "error");
        }
    };

    window.deleteInventory = async function (id) {
        if (!confirm('Bạn có chắc chắn muốn xóa nguyên liệu này? Các công thức liên kết có thể bị ảnh hưởng.')) return;

        try {
            const res = await fetch(`${API_URL}/inventory/${id}`, { method: 'DELETE' });
            const j = await res.json();
            if (j.success) {
                showToast("Đã xóa nguyên liệu!");
                loadData();
            } else {
                showToast(j.error, "error");
            }
        } catch (e) {
            showToast("Lỗi xóa db", "error");
        }
    };
}

// --- 3. RECIPES ---
async function renderRecipes() {
    appContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-heading uppercase">Công thức pha chế</h2>
            <button class="brutal-btn brutal-btn-primary px-4 py-3 flex items-center gap-2">
                <span class="material-symbols-outlined">add</span> TẠO MỚI
            </button>
        </div>
        <div id="recipe-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div class="p-6 italic">Đang tải...</div>
        </div>
    `;

    try {
        const res = await fetch(`${API_URL}/recipes`);
        const json = await res.json();
        const grid = document.getElementById('recipe-list');

        if (json.data && json.data.length > 0) {
            grid.innerHTML = json.data.map(item => `
                <div class="brutal-card p-0 flex flex-col hover:cursor-pointer group">
                    <div class="h-48 bg-secondary border-b-4 border-black relative overflow-hidden flex items-center justify-center">
                        <span class="material-symbols-outlined text-white text-[80px] opacity-20 group-hover:scale-110 transition-transform">local_cafe</span>
                        <div class="absolute top-2 right-2 bg-primary brutal-border p-1 px-2 font-bold text-xs uppercase shadow-[2px_2px_0_0_#000]">Size ${item.size}</div>
                    </div>
                    <div class="p-5 flex flex-col gap-3">
                        <div class="flex justify-between items-start">
                            <h3 class="text-xl font-heading uppercase">${item.name}</h3>
                            <span class="text-lg font-black text-secondary">${item.price.toLocaleString('vi-VN')} đ</span>
                        </div>
                        <div class="flex gap-2 text-xs font-bold">
                            <span class="bg-gray-100 px-2 py-1 brutal-border shadow-[2px_2px_0_0_#000]">${item.steps} Bước</span>
                            <span class="bg-yellow-100 px-2 py-1 brutal-border shadow-[2px_2px_0_0_#000]">Cost: ${item.cogs.toLocaleString()}đ</span>
                        </div>
                        <button class="brutal-btn brutal-btn-secondary w-full py-3 mt-2">CHI TIẾT</button>
                    </div>
                </div>
            `).join('');
        } else {
            grid.innerHTML = "Chưa có món nào.";
        }
    } catch (e) { }
}


// --- 4. ROLES / USERS ---
async function renderRoles() {
    appContent.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-heading uppercase">Phân quyền tài khoản</h2>
            <button class="brutal-btn brutal-btn-primary px-4 py-3 flex items-center gap-2" onclick="alert('Tính năng nâng cao')">
                <span class="material-symbols-outlined">add</span> THÊM TÀI KHOẢN
            </button>
        </div>
        <div id="users-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"></div>
    `;

    try {
        const res = await fetch(`${API_URL}/users`);
        const json = await res.json();
        const grid = document.getElementById('users-list');

        if (json.data && json.data.length > 0) {
            grid.innerHTML = json.data.map(user => `
                <div class="brutal-card p-6 flex flex-col gap-4">
                    <div class="flex gap-4 items-center">
                        <div class="size-16 rounded-full border-4 border-black bg-[${user.role === 'admin' ? '#FFD600' : '#e2e8f0'}] flex items-center justify-center font-heading text-2xl uppercase">
                            ${user.username.charAt(0)}
                        </div>
                        <div>
                            <h4 class="text-xl font-black">${user.username}</h4>
                            <span class="inline-block border-2 border-black px-2 py-0.5 mt-1 text-xs font-bold bg-${user.role === 'admin' ? 'secondary' : 'white'} text-${user.role === 'admin' ? 'white' : 'black'}">
                                ${user.role.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <div class="mt-2 space-y-2 border-t-4 border-black pt-4">
                        <div class="flex items-center gap-2 font-bold">
                            <span class="material-symbols-outlined ${user.role === 'admin' ? 'text-green-600' : 'text-red-500'}">
                                ${user.role === 'admin' ? 'check_box' : 'disabled_by_default'}
                            </span>
                            Toàn quyền hệ thống
                        </div>
                        <div class="flex items-center gap-2 font-bold">
                            <span class="material-symbols-outlined text-green-600">check_box</span>
                            Thao tác cơ bản
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) { }
}


// ================= UTILITIES =================
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const isError = type === "error";
    toast.className = `p-4 border-4 border-black shadow-[6px_6px_0_0_#000] font-bold flex items-center gap-3 transition-all transform translate-x-full ${isError ? 'bg-red-400 text-black' : 'bg-primary text-black'}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${isError ? 'error' : 'task_alt'}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Slide in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 50);

    // Remove
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
