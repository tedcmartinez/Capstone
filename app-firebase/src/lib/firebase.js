// Firebase initialisation
//
// One place where the Firebase SDK is set up, so every other module imports
// the already-configured auth and db objects from here rather than calling
// initializeApp again.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(),
  }),
});
