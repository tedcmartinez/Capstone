// Service worker: lets the installed app open without an internet connection
//
// It keeps a copy of the app's own files (the page, its scripts, styles,
// fonts and icons), so the window still opens when the office connection
// drops. It does not touch the inventory data. That is Firestore's job:
// the app keeps its own offline copy of the data and queues stock movements
// until the connection returns (see src/lib/firebase.js and src/lib/sync.js).
//
// Only requests to this site are handled. Firestore, Google sign-in, the
// alert service and the Sheets export all go to Google's own addresses and
// pass straight through, untouched.

// Replaced at build time by tools/vite-precache.mjs with the list of built
// files and a version made from their contents. A new deploy therefore
// means a new version, and the old copy is thrown away.
const PRECACHE = self.__PRECACHE__ || { version: 'dev', files: [] };
const CACHE = `cornerblock-${PRECACHE.version}`;

// ============================================================
// INSTALL: save a copy of every file the app needs
// ============================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `reload` skips the browser's own cache, so the copy saved is the one
      // just deployed, not one the browser kept from an hour ago
      .then((cache) => cache.addAll(PRECACHE.files.map((file) => new Request(file, { cache: 'reload' }))))
      // Take over straight away rather than waiting for every open window
      // to close. Safe here because pages are always fetched fresh when
      // online (see below), so an open window never mixes old and new.
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE: delete copies left by older versions
// ============================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('cornerblock-') && name !== CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Other sites, and Firebase's reserved /__/ paths, are left alone
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__/')) return;

  // Pages: try the network first, so a new deploy shows as soon as it is
  // live. Offline, every address gets the saved app page, the same way
  // Firebase Hosting sends index.html for every address.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html', { cacheName: CACHE }))
    );
    return;
  }

  // Scripts, styles, fonts and icons: the saved copy if there is one,
  // otherwise the network
  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then((saved) => saved || fetch(request))
  );
});
