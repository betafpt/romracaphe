const { createClient } = require('@supabase/supabase-js');

// Cấu hình Supabase (fallback về giá trị mặc định của hệ thống Rôm Rả)
const supabaseUrl = process.env.SUPABASE_URL || 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function simulateOrder() {
    console.log('⏳ Đang tạo đơn hàng giả lập GrabFood...');
    
    const shortId = 'GF-' + Math.floor(100 + Math.random() * 900);
    const bookingId = 'GRAB-' + Date.now();
    const totalAmount = 110000;
    const subtotal = 145000;
    const totalDiscount = 35000;
    const customerAddress = '15 Lê Lợi, Phường Bến Thành, Quận 1';
    
    const rawPayload = {
        shortOrderNumber: shortId,
        customerName: 'Hà My',
        customerAddress: customerAddress,
        subtotal: subtotal,
        totalDiscount: totalDiscount,
        items: [
            {
                name: 'Bạc Xỉu',
                quantity: 2,
                size: 'L',
                note: 'Size: L | Ít đá nhiều sữa'
            },
            {
                name: 'Cà phê Muối',
                quantity: 1,
                size: 'M',
                note: 'Size: M | Nhiều kem muối'
            }
        ]
    };
    
    const { data: insertedOrder, error: insertErr } = await supabase
        .from('orders')
        .insert({
            payment_method: 'grab_pay',
            total_amount: totalAmount,
            status: 'pending',
            platform: 'grab',
            external_order_id: bookingId,
            external_short_id: shortId,
            raw_payload: rawPayload,
            note: JSON.stringify(rawPayload)
        })
        .select()
        .single();
        
    if (insertErr) {
        console.error('❌ Lỗi khi chèn đơn giả lập vào Supabase:', insertErr.message);
    } else {
        console.log('========================================================');
        console.log('🎉 ĐÃ GIẢ LẬP THÀNH CÔNG ĐƠN HÀNG ONLINE MỚI!');
        console.log(`- ID Đơn hàng trên POS: ${insertedOrder.id}`);
        console.log(`- Nền tảng: GrabFood`);
        console.log(`- Mã đơn ngắn: ${shortId}`);
        console.log(`- Tổng tiền: ${totalAmount.toLocaleString('vi-VN')}đ`);
        console.log('- Trạng thái: Đã đồng bộ lên database.');
        console.log('👉 Bây giờ hãy mở trình duyệt Web POS của quán, chuông báo sẽ reo và Popup đơn mới sẽ hiển thị!');
        console.log('========================================================');
    }
}

simulateOrder().catch(console.error);
