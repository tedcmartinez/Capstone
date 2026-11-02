// The Reorder Checklist
//
// A port of app/views/checklist/index.php and ChecklistController. Every
// material at or below its threshold, printable, and sendable by email to
// chosen accounts plus one outside address such as a supplier.
//
// Manager and webmaster only, as ChecklistController was. That is also why
// the supplier column is always shown here: the page is never seen by staff.
// If the manager chooses to email the checklist to a staff member, that is
// the manager's decision, and the LAN version allowed it too.
//
// The list is live. A material leaves it on its own once a stock-in takes it
// back above its threshold, because it is worked out from the catalog each
// time rather than stored.

import {
  esc,
  render,
  $,
  $$,
  stockStatus,
  stockStatusLabel,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import { loadCatalog, lowStockOf, categoriesOf } from '../lib/materials.js';
import { categoryLabel } from '../lib/format.js';
import { allQueryParams, setQuery } from '../lib/router.js';
import { alertsConfigured, sendChecklist } from '../lib/alerts.js';
import { auditedWrite } from '../lib/audit.js';
import { updateAlerts } from '../ui/shell.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

let container = null;
let lowStock = [];
let category = '';
let activeUsers = [];
let message = null;

export async function renderChecklist(target) {
  container = target;
  category = allQueryParams().category || '';

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Reorder Checklist</h1>
        <p class="cb-page-sub">Loading...</p>
      </div>
    </div>`);

  try {
    const [catalog, usersSnapshot] = await Promise.all([
      loadCatalog(),
      getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
    ]);

    lowStock = lowStockOf(catalog.materials);
    updateAlerts(lowStock);

    // Only active accounts are offered as recipients, as the PHP page did
    activeUsers = usersSnapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.email)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Reorder Checklist</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  draw();
}

const today = () =>
  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// The category filter narrows the list on screen and on paper. The emailed
// checklist is built by the alert service from every material that needs
// reordering, so it always lists them all; the page says so.
function shownMaterials() {
  return category ? lowStock.filter((m) => m.category === category) : lowStock;
}

function draw() {
  const count = shownMaterials().length;
  const emailReady = alertsConfigured();
  const scope = category ? ` in ${categoryLabel(category)}` : '';

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Reorder Checklist</h1>
        <p class="cb-page-sub">
          ${count} material${count === 1 ? '' : 's'}${esc(scope)} at or below threshold as of ${esc(today())}
        </p>
      </div>
      <div class="d-flex gap-2 d-print-none">
        <button type="button" class="cb-btn cb-btn-outline" id="ckPrint">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
          Print
        </button>
        <button type="button" class="cb-btn cb-btn-primary" id="ckOpenSend"
                ${lowStock.length === 0 || !emailReady ? 'disabled' : ''}
                ${!emailReady ? 'title="Email is not set up yet"' : ''}>
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z"/></svg>
          Send by Email
        </button>
      </div>
    </div>

    <!-- Shown only on paper, where the page furniture is hidden -->
    <div class="d-none d-print-block mb-3">
      <h1 class="cb-page-title">Reorder Checklist</h1>
      <p class="cb-page-sub">${count} material${count === 1 ? '' : 's'}${esc(scope)} as of ${esc(today())}</p>
    </div>

    <form class="cb-filters mb-3 d-print-none" id="ckFilters">
      <select name="category" class="cb-select" aria-label="Category">
        <option value="">All Categories</option>
        ${categoriesOf(lowStock)
          .map(
            (c) =>
              `<option value="${esc(c)}"${category === c ? ' selected' : ''}>${esc(categoryLabel(c))}</option>`
          )
          .join('')}
      </select>
      ${
        category
          ? '<span class="cb-help mb-0">Send by Email always sends the full checklist, every category.</span>'
          : ''
      }
    </form>

    ${message ? `<div class="d-print-none">${alertHtml(message.kind, message.text)}</div>` : ''}

    ${
      !emailReady
        ? `<div class="d-print-none">${alertHtml(
            'info',
            'Emailing the checklist is not set up yet. It can still be printed.'
          )}</div>`
        : ''
    }

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${count === 0 ? emptyState() : table()}
      </div>
    </div>

    ${sendModal()}
  `);

  wire();
}

function emptyState() {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
      </div>
      <div class="cb-empty-title">Nothing to reorder</div>
      <p class="cb-empty-text">
        ${
          category
            ? `Every ${esc(categoryLabel(category))} material is above its minimum threshold.`
            : 'All materials are above their minimum threshold.'
        }
      </p>
    </div>`;
}

function table() {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            <th style="width:40px;" class="d-print-none"></th>
            <th>Material</th>
            <th>Category</th>
            <th class="cb-num">Current Qty</th>
            <th>Unit</th>
            <th class="cb-num">Threshold</th>
            <th>Status</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${shownMaterials().map(row).join('')}
        </tbody>
      </table>
    </div>`;
}

function row(material) {
  const status = stockStatus(material.stockQuantity, material.minThreshold);

  return `
    <tr>
      <!-- A tick box for the manager to mark items off while ordering. A
           working aid only, kept from the PHP page: nothing is saved. -->
      <td class="d-print-none">
        <input type="checkbox" class="form-check-input" aria-label="Mark ${esc(material.name)} as ordered">
      </td>
      <td class="cb-cell-name">${esc(material.name)}</td>
      <td><span class="cb-chip">${esc(categoryLabel(material.category))}</span></td>
      <td class="cb-num"><span class="cb-cell-stock">${Number(material.stockQuantity) || 0}</span></td>
      <td class="text-muted">${esc(material.unit)}</td>
      <td class="cb-num text-muted">${Number(material.minThreshold) || 0}</td>
      <td><span class="cb-badge is-${status}">${esc(stockStatusLabel(status))}</span></td>
      <td class="text-muted">${esc(material.supplierName) || '-'}</td>
    </tr>`;
}

// ============================================================
// SENDING
// ============================================================

function sendModal() {
  return `
    <div class="modal fade" id="ckSendModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="ckSendForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title">Send Reorder Checklist</h5>
                <p class="cb-modal-sub">Emails the current list of materials to reorder</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="ckSendErrors"></div>
              <div class="cb-label mb-2">Send to</div>
              ${
                activeUsers.length === 0
                  ? '<p class="cb-help">There are no active accounts to send to.</p>'
                  : activeUsers
                      .map(
                        (user) => `
              <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" name="recipients"
                       value="${esc(user.id)}" id="ckUser${esc(user.id)}">
                <label class="form-check-label" for="ckUser${esc(user.id)}" style="font-size:13.5px;">
                  ${esc(user.name || user.email)}
                  <span class="text-muted">(${esc(user.email)})</span>
                </label>
              </div>`
                      )
                      .join('')
              }

              <div class="cb-field mt-3 mb-0">
                <label class="cb-field-label" for="ckExtra">Other email <span class="text-muted">(optional)</span></label>
                <input type="email" name="extraEmail" id="ckExtra" class="cb-input" placeholder="someone@example.com">
                <div class="cb-help">One address only, for a supplier or anyone without a system account.</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="cb-btn cb-btn-primary" id="ckSend">Send Checklist</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function wire() {
  $('#ckPrint', container)?.addEventListener('click', () => window.print());

  $('#ckFilters select[name="category"]', container)?.addEventListener('change', (event) => {
    category = event.target.value;
    setQuery({ category });
    draw();
  });

  $('#ckOpenSend', container)?.addEventListener('click', () => {
    $('#ckSendErrors', container).innerHTML = '';
    window.bootstrap.Modal.getOrCreateInstance(document.querySelector('#ckSendModal')).show();
  });

  $('#ckSendForm', container)?.addEventListener('submit', send);
}

async function send(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('#ckSend', container);
  const errors = $('#ckSendErrors', container);

  const recipientUids = $$('input[name="recipients"]:checked', form).map((input) => input.value);
  const extraEmail = form.extraEmail.value.trim();

  // A single address only. A comma or a semicolon means somebody tried to
  // type several, which would otherwise be refused by the script with a
  // less helpful message.
  if (extraEmail && /[,;\s]/.test(extraEmail)) {
    errors.innerHTML = alertHtml('danger', 'Only one other email address can be added.');
    return;
  }
  if (recipientUids.length === 0 && !extraEmail) {
    errors.innerHTML = alertHtml('danger', 'Choose at least one recipient.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending...';
  errors.innerHTML = '';

  const result = await sendChecklist({ recipientUids, extraEmail });

  if (!result.ok) {
    errors.innerHTML = alertHtml('danger', result.detail || friendlyError(result));
    button.disabled = false;
    button.textContent = 'Send Checklist';
    return;
  }

  // Recorded by the app rather than by the script, so the entry carries the
  // manager as its actor, which the audit trail requires
  try {
    await auditedWrite([], {
      action: 'checklist.send',
      entity: 'checklist',
      entityId: null,
      after: {
        recipientCount: recipientUids.length + (extraEmail ? 1 : 0),
        sent: result.sent,
        failed: result.failed,
        materialCount: result.materialCount,
        ...(extraEmail ? { extraEmail } : {}),
      },
      summary:
        `Sent the reorder checklist of ${result.materialCount} material` +
        `${result.materialCount === 1 ? '' : 's'} to ${result.sent} recipient${result.sent === 1 ? '' : 's'}` +
        (result.failed > 0 ? `, ${result.failed} failed` : ''),
    });
  } catch (auditError) {
    // The email has already gone, so this is said rather than treated as a
    // failed send
    console.error('Could not record the checklist send:', auditError);
  }

  window.bootstrap.Modal.getOrCreateInstance(document.querySelector('#ckSendModal')).hide();

  message =
    result.failed > 0
      ? {
          kind: 'warning',
          text:
            `Checklist emailed to ${result.sent} recipient${result.sent === 1 ? '' : 's'}. ` +
            `${result.failed} could not be sent: ${(result.failedAddresses || []).join(', ')}.`,
        }
      : {
          kind: 'success',
          text: `Checklist emailed to ${result.sent} recipient${result.sent === 1 ? '' : 's'}.`,
        };

  draw();
}
