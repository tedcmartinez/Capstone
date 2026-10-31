// Application entry point
//
// Replaces public/index.php and core/Router.php. The PHP front controller
// loaded config, started a session, and dispatched to a controller. This
// does the same three things: waits for Firebase to say who is signed in,
// decides which screen that person may see, and hands over to a page module.

import { watchAuth } from './lib/auth.js';
import {
  route,
  setGuard,
  setNotFound,
  startRouter,
  navigate,
  resolve,
  currentPath,
  routeMeta,
} from './lib/router.js';
import {
  currentUser,
  isSignedIn,
  isManager,
  isPending,
  isDisabled,
  canUseApp,
} from './lib/session.js';
import { mountShell, resetShell } from './ui/shell.js';
import { renderLogin } from './pages/login.js';
import {
  renderPending,
  renderDisabled,
  renderWebmasterVerification,
  renderAuthError,
} from './pages/gate.js';
import { renderUsers } from './pages/users.js';
import { esc } from './lib/dom.js';

// Set while the webmaster address is waiting on email confirmation, so the
// guard can keep showing that screen instead of the login form.
let webmasterVerification = null;
let authError = null;
let authResolved = false;

// ============================================================
// ROUTES
//
// The same paths the PHP app used, so links in the manuscript and any
// bookmarks on the office desktop still work.
//
// manager: true marks a page the general manager and webmaster may open.
// The guard below enforces it, which is this app's equivalent of
// Auth::requireRole(['general_manager']) at the top of a PHP controller.
// The security rules deny the data as well, so hiding the page is a
// convenience, not the protection.
// ============================================================

route('/login', () => renderLogin());

route('/users', async () => renderUsers(mountShell()), { manager: true });

// The remaining pages are built in the steps that follow. They are
// registered now so the sidebar links resolve rather than falling through
// to the not-found screen, and each says plainly that it is not ready.
route('/dashboard', () => placeholder('Dashboard', 'step 7'), { manager: true });
route('/materials', () => placeholder('Materials', 'step 5'));
route('/categories', () => placeholder('Categories', 'step 5'));
route('/suppliers', () => placeholder('Suppliers', 'step 5'), { manager: true });
route('/movements', () => placeholder('Movement History', 'step 6'));
route('/movements/stockin', () => placeholder('Stock In', 'step 6'));
route('/movements/stockout', () => placeholder('Stock Out', 'step 6'));
route('/reports', () => placeholder('Inventory Report', 'step 7'), { manager: true });
route('/reports/lowstock', () => placeholder('Low Stock Report', 'step 7'), { manager: true });
route('/reports/movement', () => placeholder('Movement Report', 'step 7'), { manager: true });
route('/reports/value', () => placeholder('Inventory Value Report', 'step 7'), { manager: true });
route('/checklist', () => placeholder('Reorder Checklist', 'step 9'), { manager: true });
route('/audit', () => placeholder('Audit Trail', 'step 8'), { manager: true });
route('/settings', () => placeholder('Settings', 'step 9'), { manager: true });

setNotFound(() => {
  if (!isSignedIn()) {
    navigate('/login', { replace: true });
    return;
  }
  const content = mountShell();
  content.innerHTML = `
    <div class="cb-empty">
      <h1 class="cb-page-title">Page not found</h1>
      <p class="cb-empty-text">
        The address <code>${esc(currentPath())}</code> does not exist in this system.
      </p>
      <a class="cb-btn cb-btn-primary mt-3" href="/">Back to the start</a>
    </div>`;
});

// ============================================================
// THE GUARD
//
// Runs before every navigation and decides whether this account may see the
// path it asked for. The order matters: account state is checked before
// roles, so a pending or disabled user is sent to their explanation screen
// rather than bounced around the app.
// ============================================================

setGuard((path) => {
  // Still waiting for Firebase on a cold load. The loading screen in
  // index.html stays up and the real decision is made once auth resolves.
  if (!authResolved) return null;

  if (authError) return null;
  if (webmasterVerification) return null;

  if (!isSignedIn()) {
    return path === '/login' ? null : '/login';
  }

  // Signed in but not approved yet, or switched off
  if (isPending() || isDisabled()) return null;

  if (!canUseApp()) return null;

  // Signed in and approved, so the login page is no longer the right place
  if (path === '/login') return landingPath();

  // The root sends each role to its own starting page. The PHP router did
  // exactly this: managers to the dashboard, staff to the catalog, because
  // the dashboard is a manager-only page.
  if (path === '/') return landingPath();

  // Manager-only pages. Staff are redirected to their own landing page
  // rather than shown a 403, which is friendlier than the PHP version's
  // error page and gives away nothing, since the data is denied regardless.
  const meta = routeMeta(path);
  if (meta?.manager && !isManager()) return landingPath();

  return null;
});

function landingPath() {
  return isManager() ? '/dashboard' : '/materials';
}

// ============================================================
// SCREEN SELECTION
// ============================================================

function renderCurrentScreen() {
  if (authError) {
    renderAuthError(authError);
    return;
  }

  if (webmasterVerification) {
    renderWebmasterVerification(webmasterVerification);
    return;
  }

  if (isSignedIn()) {
    if (isPending()) {
      renderPending();
      return;
    }
    if (isDisabled()) {
      renderDisabled();
      return;
    }
  }

  resolve();
}

// A clearly labelled stand-in for the pages still to be built, so clicking
// a sidebar link during the migration shows something honest rather than a
// blank panel or an error.
function placeholder(title, step) {
  const content = mountShell();
  content.innerHTML = `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">${esc(title)}</h1>
        <p class="cb-page-sub">This page is being migrated to Firebase.</p>
      </div>
    </div>
    <div class="cb-card">
      <div class="cb-card-body">
        <p class="mb-0" style="color: var(--cb-muted); font-size: 14px;">
          ${esc(title)} is scheduled for ${esc(step)} of the migration and is
          not connected yet. The LAN version of this page is still available
          for reference.
        </p>
      </div>
    </div>`;
}

// ============================================================
// STARTUP
// ============================================================

watchAuth((user, error) => {
  authResolved = true;
  authError = error || null;
  webmasterVerification = user?.needsWebmasterVerification ? user.email : null;

  // The shell is thrown away whenever the signed-in user changes, so one
  // person's navigation is never briefly shown to the next.
  if (!user || webmasterVerification) resetShell();

  renderCurrentScreen();
});

startRouter();
