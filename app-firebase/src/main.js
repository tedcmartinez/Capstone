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
  setReady,
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
import { renderMaterials } from './pages/materials.js';
import { renderCategories } from './pages/categories.js';
import { renderSuppliers } from './pages/suppliers.js';
import { renderMovements } from './pages/movements.js';
import { renderStockIn, renderStockOut } from './pages/stock.js';
import { renderDashboard } from './pages/dashboard.js';
import {
  renderInventoryReport,
  renderLowStockReport,
  renderMovementReport,
  renderValueReport,
} from './pages/reports.js';
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

// The catalog. /materials and /categories are open to both roles, with cost
// and supplier columns left out for staff. /suppliers is manager only, as
// SupplierController was.
route('/materials', async () => renderMaterials(mountShell()));
route('/categories', async () => renderCategories(mountShell()));
route('/suppliers', async () => renderSuppliers(mountShell()), { manager: true });

// Stock movements. Both roles log them, as MovementController allowed.
route('/movements', async () => renderMovements(mountShell()));
route('/movements/stockin', async () => renderStockIn(mountShell()));
route('/movements/stockout', async () => renderStockOut(mountShell()));

// The remaining pages are built in the steps that follow. They are
// registered now so the sidebar links resolve rather than falling through
// to the not-found screen, and each says plainly that it is not ready.
// The manager's overview and the four reports. All manager only, because
// every one of them exposes cost information, which is why the PHP
// controller gated the whole class rather than individual actions.
route('/dashboard', async () => renderDashboard(mountShell()), { manager: true });
route('/reports', async () => renderInventoryReport(mountShell()), { manager: true });
route('/reports/lowstock', async () => renderLowStockReport(mountShell()), { manager: true });
route('/reports/movement', async () => renderMovementReport(mountShell()), { manager: true });
route('/reports/value', async () => renderValueReport(mountShell()), { manager: true });
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

// Nothing is drawn until Firebase has said who is signed in. Without this
// the first paint happens with an empty session, which drew the staff
// sidebar with a blank name before correcting itself a moment later.
setReady(() => authResolved);

setGuard((path) => {
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

// The listeners for links and the back button are attached now, but the
// first screen is NOT drawn here. Firebase answers a moment later, and the
// callback below draws it once the role is known. Until then the loading
// screen in index.html stays up.
startRouter({ resolveImmediately: false });

watchAuth((user, error) => {
  authResolved = true;
  authError = error || null;
  webmasterVerification = user?.needsWebmasterVerification ? user.email : null;

  // The shell is thrown away whenever the signed-in user changes, so one
  // person's navigation is never briefly shown to the next.
  if (!user || webmasterVerification) resetShell();

  renderCurrentScreen();
});
