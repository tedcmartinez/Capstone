// User management
//
// Replaces app/views/users/index.php and create.php. The old page had a form
// for typing in a new employee's name, email, role and password. That form
// is gone: people register themselves, and this page is where the general
// manager approves them.
//
// Manager and webmaster only. The sidebar does not show the link to anyone
// else, the router guard refuses the path, and firestore.rules refuses to
// return the documents, so all three layers agree.

import {
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../lib/firebase.js';
import { auditedWrite } from '../lib/audit.js';
import {
  esc,
  render,
  $,
  $$,
  alertHtml,
  friendlyError,
  shortDate,
  longDateTime,
} from '../lib/dom.js';
import {
  ROLE_WEBMASTER,
  ROLE_LABELS,
  STATUS_PENDING,
  STATUS_ACTIVE,
  STATUS_DISABLED,
} from '../lib/config.js';
import { currentUser } from '../lib/session.js';
import { accountActions, roleAfter } from '../lib/accounts.js';

let users = [];
let activeTab = STATUS_PENDING;
let message = null;

export async function renderUsers(container) {
  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Users</h1>
        <p class="cb-page-sub">Loading accounts...</p>
      </div>
    </div>`);

  try {
    const snapshot = await getDocs(query(collection(db, 'users'), orderBy('name')));
    users = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    render(container, `
      <div class="cb-page-head">
        <div><h1 class="cb-page-title">Users</h1></div>
      </div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  // Land on the tab that needs attention. A manager opening this page almost
  // always does so because somebody is waiting, so Pending is shown first
  // when there is anyone in it.
  const pendingCount = users.filter((u) => u.status === STATUS_PENDING).length;
  if (pendingCount === 0 && activeTab === STATUS_PENDING) activeTab = STATUS_ACTIVE;

  draw(container);
}

function draw(container) {
  const counts = {
    [STATUS_PENDING]: users.filter((u) => u.status === STATUS_PENDING).length,
    [STATUS_ACTIVE]: users.filter((u) => u.status === STATUS_ACTIVE).length,
    [STATUS_DISABLED]: users.filter((u) => u.status === STATUS_DISABLED).length,
  };

  const shown = users.filter((u) => u.status === activeTab);

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Users</h1>
        <p class="cb-page-sub">
          Employees register themselves, then you approve them here.
          ${counts[STATUS_PENDING] > 0
            ? `<strong>${counts[STATUS_PENDING]} waiting for approval.</strong>`
            : ''}
        </p>
      </div>
    </div>

    ${message ? alertHtml(message.kind, message.text) : ''}

    <div class="cb-card">
      <div class="cb-card-head">
        <div class="cb-tabs">
          ${tabButton(STATUS_PENDING, 'Pending', counts)}
          ${tabButton(STATUS_ACTIVE, 'Active', counts)}
          ${tabButton(STATUS_DISABLED, 'Disabled', counts)}
        </div>
      </div>
      <div class="cb-card-body is-flush">
        ${shown.length === 0 ? emptyState() : table(shown)}
      </div>
    </div>`);

  wire(container);
}

function tabButton(status, label, counts) {
  return `
    <button type="button" class="cb-tab${activeTab === status ? ' is-active' : ''}" data-tab="${status}">
      ${label}
      <span class="cb-tab-count">${counts[status]}</span>
    </button>`;
}

function emptyState() {
  const text = {
    [STATUS_PENDING]: 'Nobody is waiting for approval right now.',
    [STATUS_ACTIVE]: 'There are no active accounts yet.',
    [STATUS_DISABLED]: 'No accounts have been disabled.',
  }[activeTab];

  return `
    <div class="cb-empty">
      <p class="cb-empty-text">${esc(text)}</p>
    </div>`;
}

// ============================================================
// THE TABLE
//
// The verified badge and the sign-in provider are both shown, because
// together they are how a manager tells a real colleague from somebody who
// simply found the address of the system. An unverified email and password
// registration is the one to look at twice.
// ============================================================

function table(rows) {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Sign-in</th>
            <th>Role</th>
            <th>Registered</th>
            <th class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row).join('')}
        </tbody>
      </table>
    </div>`;
}

function row(user) {
  const me = currentUser();
  const isSelf = user.id === me?.uid;
  const targetIsWebmaster = user.role === ROLE_WEBMASTER;

  return `
    <tr>
      <td>
        <span class="cb-cell-strong">${esc(user.name || '(no name)')}</span>
        ${isSelf ? '<span class="cb-badge is-neutral ms-2">You</span>' : ''}
        ${targetIsWebmaster ? '<span class="cb-badge is-brand ms-2">Webmaster</span>' : ''}
      </td>
      <td>
        ${esc(user.email || '')}
        ${
          user.emailVerified
            ? '<span class="cb-badge is-healthy ms-2">Verified</span>'
            : '<span class="cb-badge is-low ms-2">Unverified</span>'
        }
      </td>
      <td>${esc(user.provider === 'google.com' ? 'Google' : 'Password')}</td>
      <td>${esc(ROLE_LABELS[user.role] || user.role || '')}</td>
      <td title="${esc(longDateTime(user.createdAt))}">${esc(shortDate(user.createdAt))}</td>
      <td class="text-end">${actions(user)}</td>
    </tr>`;
}

// Which buttons a row gets. These mirror firestore.rules exactly: anything
// the rules would refuse is not offered, so a manager is never presented
// with a button that fails when clicked.
// Which buttons a row gets. Decided by accountActions() in lib/accounts.js,
// which mirrors the users rule in firestore.rules, so a manager is never
// offered a button that would be refused, and never denied one the rules
// would allow.
function actions(user) {
  const allowed = accountActions(currentUser(), user);

  if (allowed.reason) {
    return `<span class="cb-help">${esc(allowed.reason)}</span>`;
  }

  const id = esc(user.id);
  const buttons = [];

  if (allowed.approve) {
    buttons.push(`<button type="button" class="cb-btn cb-btn-sm cb-btn-in" data-act="approve" data-id="${id}">Approve</button>`);
  }
  if (allowed.reject) {
    buttons.push(`<button type="button" class="cb-btn cb-btn-sm cb-btn-outline" data-act="reject" data-id="${id}">Reject</button>`);
  }
  if (allowed.disable) {
    buttons.push(`<button type="button" class="cb-btn cb-btn-sm cb-btn-danger" data-act="disable" data-id="${id}">Disable</button>`);
  }
  if (allowed.enable) {
    buttons.push(`<button type="button" class="cb-btn cb-btn-sm cb-btn-in" data-act="enable" data-id="${id}">Re-enable</button>`);
  }
  if (allowed.promote) {
    buttons.push(
      `<button type="button" class="cb-btn cb-btn-sm cb-btn-outline" data-act="role" data-id="${id}" data-role="${roleAfter('promote')}">Make Manager</button>`
    );
  }
  if (allowed.demote) {
    buttons.push(
      `<button type="button" class="cb-btn cb-btn-sm cb-btn-outline" data-act="role" data-id="${id}" data-role="${roleAfter('demote')}">Make Staff</button>`
    );
  }

  return buttons.length
    ? `<div class="cb-row-actions">${buttons.join('')}</div>`
    : '<span class="cb-help">No actions</span>';
}

// ============================================================
// ACTIONS
// ============================================================

function wire(container) {
  $$('[data-tab]', container).forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      message = null;
      draw(container);
    });
  });

  $$('[data-act]', container).forEach((button) => {
    button.addEventListener('click', () => {
      const user = users.find((u) => u.id === button.dataset.id);
      if (!user) return;
      perform(container, button, user, button.dataset.act, button.dataset.role);
    });
  });
}

async function perform(container, button, user, action, nextRole) {
  // A rejection and a disable both lock somebody out, so they are confirmed.
  // An approval is not, since it is the expected, harmless action.
  const confirmations = {
    reject: `Reject ${user.name}? The account stays on record but cannot be used.`,
    disable: `Disable ${user.name}? They will be signed out and cannot sign back in.`,
    role: `Change the role for ${user.name} to ${ROLE_LABELS[nextRole]}?`,
  };

  if (confirmations[action] && !window.confirm(confirmations[action])) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving...';

  const me = currentUser();

  // Each action changes only the fields firestore.rules permits a manager to
  // touch: role, status, approvedBy, approvedAt.
  const plans = {
    approve: {
      data: { status: STATUS_ACTIVE, approvedBy: me.uid, approvedAt: serverTimestamp() },
      auditAction: 'user.approve',
      summary: `Approved ${user.name} (${user.email}) as ${ROLE_LABELS[user.role]}`,
      before: { status: user.status },
      after: { status: STATUS_ACTIVE },
    },
    reject: {
      data: { status: STATUS_DISABLED },
      auditAction: 'user.reject',
      summary: `Rejected the registration of ${user.name} (${user.email})`,
      before: { status: user.status },
      after: { status: STATUS_DISABLED },
    },
    disable: {
      data: { status: STATUS_DISABLED },
      auditAction: 'user.disable',
      summary: `Disabled the account of ${user.name} (${user.email})`,
      before: { status: user.status },
      after: { status: STATUS_DISABLED },
    },
    enable: {
      data: { status: STATUS_ACTIVE, approvedBy: me.uid, approvedAt: serverTimestamp() },
      auditAction: 'user.approve',
      summary: `Re-enabled the account of ${user.name} (${user.email})`,
      before: { status: user.status },
      after: { status: STATUS_ACTIVE },
    },
    role: {
      data: { role: nextRole },
      auditAction: 'user.role_change',
      summary: `Changed the role of ${user.name} from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[nextRole]}`,
      before: { role: user.role },
      after: { role: nextRole },
    },
  };

  const plan = plans[action];

  try {
    await auditedWrite(
      [{ type: 'update', collection: 'users', id: user.id, data: plan.data }],
      {
        action: plan.auditAction,
        entity: 'users',
        entityId: user.id,
        before: plan.before,
        after: plan.after,
        summary: plan.summary,
      }
    );

    message = { kind: 'success', text: plan.summary };
    await renderUsers(container);
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    button.disabled = false;
    button.textContent = original;
    draw(container);
  }
}
