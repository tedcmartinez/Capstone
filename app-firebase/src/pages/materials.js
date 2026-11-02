// Materials catalog
//
// A port of app/views/materials/index.php, plus create.php and edit.php,
// which are now modals on this one page rather than separate screens.
//
// Cost per unit and supplier are only rendered for a manager. That is the
// capstone's role requirement, and it is real here rather than cosmetic:
// those values live in material_costs, which the security rules will not
// return to production staff at all, so for them the columns have no data
// behind them to hide.

import {
  esc,
  render,
  $,
  $$,
  peso,
  stockStatus,
  stockStatusLabel,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import { categoryLabel } from '../lib/format.js';
import { sortableTh } from '../ui/sort-header.js';
import {
  loadCatalog,
  categoriesOf,
  lowStockOf,
  filterMaterials,
  validateMaterial,
  createMaterial,
  updateMaterial,
  archiveMaterial,
} from '../lib/materials.js';
import { isManager } from '../lib/session.js';
import { allQueryParams, setQuery } from '../lib/router.js';
import { updateAlerts } from '../ui/shell.js';
import {
  stockFormFields,
  wireSteppers,
  wireReceiptPicker,
  wireRequirements,
  fillProjectSuggestions,
  submitStockForm,
} from '../ui/stock-form.js';
import { adjustStock, allowedReasons, reasonLabel } from '../lib/movements.js';
import { QUEUED } from '../lib/sync.js';

// Page state. Held at module level so a redraw after saving keeps the user's
// filters, which is what the query string did in the PHP version.
let catalog = { materials: [], suppliers: [] };
let filters = { keyword: '', category: '', status: '', supplierId: '', sort: 'name', direction: 'asc' };
let message = null;
let container = null;

export async function renderMaterials(target) {
  container = target;

  // Filters come from the URL, so a filtered list stays shareable and
  // survives a refresh, exactly as the GET form did before.
  const params = allQueryParams();
  filters = {
    keyword: params.q || '',
    category: params.category || '',
    status: params.status || '',
    supplierId: params.supplier || '',
    sort: params.sort || 'name',
    direction: params.dir === 'desc' ? 'desc' : 'asc',
  };

  render(container, loadingState());

  try {
    catalog = await loadCatalog();
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Materials Catalog</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  // The bell and the sidebar badge are fed from the catalog this page has
  // already loaded, rather than running the low-stock query a second time.
  updateAlerts(lowStockOf(catalog.materials));

  draw();
}

function loadingState() {
  return `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Materials Catalog</h1>
        <p class="cb-page-sub">Loading the catalog...</p>
      </div>
    </div>`;
}

// ============================================================
// DRAWING
// ============================================================

function draw() {
  const manager = isManager();
  const rows = filterMaterials(catalog.materials, filters);
  const categories = categoriesOf(catalog.materials);
  const hasFilters = Boolean(
    filters.keyword || filters.category || filters.status || filters.supplierId
  );

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Materials Catalog</h1>
        <p class="cb-page-sub">
          ${rows.length} material${rows.length === 1 ? '' : 's'}${hasFilters ? ' matching your filters' : ' in the catalog'}
        </p>
      </div>
      <button type="button" class="cb-btn cb-btn-primary" id="cbAddMaterial">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
        Add Material
      </button>
    </div>

    ${message ? alertHtml(message.kind, message.text) : ''}

    ${filterBar(categories, hasFilters, manager)}

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${rows.length === 0 ? emptyState(hasFilters) : table(rows, manager)}
      </div>
    </div>

    ${materialModal(manager, categories)}
    ${stockModal()}
    ${manager ? adjustModal() : ''}
  `);

  wire();
}

// The search box filters as you type rather than waiting for a submit, which
// is why the whole catalog is loaded up front. The dropdowns apply on change,
// as they did through data-auto-submit in the old app.js.
function filterBar(categories, hasFilters, manager) {
  return `
    <form class="cb-filters mb-3" id="cbFilters">
      <div class="cb-search">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
        <input type="search" name="q" class="cb-input" placeholder="Search materials..."
               value="${esc(filters.keyword)}" autocomplete="off">
      </div>

      <select name="category" class="cb-select">
        <option value="">All Categories</option>
        ${categories
          .map(
            (category) =>
              `<option value="${esc(category)}"${filters.category === category ? ' selected' : ''}>${esc(categoryLabel(category))}</option>`
          )
          .join('')}
      </select>

      <select name="status" class="cb-select">
        <option value="">All Stock Status</option>
        <option value="healthy"${filters.status === 'healthy' ? ' selected' : ''}>Healthy</option>
        <option value="low"${filters.status === 'low' ? ' selected' : ''}>Low Stock</option>
        <option value="out"${filters.status === 'out' ? ' selected' : ''}>Out of Stock</option>
      </select>

      ${
        manager
          ? `<select name="supplier" class="cb-select">
               <option value="">All Suppliers</option>
               ${catalog.suppliers
                 .map(
                   (supplier) =>
                     `<option value="${esc(supplier.id)}"${filters.supplierId === supplier.id ? ' selected' : ''}>${esc(supplier.name)}</option>`
                 )
                 .join('')}
             </select>`
          : ''
      }

      ${hasFilters ? '<button type="button" class="cb-btn cb-btn-outline" id="cbClearFilters">Clear</button>' : ''}
    </form>`;
}

function emptyState(hasFilters) {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
      </div>
      <div class="cb-empty-title">No materials found</div>
      <p class="cb-empty-text">
        ${hasFilters
          ? 'Try changing or clearing the filters above.'
          : 'Add your first material to start tracking inventory.'}
      </p>
    </div>`;
}

// A sortable column header (ui/sort-header.js). Clicking the column
// already in use flips the direction, which is what sortLink() did in the
// PHP view.
function sortHeader(field, label, className = '') {
  return sortableTh({ field, label }, { field: filters.sort, direction: filters.direction }, { className });
}

function table(rows, manager) {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table cb-materials-table">
        <thead>
          <tr>
            ${sortHeader('name', 'Name', 'cb-col-name')}
            ${sortHeader('category', 'Category')}
            <th>Size</th>
            <th>Unit</th>
            ${sortHeader('stock', 'Stock')}
            <th class="cb-num">Min Threshold</th>
            ${manager ? sortHeader('cost', 'Cost / Unit', 'cb-num') : ''}
            ${manager ? sortHeader('supplier', 'Supplier') : ''}
            <th class="cb-num">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((material) => row(material, manager)).join('')}
        </tbody>
      </table>
    </div>`;
}

// Exported for tests/unit/material-actions.test.js, which checks who is
// offered Adjust Stock, Edit and Archive
export function row(material, manager) {
  const stock = Number(material.stockQuantity) || 0;
  const status = stockStatus(stock, material.minThreshold);
  const isEmpty = stock === 0;

  return `
    <tr>
      <td class="cb-col-name"><div class="cb-cell-name">${esc(material.name)}</div></td>
      <td><span class="cb-chip">${esc(categoryLabel(material.category))}</span></td>
      <td class="text-muted">${esc(material.size) || '-'}</td>
      <td class="text-muted">${esc(material.unit)}</td>
      <td>
        <div class="cb-cell-stock">${stock}</div>
        <span class="cb-badge is-${status}">${esc(stockStatusLabel(status))}</span>
      </td>
      <td class="cb-num text-muted">${Number(material.minThreshold) || 0}</td>
      ${manager ? `<td class="cb-num">${esc(peso(material.costPerUnit))}</td>` : ''}
      ${manager ? `<td class="text-muted">${esc(material.supplierName) || '-'}</td>` : ''}
      <td>
        <div class="cb-row-actions">
          <button type="button" class="cb-btn cb-btn-outline cb-btn-sm"
                  data-move="in" data-id="${esc(material.id)}">
            Stock In
          </button>

          <div class="dropdown">
            <button class="cb-dots" type="button" data-bs-toggle="dropdown" aria-label="More actions">
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/></svg>
            </button>
            <div class="dropdown-menu dropdown-menu-end cb-dropdown">
              <button type="button" class="dropdown-item" data-move="in" data-id="${esc(material.id)}">Stock In</button>
              ${
                isEmpty
                  ? `<span class="dropdown-item disabled text-muted" title="No stock available">Stock Out</span>`
                  : `<button type="button" class="dropdown-item" data-move="out" data-id="${esc(material.id)}">Stock Out</button>`
              }
              ${
                manager
                  ? `<div class="dropdown-divider"></div>
                     <button type="button" class="dropdown-item" data-adjust="${esc(material.id)}">
                       Adjust Stock
                     </button>
                     <button type="button" class="dropdown-item" data-edit="${esc(material.id)}">Edit</button>
                     <div class="dropdown-divider"></div>
                     <button type="button" class="dropdown-item is-danger" data-archive="${esc(material.id)}">Archive</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      </td>
    </tr>`;
}

// ============================================================
// THE ADD AND EDIT MODAL
//
// One modal serves both jobs, filled in by the Edit button. The fields match
// create.php and edit.php, including which of them a manager alone may set.
// ============================================================

// Exported for tests/unit/material-actions.test.js, alongside row()
export function materialModal(manager, categories) {
  return `
    <div class="modal fade" id="cbMaterialModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="cbMaterialForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="cbMaterialTitle">Add Material</h5>
                <p class="cb-modal-sub" id="cbMaterialSub">A new item in the catalog</p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body">
              <div id="cbMaterialErrors"></div>

              <div class="cb-field">
                <label class="cb-field-label" for="mName">Material Name</label>
                <input type="text" class="cb-input" id="mName" name="name" required
                       placeholder="e.g. Kiln-Dried Narra Lumber">
              </div>

              <div class="row g-3">
                <div class="col-12 col-sm-6">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mCategory">Category</label>
                    <input type="text" class="cb-input" id="mCategory" name="category" required
                           list="cbCategoryOptions" placeholder="e.g. wood">
                    <datalist id="cbCategoryOptions">
                      ${categories.map((c) => `<option value="${esc(c)}"></option>`).join('')}
                    </datalist>
                  </div>
                </div>
                <div class="col-12 col-sm-6">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mSize">Size <span class="text-muted">(optional)</span></label>
                    <input type="text" class="cb-input" id="mSize" name="size" placeholder="e.g. 2x6x8ft">
                  </div>
                </div>
              </div>

              <div class="row g-3">
                <div class="col-12 col-sm-6">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mUnit">Unit</label>
                    <input type="text" class="cb-input" id="mUnit" name="unit" required
                           placeholder="e.g. pcs, sheet, roll">
                  </div>
                </div>
                <div class="col-12 col-sm-6" id="cbStockField">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mStock">Opening Stock</label>
                    <input type="number" class="cb-input" id="mStock" name="stockQuantity"
                           min="0" step="1" value="0" required>
                    <div class="cb-help">Afterwards the quantity only changes through stock movements.</div>
                  </div>
                </div>
              </div>

              ${
                manager
                  ? `
              <div class="cb-field">
                <label class="cb-field-label" for="mThreshold">Minimum Threshold</label>
                <input type="number" class="cb-input" id="mThreshold" name="minThreshold"
                       min="0" step="1" value="0" required>
                <div class="cb-help">An alert email is sent when stock reaches this level.</div>
              </div>

              <div class="row g-3">
                <div class="col-12 col-sm-6">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mCost">Cost / Unit <span class="text-muted">(optional)</span></label>
                    <input type="number" class="cb-input" id="mCost" name="costPerUnit"
                           min="0" step="0.01" placeholder="e.g. 350.00">
                  </div>
                </div>
                <div class="col-12 col-sm-6">
                  <div class="cb-field">
                    <label class="cb-field-label" for="mSupplier">Supplier <span class="text-muted">(optional)</span></label>
                    <select class="cb-select w-100" id="mSupplier" name="supplierId">
                      <option value="">No supplier</option>
                      ${catalog.suppliers
                        .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
                        .join('')}
                    </select>
                  </div>
                </div>
              </div>`
                  : `
              <div class="cb-help mb-3">
                The minimum threshold, cost per unit and supplier are set by the
                general manager.
              </div>`
              }

              <div class="cb-field mb-0">
                <label class="cb-field-label" for="mNotes">Notes <span class="text-muted">(optional)</span></label>
                <textarea class="cb-textarea" id="mNotes" name="notes" rows="2"
                          placeholder="e.g. Primary wood for cabinet frames"></textarea>
              </div>
            </div>

            <div class="modal-footer">
              ${
                // Editing never changes the stock figure, so the way to
                // correct one is offered right here. Managers only, and
                // hidden while adding, since a new material has no stock
                // to correct yet.
                manager
                  ? `<button type="button" class="cb-btn cb-btn-outline me-auto" id="cbMaterialAdjust" hidden>
                       Adjust Stock
                     </button>`
                  : ''
              }
              <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="cb-btn cb-btn-primary" id="cbMaterialSave">Save Material</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

// ============================================================
// BEHAVIOUR
// ============================================================

// Which material the modal is editing, or null when adding a new one
let editingId = null;

function wire() {
  const form = $('#cbFilters', container);

  // Live search. The list is redrawn from data already in memory, so there
  // is no request per keystroke. The URL is kept in sync without adding a
  // history entry, so the back button is not filled with half-typed words.
  const search = form.querySelector('input[name="q"]');
  search.addEventListener('input', () => {
    filters.keyword = search.value;
    syncUrl();
    redrawTableOnly();
  });

  $$('select', form).forEach((select) => {
    select.addEventListener('change', () => {
      const field = { category: 'category', status: 'status', supplier: 'supplierId' }[select.name];
      filters[field] = select.value;
      syncUrl();
      draw();
    });
  });

  // The form must not actually submit: pressing Enter in the search box
  // would otherwise reload the page and lose the filters.
  form.addEventListener('submit', (event) => event.preventDefault());

  $('#cbClearFilters', container)?.addEventListener('click', () => {
    filters = { ...filters, keyword: '', category: '', status: '', supplierId: '' };
    syncUrl();
    draw();
  });

  wireTable();

  $('#cbAddMaterial', container)?.addEventListener('click', () => openModal(null));
  $('#cbMaterialForm', container)?.addEventListener('submit', save);
  $('#cbMaterialAdjust', container)?.addEventListener('click', adjustFromEdit);
  $('#cbStockForm', container)?.addEventListener('submit', saveStock);
  $('#cbAdjustForm', container)?.addEventListener('submit', saveAdjustment);
}

// Handlers that belong to the table itself. Kept separate because the table
// is also redrawn on its own while the user types in the search box, and the
// replaced elements need their handlers back.
function wireTable() {
  $$('[data-sort]', container).forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.sort;
      if (filters.sort === field) {
        filters.direction = filters.direction === 'asc' ? 'desc' : 'asc';
      } else {
        filters.sort = field;
        filters.direction = 'asc';
      }
      syncUrl();
      draw();
    });
  });

  $$('[data-edit]', container).forEach((button) => {
    button.addEventListener('click', () => openModal(button.dataset.edit));
  });

  $$('[data-archive]', container).forEach((button) => {
    button.addEventListener('click', () => archive(button.dataset.archive));
  });

  $$('[data-move]', container).forEach((button) => {
    button.addEventListener('click', () => openStockModal(button.dataset.move, button.dataset.id));
  });

  $$('[data-adjust]', container).forEach((button) => {
    button.addEventListener('click', () => openAdjustModal(button.dataset.adjust));
  });
}

// Redraws just the table body, so the search box keeps focus and the cursor
// position while the user is still typing.
function redrawTableOnly() {
  const rows = filterMaterials(catalog.materials, filters);
  const manager = isManager();
  const body = $('.cb-card-body', container);
  if (!body) return;

  const hasFilters = Boolean(
    filters.keyword || filters.category || filters.status || filters.supplierId
  );

  body.innerHTML = rows.length === 0 ? emptyState(hasFilters) : table(rows, manager);

  const subtitle = $('.cb-page-sub', container);
  if (subtitle) {
    subtitle.textContent =
      `${rows.length} material${rows.length === 1 ? '' : 's'}` +
      (hasFilters ? ' matching your filters' : ' in the catalog');
  }

  // The table was replaced, so its own handlers are reattached
  wireTable();
}

function syncUrl() {
  setQuery({
    q: filters.keyword,
    category: filters.category,
    status: filters.status,
    supplier: filters.supplierId,
    sort: filters.sort === 'name' ? '' : filters.sort,
    dir: filters.direction === 'asc' ? '' : filters.direction,
  });
}

// ============================================================
// THE MODAL
// ============================================================

function openModal(id) {
  editingId = id;
  const material = id ? catalog.materials.find((m) => m.id === id) : null;

  $('#cbMaterialTitle', container).textContent = material ? 'Edit Material' : 'Add Material';
  $('#cbMaterialSub', container).textContent = material
    ? material.name
    : 'A new item in the catalog';
  $('#cbMaterialErrors', container).innerHTML = '';

  const form = $('#cbMaterialForm', container);
  form.reset();

  // The opening stock is only offered when adding. On an existing material
  // the quantity changes through stock movements alone, which is why
  // Material::update() in the PHP model deliberately left it out.
  const stockField = $('#cbStockField', container);
  stockField.style.display = material ? 'none' : '';
  if (stockField.querySelector('input')) {
    stockField.querySelector('input').required = !material;
  }

  const adjustButton = $('#cbMaterialAdjust', container);
  if (adjustButton) adjustButton.hidden = !material;

  if (material) {
    form.name.value = material.name || '';
    form.category.value = material.category || '';
    form.size.value = material.size || '';
    form.unit.value = material.unit || '';
    form.notes.value = material.notes || '';
    if (form.minThreshold) form.minThreshold.value = Number(material.minThreshold) || 0;
    if (form.costPerUnit) {
      form.costPerUnit.value = material.costPerUnit ?? '';
    }
    if (form.supplierId) form.supplierId.value = material.supplierId || '';
  }

  modalFor('#cbMaterialModal').show();
}

// From the Edit modal to the Adjust modal. The second only opens once the
// first has finished closing: Bootstrap shares one dark backdrop between
// modals, and opening a second while the first is still animating away
// leaves the backdrop behind, greying out the page with nothing on it.
function adjustFromEdit() {
  const id = editingId;
  const editElement = document.querySelector('#cbMaterialModal');

  editElement.addEventListener('hidden.bs.modal', () => openAdjustModal(id), { once: true });
  modalFor('#cbMaterialModal').hide();
}

// Bootstrap's modal, reached through the global it defines. The bundle is
// loaded as a plain script by index.html, the same way the PHP pages did.
function modalFor(selector) {
  const element = document.querySelector(selector);
  return window.bootstrap.Modal.getOrCreateInstance(element);
}

async function save(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('#cbMaterialSave', container);
  const errorBox = $('#cbMaterialErrors', container);

  const input = {
    name: form.name.value,
    category: form.category.value,
    size: form.size.value,
    unit: form.unit.value,
    notes: form.notes.value,
    stockQuantity: form.stockQuantity ? form.stockQuantity.value : '0',
    minThreshold: form.minThreshold ? form.minThreshold.value : '0',
    costPerUnit: form.costPerUnit ? form.costPerUnit.value : '',
    supplierId: form.supplierId ? form.supplierId.value : '',
  };

  // The supplier name is stored alongside the id so a list or an email can
  // show it without reading the suppliers collection as well.
  if (input.supplierId) {
    input.supplierName =
      catalog.suppliers.find((s) => s.id === input.supplierId)?.name || null;
  }

  const errors = validateMaterial(input, { isCreate: !editingId });
  if (errors.length > 0) {
    errorBox.innerHTML = errors.map((error) => alertHtml('danger', error)).join('');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    if (editingId) {
      const existing = catalog.materials.find((m) => m.id === editingId);
      await updateMaterial(editingId, existing, input);
      message = { kind: 'success', text: `${input.name.trim()} has been updated.` };
    } else {
      await createMaterial(input);
      message = { kind: 'success', text: `${input.name.trim()} has been added to the catalog.` };
    }

    modalFor('#cbMaterialModal').hide();
    await renderMaterials(container);
  } catch (error) {
    errorBox.innerHTML = alertHtml('danger', friendlyError(error));
    button.disabled = false;
    button.textContent = 'Save Material';
  }
}

async function archive(id) {
  const material = catalog.materials.find((m) => m.id === id);
  if (!material) return;

  const confirmed = window.confirm(
    `Archive ${material.name}?\n\n` +
      'It will be removed from the catalog but its movement history is kept, ' +
      'so reports and the audit trail stay complete. This can be reversed by ' +
      'the webmaster.'
  );
  if (!confirmed) return;

  try {
    await archiveMaterial(id, material);
    message = { kind: 'success', text: `${material.name} has been archived.` };
    await renderMaterials(container);
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    draw();
  }
}

// ============================================================
// THE STOCK IN / STOCK OUT MODAL
//
// The catalog offers the same form the full pages do, so the user never
// loses their place in the list. This is exactly how the PHP version worked:
// a modal per row posting to the same movements route as the page, which
// kept the validation and the stock arithmetic from drifting apart. Here
// both share ui/stock-form.js for the same reason.
// ============================================================

let movingType = 'in';
let movingMaterial = null;
let movingReceipt = null;

function stockModal() {
  return `
    <div class="modal fade" id="cbStockModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="cbStockForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title" id="cbStockTitle">Stock In</h5>
                <p class="cb-modal-sub" id="cbStockSub"></p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="cbStockBody"></div>
            <div class="modal-footer">
              <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="cb-btn cb-btn-in" id="cbStockSave">Confirm</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function openStockModal(type, materialId) {
  movingType = type;
  movingMaterial = catalog.materials.find((m) => m.id === materialId);
  movingReceipt = null;

  if (!movingMaterial) return;

  const isIn = type === 'in';

  $('#cbStockTitle', container).textContent = isIn ? 'Stock In' : 'Stock Out';
  $('#cbStockSub', container).textContent = movingMaterial.name;

  // The fields are built with the material fixed, so the modal shows the
  // current stock panel instead of a material dropdown.
  const body = $('#cbStockBody', container);
  body.innerHTML = stockFormFields(type, catalog.materials, movingMaterial);

  // Stock-out cannot exceed what is on hand, so the stepper is capped. The
  // rules refuse it as well, but the user should not be able to type a
  // number that is going to be rejected.
  const quantity = body.querySelector('input[name="quantity"]');
  if (!isIn) quantity.max = Number(movingMaterial.stockQuantity) || 0;

  const save = $('#cbStockSave', container);
  save.textContent = isIn ? 'Confirm Stock In' : 'Confirm Stock Out';
  save.className = `cb-btn ${isIn ? 'cb-btn-in' : 'cb-btn-out'}`;
  const form = $('#cbStockForm', container);
  wireSteppers(form);

  // The same requirements as the full page: Confirm waits for the receipt,
  // the project and the notes the reason needs
  const refresh = wireRequirements(form, type, save, () => movingReceipt);
  wireReceiptPicker(form, (ready) => {
    movingReceipt = ready;
    refresh();
  });
  if (!isIn) fillProjectSuggestions(form);

  modalFor('#cbStockModal').show();
}

async function saveStock(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('#cbStockSave', container);
  const errorBox = $('#sfErrors', container);
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = 'Saving...';
  if (errorBox) errorBox.innerHTML = '';

  try {
    const outcome = await submitStockForm({
      form,
      type: movingType,
      materials: catalog.materials,
      receipt: movingReceipt,
      fixedMaterial: movingMaterial,
    });

    if (!outcome.ok) {
      if (errorBox) {
        errorBox.innerHTML = outcome.errors.map((error) => alertHtml('danger', error)).join('');
      }
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    modalFor('#cbStockModal').hide();

    // Both the confirmation and whatever the alert service reported are
    // shown above the catalog, which is reloaded so the new quantity and
    // status badge are correct.
    message = outcome.message;
    const alertMessage = outcome.alertMessage;

    await renderMaterials(container);

    if (alertMessage) {
      const head = $('.cb-page-head', container);
      head?.insertAdjacentHTML('afterend', alertHtml(alertMessage.kind, alertMessage.text));
    }
  } catch (error) {
    if (errorBox) errorBox.innerHTML = alertHtml('danger', friendlyError(error));
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ============================================================
// THE ADJUST STOCK MODAL
//
// Manager and webmaster only. The manager counts the shelf and types what is
// actually there, and the system records the difference as a movement of its
// own rather than quietly overwriting the figure.
//
// This is the honest way to handle a discrepancy. Before it existed, the only
// way to correct a wrong total was a fake stock-in or stock-out, which would
// have put a delivery or a withdrawal in the history that never happened. An
// adjustment says what it is: the count was wrong, here is the real number,
// and here is why.
//
// Unlike a stock-in or stock-out it needs a connection, because it is an
// absolute figure. A count typed offline and synced an hour later would be a
// count of the shelf as it was an hour ago, so the rules refuse it and the
// failed-sync bar explains why.
// ============================================================

let adjustingMaterial = null;

function adjustModal() {
  return `
    <div class="modal fade" id="cbAdjustModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <form id="cbAdjustForm" novalidate>
            <div class="modal-header">
              <div>
                <h5 class="modal-title">Adjust Stock</h5>
                <p class="cb-modal-sub" id="cbAdjustSub"></p>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body">
              <div id="cbAdjustErrors"></div>

              <div class="cb-stock-panel">
                <span class="cb-label">System Says</span>
                <span class="cb-stock-panel-num" id="cbAdjustCurrent"></span>
              </div>

              <div class="cb-field">
                <label class="cb-field-label" for="adjCounted">Actual Counted Quantity</label>
                <input type="number" class="cb-input" id="adjCounted" name="countedQuantity"
                       min="0" step="1" required>
                <div class="cb-help" id="cbAdjustPreview">
                  Type what is actually on the shelf. The difference is recorded
                  as an adjustment in the movement history.
                </div>
              </div>

              <div class="cb-field">
                <label class="cb-field-label" for="adjReason">Reason</label>
                <select class="cb-select w-100" id="adjReason" name="reason" required>
                  <option value="">-- Select a reason --</option>
                </select>
                <div class="cb-help">Required, so the correction can be explained later.</div>
              </div>

              <div class="cb-field mb-0">
                <label class="cb-field-label" for="adjNotes">Notes <span class="text-muted">(optional)</span></label>
                <textarea class="cb-textarea" id="adjNotes" name="notes" rows="2"
                          placeholder="e.g. Two sheets found water damaged behind the rack"></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="cb-btn cb-btn-primary" id="cbAdjustSave">Save Adjustment</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
}

function openAdjustModal(materialId) {
  adjustingMaterial = catalog.materials.find((m) => m.id === materialId);
  if (!adjustingMaterial) return;

  const current = Number(adjustingMaterial.stockQuantity) || 0;

  $('#cbAdjustSub', container).textContent = adjustingMaterial.name;
  $('#cbAdjustErrors', container).innerHTML = '';
  $('#cbAdjustCurrent', container).innerHTML =
    `${current} <span class="text-muted" style="font-size:13px;font-weight:500;">${esc(adjustingMaterial.unit)}</span>`;

  const form = $('#cbAdjustForm', container);
  form.reset();

  // Starts at the current figure, so a manager who opens this by mistake
  // cannot save a zero by pressing the button
  form.countedQuantity.value = current;

  const reasonSelect = $('#adjReason', container);
  reasonSelect.innerHTML =
    '<option value="">-- Select a reason --</option>' +
    allowedReasons('adjust')
      .map((reason) => `<option value="${esc(reason)}">${esc(reasonLabel(reason))}</option>`)
      .join('');

  // Shows the difference as it is typed, so the manager sees the size of the
  // correction before committing to it
  const preview = $('#cbAdjustPreview', container);
  const updatePreview = () => {
    const counted = Number(form.countedQuantity.value);

    if (!Number.isInteger(counted) || counted < 0) {
      preview.textContent = 'Type a whole number, zero or more.';
      return;
    }

    const difference = counted - current;
    if (difference === 0) {
      preview.textContent = 'Same as the system figure, so there is nothing to adjust.';
      return;
    }

    preview.textContent =
      difference > 0
        ? `${difference} ${adjustingMaterial.unit} more than the system shows, recorded as a correction upward.`
        : `${-difference} ${adjustingMaterial.unit} fewer than the system shows, recorded as a correction downward.`;
  };

  form.countedQuantity.addEventListener('input', updatePreview);
  updatePreview();

  modalFor('#cbAdjustModal').show();
}

async function saveAdjustment(event) {
  event.preventDefault();

  const form = event.target;
  const button = $('#cbAdjustSave', container);
  const errorBox = $('#cbAdjustErrors', container);

  button.disabled = true;
  button.textContent = 'Saving...';
  errorBox.innerHTML = '';

  try {
    const result = await adjustStock({
      material: adjustingMaterial,
      countedQuantity: Number(form.countedQuantity.value),
      reason: form.reason.value,
      notes: form.notes.value.trim(),
    });

    modalFor('#cbAdjustModal').hide();

    const direction = result.difference > 0 ? 'up' : 'down';
    const size = Math.abs(result.difference);

    message =
      result.status === QUEUED
        ? {
            kind: 'danger',
            text:
              `The adjustment for ${adjustingMaterial.name} could not be confirmed, ` +
              'because an adjustment needs a connection: it is a count of the shelf ' +
              'right now. Check the connection and count again.',
          }
        : {
            kind: 'success',
            text:
              `${adjustingMaterial.name} corrected ${direction} by ${size} ` +
              `${adjustingMaterial.unit}, now ${result.afterQty} ${adjustingMaterial.unit}.`,
          };

    await renderMaterials(container);
  } catch (error) {
    errorBox.innerHTML = alertHtml('danger', friendlyError(error));
    button.disabled = false;
    button.textContent = 'Save Adjustment';
  }
}
