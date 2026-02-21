const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Database
const db = new sqlite3.Database('./dev.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Lỗi khi mở cơ sở dữ liệu!', err.message);
    } else {
        console.log('Đã kết nối tới cơ sở dữ liệu dev.sqlite');
        initSchemas();
    }
});

function initSchemas() {
    db.serialize(() => {
        // Create tables without dropping
        db.run(`CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            stock INTEGER DEFAULT 0,
            unit TEXT,
            pack_size REAL DEFAULT 1,
            pack_unit TEXT,
            recipe_unit TEXT,
            recipe_unit_ratio REAL DEFAULT 1,
            price INTEGER DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            size TEXT DEFAULT 'M',
            cogs REAL DEFAULT 0,
            steps INTEGER DEFAULT 3,
            price REAL DEFAULT 0,
            ingredients TEXT,
            steps_detail TEXT,
            image TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'staff',
            permissions TEXT
        )`);

        console.log('Đã khởi tạo xong các bảng CSDL Rôm Rả Cà Phê.');

        // Seed data giả lập
        seedData();
    });
}

function seedData() {
    console.log('Seeding dữ liệu ban đầu...');
    // Seed Users
    db.run(`INSERT INTO users (username, password, role, permissions) VALUES 
        ('Admin', 'admin123', 'admin', 'FULL'),
        ('Nhân viên A', '123456', 'staff', 'READ_ONLY')`);

    // Seed Inventory
    db.get("SELECT count(*) as count FROM inventory", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO inventory (name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price) VALUES 
                ('Hạt cà phê Robusta', 45, 'Bao', 10, 'Kg', 'gram', 10000, 1200000),
                ('Hạt cà phê Arabica', 8, 'Bao', 5, 'Kg', 'gram', 5000, 1250000), 
                ('Sữa đặc Phương Nam', 120, 'Thùng', 24, 'Lon', 'ml', 9120, 528000),
                ('Đường cát trắng', 5, 'Bao', 50, 'Kg', 'gram', 50000, 1000000)`);
        }
    });

    // Seed Recipes
    db.get("SELECT count(*) as count FROM recipes", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO recipes (name, size, cogs, steps, price) VALUES 
                ('Cà phê Đen Đá', 'M', 8000, 3, 25000),
                ('Bạc Xỉu', 'L', 12000, 4, 35000),
                ('Cà phê Muối', 'M', 15000, 5, 40000)`);
        }
    });

    console.log('Seeding Data Hoàn Tất!');
}

// ================= API ENDPOINTS =================

// --- Inventory ---
app.get('/api/inventory', (req, res) => {
    db.all(`SELECT * FROM inventory ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/inventory', (req, res) => {
    const { name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên nguyên liệu không được trống' });

    db.run(`INSERT INTO inventory (name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, stock || 0, unit || 'Cái', pack_size || 1, pack_unit || unit, recipe_unit || unit || 'Cái', recipe_unit_ratio || 1, price || 0],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: { id: this.lastID, name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price } });
        });
});

app.delete('/api/inventory/:id', (req, res) => {
    db.run(`DELETE FROM inventory WHERE id=?`, req.params.id, function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: { changes: this.changes } });
    });
});

app.put('/api/inventory/:id', (req, res) => {
    const { name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price } = req.body;
    db.run(`UPDATE inventory SET name=?, stock=?, unit=?, pack_size=?, pack_unit=?, recipe_unit=?, recipe_unit_ratio=?, price=? WHERE id=?`,
        [name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: { changes: this.changes } });
        }
    );
});

// --- Recipes ---
app.get('/api/recipes', (req, res) => {
    db.all(`SELECT * FROM inventory`, [], (err, invRows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const invMap = {};
        const invNameMap = {};
        const invRatioMap = {}; // mapping for real unit price calculation
        invRows.forEach(i => {
            const ratio = i.recipe_unit_ratio && i.recipe_unit_ratio > 0 ? i.recipe_unit_ratio : 1;
            const trueUnitCost = i.price / ratio;
            invMap[i.id] = trueUnitCost;
            invNameMap[i.name] = trueUnitCost;
        });

        db.all(`SELECT * FROM recipes ORDER BY name ASC`, [], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            rows.forEach(r => {
                let totalCost = 0;
                if (r.ingredients) {
                    try {
                        const ings = JSON.parse(r.ingredients);
                        ings.forEach(ing => {
                            let unitCost = 0;
                            if (ing.invId && invMap[ing.invId]) {
                                unitCost = invMap[ing.invId];
                            } else if (invNameMap[ing.name]) {
                                unitCost = invNameMap[ing.name];
                            }
                            totalCost += (ing.amount || 0) * unitCost;
                        });
                    } catch (e) { }
                }

                // Override raw cogs with real-time computed totalCost
                r.cogs = totalCost;
                r.profit = r.price - totalCost;
                r.profit_margin = r.price > 0 ? (r.profit / r.price) * 100 : 0;
            });

            res.json({ success: true, data: rows });
        });
    });
});

app.post('/api/recipes', (req, res) => {
    const { name, size, cogs, steps, price, image } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên công thức không được trống' });

    db.run(`INSERT INTO recipes (name, size, cogs, steps, price, image) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, size || 'M', cogs || 0, steps || 1, price || 0, image || ''],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: { id: this.lastID, name, size, cogs, steps, price, image } });
        });
});

app.put('/api/recipes/:id', (req, res) => {
    const { name, size, cogs, steps, price, ingredients, steps_detail, image } = req.body;
    db.run(`UPDATE recipes SET name=?, size=?, cogs=?, steps=?, price=?, ingredients=?, steps_detail=?, image=? WHERE id=?`,
        [name, size, cogs, steps, price, ingredients, steps_detail, image, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: { changes: this.changes } });
        }
    );
});

app.delete('/api/recipes/:id', (req, res) => {
    db.run(`DELETE FROM recipes WHERE id=?`, req.params.id, function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: { changes: this.changes } });
    });
});

// --- Reports ---
app.get('/api/reports/dashboard', (req, res) => {
    // Mocking 7-day revenue data
    const last7Days = [];
    const revenues = [];
    const costs = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
        revenues.push(Math.floor(Math.random() * 5000000) + 1000000); // 1M - 6M
        costs.push(Math.floor(Math.random() * 2000000) + 500000);   // 500k - 2.5M
    }

    const topProducts = [
        { name: 'Cà phê Đen Đá', qty: 145, revenue: 145 * 25000 },
        { name: 'Bạc Xỉu', qty: 98, revenue: 98 * 35000 },
        { name: 'Cà phê Muối', qty: 120, revenue: 120 * 40000 },
        { name: 'Trà Đào Cam Sả', qty: 85, revenue: 85 * 45000 }
    ];

    res.json({
        success: true,
        data: {
            revenueData: { labels: last7Days, revenues, costs },
            topProducts: topProducts,
            summary: {
                totalRevenue: revenues.reduce((a, b) => a + b, 0),
                totalCost: costs.reduce((a, b) => a + b, 0),
                totalOrders: 420
            }
        }
    });
});

// --- Users ---
app.get('/api/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY role ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.post('/api/users', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Thiếu tên hoặc mật khẩu' });
    }
    const usernameRegex = /^[a-zA-Z0-9]+$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ success: false, error: 'Tên đăng nhập viết liền, không dấu, không ký tự đặc biệt' });
    }
    if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải từ 8 ký tự trở lên' });
    }

    const permissions = role === 'admin' ? 'FULL' : 'READ_ONLY';

    db.run(`INSERT INTO users (username, password, role, permissions) VALUES (?, ?, ?, ?)`,
        [username, password, role, permissions],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: { id: this.lastID, username, role, permissions } });
        });
});

app.put('/api/users/:id/password', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, error: 'Thiếu mật khẩu mới' });
    }

    db.run(`UPDATE users SET password = ? WHERE id = ?`,
        [password, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
            res.json({ success: true, message: 'Đổi mật khẩu thành công' });
        });
});

app.delete('/api/users/:id', (req, res) => {
    // Không cho phép xóa ID = 1 (Tài khoản Admin root)
    if (req.params.id == 1) {
        return res.status(403).json({ success: false, error: 'Không thể xóa tài khoản Quản trị viên gốc' });
    }
    db.run(`DELETE FROM users WHERE id=?`, req.params.id, function (err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
        res.json({ success: true, data: { changes: this.changes } });
    });
});


// Use simple middleware if necessary, but express.static is enough for SPA.
// If you use browser router, might need specific routes.

// Start the Express server
app.listen(port, () => {
    console.log(`Server v2 is running on http://localhost:${port}`);
});
