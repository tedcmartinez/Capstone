// The router
//
// Two bugs found in live testing came from here, and these tests exist so
// neither can come back.
//
//   1. setQuery() used to re-run the whole route. The catalog's live search
//      updates the address on every keystroke, so each letter reloaded the
//      catalog from Firestore and redrew the page, wiping the search box.
//
//   2. A route resolved before Firebase had answered drew the staff sidebar
//      with a blank name. The readiness check now holds every route back
//      until the profile is known.
//
// The router only touches window.location and window.history, so a small
// stand-in for those is enough. No browser is needed.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// ---- A minimal window ----
// Installed before the router is imported, since it reads window when its
// functions run. Removed again afterwards: the test files share one process,
// and a stand-in window left behind would mislead any later test that
// checks whether it is running in a browser.
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

const historyCalls = [];
let currentUrl = new URL('http://localhost/materials');

globalThis.window = {
  get location() {
    return {
      pathname: currentUrl.pathname,
      search: currentUrl.search,
    };
  },
  history: {
    replaceState: (_state, _title, url) => {
      historyCalls.push(['replace', url]);
      currentUrl = new URL(url, 'http://localhost');
    },
    pushState: (_state, _title, url) => {
      historyCalls.push(['push', url]);
      currentUrl = new URL(url, 'http://localhost');
    },
  },
  addEventListener: () => {},
};
globalThis.document = { addEventListener: () => {} };

const router = await import('../../app-firebase/src/lib/router.js');

const materialsHandler = vi.fn();
const reportsHandler = vi.fn();
router.route('/materials', materialsHandler);
router.route('/reports', reportsHandler);

let ready = true;
router.setReady(() => ready);

beforeEach(() => {
  historyCalls.length = 0;
  materialsHandler.mockClear();
  reportsHandler.mockClear();
  ready = true;
  currentUrl = new URL('http://localhost/materials');
});

// ============================================================
// 1. UPDATING THE ADDRESS DOES NOT REDRAW THE PAGE
// ============================================================

describe('setQuery', () => {
  it('rewrites the address without running the route', () => {
    router.setQuery({ q: 'mahogany' });

    expect(historyCalls).toEqual([['replace', '/materials?q=mahogany']]);
    // The point of the fix: no reload, so a search box keeps its text
    expect(materialsHandler).not.toHaveBeenCalled();
  });

  it('can be called on every keystroke without reloading anything', () => {
    for (const keyword of ['m', 'ma', 'mah', 'maho', 'mahog']) {
      router.setQuery({ q: keyword });
    }

    expect(historyCalls).toHaveLength(5);
    expect(materialsHandler).not.toHaveBeenCalled();
  });

  it('leaves empty values out of the address', () => {
    router.setQuery({ q: '', category: 'wood', status: null, supplier: undefined });

    expect(historyCalls).toEqual([['replace', '/materials?category=wood']]);
  });

  it('clears the query string entirely when nothing is set', () => {
    router.setQuery({ q: '' });

    expect(historyCalls).toEqual([['replace', '/materials']]);
  });

  it('replaces the history entry rather than adding one', () => {
    // Otherwise the back button would step through every half-typed word
    router.setQuery({ q: 'abc' });

    expect(historyCalls.every(([kind]) => kind === 'replace')).toBe(true);
  });

  it('re-runs the route only when asked to, which is what the reports do', async () => {
    currentUrl = new URL('http://localhost/reports');

    router.setQuery({ category: 'wood' }, { reload: true });
    await Promise.resolve();

    expect(reportsHandler).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 2. NOTHING IS DRAWN BEFORE THE PROFILE RESOLVES
// ============================================================

describe('the readiness check', () => {
  it('holds a route back while the app is not ready', async () => {
    ready = false;

    await router.resolve();

    // The staff sidebar with a blank name came from this handler running
    // before Firebase had said who was signed in
    expect(materialsHandler).not.toHaveBeenCalled();
  });

  it('lets the same route through once it is ready', async () => {
    ready = false;
    await router.resolve();
    expect(materialsHandler).not.toHaveBeenCalled();

    ready = true;
    await router.resolve();
    expect(materialsHandler).toHaveBeenCalledTimes(1);
  });

  it('also holds back a navigation made during those first moments', async () => {
    // A link clicked before Firebase answers goes through navigate(), and
    // must not slip past the check either
    ready = false;
    router.navigate('/materials');
    await Promise.resolve();

    expect(materialsHandler).not.toHaveBeenCalled();
  });

  it('can start without drawing anything, leaving that to the auth callback', () => {
    const result = router.startRouter({ resolveImmediately: false });

    expect(result).toBeUndefined();
    expect(materialsHandler).not.toHaveBeenCalled();
  });
});
