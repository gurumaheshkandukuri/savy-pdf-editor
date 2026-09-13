/**
 * SAVY PDF Workspace — Service Worker (sw.js)
 * Caches static application shell assets for offline availability.
 *
 * PRIVACY GUARANTEE:
 * "Your PDF is processed locally in your browser and is never uploaded to SAVY servers."
 *
 * NOTE: User PDFs, document bytes, signatures, and annotations are NEVER
 * cached, transmitted, or stored remotely by this service worker.
 */

const CACHE_NAME = 'savy-shell-v2';

// Dynamic base path detection for subdirectory hosting (e.g., GitHub Pages)
const BASE_PATH = self.location.pathname.replace(/\/[^/]*$/, '');

const RAW_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/editor.html',
  '/privacy.html',
  '/404.html',
  '/manifest.json',
  '/assets/images/savy-logo.svg',
  '/assets/images/privacy-badge.svg',
  '/assets/icons/shield.svg',
  '/assets/icons/lock.svg',
  '/assets/icons/upload.svg',
  '/assets/icons/download.svg',
  '/assets/icons/file-pdf.svg',
  '/assets/icons/mouse-pointer.svg',
  '/assets/icons/hand.svg',
  '/assets/icons/type.svg',
  '/assets/icons/pen.svg',
  '/assets/icons/highlighter.svg',
  '/assets/icons/square.svg',
  '/assets/icons/circle.svg',
  '/assets/icons/arrow-up-right.svg',
  '/assets/icons/image.svg',
  '/assets/icons/signature.svg',
  '/assets/icons/search.svg',
  '/assets/icons/presentation.svg',
  '/assets/icons/stamp.svg',
  '/assets/icons/form.svg',
  '/assets/icons/crop.svg',
  '/assets/icons/tools.svg',
  '/assets/icons/info.svg',
  '/assets/icons/eye-off.svg',
  '/assets/icons/undo.svg',
  '/assets/icons/redo.svg',
  '/assets/icons/trash.svg',
  '/assets/icons/layers.svg',
  '/assets/icons/chevron-left.svg',
  '/assets/icons/chevron-right.svg',
  '/assets/icons/zoom-in.svg',
  '/assets/icons/zoom-out.svg',
  '/assets/icons/fit-page.svg',
  '/assets/icons/sparkles.svg',
  '/assets/icons/message-square.svg',
  '/assets/icons/zap.svg',
  '/assets/icons/list.svg'
];

const APP_SHELL = RAW_SHELL_ASSETS.map((asset) => {
  if (BASE_PATH && BASE_PATH !== '/') {
    return asset === '/' ? BASE_PATH + '/' : BASE_PATH + asset;
  }
  return asset;
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('SAVY SW: Some shell assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // STRICT PRIVACY RULE: Never intercept or cache non-HTTP requests, blobs, data URIs, or uploads
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Network first with cache fallback for static app assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          url.origin === self.location.origin &&
          (url.pathname.endsWith('.html') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.svg') ||
            url.pathname.endsWith('.json'))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            const fallbackPath = (BASE_PATH && BASE_PATH !== '/') ? BASE_PATH + '/editor.html' : '/editor.html';
            return caches.match(fallbackPath);
          }
          return new Response('Offline: Resource not cached.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});
