const CACHE_NAME = 'romracaphe-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/supabase-config.js',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Chỉ Cache các dữ liệu Tĩnh (GET Request, không Cache API Call hay Supabase upload)
    if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Trả về Cache nếu có, không có thì Network
            return response || fetch(event.request).then(fetchRes => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request.url, fetchRes.clone());
                    return fetchRes;
                });
            });
        }).catch(() => {
            // Khi rớt mạng mà không tìm thấy css/js/html, mặc định nhả index
            if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match('/index.html');
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});
