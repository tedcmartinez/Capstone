// Small DOM and formatting helpers
//
// The PHP version had these as view helpers in config/app.php. They are kept
// here with the same names and the same behaviour, so a page ported from a
// PHP view reads almost the same as the original.

// ============================================================
// ESCAPING
// Everything a user typed is escaped before it goes into HTML, the same job
// htmlspecialchars() did in the PHP views. Material names, notes and user
// names all pass through here.
// ============================================================

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// ============================================================
// MONEY AND DATES
// Ported from peso(), pesoShort() and shortDate() in config/app.php.
// ============================================================

export function peso(amount, emptyText = '-') {
  if (amount === null || amount === undefined || amount === '') return emptyText;
  const value = Number(amount);
  if (Number.isNaN(value)) return emptyText;
  return 'PHP ' + value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pesoShort(amount) {
  const value = Number(amount) || 0;
  if (value >= 1000000) return 'PHP ' + (value / 1000000).toFixed(2) + 'M';
  if (value >= 100000) return 'PHP ' + (value / 1000).toFixed(1) + 'K';
  return peso(value);
}

// "Aug 21, 2026". Accepts a Firestore Timestamp, a Date, or a YYYY-MM-DD
// string, since movement dates are stored as plain strings and audit
// timestamps as Firestore Timestamps.
export function shortDate(value) {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Aug 21, 2026 at 3:04 PM", used by the audit trail where the exact moment
// matters rather than just the day.
export function longDateTime(value) {
  const date = toDate(value);
  if (!date) return '-';
  return (
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

export function toDate(value) {
  if (!value) return null;
  // Firestore Timestamp
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    // A plain YYYY-MM-DD is parsed as local time rather than UTC, so the
    // date shown never slips to the previous day in a +08:00 timezone.
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) return new Date(+parts[1], +parts[2] - 1, +parts[3]);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

// Today as YYYY-MM-DD in the browser's own timezone, which is what the
// movement date fields store.
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// ============================================================
// STOCK STATUS
// The single source of truth for stock status, ported from stockStatus() in
// config/app.php. Every badge in the system goes through here so the rules
// stay identical on every page, exactly as the PHP comment insisted.
// ============================================================

export function stockStatus(quantity, threshold) {
  const qty = Number(quantity) || 0;
  const min = Number(threshold) || 0;
  if (qty === 0) return 'out';
  if (qty <= min) return 'low';
  return 'healthy';
}

export function stockStatusLabel(status) {
  return {
    out: 'Out of Stock',
    low: 'Low Stock',
    healthy: 'Healthy',
  }[status] || status;
}

// ============================================================
// RENDERING
// ============================================================

// Replaces the contents of an element and returns it, so a page module can
// render and then wire up its own event listeners.
export function render(target, html) {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  element.innerHTML = html;
  return element;
}

// Shorthand for querying inside a container
export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

// Attaches a click handler to every element matching a selector. Used
// instead of inline onclick so no user-supplied text is ever treated as code.
export function onClick(scope, selector, handler) {
  $$(selector, scope).forEach((element) => {
    element.addEventListener('click', (event) => handler(event, element));
  });
}

// ============================================================
// FEEDBACK
// The PHP app showed success and failure as a styled alert strip at the top
// of the page. Same markup, same classes.
// ============================================================

export function alertHtml(kind, message) {
  const icons = {
    danger:
      '<path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>',
    success:
      '<path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425z"/>',
    info:
      '<path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/>',
  };
  return `
    <div class="cb-alert is-${esc(kind)}">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;">
        ${icons[kind] || icons.info}
      </svg>
      <div>${esc(message)}</div>
    </div>`;
}

// Turns a Firebase error into something a shop floor user can act on.
// Firebase codes like 'auth/invalid-credential' are meaningless to them.
export function friendlyError(error) {
  // The whole error, with whatever URL or stack it carries, goes to the
  // console. Nothing is lost by showing the user a shorter sentence: this
  // is where the person maintaining the system looks, and a missing index
  // error in particular carries the link that creates it.
  if (error) console.error('Cornerblock:', error);

  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/invalid-email': 'That does not look like a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact the general manager.',
    'auth/user-not-found': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/email-already-in-use': 'An account with that email already exists. Try logging in instead.',
    'auth/weak-password': 'Password must be at least 8 characters long.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
    'auth/network-request-failed': 'Could not reach Firebase. Check the internet connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/account-exists-with-different-credential':
      'That email is already registered with a different sign-in method. Use the other method instead.',
    'permission-denied': 'You do not have permission to do that.',
    unavailable: 'No connection to the server. The change will be saved when the connection returns.',
    'deadline-exceeded': 'The server took too long to answer. Check the connection and try again.',
    'resource-exhausted':
      'The system has reached its daily free allowance of database activity. ' +
      'It will start working again tomorrow.',
  };
  if (messages[code]) return messages[code];

  // A missing database index. Firestore's own message is a paragraph ending
  // in a very long console URL, which is useful to whoever maintains the
  // system and meaningless to the shop. The full error goes to the browser
  // console below; this is what the user is told.
  if (code === 'failed-precondition' && /index/i.test(String(error?.message))) {
    return (
      'This page needs a database index that is still being built. ' +
      'That usually takes a few minutes after an update. Try again shortly, ' +
      'and tell the system administrator if it keeps happening.'
    );
  }

  return cleanMessage(error?.message) || 'Something went wrong. Please try again.';
}

// Strips anything that belongs in a developer's console rather than on a
// shop floor screen: URLs, and the "FirebaseError:" prefix the SDK adds.
//
// A long unbroken URL also used to stretch the alert strip past the edge of
// the page, so removing it fixes the layout as well as the wording. The
// alert itself now wraps regardless, in app.css.
function cleanMessage(message) {
  if (!message) return '';

  const withoutUrls = String(message)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // A message that ended at the URL is left with a dangling connective
    .replace(/[\s,:;]+(here|at|see)?[\s.]*$/i, '');

  return withoutUrls ? `${withoutUrls}.`.replace(/\.+$/, '.') : '';
}
