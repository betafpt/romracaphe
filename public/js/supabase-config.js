// public/js/supabase-config.js

// LƯU Ý MỤC NÀY CHO ADMIN: 
// Hãy dán URL và Anon Key từ trang Dashboard Supabase của bạn (Mục Project Settings -> API) vào 2 biến dưới đây:
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL_HERE'; // Ví dụ: 'https://xyzabcdef.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // Đoạn key rất dài bắt đầu bằng 'eyJ...'

// Khởi tạo Supabase Client thông qua thư viện CDN (đã được nhúng trong index.html)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export đối tượng để dùng toàn cục Web App
window.SupabaseStorage = supabase.storage;
window.SupabaseApp = supabase;
