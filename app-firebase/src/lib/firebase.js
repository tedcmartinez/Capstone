// Firebase initialisation
//
// One place where the Firebase SDK is set up, so every other module imports
// the already-configured auth and db objects from here rather than calling
// initializeApp again.

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore';

import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// ============================================================
// FIRESTORE WITH OFFLINE PERSISTENCE
//
// The office internet is not always reliable, so the cache is turned on at
// startup. Firestore then keeps a copy of everything already read in the
// browser's IndexedDB, which means:
//   - pages still load and display data while the connection is down
//   - writes made offline are queued and sent automatically on reconnect
//
// Single-tab manager is used deliberately. The system runs on one shop
// desktop in a single window, so multi-tab coordination would add moving
// parts with nothing to gain. Opening a second tab simply reads through to
// the server instead of sharing the cache.
// ============================================================

// If IndexedDB is missing or blocked, the SDK reports it and falls back to
// an in-memory cache rather than failing. That is worth knowing: in a
// private window, or with site data blocked, the app keeps working but
// loses its offline ability, because queued writes live in that cache. The
// shop desktop uses an ordinary Chrome or Edge profile, so persistence is
// available there.
//
// initializeFirestore may only be called once for an app, and it throws if
// something has already set Firestore up. That happens during development
// when Vite reloads this module without restarting the page, and in the
// test suite where several test files share one process. In that case the
// instance that already exists is the right one to use, so it is returned
// instead of letting the error escape.
function openFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(),
      }),
    });
  } catch (error) {
    if (error?.code === 'failed-precondition' || /already been called/.test(error?.message || '')) {
      return getFirestore(app);
    }
    throw error;
  }
}

export const db = openFirestore();

// ============================================================
// LOCAL EMULATORS
//
// Set VITE_USE_EMULATORS=true to point the app at the local Auth and
// Firestore emulators instead of the live project. This is how the sign-in
// and approval flow is tested without creating real accounts, and without
// spending reads and writes from the free tier quota.
//
// The integration tests set the global instead, because they import these
// modules directly in Node rather than through Vite.
//
// Nothing here runs in a production build: both conditions are false, and
// the branch is dropped from the bundle.
// ============================================================

const useEmulators =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_EMULATORS === 'true') ||
  globalThis.__CORNERBLOCK_USE_EMULATORS__ === true;

if (useEmulators) {
  // Both calls throw if this instance is already pointed at an emulator,
  // which happens for the same reasons described above. Already connected
  // is the desired state, so it is not an error worth stopping for.
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    console.info('Cornerblock: using local Firebase emulators, not the live project.');
  } catch (error) {
    console.info('Cornerblock: already connected to the local Firebase emulators.');
  }
}
