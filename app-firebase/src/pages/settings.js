// Settings
//
// A port of app/views/settings/index.php: a read-only summary of how the
// system is set up, for a new manager and for the panel. Nothing here can be
// edited, which was the point of the original too, so that live mail
// settings could never be changed from a browser.
//
// The LAN version showed SMTP host, port and the account its App Password
// belonged to. There is no SMTP and no password any more, so the Email
// Alerts card asks the alert service itself whether it is working.
//
// Manager and webmaster only, as SettingsController was.

import { esc, render, $, alertHtml, friendlyError } from '../lib/dom.js';
import { loadCatalog, lowStockOf } from '../lib/materials.js';
import {
  alertsConfigured,
  pingAlertService,
  ALERTS_NOT_CONFIGURED,
  ALERTS_UNREACHABLE,
  ALERTS_REFUSED,
} from '../lib/alerts.js';
import { updateAlerts } from '../ui/shell.js';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { APP_VERSION, SYSTEM_TITLE, firebaseConfig } from '../lib/config.js';

let container = null;

export async function renderSettings(target) {
  container = target;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Settings</h1>
        <p class="cb-page-sub">Loading...</p>
      </div>
    </div>`);

  let materials;
  let users;
  try {
    const [catalog, usersSnapshot] = await Promise.all([
      loadCatalog(),
      getDocs(collection(db, 'users')),
    ]);
    materials = catalog.materials;
    users = usersSnapshot.docs.map((d) => d.data());
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Settings</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  const low = lowStockOf(materials);
  updateAlerts(low);

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Settings</h1>
        <p class="cb-page-sub">How this system is configured</p>
      </div>
      <a href="/users" class="cb-btn cb-btn-outline">Manage Users</a>
    </div>

    ${alertHtml(
      'info',
      "These values are set in the project's configuration, in the Firebase console and in " +
        'the alert service. They are shown here for reference and cannot be edited from this page.'
    )}

    <div class="row g-3">
      <div class="col-12 col-lg-6">${emailCard()}</div>
      <div class="col-12 col-lg-6">${rulesCard()}</div>
      <div class="col-12 col-lg-6">${rolesCard()}</div>
      <div class="col-12 col-lg-6">${systemCard(materials, low, users)}</div>
    </div>
  `);

  // The status needs a round trip to the alert service, so the page is drawn
  // first and the card is filled in when the answer arrives
  checkAlertService();
}

// ============================================================
// EMAIL ALERTS
// ============================================================

function emailCard() {
  return `
    <div class="cb-card h-100">
      <div class="cb-card-head">
        <div>
          <h2 class="cb-section-title">Email Alerts</h2>
          <p class="cb-section-sub">Low-stock and stock-out notifications</p>
        </div>
        <span id="stStatusBadge" class="cb-badge is-neutral">Checking...</span>
      </div>
      <div class="cb-card-body">
        <table class="cb-table" style="font-size:13px;">
          <tbody>
            <tr>
              <td class="cb-label" style="width:40%;">Sent By</td>
              <td id="stSender"><span class="text-muted">Checking...</span></td>
            </tr>
            <tr>
              <td class="cb-label">Sending Service</td>
              <td>Google Apps Script, using Gmail</td>
            </tr>
            <tr>
              <td class="cb-label">Emails Left Today</td>
              <td id="stQuota"><span class="text-muted">Checking...</span></td>
            </tr>
            <tr>
              <td class="cb-label">Password</td>
              <td><span class="text-muted">None. The service sends as its own Google account.</span></td>
            </tr>
          </tbody>
        </table>
        <div id="stServiceDetail"></div>
        <div class="cb-help mt-3">
          Gmail allows a free account to send to about 100 recipients a day.
          One low-stock alert to five people uses five of those. The count above
          is Google's own figure and resets each day.
        </div>
      </div>
    </div>`;
}

async function checkAlertService() {
  const badge = $('#stStatusBadge', container);
  const sender = $('#stSender', container);
  const quota = $('#stQuota', container);
  const detail = $('#stServiceDetail', container);
  if (!badge) return;

  if (!alertsConfigured()) {
    badge.className = 'cb-badge is-low';
    badge.textContent = 'Not Set Up';
    sender.innerHTML = '<span class="text-muted">Not set up</span>';
    quota.innerHTML = '<span class="text-muted">Not set up</span>';
    detail.innerHTML = `<div class="mt-3">${alertHtml(
      'info',
      'The alert service has not been connected yet, so no emails are sent. Stock movements are ' +
        'still recorded as normal.'
    )}</div>`;
    return;
  }

  const result = await pingAlertService();

  // The page may have been left while waiting
  if (!document.body.contains(badge)) return;

  if (result.ok) {
    badge.className = 'cb-badge is-healthy';
    badge.textContent = 'Working';
    sender.textContent = result.sender || '(unknown)';
    quota.textContent =
      typeof result.quotaRemaining === 'number' ? result.quotaRemaining.toLocaleString('en-PH') : '(unknown)';
    return;
  }

  const labels = {
    [ALERTS_NOT_CONFIGURED]: 'Not Set Up',
    [ALERTS_UNREACHABLE]: 'Unreachable',
    [ALERTS_REFUSED]: 'Needs Attention',
  };

  badge.className = 'cb-badge is-out';
  badge.textContent = labels[result.status] || 'Not Working';
  sender.innerHTML = '<span class="text-muted">Unknown</span>';
  quota.innerHTML = '<span class="text-muted">Unknown</span>';

  // The script words its refusals for the person reading them, including
  // which setup step is missing, so its message is shown as it came
  detail.innerHTML = `<div class="mt-3">${alertHtml(
    'danger',
    result.status === ALERTS_UNREACHABLE
      ? 'The alert service could not be reached. Check the internet connection. If it keeps ' +
          'happening, the service may need redeploying.'
      : result.detail || 'The alert service refused the request.'
  )}</div>`;
}

// ============================================================
// ALERT RULES
// Unchanged from the LAN version, because the rules themselves are.
// ============================================================

function rulesCard() {
  const rule = (title, text, badgeClass, badge, last = false) => `
    <div class="cb-stock-panel${last ? ' mb-0' : ''}">
      <div>
        <div style="font-size:13px;font-weight:600;">${esc(title)}</div>
        <div class="cb-help mt-1">${esc(text)}</div>
      </div>
      <span class="cb-badge ${badgeClass}">${esc(badge)}</span>
    </div>`;

  return `
    <div class="cb-card h-100">
      <div class="cb-card-head">
        <div>
          <h2 class="cb-section-title">Alert Rules</h2>
          <p class="cb-section-sub">When the system sends an email</p>
        </div>
      </div>
      <div class="cb-card-body">
        ${rule('Low-Stock Alert', "Stock falls to or below the material's threshold", 'is-low', 'Staff + Manager')}
        ${rule('Stock-Out Alert', 'Stock reaches zero', 'is-out', 'Manager Only')}
        ${rule('Repeat Protection', 'The same alert is not resent within 24 hours', 'is-neutral', '24 Hours', true)}
      </div>
    </div>`;
}

// ============================================================
// ROLES
// The LAN version's table, extended to three roles and to what the cloud
// version adds. Kept in step with firestore.rules, which is what actually
// enforces each line.
// ============================================================

function rolesCard() {
  // [Staff, Manager, Webmaster]
  const permissions = [
    ['Log stock in / stock out', true, true, true],
    ['View materials catalog', true, true, true],
    ['Add materials', true, true, true],
    ['Edit / archive materials', false, true, true],
    ['Adjust stock to a counted figure', false, true, true],
    ['See cost and supplier', false, true, true],
    ['View dashboard and reports', false, true, true],
    ['Approve, disable and re-enable accounts', false, true, true],
    ['Demote a manager to staff', false, true, true],
    ['Promote staff to manager', false, false, true],
    ['View and export the audit trail', false, true, true],
  ];

  const mark = (allowed) =>
    allowed
      ? '<span style="color: var(--cb-green);font-weight:700;">&#10003;</span>'
      : '<span class="text-muted">-</span>';

  return `
    <div class="cb-card h-100">
      <div class="cb-card-head">
        <div>
          <h2 class="cb-section-title">Roles and Permissions</h2>
          <p class="cb-section-sub">What each role is allowed to do</p>
        </div>
      </div>
      <div class="cb-card-body is-flush">
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Staff</th>
                <th>Manager</th>
                <th>Webmaster</th>
              </tr>
            </thead>
            <tbody>
              ${permissions
                .map(
                  ([action, staff, manager, webmaster]) => `
                <tr>
                  <td>${esc(action)}</td>
                  <td>${mark(staff)}</td>
                  <td>${mark(manager)}</td>
                  <td>${mark(webmaster)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="cb-help px-3 pb-3 pt-2">
          Nobody can change their own role or status, and nobody can change
          the webmaster's account.
        </div>
      </div>
    </div>`;
}

// ============================================================
// SYSTEM
// ============================================================

function systemCard(materials, low, users) {
  const active = users.filter((u) => u.status === 'active').length;
  const pending = users.filter((u) => u.status === 'pending').length;

  const row = (label, value) => `
    <tr>
      <td class="cb-label" style="width:45%;">${esc(label)}</td>
      <td>${value}</td>
    </tr>`;

  return `
    <div class="cb-card h-100">
      <div class="cb-card-head">
        <div>
          <h2 class="cb-section-title">System</h2>
          <p class="cb-section-sub">Current state of the installation</p>
        </div>
      </div>
      <div class="cb-card-body">
        <table class="cb-table" style="font-size:13px;">
          <tbody>
            ${row('Application', esc(SYSTEM_TITLE))}
            ${row('Version', esc(APP_VERSION))}
            ${row('Materials Tracked', String(materials.length))}
            ${row(
              'Needing Reorder',
              low.length > 0
                ? `<span class="cb-badge is-low">${low.length}</span>`
                : '<span class="cb-badge is-healthy">None</span>'
            )}
            ${row(
              'User Accounts',
              `${active} active of ${users.length}` +
                (pending > 0 ? ` <span class="cb-badge is-low ms-1">${pending} waiting</span>` : '')
            )}
            ${row('Deployment', 'Firebase Hosting (cloud)')}
            ${row('Database', 'Cloud Firestore, Singapore region')}
            ${row('Project', `<code>${esc(firebaseConfig.projectId)}</code>`)}
          </tbody>
        </table>
      </div>
    </div>`;
}
