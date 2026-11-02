// Vite plugin: tells the service worker which files to save for offline use
//
// Vite names each built script after its contents (index-3f9a2c.js), so the
// list of files changes with every build. Once the build is written, this
// lists everything in dist/ and puts that list at the top of
// dist/service-worker.js, together with a version made from the files'
// contents. A deploy that changes anything therefore changes the version,
// and the service worker replaces its saved copy.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Not saved: source maps are only for reading stack traces, and the service
// worker itself is always fetched fresh by the browser
const SKIP = [/\.map$/, /^service-worker\.js$/];

function listFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

export function precache() {
  let outDir;

  return {
    name: 'cornerblock-precache',
    apply: 'build',

    configResolved(config) {
      // outDir is written relative to the Vite root (app-firebase/)
      outDir = resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      const hash = createHash('sha256');
      const files = [];

      for (const path of listFiles(outDir).sort()) {
        const name = relative(outDir, path).split(sep).join('/');
        if (SKIP.some((pattern) => pattern.test(name))) continue;

        files.push('/' + name);
        hash.update(name);
        hash.update(readFileSync(path));
      }

      const precacheList = {
        version: hash.digest('hex').slice(0, 12),
        files,
      };

      const workerPath = join(outDir, 'service-worker.js');
      const worker = readFileSync(workerPath, 'utf8');
      writeFileSync(
        workerPath,
        `self.__PRECACHE__ = ${JSON.stringify(precacheList, null, 2)};\n\n${worker}`
      );

      console.log(`service worker: ${files.length} files saved for offline use, version ${precacheList.version}`);
    },
  };
}
