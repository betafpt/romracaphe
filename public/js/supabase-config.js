// public/js/supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mjyldmkdcoiyrolggpje.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM';

// Khởi tạo Supabase Client thông qua thư viện CDN Import Module
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Export đối tượng để dùng toàn cục Web App
window.SupabaseStorage = supabase.storage;
window.SupabaseApp = supabase;

// TỰ ĐỘNG KHỞI TẠO BUCKET VÀ PHÂN QUYỀN PUBLIC CHO LẦN ĐẦU TIÊN
async function initStorageBucket() {
    try {
        const { data: buckets, error } = await supabase.storage.listBuckets();
        if (error) throw error;

        const recipesBucketExists = buckets.some(b => b.name === 'recipes');
        if (!recipesBucketExists) {
            console.log("Đang tự động khởi tạo Kho Ảnh (Bucket 'recipes') trên Supabase...");
            const { data, createError } = await supabase.storage.createBucket('recipes', {
                public: true,
                allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
                fileSizeLimit: 2097152 // 2MB
            });
            if (createError) throw createError;
            console.log("Đã khởi tạo xong Bucket 'recipes' thành công!");
        }
    } catch (err) {
        console.warn("Script Khởi Tạo Kho Lỗi (Có thể do bạn không có quyền Admin Role API hoặc Bucket đã có). Chi tiết:", err.message);
    }
}

initStorageBucket();
