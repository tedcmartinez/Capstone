// Test configuration for the security rules suite
//
// This file exists separately from vite.config.js on purpose. The Vite build
// sets its root to app-firebase/, which is correct for bundling the app but
// would make Vitest look for tests inside that folder. The tests live in
// tests/ at the repo root, next to firestore.rules, so the root is reset here.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.js'],

    // The rules tests talk to the Firestore emulator over the network, so
    // they run in Node rather than a simulated browser.
    environment: 'node',

    // Rules evaluation involves real round trips to the emulator, and the
    // suite deliberately asserts on many denied writes, so the default
    // five second timeout is too tight on a cold start.
    testTimeout: 20000,
    hookTimeout: 30000,

    // One emulator instance is shared by the whole run. Running files in
    // parallel would let one file's clearFirestore() wipe another file's
    // seeded data mid-test, so the files are run one at a time.
    fileParallelism: false,

    // Child processes rather than worker threads. The Firebase SDK opens
    // gRPC and websocket handles that do not survive in Vitest's default
    // worker threads, which crashes the worker before any test runs.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
