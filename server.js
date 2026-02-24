const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const app = express();
const port = process.env.PORT || 3000;

// Setup Multer for in-memory file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Vô hiệu hóa Cache tĩnh để khách luôn thấy bản Update mới
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM'; // Khuyến nghị: Sử dụng SERVICE_ROLE_KEY cho backend thay vì ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Đã kết nối tới Supabase Database');


// ================= THIẾT LẬP THEME TOÀN HỆ THỐNG =================
const fs = require('fs');
const THEME_FILE = path.join(__dirname, 'theme.json');
let currentTheme = 'brutalism';

try {
    if (fs.existsSync(THEME_FILE)) {
        currentTheme = JSON.parse(fs.readFileSync(THEME_FILE, 'utf-8')).theme || 'brutalism';
    }
} catch (e) {
    console.warn("Chưa có file theme.json, dùng theme mặc định.");
}

app.get('/api/theme', (req, res) => {
    res.json({ success: true, theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    if (theme === 'brutalism' || theme === 'cloud') {
        currentTheme = theme;
        try {
            fs.writeFileSync(THEME_FILE, JSON.stringify({ theme: currentTheme }));
        } catch (e) {
            console.error("Không thể lưu theme.json");
        }
        res.json({ success: true, theme: currentTheme });
    } else {
        res.status(400).json({ success: false, error: 'Theme không hợp lệ' });
    }
});

// ================= API ENDPOINTS =================

// --- Inventory ---
app.get('/api/inventory', async (req, res) => {
    const { data: rows, error } = await supabase.from('inventory').select('*').order('name', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: rows });
});

app.post('/api/inventory', async (req, res) => {
    const { name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên nguyên liệu không được trống' });

    const newRow = {
        name,
        stock: stock || 0,
        unit: unit || 'Cái',
        pack_size: pack_size || 1,
        pack_unit: pack_unit || unit,
        recipe_unit: recipe_unit || unit || 'Cái',
        recipe_unit_ratio: recipe_unit_ratio || 1,
        price: price || 0
    };

    const { data, error } = await supabase.from('inventory').insert([newRow]).select().single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Ghi lịch sử nhập kho
    await supabase.from('inventory_history').insert([{
        inventory_id: data.id,
        action_type: 'IMPORT',
        quantity_changed: stock || 0,
        price: price || 0
    }]);

    res.json({ success: true, data });
});

app.delete('/api/inventory/:id', async (req, res) => {
    const { error, count } = await supabase.from('inventory').delete({ count: 'exact' }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: { changes: count } });
});

app.put('/api/inventory/:id', async (req, res) => {
    const { name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price } = req.body;

    const updateData = { name, stock, unit, pack_size, pack_unit, recipe_unit, recipe_unit_ratio, price };

    const { error } = await supabase.from('inventory').update(updateData).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Ghi lịch sử cập nhật
    await supabase.from('inventory_history').insert([{
        inventory_id: req.params.id,
        action_type: 'UPDATE',
        quantity_changed: stock || 0,
        price: price || 0
    }]);

    res.json({ success: true, data: { changes: 1 } });
});

app.get('/api/inventory/:id/history', async (req, res) => {
    const { data: rows, error } = await supabase.from('inventory_history').select('*').eq('inventory_id', req.params.id).order('timestamp', { ascending: false });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: rows });
});

// --- Export Inventory ---

app.get('/api/inventory/export/csv', async (req, res) => {
    const { data: rows, error } = await supabase.from('inventory').select('id, name, stock, unit, price').order('name', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });

    let csvContent = "ID,Tên Nguyên Liệu,Số Lượng,Đơn Vị, Đơn Giá\n";
    rows.forEach(r => {
        csvContent += `"${r.id}","${r.name}","${r.stock}","${r.unit}","${r.price}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_export.csv"');
    res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8'));
});

app.get('/api/inventory/export/excel', async (req, res) => {
    try {
        const { data: rows, error } = await supabase.from('inventory').select('id, name, stock, unit, price').order('name', { ascending: true });
        if (error) throw error;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Kho Nguyên Liệu');

        sheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'TÊN NGUYÊN LIỆU', key: 'name', width: 35 },
            { header: 'SỐ LƯỢNG', key: 'stock', width: 15 },
            { header: 'ĐƠN VỊ', key: 'unit', width: 15 },
            { header: 'ĐƠN GIÁ (VNĐ)', key: 'price', width: 20 },
            { header: 'TỔNG VỐN (VNĐ)', key: 'total', width: 25 },
        ];

        // Brutalism Header Styling
        const headerRow = sheet.getRow(1);
        headerRow.font = { name: 'Arial', family: 4, size: 12, bold: true, color: { argb: 'FF000000' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD600' } }; // Rôm Rả Yellow
        headerRow.eachCell((cell) => {
            cell.border = {
                top: { style: 'thick' }, left: { style: 'thick' }, bottom: { style: 'thick' }, right: { style: 'thick' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        rows.forEach(r => {
            const row = sheet.addRow({
                id: r.id, name: r.name, stock: r.stock, unit: r.unit, price: r.price, total: r.stock * r.price
            });
            row.eachCell((cell) => {
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                if (cell.col >= 3) cell.alignment = { horizontal: 'right' };
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Kho_Rôm_Rả_Cà_Phê.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/inventory/export/pdf', async (req, res) => {
    const { data: rows, error } = await supabase.from('inventory').select('id, name, stock, unit, price').order('name', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Bao_Cao_Kho_Rom_Ra.pdf"');
    doc.pipe(res);

    // Header Background (Simulate Brutalism Yellow Block)
    doc.rect(50, 40, 495, 60).fillAndStroke('#FFD600', '#000000');
    doc.lineWidth(4); // Thick borders
    doc.rect(50, 40, 495, 60).stroke();

    // Title
    doc.fillColor('#000000').fontSize(24).font('Helvetica-Bold').text('RÔM RẢ CÀ PHÊ - KHO NGUYÊN LIỆU', 0, 58, { align: 'center' });

    doc.moveDown(3);
    doc.fontSize(10).font('Helvetica-Bold');

    let y = 140;
    const colWidths = [40, 200, 60, 60, 100];
    const headers = ["ID", "TEN NGUYEN LIEU", "SL", "D.VI", "TONG VON(VND)"];

    // Draw Table Header
    let x = 50;
    headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], 30).fillAndStroke('#000000', '#000000');
        doc.fillColor('#FFFFFF').text(h, x + 5, y + 10);
        x += colWidths[i];
    });

    y += 30;
    doc.font('Helvetica').fillColor('#000000');
    doc.lineWidth(1);

    rows.forEach((r, idx) => {
        if (y > 750) {
            doc.addPage();
            y = 50;
        }
        x = 50;
        const isAlt = idx % 2 === 0;
        const values = [r.id.toString(), r.name, r.stock.toString(), r.unit, (r.stock * r.price).toLocaleString('en-US')];
        values.forEach((val, i) => {
            doc.rect(x, y, colWidths[i], 25).fillAndStroke(isAlt ? '#f8fafc' : '#ffffff', '#000000');
            doc.fillColor('#000000').text(val, x + 5, y + 8);
            x += colWidths[i];
        });
        y += 25;
    });

    doc.end();
});

app.post('/api/inventory/import', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Vui lòng chọn file CSV' });

    const results = [];

    // Convert Buffer to stream
    const stream = Readable.from(req.file.buffer.toString('utf-8'));

    stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            if (results.length === 0) return res.status(400).json({ success: false, error: 'File rỗng hoặc sai định dạng' });

            // Cố gắng update các mặt hàng có sẵn dựa trên ID hoặc Tên
            let errorOccurred = false;
            let successCount = 0;

            for (const row of results) {
                const id = row['ID'] || row['id'];
                const name = row['Tên Nguyên Liệu'] || row['name'] || row['TEN NGUYEN LIEU'];
                const addedStock = parseFloat(row['Số Lượng']) || parseFloat(row['SL']) || parseFloat(row['stock']) || 0;
                const price = parseFloat(row['Đơn Giá']) || parseFloat(row['price']) || parseFloat(row['GIA VON(VND)']) || 0;

                if (!name && !id) continue; // Skip invalid rows

                try {
                    // Fetch existing to get current stock and true ID
                    let query = supabase.from('inventory').select('id, stock');
                    if (id) query = query.eq('id', id);
                    else if (name) query = query.eq('name', name);

                    const { data: existingData, error: fetchErr } = await query.single();

                    if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 is no rows
                        errorOccurred = true;
                        continue;
                    }

                    if (existingData) {
                        const newStock = parseFloat(existingData.stock) + addedStock;
                        const { error: updateErr } = await supabase.from('inventory').update({ stock: newStock, price }).eq('id', existingData.id);

                        if (!updateErr) {
                            await supabase.from('inventory_history').insert([{
                                inventory_id: existingData.id,
                                action_type: 'BATCH_IMPORT',
                                quantity_changed: addedStock,
                                price: price
                            }]);
                            successCount++;
                        } else {
                            errorOccurred = true;
                        }
                    } else {
                        // Optional: Insert new if doesn't exist? Currently only update supported basically
                    }
                } catch (err) {
                    errorOccurred = true;
                }
            }

            if (errorOccurred && successCount === 0) {
                return res.status(500).json({ success: false, error: 'Lỗi parse file hoặc cập nhật dữ liệu' });
            } else {
                res.json({ success: true, message: `Đã import hoặc kiểm tra xong file. Cập nhật được ${successCount} dòng dữ liệu` });
            }
        });
});

// --- Recipes ---
app.get('/api/recipes', async (req, res) => {
    const { data: invRows, error: invErr } = await supabase.from('inventory').select('*');
    if (invErr) return res.status(500).json({ success: false, error: invErr.message });

    const invMap = {};
    const invNameMap = {};
    invRows.forEach(i => {
        const ratio = i.recipe_unit_ratio && Number(i.recipe_unit_ratio) > 0 ? Number(i.recipe_unit_ratio) : 1;
        const trueUnitCost = Number(i.price) / ratio;
        invMap[i.id] = trueUnitCost;
        invNameMap[i.name] = trueUnitCost;
    });

    const { data: rows, error: recErr } = await supabase.from('recipes').select('*').order('name', { ascending: true });
    if (recErr) return res.status(500).json({ success: false, error: recErr.message });

    rows.forEach(r => {
        let totalCost = 0;
        if (r.ingredients) {
            try {
                // with Supabase JSONB, it might already be parsed, check if string
                const ings = typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients;
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

app.get('/api/recipes/export/pdf', async (req, res) => {
    // 1. Fetch Inventory to build cost map
    const { data: invRows, error: invErr } = await supabase.from('inventory').select('*');
    if (invErr) return res.status(500).json({ success: false, error: invErr.message });

    const invMap = {};
    const invNameMap = {};
    invRows.forEach(i => {
        const ratio = i.recipe_unit_ratio && Number(i.recipe_unit_ratio) > 0 ? Number(i.recipe_unit_ratio) : 1;
        const trueUnitCost = Number(i.price) / ratio;
        invMap[i.id] = trueUnitCost;
        invNameMap[i.name] = trueUnitCost;
    });

    // 2. Fetch Recipes
    const { data: rows, error: recErr } = await supabase.from('recipes').select('*').order('name', { ascending: true });
    if (recErr) return res.status(500).json({ success: false, error: recErr.message });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Menu_Cong_Thuc_Rom_Ra.pdf"');
    doc.pipe(res);

    // Brutalism Header
    doc.rect(50, 40, 495, 60).fillAndStroke('#FFD600', '#000000');
    doc.lineWidth(4);
    doc.rect(50, 40, 495, 60).stroke();

    // Title
    doc.fillColor('#000000').fontSize(24).font('Helvetica-Bold').text('RÔM RẢ CÀ PHÊ - MENU CÔNG THỨC', 0, 58, { align: 'center' });

    doc.moveDown(3);
    doc.fontSize(10).font('Helvetica-Bold');

    let y = 140;
    const colWidths = [180, 50, 40, 100, 100];
    const headers = ["TEN MON", "SIZE", "B.CAO", "GIA VON(VND)", "GIA BAN(VND)"];

    // Draw Table Header
    let x = 50;
    headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], 30).fillAndStroke('#000000', '#000000');
        doc.fillColor('#FFFFFF').text(h, x + 5, y + 10);
        x += colWidths[i];
    });

    y += 30;
    doc.font('Helvetica').fillColor('#000000');
    doc.lineWidth(1);

    rows.forEach((r, idx) => {
        if (y > 750) {
            doc.addPage();
            y = 50;
        }

        // Calculate Dynamic COGS
        let totalCost = 0;
        if (r.ingredients) {
            try {
                const ings = typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients;
                ings.forEach(ing => {
                    let unitCost = 0;
                    if (ing.invId && invMap[ing.invId]) unitCost = invMap[ing.invId];
                    else if (invNameMap[ing.name]) unitCost = invNameMap[ing.name];
                    totalCost += (ing.amount || 0) * unitCost;
                });
            } catch (e) { }
        }

        x = 50;
        const isAlt = idx % 2 === 0;
        const values = [r.name, r.size || 'M', r.steps.toString() + ' Buoc', totalCost.toLocaleString('en-US'), Number(r.price).toLocaleString('en-US')];

        values.forEach((val, i) => {
            doc.rect(x, y, colWidths[i], 25).fillAndStroke(isAlt ? '#f8fafc' : '#ffffff', '#000000');
            doc.fillColor('#000000').text(val, x + 5, y + 8);
            x += colWidths[i];
        });
        y += 25;
    });

    doc.end();
});

app.post('/api/recipes', async (req, res) => {
    const { name, size, cogs, steps, price, image, ingredients, steps_detail, description, is_best_seller, is_sold_out } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên công thức không được trống' });

    // Ensure JSON is passed for JSONB
    let parsedIngredients = ingredients;
    let parsedSteps = steps_detail;
    try {
        if (typeof ingredients === 'string') parsedIngredients = JSON.parse(ingredients);
        if (typeof steps_detail === 'string') parsedSteps = JSON.parse(steps_detail);
    } catch (e) { }

    const newObj = {
        name,
        size: size || 'M',
        cogs: cogs || 0,
        steps: steps || 1,
        price: price || 0,
        image: image || '',
        description: description || '',
        is_best_seller: is_best_seller || false,
        is_sold_out: is_sold_out || false,
        ingredients: parsedIngredients, // Supabase allows storing JSON objects directly into JSONB
        steps_detail: parsedSteps
    };

    const { data, error } = await supabase.from('recipes').insert([newObj]).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.put('/api/recipes/:id', async (req, res) => {
    const { name, size, cogs, steps, price, ingredients, steps_detail, image, description, is_best_seller, is_sold_out } = req.body;

    let parsedIngredients = ingredients;
    let parsedSteps = steps_detail;
    try {
        if (typeof ingredients === 'string') parsedIngredients = JSON.parse(ingredients);
        if (typeof steps_detail === 'string') parsedSteps = JSON.parse(steps_detail);
    } catch (e) { }

    const updateObj = {
        name, size, cogs, steps, price, image,
        description, is_best_seller, is_sold_out,
        ingredients: parsedIngredients, steps_detail: parsedSteps
    };

    const { error } = await supabase.from('recipes').update(updateObj).eq('id', req.params.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: { changes: 1 } });
});

app.delete('/api/recipes/:id', async (req, res) => {
    const { error, count } = await supabase.from('recipes').delete({ count: 'exact' }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: { changes: count } });
});

// --- Orders / POS ---
app.post('/api/orders', async (req, res) => {
    try {
        const { items, paymentMethod, clientTotal } = req.body;
        if (!items || items.length === 0) return res.status(400).json({ success: false, error: "Giỏ hàng rỗng" });

        // 1. Lấy giá chuẩn của các món từ CSDL để check gian lận
        const recipeIds = items.map(i => i.recipeId);
        const { data: recipes, error: rErr } = await supabase.from('recipes').select('id, price').in('id', recipeIds);
        if (rErr) throw rErr;

        let serverTotal = 0;
        const validItems = [];

        items.forEach(item => {
            const r = recipes.find(r => r.id === item.recipeId);
            if (r) {
                serverTotal += (r.price * item.quantity);
                validItems.push({
                    recipe_id: item.recipeId,
                    quantity: item.quantity,
                    price: r.price
                });
            }
        });

        // 2. Tạo record Order
        const { data: orderData, error: oErr } = await supabase.from('orders').insert({
            payment_method: paymentMethod || 'cash',
            total_amount: serverTotal,
            status: 'pending' // Chờ thu ngân/chế biến xác nhận
        }).select().single();

        if (oErr) throw oErr;

        // 3. Gắn Order ID vào chi tiết và Insert Order Items
        const orderItemsToInsert = validItems.map(vi => ({
            ...vi,
            order_id: orderData.id
        }));

        const { error: oiErr } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (oiErr) throw oiErr;

        res.json({ success: true, orderId: orderData.id });
    } catch (e) {
        console.error('Order Error:', e);
    }
});

// Lấy danh sách Order (live POS)
app.get('/api/orders', async (req, res) => {
    try {
        // Lấy danh sách 50 đơn mới nhất
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id, quantity, price,
                    recipes (name, size)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        console.error('Fetch Orders Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Cập nhật trạng thái Order (pending -> processing -> completed / cancelled)
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ" });
        }

        const { error } = await supabase
            .from('orders')
            .update({ status })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        console.error('Update Order Status Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Reports ---
app.get('/api/reports/dashboard', async (req, res) => {
    try {
        // 1. Khởi tạo mảng 7 ngày gần nhất (định dạng DD/MM)
        const last7Days = [];
        const dateKeyMap = {}; // Map DD/MM -> YYYY-MM-DD

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            // Cắt ra YYYY-MM-DD theo múi giờ local
            const dStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

            last7Days.push(label);
            dateKeyMap[dStr] = label;
        }

        // 2. Fetch toàn bộ order trong 7 ngày
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id, total_amount, created_at, status,
                order_items (
                    quantity, price,
                    recipes (name)
                )
            `)
            .gte('created_at', startDate.toISOString())
            .eq('status', 'completed');

        if (error) throw error;

        // 3. Xử lý dữ liệu gom theo ngày và Top Products
        const dailyRevenues = {};
        const dailyCosts = {};
        const productStats = {}; // { recipeName: { qty, rev } }
        let totalRev = 0;
        let totalCostAll = 0;

        last7Days.forEach(day => {
            dailyRevenues[day] = 0;
            dailyCosts[day] = 0;
        });

        orders.forEach(order => {
            // Xác định ngày của Order
            const d = new Date(order.created_at);
            const dStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const label = dateKeyMap[dStr];

            if (label && dailyRevenues[label] !== undefined) {
                dailyRevenues[label] += order.total_amount;
                // Giả định Cost = 40% doanh thu trong v1
                dailyCosts[label] += order.total_amount * 0.4;

                totalRev += order.total_amount;
                totalCostAll += order.total_amount * 0.4;
            }

            // Tính Top Product
            order.order_items.forEach(oi => {
                const rName = oi.recipes?.name || 'Món Đã Xóa';
                if (!productStats[rName]) {
                    productStats[rName] = { qty: 0, revenue: 0 };
                }
                productStats[rName].qty += oi.quantity;
                productStats[rName].revenue += (oi.quantity * (oi.price || 0));
            });
        });

        // 4. Format Output Map thành Mảng cho Chart
        const revenues = last7Days.map(day => dailyRevenues[day]);
        const costs = last7Days.map(day => dailyCosts[day]);

        let topProducts = Object.keys(productStats).map(name => ({
            name: name,
            qty: productStats[name].qty,
            revenue: productStats[name].revenue
        }));
        // Sort descending by qty
        topProducts.sort((a, b) => b.qty - a.qty);
        topProducts = topProducts.slice(0, 4); // Chỉ lấy 4 món top

        res.json({
            success: true,
            data: {
                revenueData: { labels: last7Days, revenues, costs },
                topProducts: topProducts,
                summary: {
                    totalRevenue: totalRev,
                    totalCost: totalCostAll,
                    totalOrders: orders.length
                }
            }
        });
    } catch (e) {
        console.error("Dashboard Report Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Users ---
app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: row, error } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();

    if (error || !row) return res.status(401).json({ success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' });
    res.json({ success: true, data: { id: row.id, username: row.username, role: row.role } });
});

app.get('/api/users', async (req, res) => {
    const { data: rows, error } = await supabase.from('users').select('*').order('role', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: rows });
});

app.post('/api/users', async (req, res) => {
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

    const { data, error } = await supabase.from('users').insert([{ username, password, role, permissions }]).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: { id: data.id, username, role, permissions } });
});

app.put('/api/users/:id/password', async (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, error: 'Thiếu mật khẩu mới' });
    }

    const { error, count } = await supabase.from('users').update({ password }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
});

app.delete('/api/users/:id', async (req, res) => {
    // Không cho phép xóa ID = 1 (Tài khoản Admin root)
    if (req.params.id == 1) {
        return res.status(403).json({ success: false, error: 'Không thể xóa tài khoản Quản trị viên gốc' });
    }
    const { error, count } = await supabase.from('users').delete({ count: 'exact' }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: { changes: count } });
});


// Start the Express server
if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server v3 (Supabase) is running on http://localhost:${port}`);
    });
}

// Export for Vercel Serverless Function
module.exports = app;
