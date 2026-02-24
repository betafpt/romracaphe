const CACHE_NAME = 'romracaphe-v4'; // Bumped to v4 to clear old cache
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
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
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

    // Network First strategy: ưu tiên tải mạng để cập nhật UI mới nhất, nếu rớt mạng mới dùng Cache
    event.respondWith(
        fetch(event.request)
            .then(fetchRes => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request.url, fetchRes.clone());
                    return fetchRes;
                });
            })
            .catch(() => {
                // Rớt mạng -> Lọc Cache
                return caches.match(event.request).then((response) => {
                    if (response) return response;
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    // Claim control of all open clients immediately
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});
