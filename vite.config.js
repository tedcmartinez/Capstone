// Vite build configuration
//
// The app source lives in app-firebase/ and the built files go to dist/,
// which is the folder Firebase Hosting uploads (see firebase.json).
//
// This is a single-page app: every route is handled in the browser by
// src/main.js, so there is only one HTML entry point.

import { defineConfig } from 'vite';
import { precache } from './tools/vite-precache.mjs';

export default defineConfig({
  root: 'app-firebase',

  // Lists the built files for the service worker to save for offline use
  plugins: [precache()],

  build: {
    // dist/ sits at the repo root, one level above the Vite root
    outDir: '../dist',
    emptyOutDir: true,
    // Source maps make it possible to read a real stack trace if something
    // breaks on the office desktop after deployment
    sourcemap: true,
  },

  server: {
    port: 5173,
    open: true,
  },
});
