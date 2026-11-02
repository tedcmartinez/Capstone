// Suppliers
//
// A port of app/views/suppliers/index.php: every supplier with how many
// materials they supply and how many of those need reordering, so the
// manager knows who to contact first. Manager only, because supplier and
// cost information is a management concern, and the rules enforce it.
//
// One genuine addition. The LAN version could not add a supplier at all: its
// own empty state read "Suppliers are added directly to the database and
// then linked to materials", which worked while the manager could open
// phpMyAdmin on the office PC. There is no equivalent door into Firestore,
// so adding and editing suppliers had to move into the app itself.

import {
  esc,
  render,
  $,
  $$,
  peso,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import {
  loadCatalog,
  supplierStats,
  lowStockOf,
  createSupplier,
  updateSupplier,
  archiveSupplier,
} from '../lib/materials.js';
import { updateAlerts } from '../ui/shell.js';

let rows = [];
let message = null;
let container = null;
let editingId = null;

export async function renderSuppliers(target) {
  container = target;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Suppliers</h1>
        <p class="cb-page-sub">Loading suppliers...</p>
      </div>
    </div>`);

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Suppliers</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  updateAlerts(lowStockOf(catalog.materials));
  rows = supplierStats(catalog.suppliers, catalog.materials);

  draw();
}

function draw() {
  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Suppliers</h1>
        <p class="cb-page-sub">${rows.length} supplier${rows.length === 1 ? '' : 's'} on record</p>
      </div>
      <div class="d-flex gap-2">
        <a href="/checklist" class="cb-btn cb-btn-outline">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M5 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-2-3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5"/><path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>
          Reorder Checklist
        </a>
        <button type="button" class="cb-btn cb-btn-primary" id="cbAddSupplier">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
          Add Supplier
        </button>
      </div>
    </div>

    ${message ? alertHtml(message.kind, message.text) : ''}

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${rows.length === 0 ? emptyState() : table()}
      </div>
    </div>

    ${supplierModal()}
  `);

  wire();
}

function emptyState() {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h9A1.5 1.5 0 0 1 12 3.5V5h1.02a1.5 1.5 0 0 1 1.17.563l1.481 1.85a1.5 1.5 0 0 1 .329.938V10.5a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 1 1-4 0H6a2 2 0 1 1-3.998-.085A1.5 1.5 0 0 1 0 10.5zm1.5-.5a.5.5 0 0 0-.5.5v7.014l.24-.317A1.99 1.99 0 0 1 4 9.5c.622 0 1.18.284 1.546.729l.24-.229H11V3.5a.5.5 0 0 0-.5-.5zM12 6v3.5h3v-.15a.5.5 0 0 0-.11-.312l-1.48-1.85A.5.5 0 0 0 13.02 6zM4 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/></svg>
      </div>
      <div class="cb-empty-title">No suppliers recorded</div>
      <p class="cb-empty-text">
        Add a supplier here, then link it to a material from the catalog.
      </p>
    </div>`;
}

function table() {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Viber Contact</th>
            <th class="cb-num">Materials</th>
            <th class="cb-num">Stock Value</th>
            <th>Status</th>
            <th>Notes</th>
            <th class="cb-num">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row).join('')}
        </tbody>
      </table>
    </div>`;
}

function row(supplier) {
  return `
    <tr>
      <td class="cb-cell-name">${esc(supplier.name)}</td>
      <td class="text-muted">${esc(supplier.viberContact) || '-'}</td>
      <td class="cb-num">${supplier.itemCount}</td>
      <td class="cb-num">${esc(peso(supplier.totalValue))}</td>
      <td>${statusBadge(supplier)}</td>
      <td class="text-muted" style="max-width:240px;">${esc(supplier.notes) || '-'}</td>
      <td class="cb-num">
        <div class="cb-row-actions">
          <a class="cb-btn cb-btn-outline cb-btn-sm" href="/materials?supplier=${esc(supplier.id)}">
            View Materials
          </a>
          <div class="dropdown">
            <button class="cb-dots" type="button" data-bs-toggle="dropdown" aria-label="More actions">
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/></svg>
            </button>
            <div class="dropdown-menu dropdown-menu-end cb-dropdown">
              <button type="button" class="dropdown-item" data-edit="${esc(supplier.id)}">Edit</button>
              <div class="dropdown-divider"></div>
              <button type="button" class="dropdown-item is-danger" data-archive="${esc(supplier.id)}">Archive</button>
            </div>
          </div>
        </div>
      </td>
    </tr>`;
}

function statusBadge(supplier) {
  if (supplier.itemCount === 0) return '<span class="cb-badge is-neutral">No Materials</span>';
  if (supplier.reorderCount > 0)
    return `<span class="cb-badge is-low">${supplier.reorderCount} To Reorder</span>`;
  return '<span class="cb-badge is-healthy">All Healthy</span>';
}

// ============================================================
// ADD AND EDIT
// ============================================================

function supplierModal() {
  return `
    <div class="modal fade" id="cbSupplierModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="cbSupplierForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="cbSupplierTitle">Add Supplier</h5>
                <p class="cb-modal-sub" id="cbSupplierSub">Contact details for reordering</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body">
              <div id="cbSupplierErrors"></div>

              <div class="cb-field">
                <label class="cb-field-label" for="sName">Supplier Name</label>
                <input type="text" class="cb-input" id="sName" name="name" required
                       placeholder="e.g. Antipolo Hardwood Supply">
              </div>

              <div class="cb-field">
                <label class="cb-field-label" for="sViber">
                  Viber Contact <span class="text-muted">(optional)</span>
                </label>
                <input type="text" class="cb-input" id="sViber" name="viberContact"
                       placeholder="e.g. 09171234567">
                <div class="cb-help">Shown on the reorder checklist so the manager can message them.</div>
              </div>

              <div class="cb-field mb-0">
                <label class="cb-field-label" for="sNotes">Notes <span class="text-muted">(optional)</span></label>
                <textarea class="cb-textarea" id="sNotes" name="notes" rows="2"
                          placeholder="e.g. Main supplier for narra and mahogany lumber"></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="cb-btn cb-btn-primary" id="cbSupplierSave">Save Supplier</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function wire() {
  $('#cbAddSupplier', container)?.addEventListener('click', () => openModal(null));

  $$('[data-edit]', container).forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.edit));
  });

  $$('[data-archive]', container).forEach((button) => {
    button.addEventListener('click', () => archive(button.dataset.archive));
  });

  $('#cbSupplierForm', container)?.addEventListener('submit', save);
}

function openModal(id) {
  editingId = id;
  const supplier = id ? rows.find((s) => s.id === id) : null;

  $('#cbSupplierTitle', container).textContent = supplier ? 'Edit Supplier' : 'Add Supplier';
  $('#cbSupplierSub', container).textContent = supplier
    ? supplier.name
    : 'Contact details for reordering';
  $('#cbSupplierErrors', container).innerHTML = '';

  const form = $('#cbSupplierForm', container);
  form.reset();

  if (supplier) {
    form.name.value = supplier.name || '';
    form.viberContact.value = supplier.viberContact || '';
    form.notes.value = supplier.notes || '';
  }

  window.bootstrap.Modal.getOrCreateInstance(
    document.querySelector('#cbSupplierModal')
  ).show();
}

async function save(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('#cbSupplierSave', container);
  const errorBox = $('#cbSupplierErrors', container);

  const input = {
    name: form.name.value,
    viberContact: form.viberContact.value,
    notes: form.notes.value,
  };

  if (!input.name.trim()) {
    errorBox.innerHTML = alertHtml('danger', 'Supplier name is required.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    if (editingId) {
      await updateSupplier(editingId, rows.find((s) => s.id === editingId), input);
      message = { kind: 'success', text: `${input.name.trim()} has been updated.` };
    } else {
      await createSupplier(input);
      message = { kind: 'success', text: `${input.name.trim()} has been added.` };
    }

    window.bootstrap.Modal.getOrCreateInstance(
      document.querySelector('#cbSupplierModal')
    ).hide();
    await renderSuppliers(container);
  } catch (error) {
    errorBox.innerHTML = alertHtml('danger', friendlyError(error));
    button.disabled = false;
    button.textContent = 'Save Supplier';
  }
}

async function archive(id) {
  const supplier = rows.find((s) => s.id === id);
  if (!supplier) return;

  // A supplier still linked to materials is worth a clearer warning, because
  // archiving it leaves those materials showing a supplier that is no longer
  // on the list.
  const warning =
    supplier.itemCount > 0
      ? `\n\n${supplier.itemCount} material${supplier.itemCount === 1 ? '' : 's'} ` +
        'currently name this supplier. They keep the name on record, but you ' +
        'will want to point them at a different supplier.'
      : '';

  if (!window.confirm(`Archive ${supplier.name}?${warning}`)) return;

  try {
    await archiveSupplier(id, supplier);
    message = { kind: 'success', text: `${supplier.name} has been archived.` };
    await renderSuppliers(container);
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    draw();
  }
}
