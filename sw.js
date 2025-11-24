// sw.js
const CACHE_NAME = 'quran-app-v2';
// موارد أساسية ونقطة بداية - نقوم بتحميل الصور ديناميكياً
const coreResources = [
  './',
  'index.html',
  'adea.html',
  'ar.json',
  'info.html',
  'quarters.json',
  // موارد خارجية قد تعيد استجابة opaque (no-cors)
  'https://unpkg.com/webkul-micron@1.1.6/dist/css/micron.min.css',
  'https://unpkg.com/webkul-micron@1.1.6/dist/script/micron.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

// عدد صفحات الصور (يمكن تخفيضه إن أردت اقتصاد المساحة)
const IMAGE_COUNT = 604;

// حدود كاش للصور/الموارد لمنع نفاد المساحة (قابلة للتعديل)
const MAX_IMAGE_CACHE_ITEMS = 800;

// Helpers
function isCrossOrigin(url) {
  try {
    const requestURL = new URL(url, self.location.href);
    return requestURL.origin !== self.location.origin;
  } catch (e) {
    return false;
  }
}

async function cacheResourcesSafely(cacheName, urls) {
  const cache = await caches.open(cacheName);
  const results = await Promise.allSettled(urls.map(async url => {
    try {
      const req = new Request(url, { mode: isCrossOrigin(url) ? 'no-cors' : 'same-origin' });
      const res = await fetch(req);
      // بعض السيرفرات الخارجية تعيد استجابة opaque (no-cors). قبولها كذلك.
      if (res && (res.ok || res.type === 'opaque')) {
        await cache.put(req, res.clone());
        return { url, status: 'cached' };
      }
      return { url, status: 'skipped', reason: 'bad-response' };
    } catch (err) {
      return { url, status: 'failed', reason: String(err) };
    }
  }));
  return results;
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  const removeCount = keys.length - maxItems;
  for (let i = 0; i < removeCount; i++) {
    await cache.delete(keys[i]);
  }
}

// تثبيت Service Worker: نجمع كل الوعود ونستخدم allSettled حتى لا يفشل التثبيت إذا تعذّر تنزيل بعض الموارد
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // نجلب الموارد الأساسية أولاً
    await cacheResourcesSafely(CACHE_NAME, coreResources);

    // ثم نحاول تحميل صور المصحف تدريجياً (لا نريد أن يفشل التثبيت إن تعذر تنزيل صورة واحدة)
    const imageUrls = [];
    for (let i = 1; i <= IMAGE_COUNT; i++) {
      imageUrls.push(`quran/${i}.png`);
    }
    // تحميل صور (يمكن أن يكون ثقيلًا؛ يتم باستخدام allSettled)
    await cacheResourcesSafely(CACHE_NAME, imageUrls);

    // أثناء التثبيت: حاول الحصول على النسخة المحلية `ar.json` وحفظها في IndexedDB
      try {
        const cache = await caches.open(CACHE_NAME);
        // ar.json موجود ضمن coreResources (نسبي)، نحاول العثور عليه في الكاش أو الشبكة
        let arResp = await cache.match('ar.json');
        if (!arResp) {
          try {
            arResp = await fetch('ar.json');
          } catch (e) { arResp = null; }
        }
        if (arResp) {
          try {
            const json = await arResp.clone().json();
            await saveToIndexedDB(json).catch(() => {});
            try { await cache.put('ar.json', new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } })); } catch (e) {}
          } catch (e) {
            // ignore parse errors
          }
        }
      } catch (e) {
        // ignore
      }

    // اقتراح: بعد التنزيل، نقوم بقص الكاش إن كان كبيرًا
    await trimCache(CACHE_NAME, MAX_IMAGE_CACHE_ITEMS + coreResources.length);
    self.skipWaiting();
  })());
});

// تنشيط وتنظيف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return Promise.resolve();
    }));
    self.clients.claim();
  })());
});

// ردود افتراضية: صورة SVG بسيطة إذا لم يوجد المحتوى
function imagePlaceholderResponse() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 24 24' fill='none' stroke='%23777' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'>\n  <rect x='1' y='1' width='22' height='22' rx='2' ry='2' fill='%23f3f3f3'/>\n  <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='%23999'>offline</text>\n</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

// Fetch handler: سياسة مرنة تعتمد على نوع الطلب
self.addEventListener('fetch', event => {
  const req = event.request;
  // نترك الطلبات غير GET تمر مباشرة
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // تعامل خاص مع طلبات الـ API الخارجية أو محلية ar.json
  if (req.url.includes('api.alquran.cloud') || req.url.endsWith('/ar.json') || req.url.includes('/ar.json')) {
    event.respondWith((async () => {
      // إذا كان طلبًا لصيغة ar.json (محلي) فنسعى للكاش أولاً
      if (req.url.endsWith('/ar.json') || req.url.endsWith('ar.json') || req.url.includes('/ar.json')) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('ar.json') || await cache.match(new Request('ar.json'));
          if (cached) return cached;
          const net = await fetch('ar.json');
          if (net && (net.ok || net.type === 'opaque')) {
            cache.put('ar.json', net.clone()).catch(() => {});
            try { const json = await net.clone().json(); saveToIndexedDB(json).catch(() => {}); } catch (e) {}
            return net;
          }
        } catch (e) {}
        // أخيراً حاول IndexedDB
        try {
          const data = await getFromIndexedDB();
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
        }
      }

      // للـ API الخارجية: network-first مع مهلة، ثم fallback إلى الكاش ثم ar.json ثم IndexedDB
      try {
        const networkResponse = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), 8000))
        ]);
        try {
          const clone = networkResponse.clone();
          const data = await clone.json();
          saveToIndexedDB(data).catch(() => {});
        } catch (e) {}
        return networkResponse;
      } catch (err) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const cachedResp = await cache.match(req);
          if (cachedResp) return cachedResp;
          const localResp = await cache.match('ar.json') || await cache.match(new Request('ar.json'));
          if (localResp) return localResp;
        } catch (e) {}
        try {
          const data = await getFromIndexedDB();
          return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
        }
      }
    })());
    return;
  }

  // موارد الصور: cache-first ثم شبكة ثم placeholder
  if (url.pathname.startsWith('/quran/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const response = await fetch(req);
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(req, response.clone()).catch(() => {});
          // بعد إضافة، نقص الكاش إن لزم
          trimCache(CACHE_NAME, MAX_IMAGE_CACHE_ITEMS + coreResources.length).catch(() => {});
          return response;
        }
      } catch (e) {}
      return imagePlaceholderResponse();
    })());
    return;
  }

  // موارد عامة: cache-first ثم شبكة
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(req, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      // إن تعذر الشبكة والملف غير موجود في الكاش، نعيد خطأ بسيط
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});

// IndexedDB: حفظ واسترجاع بيانات JSON من الـ API
function saveToIndexedDB(data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuranDB', 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('quran')) {
        db.createObjectStore('quran', { keyPath: 'id' });
      }
    };
    request.onsuccess = event => {
      const db = event.target.result;
      const transaction = db.transaction(['quran'], 'readwrite');
      const store = transaction.objectStore('quran');
      try {
        store.put({ id: 'quranData', data });
      } catch (e) {
        // ignore
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function getFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuranDB', 1);
    request.onsuccess = event => {
      const db = event.target.result;
      const transaction = db.transaction(['quran'], 'readonly');
      const store = transaction.objectStore('quran');
      const getRequest = store.get('quranData');
      getRequest.onsuccess = () => resolve(getRequest.result ? getRequest.result.data : {});
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}