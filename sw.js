// sw.js - Service Worker للإشعارات

self.addEventListener('install', function(event) {
    console.log('📦 Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('✅ Service Worker activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'تم وصول بطاقتك، يرجى الحضور للاستلام',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        tag: 'birth-notification-' + (data.birthNumber || Date.now()),
        renotify: true,
        requireInteraction: true,
        data: {
            url: data.url || '/',
            birthNumber: data.birthNumber,
            birthId: data.birthId
        },
        actions: [
            {
                action: 'open',
                title: '📋 عرض التفاصيل'
            },
            {
                action: 'close',
                title: 'إغلاق'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(
            data.title || '📋 إخطار ولادة جديد', 
            options
        )
    );
});

// التعامل مع النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.action === 'open') {
        const urlToOpen = event.notification.data?.url || '/';
        event.waitUntil(
            clients.openWindow(urlToOpen)
        );
    }
});

// التعامل مع إغلاق الإشعار
self.addEventListener('notificationclose', function(event) {
    console.log('📭 Notification closed');
});

// تسجيل الـ Service Worker
console.log('🔔 Service Worker ready for notifications');