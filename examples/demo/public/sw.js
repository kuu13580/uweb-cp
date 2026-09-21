// インストール条件を満たすためだけの Service Worker。
// fetch ハンドラは存在だけが必要で、respondWith を呼ばないので通常どおりネットワークに出る。

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
