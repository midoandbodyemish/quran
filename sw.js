// sw.js
const CACHE_NAME = 'quran-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/adea.html',
  '/info.html',
  // ملفات الـ CSS والـ JS الخارجية
  'https://unpkg.com/webkul-micron@1.1.6/dist/css/micron.min.css',
  'https://unpkg.com/webkul-micron@1.1.6/dist/script/micron.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

// إضافة صور الصفحات (1 إلى 604)
for (let i = 1; i <= 604; i++) {
  urlsToCache.push(`/quran/${i}.png`);
}

// تثبيت Service Worker وحفظ الموارد
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// تنشيط Service Worker وتنظيف الذاكرة القديمة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// التعامل مع الطلبات
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      if (event.request.url.includes('api.alquran.cloud')) {
        return fetch(event.request).then(networkResponse => {
          return networkResponse.clone().json().then(data => {
            saveToIndexedDB(data);
            return networkResponse;
          });
        }).catch(() => {
          return getFromIndexedDB().then(data => {
            return new Response(JSON.stringify(data), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      }
      return fetch(event.request);
    })
  );
});

// حفظ البيانات في IndexedDB
function saveToIndexedDB(data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuranDB', 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      db.createObjectStore('quran', { keyPath: 'id' });
    };
    request.onsuccess = event => {
      const db = event.target.result;
      const transaction = db.transaction(['quran'], 'readwrite');
      const store = transaction.objectStore('quran');
      store.put({ id: 'quranData', data });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject();
    };
    request.onerror = () => reject();
  });
}

// استرجاع البيانات من IndexedDB
function getFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuranDB', 1);
    request.onsuccess = event => {
      const db = event.target.result;
      const transaction = db.transaction(['quran'], 'readonly');
      const store = transaction.objectStore('quran');
      const getRequest = store.get('quranData');
      getRequest.onsuccess = () => resolve(getRequest.result ? getRequest.result.data : {});
      getRequest.onerror = () => reject();
    };
    request.onerror = () => reject();
  });
}