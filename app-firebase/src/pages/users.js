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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../lib/firebase.js';
import { auditedWrite, deleteAuditId } from '../lib/audit.js';
import { onLeave } from '../lib/router.js';
import { confirmDialog } from '../ui/confirm.js';
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

// The list is live: a new registration, a colleague approving someone on
// another computer, or a waiting employee confirming their email all show
// up here without a reload. The listener stops when the page is left.
export function renderUsers(container) {
  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Users</h1>
        <p class="cb-page-sub">Loading accounts...</p>
      </div>
    </div>`);

  let first = true;
  message = null;

  const stop = onSnapshot(
    query(collection(db, 'users'), orderBy('name')),
    (snapshot) => {
      users = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

      // Land on the tab that needs attention. A manager opening this page
      // almost always does so because somebody is waiting, so Pending is
      // shown first when there is anyone in it.
      if (first) {
        first = false;
        const pendingCount = users.filter((u) => u.status === STATUS_PENDING).length;
        activeTab = pendingCount > 0 ? STATUS_PENDING : STATUS_ACTIVE;
      }

      draw(container);
    },
    (error) => {
      render(container, `
        <div class="cb-page-head">
          <div><h1 class="cb-page-title">Users</h1></div>
        </div>
        ${alertHtml('danger', friendlyError(error))}`);
    }
  );

  onLeave(stop);
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
      <table class="cb-table cb-users-table">
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
      <td class="cb-users-name">
        <span class="cb-cell-strong">${esc(user.name || '(no name)')}</span>
        ${isSelf ? '<span class="cb-badge is-neutral ms-1">You</span>' : ''}
        ${targetIsWebmaster ? '<span class="cb-badge is-brand ms-1">Webmaster</span>' : ''}
      </td>
      <td class="cb-users-email">
        <span class="cb-truncate" title="${esc(user.email || '')}">${esc(user.email || '')}</span>
        ${
          user.emailVerified
            ? '<span class="cb-badge is-healthy">Verified</span>'
            : '<span class="cb-badge is-low">Unverified</span>'
        }
      </td>
      <td>${esc(user.provider === 'google.com' ? 'Google' : 'Password')}</td>
      <td>${esc(ROLE_LABELS[user.role] || user.role || '')}</td>
      <td title="${esc(longDateTime(user.createdAt))}">${esc(shortDate(user.createdAt))}</td>
      <td class="text-end">${actions(user)}</td>
    </tr>`;
}

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
  if (allowed.remove) {
    buttons.push(`<button type="button" class="cb-btn cb-btn-sm cb-btn-danger" data-act="delete" data-id="${id}">Delete</button>`);
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

// Confirmation for each action that needs one. Rejecting, disabling and
// deleting lock somebody out, and a role change alters what they can see.
// Approval is only questioned when the address is still unconfirmed, which
// is the one sign that the person may not be who they claim. Exported for
// tests/unit/users-page.test.js.
export function confirmationFor(action, user, nextRole) {
  switch (action) {
    case 'approve':
      return user.emailVerified
        ? null
        : {
            title: 'Approve unverified account',
            text: `${user.email} hasn't verified their email yet. Approve anyway?`,
            confirmLabel: 'Approve',
          };
    case 'reject':
      return {
        title: 'Reject request',
        text: `Reject ${user.name}? The account stays on record but cannot be used.`,
        confirmLabel: 'Reject',
        danger: true,
      };
    case 'disable':
      return {
        title: 'Disable account',
        text: `Disable ${user.name}? They will be signed out and cannot sign back in.`,
        confirmLabel: 'Disable',
        danger: true,
      };
    case 'role':
      return {
        title: 'Change role',
        text: `Change the role for ${user.name} to ${ROLE_LABELS[nextRole]}?`,
        confirmLabel: 'Change Role',
      };
    case 'delete':
      return {
        title: 'Delete account',
        text:
          `Delete ${user.name} (${user.email})? They lose access, and if they sign in again ` +
          "they'll appear as a new request. Their past stock movements and audit entries are kept.",
        confirmLabel: 'Delete',
        danger: true,
      };
    default:
      return null;
  }
}

async function perform(container, button, user, action, nextRole) {
  const question = confirmationFor(action, user, nextRole);
  if (question && !(await confirmDialog(question))) return;

  if (action === 'delete') {
    await deleteAccount(container, button, user);
    return;
  }

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

    // The live listener redraws the table; the message goes above it
    message = { kind: 'success', text: plan.summary };
    draw(container);
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    button.disabled = false;
    button.textContent = original;
    draw(container);
  }
}

// ============================================================
// DELETE
//
// Removes the users document, in the same batch as a user.delete entry
// holding who the account belonged to. The entry's id is worked out from
// the account's current lastAuditId (deleteAuditId in lib/audit.js), which
// is how the rules find it, since a deleted document cannot point to it.
//
// The Firebase sign-in stays: removing it needs the Admin SDK, which the
// free plan only allows from the Firebase console. If the person signs in
// again, they arrive as a new pending request.
// ============================================================

async function deleteAccount(container, button, user) {
  button.disabled = true;
  button.textContent = 'Deleting...';

  const summary = `Deleted the account of ${user.name} (${user.email})`;

  try {
    await auditedWrite(
      [{ type: 'delete', collection: 'users', id: user.id }],
      {
        action: 'user.delete',
        entity: 'users',
        entityId: user.id,
        before: { name: user.name, email: user.email, role: user.role },
        after: null,
        summary,
      },
      { auditId: deleteAuditId(user.id, user.lastAuditId) }
    );

    message = { kind: 'success', text: summary };
    draw(container);
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    button.disabled = false;
    button.textContent = 'Delete';
    draw(container);
  }
}
