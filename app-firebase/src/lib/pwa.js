// Installable app (PWA)
//
// Registers the service worker, which saves the app's own files so the
// installed window opens offline. Only in the built app: during `npm run
// dev` a saved copy would hide every edit until the cache was cleared.

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // After the page has loaded, so saving the files never competes with the
  // first screen for the connection
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      // The app works without it, only not offline, so this is not shown
      console.error('Service worker registration failed', error);
    });
  });
}
