// A deploy must never show new scripts with old stylesheets
//
// Files with fixed names can be kept by the browser or the service worker
// after a deploy. Before this was fixed, /css/app.css stayed cached for up
// to an hour while the new scripts loaded at once, so new screens showed
// with old styles. The stylesheets now go through the build, which names
// them after their contents, and the service worker only trusts its saved
// copy for those content-named files. These checks keep it that way.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dirname, '..', '..', 'app-firebase');
const read = (path) => readFileSync(join(APP, path), 'utf8');

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

describe('stylesheets get content-based names', () => {
  it('links every stylesheet from src/, so the build hashes it', () => {
    const links = [...read('index.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(['/src/css/bootstrap.min.css', '/src/css/style.css', '/src/css/app.css']);
  });

  it('keeps no stylesheets or fonts in public/, where names never change', () => {
    const stale = filesIn(join(APP, 'public')).filter((path) => /\.(css|woff2?)$/.test(path));
    expect(stale).toEqual([]);
  });
});

describe('the service worker', () => {
  const worker = read('public/service-worker.js');

  it('answers from its saved copy first only for content-named /assets/ files', () => {
    expect(worker).toMatch(
      /if \(url\.pathname\.startsWith\('\/assets\/'\)\) \{\s*event\.respondWith\(\s*caches\.match\(request/
    );
  });

  it('fetches every other file from the network first, the saved copy only offline', () => {
    expect(worker).toMatch(/fetch\(request\)\.catch\(\(\) => caches\.match\(request, \{ cacheName: CACHE \}\)\)/);
  });
});
