// Reports
//
// A port of the four report views and ReportController. Manager and
// webmaster only, because every one of them exposes cost information, which
// is the reason the PHP controller gated the whole class rather than
// individual actions.
//
// All four are printable. The shop's manager prints the reorder checklist
// and the low stock report to carry to a supplier, so the print rules in
// style.css still apply and the page furniture is marked d-print-none.

import {
  esc,
  render,
  $,
  $$,
  peso,
  pesoShort,
  shortDate,
  todayIso,
  stockStatus,
  stockStatusLabel,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import {
  loadCatalog,
  filterMaterials,
  categoriesOf,
  lowStockOf,
  inventoryValue,
  categoryStats,
} from '../lib/materials.js';
import {
  loadMovementsInRange,
  movementTotals,
  reasonLabel,
  movementTypeLabel,
} from '../lib/movements.js';
import { allQueryParams, setQuery } from '../lib/router.js';
import { updateAlerts } from '../ui/shell.js';

export const renderInventoryReport = (container) => renderReport(container, 'inventory');
export const renderLowStockReport = (container) => renderReport(container, 'lowstock');
export const renderMovementReport = (container) => renderReport(container, 'movement');
export const renderValueReport = (container) => renderReport(container, 'value');

// ============================================================
// THE SHARED FRAME
// ============================================================

const REPORTS = {
  inventory: { route: '/reports', label: 'Inventory Report' },
  lowstock: { route: '/reports/lowstock', label: 'Low Stock Report' },
  movement: { route: '/reports/movement', label: 'Stock Movement Report' },
  value: { route: '/reports/value', label: 'Inventory Value Report' },
};

// The tab strip, ported from reports/_tabs.php
function tabs(current) {
  return `
    <div class="cb-filters mb-3 d-print-none">
      ${Object.entries(REPORTS)
        .map(
          ([key, report]) =>
            `<a href="${report.route}" class="cb-btn ${key === current ? 'cb-btn-primary' : 'cb-btn-outline'}">
               ${esc(report.label)}
             </a>`
        )
        .join('')}
    </div>`;
}

const printIcon =
  '<svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>';

function pageHead(title, subtitle, extraButtons = '') {
  return `
    <div class="cb-page-head d-print-none">
      <div>
        <h1 class="cb-page-title">${esc(title)}</h1>
        <p class="cb-page-sub">${esc(subtitle)}</p>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="cb-btn cb-btn-outline" id="cbPrint">
          ${printIcon}
          Print
        </button>
        ${extraButtons}
      </div>
    </div>

    <!-- Shown only on paper, where the page furniture is hidden -->
    <div class="d-none d-print-block mb-3">
      <h1 class="cb-page-title">${esc(title)}</h1>
      <p class="cb-page-sub">${esc(subtitle)}</p>
    </div>`;
}

// ============================================================
// DISPATCH
// ============================================================

let container = null;
let catalog = { materials: [], suppliers: [] };

async function renderReport(target, which) {
  container = target;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">${esc(REPORTS[which].label)}</h1>
        <p class="cb-page-sub">Loading...</p>
      </div>
    </div>`);

  try {
    catalog = await loadCatalog();
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">${esc(REPORTS[which].label)}</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  updateAlerts(lowStockOf(catalog.materials));

  if (which === 'inventory') drawInventory();
  else if (which === 'lowstock') drawLowStock();
  else if (which === 'value') drawValue();
  else await drawMovement();
}

function wireCommon() {
  $('#cbPrint', container)?.addEventListener('click', () => window.print());
}

const today = () =>
  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ============================================================
// 1. INVENTORY REPORT
// The whole stock position, filtered by category, supplier and status.
// ============================================================

function drawInventory() {
  const params = allQueryParams();
  const filters = {
    category: params.category || '',
    status: params.status || '',
    supplierId: params.supplier || '',
    sort: 'name',
    direction: 'asc',
  };

  const materials = filterMaterials(catalog.materials, filters);

  const totalUnits = materials.reduce((sum, m) => sum + (Number(m.stockQuantity) || 0), 0);
  const totalValue = inventoryValue(materials);

  render(container, `
    ${pageHead('Inventory Report', `Complete stock position as of ${today()}`)}
    ${tabs('inventory')}

    <form class="cb-filters mb-3 d-print-none" id="cbReportFilters">
      <select name="category" class="cb-select">
        <option value="">All Categories</option>
        ${categoriesOf(catalog.materials)
          .map((c) => `<option value="${esc(c)}"${filters.category === c ? ' selected' : ''}>${esc(c)}</option>`)
          .join('')}
      </select>

      <select name="status" class="cb-select">
        <option value="">All Stock Status</option>
        <option value="healthy"${filters.status === 'healthy' ? ' selected' : ''}>Healthy</option>
        <option value="low"${filters.status === 'low' ? ' selected' : ''}>Low Stock</option>
        <option value="out"${filters.status === 'out' ? ' selected' : ''}>Out of Stock</option>
      </select>

      <select name="supplier" class="cb-select">
        <option value="">All Suppliers</option>
        ${catalog.suppliers
          .map((s) => `<option value="${esc(s.id)}"${filters.supplierId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`)
          .join('')}
      </select>
    </form>

    <div class="row g-3 mb-3">
      ${kpi('Materials Listed', String(materials.length), 'in this report')}
      ${kpi('Total Units', totalUnits.toLocaleString('en-PH'), 'across all materials')}
      ${kpi('Total Value', pesoShort(totalValue), 'stock on hand', 'is-value', 'is-money')}
    </div>

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${
          materials.length === 0
            ? emptyReport('No materials match these filters', 'Try clearing a filter above.')
            : `
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Category</th>
                <th>Size</th>
                <th class="cb-num">Stock</th>
                <th class="cb-num">Threshold</th>
                <th>Status</th>
                <th class="cb-num">Cost / Unit</th>
                <th class="cb-num">Total Value</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(inventoryRow).join('')}
            </tbody>
          </table>
        </div>`
        }
      </div>
    </div>
  `);

  wireCommon();
  wireReportFilters(['category', 'status', 'supplier']);
}

function inventoryRow(material) {
  const stock = Number(material.stockQuantity) || 0;
  const status = stockStatus(stock, material.minThreshold);
  const cost = Number(material.costPerUnit) || 0;

  return `
    <tr>
      <td class="cb-cell-name">${esc(material.name)}</td>
      <td><span class="cb-chip">${esc(material.category)}</span></td>
      <td class="text-muted">${esc(material.size) || '-'}</td>
      <td class="cb-num">
        <span class="cb-cell-stock">${stock}</span>
        <span class="text-muted">${esc(material.unit)}</span>
      </td>
      <td class="cb-num text-muted">${Number(material.minThreshold) || 0}</td>
      <td><span class="cb-badge is-${status}">${esc(stockStatusLabel(status))}</span></td>
      <td class="cb-num">${esc(peso(material.costPerUnit))}</td>
      <td class="cb-num">${cost > 0 ? esc(peso(stock * cost)) : '-'}</td>
    </tr>`;
}

// ============================================================
// 2. LOW STOCK REPORT
// Worst first, because out of stock is the urgent case.
// ============================================================

function drawLowStock() {
  const materials = lowStockOf(catalog.materials);
  const outCount = materials.filter((m) => Number(m.stockQuantity) === 0).length;
  const lowCount = materials.length - outCount;

  render(container, `
    ${pageHead(
      'Low Stock Report',
      `Materials needing attention as of ${today()}`,
      '<a href="/checklist" class="cb-btn cb-btn-primary">Send Reorder Checklist</a>'
    )}
    ${tabs('lowstock')}

    <div class="row g-3 mb-3">
      <div class="col-6">
        <div class="cb-kpi is-out">
          <div class="cb-kpi-label mb-2">Out of Stock</div>
          <div class="cb-kpi-value ${outCount > 0 ? 'is-critical' : ''}">${outCount}</div>
          <div class="cb-kpi-foot">cannot be used until restocked</div>
        </div>
      </div>
      <div class="col-6">
        <div class="cb-kpi is-low">
          <div class="cb-kpi-label mb-2">Low Stock</div>
          <div class="cb-kpi-value ${lowCount > 0 ? 'is-warning' : ''}">${lowCount}</div>
          <div class="cb-kpi-foot">running low, reorder soon</div>
        </div>
      </div>
    </div>

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${
          materials.length === 0
            ? emptyReport('Nothing to reorder', 'Every material is above its minimum threshold.')
            : `
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Category</th>
                <th class="cb-num">Current Stock</th>
                <th class="cb-num">Min Threshold</th>
                <th class="cb-num">Shortfall</th>
                <th>Status</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(lowStockRow).join('')}
            </tbody>
          </table>
        </div>`
        }
      </div>
    </div>
  `);

  wireCommon();
}

function lowStockRow(material) {
  const stock = Number(material.stockQuantity) || 0;
  const threshold = Number(material.minThreshold) || 0;
  const status = stockStatus(stock, threshold);

  // How many units short of the threshold this material is
  const shortfall = Math.max(0, threshold - stock);

  return `
    <tr>
      <td class="cb-cell-name">${esc(material.name)}</td>
      <td><span class="cb-chip">${esc(material.category)}</span></td>
      <td class="cb-num">
        <span class="cb-cell-stock">${stock}</span>
        <span class="text-muted">${esc(material.unit)}</span>
      </td>
      <td class="cb-num text-muted">${threshold}</td>
      <td class="cb-num">
        ${
          shortfall > 0
            ? `<strong style="color: var(--cb-red);">-${shortfall}</strong>`
            : '<span class="text-muted">0</span>'
        }
      </td>
      <td><span class="cb-badge is-${status}">${esc(stockStatusLabel(status))}</span></td>
      <td class="text-muted">${esc(material.supplierName) || '-'}</td>
    </tr>`;
}

// ============================================================
// 3. STOCK MOVEMENT REPORT
//
// The one report that reads the movement history rather than the catalog,
// and the only place adjustments appear alongside deliveries and
// withdrawals in a date range.
//
// Unlike the history page this is not paginated. A report is meant to be
// printed whole, so a date range is the thing that keeps it a sensible
// size, and the default is the last thirty days as the PHP version set.
// ============================================================

async function drawMovement() {
  const params = allQueryParams();

  const dateFrom = params.from || defaultFrom();
  const dateTo = params.to || todayIso();
  const type = ['in', 'out', 'adjust'].includes(params.type) ? params.type : '';
  const materialId = params.material || '';

  render(container, `
    ${pageHead('Stock Movement Report', `${shortDate(dateFrom)} to ${shortDate(dateTo)}`)}
    ${tabs('movement')}
    <div class="cb-card"><div class="cb-card-body"><p class="cb-help mb-0">Loading movements...</p></div></div>`);

  let movements;
  try {
    movements = await loadMovementsInRange(dateFrom, dateTo);
  } catch (error) {
    render(container, `
      ${pageHead('Stock Movement Report', `${shortDate(dateFrom)} to ${shortDate(dateTo)}`)}
      ${tabs('movement')}
      ${alertHtml('danger', friendlyError(error))}`);
    wireCommon();
    return;
  }

  // Type and material are filtered here rather than in the query, so that
  // changing either does not cost another read of the same range
  if (type) movements = movements.filter((m) => m.type === type);
  if (materialId) movements = movements.filter((m) => m.materialId === materialId);

  const totals = movementTotals(movements);

  render(container, `
    ${pageHead('Stock Movement Report', `${shortDate(dateFrom)} to ${shortDate(dateTo)}`)}
    ${tabs('movement')}

    <form class="cb-filters mb-3 d-print-none" id="cbReportFilters">
      <input type="date" name="from" class="cb-input" value="${esc(dateFrom)}" aria-label="From date">
      <input type="date" name="to" class="cb-input" value="${esc(dateTo)}" aria-label="To date">

      <select name="type" class="cb-select">
        <option value="">All Movements</option>
        <option value="in"${type === 'in' ? ' selected' : ''}>Stock In Only</option>
        <option value="out"${type === 'out' ? ' selected' : ''}>Stock Out Only</option>
        <option value="adjust"${type === 'adjust' ? ' selected' : ''}>Adjustments Only</option>
      </select>

      <select name="material" class="cb-select">
        <option value="">All Materials</option>
        ${catalog.materials
          .map((m) => `<option value="${esc(m.id)}"${materialId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`)
          .join('')}
      </select>
    </form>

    <div class="row g-3 mb-3">
      ${kpi('Stock In', `+${totals.totalIn.toLocaleString('en-PH')}`, 'units received', 'is-value')}
      ${kpi('Stock Out', `-${totals.totalOut.toLocaleString('en-PH')}`, 'units withdrawn', 'is-out')}
      ${
        totals.adjustmentCount > 0
          ? kpi(
              'Adjustments',
              `${totals.adjustedUp - totals.adjustedDown >= 0 ? '+' : ''}${(totals.adjustedUp - totals.adjustedDown).toLocaleString('en-PH')}`,
              `across ${totals.adjustmentCount} correction${totals.adjustmentCount === 1 ? '' : 's'}`
            )
          : ''
      }
      ${kpi(
        'Net Change',
        `${totals.net >= 0 ? '+' : ''}${totals.net.toLocaleString('en-PH')}`,
        'units overall'
      )}
    </div>

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${
          movements.length === 0
            ? emptyReport(
                'No movements in this range',
                'Try widening the dates, or clearing the type and material filters.'
              )
            : `
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Category</th>
                <th>Movement</th>
                <th class="cb-num">Quantity</th>
                <th>Logged By</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${movements.map(movementRow).join('')}
            </tbody>
          </table>
        </div>`
        }
      </div>
    </div>
  `);

  wireCommon();
  wireReportFilters(['from', 'to', 'type', 'material']);
}

// The last thirty days, which is what ReportController defaulted to
function defaultFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 29);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function movementRow(movement) {
  const isIn = movement.type === 'in';
  const isAdjust = movement.type === 'adjust';
  const quantity = Number(movement.quantity) || 0;
  const difference = Number(movement.difference) || 0;

  const sign = isAdjust ? (difference > 0 ? '+' : '-') : isIn ? '+' : '-';
  const badgeClass = isAdjust ? 'is-adjust' : isIn ? 'is-in' : 'is-out';

  // The category is not stored on a movement, so it is looked up from the
  // catalog. A material archived since the movement was logged will not be
  // found, which is why this falls back rather than assuming.
  const material = catalog.materials.find((m) => m.id === movement.materialId);

  const details = [
    movement.reason ? reasonLabel(movement.reason) : '',
    movement.reference ? (isIn ? `Ref: ${movement.reference}` : `Project: ${movement.reference}`) : '',
    movement.notes || '',
  ].filter(Boolean);

  return `
    <tr>
      <td class="text-muted">${esc(shortDate(movement.movementDate))}</td>
      <td class="cb-cell-name">${esc(movement.materialName)}</td>
      <td>${material ? `<span class="cb-chip">${esc(material.category)}</span>` : '<span class="text-muted">-</span>'}</td>
      <td>
        <span class="cb-move ${badgeClass}">
          ${esc(movementTypeLabel(movement.type))}
          <span class="cb-move-qty">${sign}${quantity}</span>
        </span>
      </td>
      <td class="cb-num">${quantity}</td>
      <td>${esc(movement.loggedByName || '')}</td>
      <td class="text-muted" style="max-width:240px;">
        ${details.length > 0 ? esc(details.join(' · ')) : '-'}
        ${
          isAdjust
            ? `<div class="cb-cell-sub">System said ${Number(movement.beforeQty)}, counted ${Number(movement.afterQty)}</div>`
            : ''
        }
      </td>
    </tr>`;
}

// ============================================================
// 4. INVENTORY VALUE REPORT
// Most valuable first, with each material's share of the total, so the
// manager can see where the money is sitting.
// ============================================================

function drawValue() {
  const total = inventoryValue(catalog.materials);

  // Most valuable first, as Material::getValueReport() ordered it
  const materials = [...catalog.materials]
    .map((material) => ({
      ...material,
      totalValue: (Number(material.stockQuantity) || 0) * (Number(material.costPerUnit) || 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue || a.name.localeCompare(b.name));

  const byCategory = categoryStats(catalog.materials)
    .filter((row) => row.totalValue > 0)
    .sort((a, b) => b.totalValue - a.totalValue);

  // Materials with no cost recorded cannot be valued, and saying so is more
  // use than letting the total quietly understate the stock on hand.
  const unpriced = catalog.materials.filter(
    (m) => !m.costPerUnit && Number(m.stockQuantity) > 0
  ).length;

  render(container, `
    ${pageHead('Inventory Value Report', `Value of stock on hand as of ${today()}`)}
    ${tabs('value')}

    <div class="row g-3 mb-3">
      <div class="col-12 col-lg-6">
        <div class="cb-kpi is-value">
          <div class="cb-kpi-label mb-2">Total Inventory Value</div>
          <div class="cb-kpi-value is-money">${esc(peso(total))}</div>
          <div class="cb-kpi-foot">
            ${
              unpriced > 0
                ? `${unpriced} material${unpriced === 1 ? '' : 's'} with stock but no cost recorded are not counted`
                : 'every material with stock has a cost recorded'
            }
          </div>
        </div>
      </div>
      ${
        byCategory.length > 0
          ? `
      <div class="col-12 col-lg-6">
        <div class="cb-card h-100">
          <div class="cb-card-head">
            <h2 class="cb-section-title">Value by Category</h2>
          </div>
          <div class="cb-card-body">
            ${byCategory
              .map(
                (row) => `
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="cb-chip">${esc(row.category)}</span>
                <span>
                  <strong>${esc(pesoShort(row.totalValue))}</strong>
                  <span class="text-muted" style="font-size:12px;">
                    ${total > 0 ? Math.round((row.totalValue / total) * 100) : 0}%
                  </span>
                </span>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>`
          : ''
      }
    </div>

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${
          materials.length === 0
            ? emptyReport('Nothing to value', 'Add materials with a cost per unit to see their value here.')
            : `
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Category</th>
                <th class="cb-num">Stock</th>
                <th class="cb-num">Cost / Unit</th>
                <th class="cb-num">Total Value</th>
                <th class="cb-num">Share</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map((material) => valueRow(material, total)).join('')}
            </tbody>
          </table>
        </div>`
        }
      </div>
    </div>
  `);

  wireCommon();
}

function valueRow(material, total) {
  const stock = Number(material.stockQuantity) || 0;
  const share = total > 0 ? (material.totalValue / total) * 100 : 0;

  return `
    <tr>
      <td class="cb-cell-name">${esc(material.name)}</td>
      <td><span class="cb-chip">${esc(material.category)}</span></td>
      <td class="cb-num">
        ${stock} <span class="text-muted">${esc(material.unit)}</span>
      </td>
      <td class="cb-num">${esc(peso(material.costPerUnit))}</td>
      <td class="cb-num">${material.totalValue > 0 ? esc(peso(material.totalValue)) : '-'}</td>
      <td class="cb-num text-muted">${material.totalValue > 0 ? `${share.toFixed(1)}%` : '-'}</td>
    </tr>`;
}

// ============================================================
// SHARED PIECES
// ============================================================

function kpi(label, value, foot, cardModifier = '', valueModifier = '') {
  return `
    <div class="col-6 col-lg">
      <div class="cb-kpi ${cardModifier}">
        <div class="cb-kpi-label mb-2">${esc(label)}</div>
        <div class="cb-kpi-value ${valueModifier}">${esc(value)}</div>
        <div class="cb-kpi-foot">${esc(foot)}</div>
      </div>
    </div>`;
}

function emptyReport(title, text) {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
      </div>
      <div class="cb-empty-title">${esc(title)}</div>
      <p class="cb-empty-text">${esc(text)}</p>
    </div>`;
}

// Report filters go into the URL and reload the report, which is how the
// PHP pages worked: a filtered report stays printable and shareable because
// its address describes it.
function wireReportFilters(names) {
  const form = $('#cbReportFilters', container);
  if (!form) return;

  form.addEventListener('submit', (event) => event.preventDefault());

  $$('select, input', form).forEach((control) => {
    control.addEventListener('change', () => {
      const next = {};
      for (const name of names) {
        const field = form.elements[name];
        if (field && field.value) next[name] = field.value;
      }
      // A report rebuilds itself from the address, so it asks for the route
      // to be run again rather than redrawing in place
      setQuery(next, { reload: true });
    });
  });
}
