// Client-side router
//
// Replaces core/Router.php. The PHP version read a 'url' query string that
// .htaccess rewrote, and dispatched to a controller. This one reads
// window.location.pathname and calls a page module, and firebase.json
// rewrites every path to index.html so a refresh on /materials still works.
//
// Routes are kept as the same paths the PHP app used, so links written in
// the capstone manuscript and any bookmarks on the office desktop still
// point at the right screen.

const routes = [];
let notFoundHandler = null;
let beforeEach = null;

// Registers a route. The pattern is a plain path, optionally ending in /:id
// for the one case that needs it.
export function route(path, handler, options = {}) {
  routes.push({ path, handler, ...options });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

// A guard run before every navigation. Returning a path from it redirects
// there instead, which is how a pending account is kept on its waiting
// screen no matter what address is typed.
export function setGuard(handler) {
  beforeEach = handler;
}

// ============================================================
// NAVIGATION
// ============================================================

export function navigate(path, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  resolve();
}

export function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function queryParam(key, fallback = '') {
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

export function allQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

// Replaces the query string without adding a history entry, so changing a
// filter does not fill the back button with every intermediate state. The
// filters stay in the URL, which is what made the PHP pages shareable and
// bookmarkable, and that behaviour is kept.
export function setQuery(params, { replace = true } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  const url = currentPath() + (query ? `?${query}` : '');
  navigate(url, { replace });
}

// ============================================================
// RESOLUTION
// ============================================================

function match(path) {
  for (const entry of routes) {
    if (entry.path === path) return { entry, params: {} };

    // One dynamic segment, e.g. /materials/edit/:id
    if (entry.path.includes('/:')) {
      const [prefix, paramName] = entry.path.split('/:');
      if (path.startsWith(prefix + '/')) {
        const value = path.slice(prefix.length + 1);
        if (value && !value.includes('/')) {
          return { entry, params: { [paramName]: value } };
        }
      }
    }
  }
  return null;
}

// Looks up a path's registered options without running its handler. The
// navigation guard uses this to find out whether a page is manager-only.
export function routeMeta(path) {
  const found = match(path.replace(/\/+$/, '') || '/');
  return found ? found.entry : null;
}

export async function resolve() {
  const path = currentPath();

  if (beforeEach) {
    const redirect = await beforeEach(path);
    if (redirect && redirect !== path) {
      window.history.replaceState({}, '', redirect);
      return resolve();
    }
  }

  const found = match(currentPath());

  if (!found) {
    if (notFoundHandler) notFoundHandler();
    return;
  }

  await found.entry.handler(found.params);
}

// ============================================================
// STARTUP
// ============================================================

export function startRouter() {
  // The back and forward buttons
  window.addEventListener('popstate', () => resolve());

  // Any link to an internal path is handled without a page reload. Links
  // with a target, a download, or an external href are left to the browser.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    if (link.target || link.hasAttribute('download')) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    event.preventDefault();
    navigate(href);
  });

  return resolve();
}
