const CACHE_NAME = 'big-data-exam-v2';
const PRECACHE = [
  './',
  './index.html',
  './challenge.html',
  './offline.html',
  './404.html',
  './manifest.webmanifest',
  './assets/style.css',
  './assets/challenge.css',
  './assets/home.js',
  './assets/exam.js',
  './assets/challenge.js',
  './assets/practice-utils.js',
  './assets/ui.js',
  './assets/site.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './data/papers.json',
  './data/audit.json',
  './papers/paper-01.html',
  './papers/paper-02.html',
  './papers/paper-03.html',
  './papers/paper-04.html',
  './papers/paper-05.html',
  './papers/paper-06.html',
  './papers/paper-07.html',
  './papers/paper-08.html',
  './papers/paper-09.html',
  './papers/paper-10.html',
  './papers/paper-11.html',
  './assets/images/paper-01-q002-01.png',
  './assets/images/paper-01-q003-01.png',
  './assets/images/paper-05-q001-01.png',
  './assets/images/paper-05-q002-01.png',
  './assets/images/paper-05-q002-02.png',
  './assets/images/paper-05-q003-01.png',
  './assets/images/paper-05-q003-02.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request, { ignoreSearch: true })) || caches.match('./offline.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
