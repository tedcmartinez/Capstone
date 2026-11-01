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
  landingPath,
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
import { renderAudit } from './pages/audit.js';
import { renderChecklist } from './pages/checklist.js';
import { renderSettings } from './pages/settings.js';
import { esc } from './lib/dom.js';
import { registerServiceWorker } from './lib/pwa.js';
import { watchAccount, stopWatchingAccount, nextStep } from './lib/accountWatch.js';

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

// The manager's overview and the four reports. All manager only, because
// every one of them exposes cost information, which is why the PHP
// controller gated the whole class rather than individual actions.
route('/dashboard', async () => renderDashboard(mountShell()), { manager: true });
route('/reports', async () => renderInventoryReport(mountShell()), { manager: true });
route('/reports/lowstock', async () => renderLowStockReport(mountShell()), { manager: true });
route('/reports/movement', async () => renderMovementReport(mountShell()), { manager: true });
route('/reports/value', async () => renderValueReport(mountShell()), { manager: true });

// The audit trail, the reorder checklist and settings. Manager only, as
// ChecklistController and SettingsController were.
route('/audit', async () => renderAudit(mountShell()), { manager: true });
route('/checklist', async () => renderChecklist(mountShell()), { manager: true });
route('/settings', async () => renderSettings(mountShell()), { manager: true });

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

// ============================================================
// STARTUP
// ============================================================

// The listeners for links and the back button are attached now, but the
// first screen is NOT drawn here. Firebase answers a moment later, and the
// callback below draws it once the role is known. Until then the loading
// screen in index.html stays up.
startRouter({ resolveImmediately: false });

// Saves the app's files so the installed window opens offline
registerServiceWorker();

watchAuth((user, error) => {
  authResolved = true;
  authError = error || null;
  webmasterVerification = user?.needsWebmasterVerification ? user.email : null;

  // The shell is thrown away whenever the signed-in user changes, so one
  // person's navigation is never briefly shown to the next.
  if (!user || webmasterVerification) resetShell();

  // Listen for a manager changing this account while it is open. Stopped
  // on sign-out, and for the webmaster verification screen, which has no
  // account document yet.
  if (user && !webmasterVerification) {
    watchAccount(user.uid, accountChanged);
  } else {
    stopWatchingAccount();
  }

  renderCurrentScreen();
});

// ============================================================
// THE ACCOUNT CHANGED WHILE OPEN
//
// lib/accountWatch.js calls this when a manager approves, disables, or
// changes the role of the signed-in account. The session already holds the
// new role and status; this moves the person to the screen it allows,
// exactly as a fresh page load would, without one.
// ============================================================

function accountChanged(before, after) {
  closeOpenDialogs();

  // The sidebar was drawn for the old role, so it is drawn again
  resetShell();

  // Just approved: straight into the app, at the role's starting page
  if (nextStep(before, after) === 'enter') {
    navigate(landingPath(), { replace: true });
    return;
  }

  // Disabled, or still active with a different role. The guard sends a
  // demoted manager off a manager-only page, and a disabled account to its
  // explanation screen.
  renderCurrentScreen();
}

// A form left open in a Bootstrap dialog belongs to the screen being
// replaced. The dialog itself goes with that screen, but the dark backdrop
// and the scroll lock Bootstrap puts on <body> would stay behind.
function closeOpenDialogs() {
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}
