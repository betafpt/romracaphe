const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const UAParser = require('ua-parser-js');
const PayOSModule = require('@payos/node');
const PayOS = PayOSModule.PayOS || PayOSModule.default || PayOSModule;
const { chromium } = require('playwright');

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID || '7dadb264-b04a-49d5-924f-3ef465b0e394',
  apiKey: process.env.PAYOS_API_KEY || 'cd36b13d-d269-4e77-98bb-6546042d4028',
  checksumKey: process.env.PAYOS_CHECKSUM_KEY || 'b9bc139250a3f68030eb9438a248e267335e70f9dcd7c58506db8ecaeecc0cbc'
});

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

// --- Categories ---
app.get('/api/categories', async (req, res) => {
    const { data: rows, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data: rows });
});

app.post('/api/categories', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên danh mục không được trống' });

    const { data, error } = await supabase.from('categories').insert([{ name }]).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên danh mục không được trống' });

    const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
});

app.post('/api/categories/reorder', async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'Invalid order data' });

    try {
        // Bulk update is not natively a single function in supabase-js for many rows with different values,
        // so we perform individual updates or an upsert. Upsert requires all columns if not using specific config,
        // so individual updates is safer here since it's a small list.
        const promises = order.map(item =>
            supabase.from('categories').update({ sort_order: item.sort_order }).eq('id', item.id)
        );
        await Promise.all(promises);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Tracking ---
app.post('/api/track-visit', async (req, res) => {
    try {
        const { referrer, user_agent, screen_width } = req.body;

        // 1. Get IP Address
        let ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip_address) ip_address = ip_address.split(',')[0].trim();

        // 2. Parse User Agent
        let device_model = 'Unknown Device';
        if (user_agent) {
            const parser = new UAParser(user_agent);
            const rDevice = parser.getDevice();
            const rOS = parser.getOS();
            const rBrowser = parser.getBrowser();

            if (rDevice.vendor && rDevice.model) {
                device_model = `${rDevice.vendor} ${rDevice.model}`;
            } else if (rOS.name) {
                device_model = `${rOS.name} (${rBrowser.name || 'Unknown Browser'})`;
            }
            if (screen_width && screen_width < 1024 && device_model === 'Unknown Device') {
                device_model = 'Mobile Device';
            }
        }

        // 3. Get Location from IP (if public IP)
        let location = 'Local/Unknown';
        if (ip_address && ip_address !== '::1' && ip_address !== '127.0.0.1' && !ip_address.startsWith('192.168.')) {
            try {
                // Free, rate-limited to 45/min but sufficient for this scale
                const geoRes = await fetch(`http://ip-api.com/json/${ip_address}?fields=city,country`);
                const geo = await geoRes.json();
                if (geo.status === 'success') {
                    location = `${geo.city}, ${geo.country}`;
                }
            } catch (err) { }
        }

        const { data, error } = await supabase.from('visitor_logs').insert([{
            referrer, user_agent, screen_width, ip_address, location, device_model
        }]);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

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
    const { name, size, category, cogs, steps, price, image, ingredients, steps_detail, description, is_best_seller, is_sold_out, is_new } = req.body;
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
        category: category || '',
        cogs: cogs || 0,
        steps: steps || 1,
        price: price || 0,
        image: image || '',
        description: description || '',
        is_best_seller: is_best_seller || false,
        is_sold_out: is_sold_out || false,
        is_new: is_new || false,
        ingredients: parsedIngredients, // Supabase allows storing JSON objects directly into JSONB
        steps_detail: parsedSteps
    };

    const { data, error } = await supabase.from('recipes').insert([newObj]).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

app.put('/api/recipes/:id', async (req, res) => {
    const { name, size, category, cogs, steps, price, ingredients, steps_detail, image, description, is_best_seller, is_sold_out, is_new } = req.body;

    let parsedIngredients = ingredients;
    let parsedSteps = steps_detail;
    try {
        if (typeof ingredients === 'string') parsedIngredients = JSON.parse(ingredients);
        if (typeof steps_detail === 'string') parsedSteps = JSON.parse(steps_detail);
    } catch (e) { }

    const updateObj = {
        name, size, category, cogs, steps, price, image,
        description, is_best_seller, is_sold_out, is_new,
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
        const { items, paymentMethod, note, clientTotal, platform, status } = req.body;
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
                    price: r.price,
                    note: item.note || ''
                });
            }
        });

        // 2. Tạo record Order
        const { data: orderData, error: oErr } = await supabase.from('orders').insert({
            payment_method: paymentMethod || 'cash',
            total_amount: serverTotal,
            status: status || 'pending', // Chờ thu ngân/chế biến xác nhận
            platform: platform || 'local',
            note: note || ''
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

// --- API IN TEM QUA MẠNG LAN TỪ BACKEND (Hỗ trợ in từ mọi thiết bị điện thoại/iPad/máy tính) ---
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ý|Ỳ|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str.trim();
}

app.post('/api/print-label-backend', async (req, res) => {
    const { orderId, printerIP: reqPrinterIP, singleItemIndex, singleItemType, layout: reqLayout } = req.body;
    if (!orderId) {
        return res.status(400).json({ success: false, error: "Thiếu orderId" });
    }
    
    let browser = null;
    try {
        const printerIP = reqPrinterIP || '192.168.50.12';
        console.log(`[PRINT LAN] Bắt đầu xử lý in tem đơn hàng #${orderId} qua máy in ${printerIP}...`);
        
        // 1. Lấy thông tin đơn hàng cùng order_items và recipes
        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id, quantity, price, note,
                    recipes (name, size)
                )
            `)
            .eq('id', orderId)
            .single();

        if (error || !order) {
            console.error("Lỗi lấy đơn hàng từ Supabase:", error);
            return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng trong Database" });
        }

        const isApp = order.platform && order.platform !== 'local';
        let printItems = [];
        let displayId = isApp ? (order.external_short_id || order.id) : order.id;

        if (isApp && order.note && order.note.startsWith('{')) {
            try {
                let appData = JSON.parse(order.note);
                // Fallback to appData.shortOrderNumber if external_short_id is empty
                if (!order.external_short_id && appData.shortOrderNumber) {
                    displayId = appData.shortOrderNumber;
                }
                
                if (appData.items) {
                    printItems = appData.items.map(i => {
                        let notesArray = [];
                        if (i.toppings && i.toppings.length > 0) {
                            i.toppings.forEach(t => notesArray.push(t));
                        }
                        if (i.note) {
                            // Làm sạch ghi chú món: loại bỏ duplicate size
                            const cleanedNote = i.note.replace(/size:\s*[a-zA-Z]\s*\|\s*/i, '').trim();
                            if (cleanedNote) {
                                notesArray.push("Ghi chú: " + cleanedNote);
                            }
                        }
                        return {
                            name: i.name,
                            quantity: i.quantity,
                            size: i.size || '-',
                            note: notesArray.join('|')
                        };
                    });
                }
            } catch(e) {
                console.error("Lỗi parse order.note trong in backend:", e);
            }
        } else {
            printItems = (order.order_items || []).map(oi => {
                const cleanedNote = oi.note ? oi.note.replace(/size:\s*[a-zA-Z]\s*\|\s*/i, '').trim() : '';
                return {
                    name: oi.recipes?.name || 'Món',
                    quantity: oi.quantity,
                    size: oi.recipes?.size || '-',
                    note: cleanedNote ? "Ghi chú: " + cleanedNote : ''
                };
            });
        }

        const platformName = (order.platform || 'LOCAL').toUpperCase();
        const orderDate = new Date(order.created_at);
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${pad(orderDate.getHours())}:${pad(orderDate.getMinutes())} ${pad(orderDate.getDate())}/${pad(orderDate.getMonth() + 1)}/${orderDate.getFullYear()}`;

        // Xây dựng danh sách toàn bộ các tem cốc được in ra của đơn hàng trước khi lọc in lẻ
        let totalQuantity = printItems.reduce((acc, oi) => acc + (parseInt(oi.quantity) || 1), 0);
        let tempIndex = 1;
        const allLabelsToPrint = [];

        printItems.forEach((oi, oiIdx) => {
            const qty = parseInt(oi.quantity) || 1;
            for (let i = 1; i <= qty; i++) {
                allLabelsToPrint.push({
                    oi,
                    itemIndex: tempIndex,
                    totalQuantity: totalQuantity,
                    originalItemIndex: oiIdx
                });
                tempIndex++;
            }
        });

        // Lọc in lẻ nếu có tham số singleItemIndex từ frontend
        let labelsToRender = allLabelsToPrint;
        if (singleItemIndex !== undefined) {
            const idx = parseInt(singleItemIndex);
            labelsToRender = allLabelsToPrint.filter(label => label.originalItemIndex === idx);
            console.log(`[PRINT LAN] Yêu cầu in lẻ món tại vị trí index: ${idx}. Lọc được ${labelsToRender.length}/${totalQuantity} tem để in.`);
        } else {
            console.log(`[PRINT LAN] Tổng cộng cần in ${totalQuantity} tem.`);
        }

        // Khởi động Playwright Chromium ngầm
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Nạp Google Fonts tiếng Việt cao cấp và đợi load xong hoàn toàn trước khi vẽ
        await page.setContent(`
            <html>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Comfortaa:ital,wght@0,400;0,700;1,400;1,700&family=Inter:ital,wght@0,400;0,700;1,400;1,700&family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Outfit:ital,wght@0,400;0,700;1,400;1,700&family=Roboto:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
                <style>body { margin: 0; padding: 0; }</style>
            </head>
            <body></body>
            </html>
        `);
        await page.evaluate(() => document.fonts.ready);

        let allLabelsBuffers = [];
        
        // Sử dụng layout kéo thả từ request hoặc layout mặc định cực kỳ chuẩn xác
        const layout = reqLayout || {
            fontFamily: "Arial",
            title: { x: 20, y: 20, fontSize: 24, fontWeight: 'bold', fontStyle: 'normal', visible: true },
            divider: { x: 20, y: 48, width: 360, height: 3, style: 'solid', visible: true },
            itemName: { x: 20, y: 60, fontSize: 28, fontWeight: 'bold', fontStyle: 'normal', visible: true },
            size: { x: 20, y: 125, fontSize: 20, fontWeight: 'bold', fontStyle: 'normal', visible: true },
            note: { x: 20, y: 155, fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', visible: true },
            timeStr: { x: 20, y: 200, fontSize: 18, fontWeight: 'bold', fontStyle: 'normal', visible: true },
            indexStr: { x: 310, y: 200, fontSize: 18, fontWeight: 'bold', fontStyle: 'normal', visible: true }
        };

        // Duyệt qua danh sách nhãn đã lọc để vẽ
        for (let labelInfo of labelsToRender) {
            const oi = labelInfo.oi;
            console.log(`[PRINT LAN] Đang vẽ tem ${labelInfo.itemIndex}/${labelInfo.totalQuantity}: ${oi.name}`);
                
                // Vẽ giao diện tem in trên canvas trong browser Playwright ngầm và xuất dữ liệu bitmap đơn sắc
                const bitmapData = await page.evaluate((data) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 400; // 50mm tại 203 DPI (8 dots/mm)
                    canvas.height = 240; // 30mm tại 203 DPI (8 dots/mm)
                    const ctx = canvas.getContext('2d');
                    
                    // 1. Vẽ nền trắng
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, 400, 240);
                    
                    // 2. Thiết lập màu vẽ mặc định là đen
                    ctx.fillStyle = '#000000';
                    ctx.strokeStyle = '#000000';
                    
                    // Bật textBaseline = 'top' để khớp hoàn hảo 1:1 với top của absolute div frontend!
                    ctx.textBaseline = 'top';
                    
                    const layout = data.layout;
                    const fontName = layout.fontFamily || 'Arial';
                    
                    // 3. Tiêu đề in đậm (Ví dụ: LOCAL #100)
                    if (layout.title && layout.title.visible) {
                        const t = layout.title;
                        ctx.font = `${t.fontStyle === 'italic' ? 'italic' : ''} ${t.fontWeight === 'bold' ? 'bold' : ''} ${t.fontSize}px "${fontName}", Arial, sans-serif`;
                        ctx.fillText(data.title, t.x, t.y);
                    }
                    
                    // Vạch kẻ đen phân cách dày phong cách Brutalism
                    if (layout.divider && layout.divider.visible) {
                        const d = layout.divider;
                        ctx.lineWidth = d.height || 3;
                        
                        // Cấu hình nét đứt, nét chấm
                        if (d.style === 'dashed') {
                            ctx.setLineDash([8, 6]);
                        } else if (d.style === 'dotted') {
                            ctx.setLineDash([2, 4]);
                        } else {
                            ctx.setLineDash([]);
                        }
                        
                        ctx.beginPath();
                        ctx.moveTo(d.x, d.y);
                        ctx.lineTo(d.x + (d.width || 360), d.y);
                        ctx.stroke();
                        ctx.setLineDash([]); // Reset nét vẽ
                    }
                    
                    // 4. Vẽ tên món ăn (In đậm, tự động co size / xuống dòng thông minh để tiếng Việt không bao giờ bị cắt thô bạo)
                    if (layout.itemName && layout.itemName.visible) {
                        const itemLayout = layout.itemName;
                        // Chừa lề phải tối thiểu 20px để chống tràn
                        const maxTextWidth = 400 - itemLayout.x - 20;
                        
                        let fontSize = itemLayout.fontSize;
                        ctx.font = `${itemLayout.fontStyle === 'italic' ? 'italic' : ''} ${itemLayout.fontWeight === 'bold' ? 'bold' : ''} ${fontSize}px "${fontName}", Arial, sans-serif`;
                        
                        let itemName = data.itemName.toUpperCase();
                        let textWidth = ctx.measureText(itemName).width;
                        
                        // Thử giảm cỡ chữ dần dần (tối thiểu 18px) để tên món nằm trọn 1 dòng
                        while (textWidth > maxTextWidth && fontSize > 18) {
                            fontSize -= 2;
                            ctx.font = `${itemLayout.fontStyle === 'italic' ? 'italic' : ''} ${itemLayout.fontWeight === 'bold' ? 'bold' : ''} ${fontSize}px "${fontName}", Arial, sans-serif`;
                            textWidth = ctx.measureText(itemName).width;
                        }
                        
                        let lines = [];
                        if (textWidth <= maxTextWidth) {
                            lines.push(itemName);
                        } else {
                            // Tên món quá dài -> ngắt thành 2 dòng thông minh theo khoảng trắng
                            fontSize = 20; // Cỡ chữ tối ưu khi ngắt 2 dòng
                            ctx.font = `${itemLayout.fontStyle === 'italic' ? 'italic' : ''} ${itemLayout.fontWeight === 'bold' ? 'bold' : ''} ${fontSize}px "${fontName}", Arial, sans-serif`;
                            const words = itemName.split(' ');
                            let currentLine = '';
                            
                            for (let word of words) {
                                let testLine = currentLine ? currentLine + ' ' + word : word;
                                let testWidth = ctx.measureText(testLine).width;
                                if (testWidth > maxTextWidth) {
                                    lines.push(currentLine);
                                    currentLine = word;
                                } else {
                                    currentLine = testLine;
                                }
                            }
                            if (currentLine) {
                                lines.push(currentLine);
                            }
                        }
                        
                        // Vẽ từng dòng tên món ăn
                        let currentY = itemLayout.y;
                        lines.forEach((line) => {
                            ctx.font = `${itemLayout.fontStyle === 'italic' ? 'italic' : ''} ${itemLayout.fontWeight === 'bold' ? 'bold' : ''} ${fontSize}px "${fontName}", Arial, sans-serif`;
                            ctx.fillText(line, itemLayout.x, currentY);
                            currentY += fontSize + 4;
                        });
                    }
                    
                    // 5. Hiển thị Size
                    if (layout.size && layout.size.visible && data.size && data.size !== '-') {
                        const s = layout.size;
                        ctx.font = `${s.fontStyle === 'italic' ? 'italic' : ''} ${s.fontWeight === 'bold' ? 'bold' : ''} ${s.fontSize}px "${fontName}", Arial, sans-serif`;
                        ctx.fillText(`Size: ${data.size}`, s.x, s.y);
                    }
                    
                    // 6. Hiển thị Ghi chú / Topping (Tự động xuống dòng thông minh theo từ, tránh bị cắt bằng ba chấm)
                    if (layout.note && layout.note.visible && data.note) {
                        const n = layout.note;
                        ctx.font = `${n.fontStyle === 'italic' ? 'italic' : ''} ${n.fontWeight === 'bold' ? 'bold' : ''} ${n.fontSize}px "${fontName}", Arial, sans-serif`;
                        const notes = data.note.split('|');
                        const maxTextWidth = 400 - n.x - 20;
                        let currentY = n.y;
                        
                        notes.forEach((note) => {
                            let noteText = note.trim();
                            if (!noteText) return;
                            
                            // Thực hiện thuật toán Word Wrap (xuống dòng theo từ)
                            let words = noteText.split(' ');
                            let currentLine = '';
                            let subLines = [];
                            
                            for (let word of words) {
                                let testLine = currentLine ? currentLine + ' ' + word : word;
                                let testWidth = ctx.measureText(testLine).width;
                                if (testWidth > maxTextWidth) {
                                    if (currentLine) subLines.push(currentLine);
                                    currentLine = word;
                                } else {
                                    currentLine = testLine;
                                }
                            }
                            if (currentLine) subLines.push(currentLine);
                            
                            // Vẽ từng dòng ghi chú
                            subLines.forEach((line) => {
                                // Khống chế tọa độ Y để không đè lên phần giờ in và số thứ tự tem ở Y = 200
                                if (currentY < 195) {
                                    ctx.fillText(line, n.x, currentY);
                                    currentY += n.fontSize + 4;
                                }
                            });
                        });
                    }
                    
                    // 7. Footer: Giờ in
                    if (layout.timeStr && layout.timeStr.visible) {
                        const t = layout.timeStr;
                        ctx.font = `${t.fontStyle === 'italic' ? 'italic' : ''} ${t.fontWeight === 'bold' ? 'bold' : ''} ${t.fontSize}px "${fontName}", Arial, sans-serif`;
                        ctx.fillText(data.timeStr, t.x, t.y);
                    }
                    
                    // Thứ tự tem
                    if (layout.indexStr && layout.indexStr.visible) {
                        const idx = layout.indexStr;
                        ctx.font = `${idx.fontStyle === 'italic' ? 'italic' : ''} ${idx.fontWeight === 'bold' ? 'bold' : ''} ${idx.fontSize}px "${fontName}", Arial, sans-serif`;
                        ctx.fillText(`${data.itemIndex}/${data.totalQuantity}`, idx.x, idx.y);
                    }
                    
                    // 8. Chuyển đổi toàn bộ pixel canvas thành dữ liệu Monochrome Bitmap (1 là đen, 0 là trắng)
                    const width = 400;
                    const height = 240;
                    const widthBytes = width / 8; // 50 bytes
                    const imgData = ctx.getImageData(0, 0, width, height).data;
                    const bitmap = new Uint8Array(widthBytes * height);
                    
                    for (let y = 0; y < height; y++) {
                        for (let xBytes = 0; xBytes < widthBytes; xBytes++) {
                            let byteVal = 0xff; // Mặc định là trắng (1)
                            for (let bit = 0; bit < 8; bit++) {
                                const x = xBytes * 8 + bit;
                                const pixelIdx = (y * width + x) * 4;
                                const r = imgData[pixelIdx];
                                const g = imgData[pixelIdx + 1];
                                const b = imgData[pixelIdx + 2];
                                const a = imgData[pixelIdx + 3];
                                
                                let isBlack = 0;
                                if (a > 50) {
                                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                                    if (gray < 200) { // Nét chữ/vạch kẻ
                                        isBlack = 1;
                                    }
                                }
                                
                                if (isBlack) {
                                    // Xóa bit về 0 để máy in phun mực đen
                                    byteVal &= ~(1 << (7 - bit));
                                }
                            }
                            bitmap[y * widthBytes + xBytes] = byteVal;
                        }
                    }
                    
                    return Array.from(bitmap);
                }, {
                    title: `${platformName} #${displayId}`,
                    itemName: oi.name,
                    size: oi.size,
                    note: oi.note,
                    timeStr: timeStr,
                    itemIndex: labelInfo.itemIndex,
                    totalQuantity: labelInfo.totalQuantity,
                    layout: layout
                });

                const bitmapBuffer = Buffer.from(bitmapData);

                // Khởi tạo trang in nhãn TSPL và ghép ảnh bitmap nhị phân thô (không dấu cách sau dấu phẩy trong SIZE và GAP)
                allLabelsBuffers.push(Buffer.from("SIZE 50 mm,30 mm\r\nGAP 2 mm,0 mm\r\nSET TEAR ON\r\nDIRECTION 0,0\r\nCLS\r\n"));
                allLabelsBuffers.push(Buffer.from("BITMAP 0,0,50,240,0,"));
                allLabelsBuffers.push(bitmapBuffer);
                allLabelsBuffers.push(Buffer.from("\r\nPRINT 1,1\r\n"));
        }

        // Đóng browser ngầm Playwright
        await browser.close();
        browser = null;

        // Nối toàn bộ lệnh của tất cả các tem in thành một buffer nhị phân duy nhất
        const finalTsplCommands = Buffer.concat(allLabelsBuffers);

        // 3. Kết nối TCP Socket port 9100 gửi lệnh in thô trực tiếp đến IP của máy in mạng
        const net = require('net');
        const printerPort = 9100;

        console.log(`[PRINT LAN] Đang kết nối tới máy in mạng IP ${printerIP}...`);
        const client = new net.Socket();
        client.setTimeout(4000); // Đặt timeout kết nối là 4 giây (tăng thêm chút phòng khi mạng bận)

        client.connect(printerPort, printerIP, () => {
            console.log(`[PRINT LAN] Kết nối thành công! Đang gửi Buffer lệnh in bitmap...`);
            client.write(finalTsplCommands, () => {
                console.log(`[PRINT LAN] Đã gửi Buffer lệnh in thô thành công!`);
                client.destroy(); // Đóng socket kết nối
                res.json({ success: true, message: "Đã in tem thành công!" });
            });
        });

        client.on('error', (err) => {
            console.error("[PRINT LAN] Lỗi kết nối máy in mạng:", err);
            client.destroy();
            res.status(500).json({ success: false, error: `Không kết nối được máy in mạng ${printerIP} (Port 9100). Vui lòng kiểm tra dây mạng.` });
        });

        client.on('timeout', () => {
            console.error("[PRINT LAN] Timeout kết nối tới máy in mạng!");
            client.destroy();
            res.status(500).json({ success: false, error: `Quá giờ kết nối tới máy in mạng ${printerIP} (Timeout)` });
        });

    } catch (e) {
        console.error("Lỗi API print-label-backend:", e);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (browser) {
            await browser.close().catch(err => console.error("Lỗi đóng browser ngầm:", err));
        }
    }
});

// API in nhãn TSPL nhị phân thô trực tiếp từ dữ liệu Base64 gửi từ Frontend
app.post('/api/print-raw-tspl', async (req, res) => {
    const { printerIP, base64Data } = req.body;
    if (!base64Data) {
        return res.status(400).json({ success: false, error: "Thiếu dữ liệu base64Data" });
    }
    
    try {
        const ip = printerIP || '192.168.50.12';
        const buffer = Buffer.from(base64Data, 'base64');
        const net = require('net');
        const printerPort = 9100;
        
        console.log(`[PRINT RAW TSPL] Đang kết nối trực tiếp đến máy in mạng IP ${ip}...`);
        const client = new net.Socket();
        client.setTimeout(3000);
        
        client.connect(printerPort, ip, () => {
            console.log(`[PRINT RAW TSPL] Kết nối thành công! Đang gửi mảng byte nhị phân...`);
            client.write(buffer, () => {
                console.log(`[PRINT RAW TSPL] Đã gửi lệnh in thành công!`);
                client.destroy();
                res.json({ success: true });
            });
        });
        
        client.on('error', (err) => {
            console.error("[PRINT RAW TSPL] Lỗi kết nối:", err);
            client.destroy();
            res.status(500).json({ success: false, error: `Lỗi kết nối máy in mạng: ${err.message}` });
        });
        
        client.on('timeout', () => {
            console.error("[PRINT RAW TSPL] Timeout kết nối!");
            client.destroy();
            res.status(500).json({ success: false, error: "Timeout kết nối tới máy in mạng." });
        });
    } catch (e) {
        console.error("Lỗi API print-raw-tspl:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- PAYOS INTEGRATION ---

// Tạo link thanh toán
app.post('/api/payos/create-payment-link', async (req, res) => {
    try {
        const { orderId, amount, description, returnUrl, cancelUrl } = req.body;
        if (!orderId || !amount) {
            return res.status(400).json({ success: false, error: "Thiếu orderId hoặc amount" });
        }

        const domain = req.protocol + '://' + req.get('host');
        const safeDescription = (description || `Thanh toan don ${orderId}`).substring(0, 25).replace(/[^a-zA-Z0-9 ]/g, '');

        const body = {
            orderCode: Number(orderId),
            amount: Number(amount),
            description: safeDescription,
            cancelUrl: cancelUrl || domain,
            returnUrl: returnUrl || domain
        };

        const paymentLinkResponse = await payos.paymentRequests.create(body);
        
        res.json({
            success: true,
            checkoutUrl: paymentLinkResponse.checkoutUrl,
            paymentLinkId: paymentLinkResponse.paymentLinkId,
            qrCode: paymentLinkResponse.qrCode, // Added qrCode
            qrInfo: {
                bin: paymentLinkResponse.bin,
                accountNumber: paymentLinkResponse.accountNumber,
                accountName: paymentLinkResponse.accountName,
                amount: paymentLinkResponse.amount,
                description: paymentLinkResponse.description
            }
        });
    } catch (error) {
        console.error("PayOS Create Payment Link Error:", error.message || error);
        res.status(500).json({ success: false, error: "Lỗi tạo link thanh toán PayOS: " + (error.message || "") });
    }
});

// Webhook xử lý cập nhật trạng thái đơn hàng khi PayOS gọi về
app.post('/api/payos/webhook', async (req, res) => {
    try {
        const webhookData = payos.webhooks.verify(req.body);

        if (webhookData && webhookData.code === '00') {
            const orderId = webhookData.orderCode;
            
            // Cập nhật trạng thái đơn trên Supabase thành completed (hoặc paid tùy thiết lập của bạn)
            const { error } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', orderId);

            if (error) {
                console.error("Supabase Error Update Order:", error);
            } else {
                console.log(`Đã cập nhật đơn hàng ${orderId} thành completed qua PayOS webhook.`);
            }
        }

        res.json({ success: true, message: "Webhook processed" });
    } catch (error) {
        console.error("PayOS Webhook Error:", error);
        res.status(400).json({ success: false, error: "Webhook verification failed" });
    }
});

// Dọn dẹp tự động (Lazy Cleanup) dữ liệu cũ hơn 30 ngày
async function cleanupOldData() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        const cutoffISO = thirtyDaysAgo.toISOString();

        // Xóa order cũ, cascade delete items cũng sẽ xóa nếu CSDL đã setup, hoặc chờ cron job.
        // Ở đây xoá cứng order và visitor log cũ hơn 30 ngày.
        await supabase.from('orders').delete().lt('created_at', cutoffISO);
        await supabase.from('visitor_logs').delete().lt('visited_at', cutoffISO);
    } catch (e) {
        console.error("Cleanup error", e);
    }
}

// Lấy danh sách Order (live POS)
app.get('/api/orders', async (req, res) => {
    try {
        // Kích hoạt dọn dẹp background
        cleanupOldData();

        const range = req.query.range || 'today';
        let query = supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id, quantity, price, note,
                    recipes (name, size)
                )
            `);

        // Setup Date Bounds based on Local TZ
        const now = new Date();
        const startOfDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (range === 'today') {
            query = query.gte('created_at', startOfDate.toISOString());
        } else if (range === '7d') {
            const startDate = new Date(startOfDate);
            startDate.setDate(startDate.getDate() - 6);
            query = query.gte('created_at', startDate.toISOString());
        } else if (range === '30d') {
            const startDate = new Date(startOfDate);
            startDate.setDate(startDate.getDate() - 29);
            query = query.gte('created_at', startDate.toISOString());
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(200);

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

// Gửi lệnh tương tác ngược tới Bot Grab ngầm qua bảng bot_commands
app.post('/api/grab/command', async (req, res) => {
    try {
        const { orderId, commandType, payload } = req.body;
        if (!orderId || !commandType) {
            return res.status(400).json({ success: false, error: 'Thiếu orderId hoặc commandType' });
        }

        // 1. Lấy thông tin đơn hàng từ DB
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('external_order_id, external_short_id')
            .eq('id', orderId)
            .single();
            
        if (orderErr || !order) {
            return res.status(400).json({ success: false, error: 'Không tìm thấy đơn hàng trong hệ thống.' });
        }

        if (!order.external_order_id) {
            return res.status(400).json({ success: false, error: 'Đơn hàng không có mã ID ngoại sàn Grab.' });
        }

        // 2. Chèn lệnh vào bảng bot_commands
        const { data: cmd, error: cmdErr } = await supabase
            .from('bot_commands')
            .insert([{
                booking_id: order.external_order_id,
                short_id: order.external_short_id || '',
                command_type: commandType,
                payload: payload || {},
                status: 'pending'
            }])
            .select()
            .single();

        if (cmdErr) {
            console.error('Lỗi insert bot_commands:', cmdErr);
            return res.status(500).json({ success: false, error: cmdErr.message });
        }

        console.log(`[API server] Đã chèn lệnh ${commandType} cho đơn Grab ${order.external_short_id} thành công.`);
        res.json({ success: true, command: cmd });
    } catch (err) {
        console.error('Lỗi trong /api/grab/command:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// --- Reports ---
app.get('/api/reports/dashboard', async (req, res) => {
    try {
        cleanupOldData();
        const range = req.query.range || 'today';
        let daysToFetch = 1;

        if (range === '7d') daysToFetch = 7;
        else if (range === '30d') daysToFetch = 30;

        // 1. Khởi tạo mảng X ngày gần nhất
        const dateLabels = [];
        const dateKeyMap = {}; // Map DD/MM -> YYYY-MM-DD

        for (let i = daysToFetch - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            // Cắt ra YYYY-MM-DD theo múi giờ local
            const dStr = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

            dateLabels.push(label);
            dateKeyMap[dStr] = label;
        }

        // 2. Fetch toàn bộ order
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (daysToFetch > 1) {
            startDate.setDate(startDate.getDate() - (daysToFetch - 1));
        }

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

        dateLabels.forEach(day => {
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

        // 4. Fetch Visitor Logs in range
        const { data: visits } = await supabase.from('visitor_logs')
            .select('*')
            .gte('visited_at', startDate.toISOString())
            .order('visited_at', { ascending: false });

        let totalVisits = 0;
        let qrVisits = 0;
        let recentVisitors = [];

        if (visits) {
            totalVisits = visits.length;
            qrVisits = visits.filter(v => v.referrer === '' && v.screen_width < 1024).length;
            recentVisitors = visits.slice(0, 50); // Send the most recent 50 logs for the grid
        }

        // 5. Format Output Map thành Mảng cho Chart
        const revenues = dateLabels.map(day => dailyRevenues[day]);
        const costs = dateLabels.map(day => dailyCosts[day]);

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
                revenueData: { labels: dateLabels, revenues, costs },
                topProducts: topProducts,
                recentVisitors: recentVisitors,
                summary: {
                    totalRevenue: totalRev,
                    totalCost: totalCostAll,
                    totalOrders: orders.length,
                    totalVisits: totalVisits,
                    qrVisits: qrVisits
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
