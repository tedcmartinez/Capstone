// Movement history
//
// A port of app/views/movements/index.php, with the filters the brief asked
// for added. The PHP page could only sort; filtering by date, type and
// material was available on the movement report but not here, which meant
// finding one withdrawal from last month involved scrolling.
//
// Both roles may open this page. A movement records quantities and who moved
// them, with no cost or supplier anywhere in it, so there is nothing on it a
// production staff member may not see.

import {
  esc,
  render,
  $,
  $$,
  shortDate,
  longDateTime,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import {
  loadMovements,
  movementTotals,
  sortMovementsInPage,
  reasonLabel,
  movementTypeLabel,
} from '../lib/movements.js';
import { loadMaterials, lowStockOf } from '../lib/materials.js';
import { loadReceipt, formatSize } from '../lib/receipts.js';
import { allQueryParams, setQuery } from '../lib/router.js';
import { updateAlerts } from '../ui/shell.js';
import { takeStockMessages } from './stock.js';
import { PAGE_SIZE } from '../lib/config.js';

let container = null;
let materials = [];
let page = { movements: [], hasMore: false, lastDoc: null };
let filters = { type: '', materialId: '', dateFrom: '', dateTo: '' };
let sort = { field: 'movementDate', direction: 'desc' };
let messages = [];

// The cursor of each page already visited, so Previous can go back without
// re-querying from the beginning. Firestore pages forward only, so the
// starting point of every page is remembered as the user moves through.
let cursors = [];
let pageIndex = 0;

export async function renderMovements(target) {
  container = target;

  // A save on the stock pages leaves its confirmation here, which is where
  // the PHP controller redirected to after logging a movement.
  messages = takeStockMessages();

  const params = allQueryParams();
  filters = {
    type: ['in', 'out', 'adjust'].includes(params.type) ? params.type : '',
    materialId: params.material || '',
    dateFrom: params.from || '',
    dateTo: params.to || '',
  };
  sort = {
    field: params.sort || 'movementDate',
    direction: params.dir === 'asc' ? 'asc' : 'desc',
  };

  cursors = [];
  pageIndex = 0;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Movement History</h1>
        <p class="cb-page-sub">Loading movements...</p>
      </div>
    </div>`);

  try {
    // The material list feeds the filter dropdown and is small enough to
    // read in full, unlike the movement history itself.
    materials = await loadMaterials();
    updateAlerts(lowStockOf(materials));
    page = await loadMovements(filters);
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Movement History</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  draw();
}

// ============================================================
// DRAWING
// ============================================================

function draw() {
  const rows = sortMovementsInPage(page.movements, sort.field, sort.direction);
  const totals = movementTotals(page.movements);
  const hasFilters = Boolean(
    filters.type || filters.materialId || filters.dateFrom || filters.dateTo
  );

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Movement History</h1>
        <p class="cb-page-sub">${describeCount(hasFilters)}</p>
      </div>
      <div class="d-flex gap-2">
        <a href="/movements/stockin" class="cb-btn cb-btn-in">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
          Stock In
        </a>
        <a href="/movements/stockout" class="cb-btn cb-btn-out">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
          Stock Out
        </a>
      </div>
    </div>

    ${messages.map((m) => alertHtml(m.kind, m.text)).join('')}

    ${totalsStrip(totals)}

    ${filterBar(hasFilters)}

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${rows.length === 0 ? emptyState(hasFilters) : table(rows)}
      </div>
      ${rows.length === 0 ? '' : pager()}
    </div>

    ${receiptModal()}
  `);

  messages = [];
  wire();
}

function describeCount(hasFilters) {
  const count = page.movements.length;
  const shown = `${count} movement${count === 1 ? '' : 's'}`;

  if (pageIndex > 0 || page.hasMore) {
    return `${shown} on page ${pageIndex + 1}${hasFilters ? ', matching your filters' : ''}`;
  }
  return `${shown}${hasFilters ? ' matching your filters' : ' recorded'}`;
}

// The three figures above the table. They describe the movements currently
// listed, which is what the PHP page's totals did.
function totalsStrip(totals) {
  return `
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-4">
        <div class="cb-kpi is-value">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Total Received</span>
            <span class="cb-kpi-icon">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value">+${totals.totalIn.toLocaleString('en-PH')}</div>
          <div class="cb-kpi-foot">units stocked in</div>
        </div>
      </div>
      <div class="col-6 col-lg-4">
        <div class="cb-kpi is-out">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Total Withdrawn</span>
            <span class="cb-kpi-icon">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value">-${totals.totalOut.toLocaleString('en-PH')}</div>
          <div class="cb-kpi-foot">units stocked out</div>
        </div>
      </div>
      ${
        totals.adjustmentCount > 0
          ? `
      <div class="col-6 col-lg-4">
        <div class="cb-kpi">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Adjustments</span>
            <span class="cb-kpi-icon">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.5a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3V5a.5.5 0 0 1 .5-.5"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value">${totals.adjustedUp - totals.adjustedDown >= 0 ? '+' : ''}${(totals.adjustedUp - totals.adjustedDown).toLocaleString('en-PH')}</div>
          <div class="cb-kpi-foot">
            across ${totals.adjustmentCount} correction${totals.adjustmentCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>`
          : ''
      }
      <div class="col-12 col-lg-4">
        <div class="cb-kpi">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Net Change</span>
            <span class="cb-kpi-icon">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M0 8a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1H.5A.5.5 0 0 1 0 8"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value">${totals.net >= 0 ? '+' : ''}${totals.net.toLocaleString('en-PH')}</div>
          <div class="cb-kpi-foot">units overall</div>
        </div>
      </div>
    </div>`;
}

function filterBar(hasFilters) {
  return `
    <form class="cb-filters mb-3" id="mvFilters">
      <select name="type" class="cb-select">
        <option value="">All Movements</option>
        <option value="in"${filters.type === 'in' ? ' selected' : ''}>Stock In only</option>
        <option value="out"${filters.type === 'out' ? ' selected' : ''}>Stock Out only</option>
        <option value="adjust"${filters.type === 'adjust' ? ' selected' : ''}>Adjustments only</option>
      </select>

      <select name="material" class="cb-select">
        <option value="">All Materials</option>
        ${materials
          .map(
            (material) =>
              `<option value="${esc(material.id)}"${filters.materialId === material.id ? ' selected' : ''}>${esc(material.name)}</option>`
          )
          .join('')}
      </select>

      <input type="date" name="from" class="cb-input" value="${esc(filters.dateFrom)}"
             aria-label="From date" title="From date">
      <input type="date" name="to" class="cb-input" value="${esc(filters.dateTo)}"
             aria-label="To date" title="To date">

      ${hasFilters ? '<button type="button" class="cb-btn cb-btn-outline" id="mvClear">Clear</button>' : ''}
    </form>`;
}

function emptyState(hasFilters) {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
      </div>
      <div class="cb-empty-title">${hasFilters ? 'No movements match these filters' : 'No movements logged yet'}</div>
      <p class="cb-empty-text">
        ${hasFilters
          ? 'Try widening the date range, or clearing the filters above.'
          : 'Use Stock In or Stock Out to record your first transaction.'}
      </p>
    </div>`;
}

// Date is ordered by the server, because that is the field indexed alongside
// the filters. The other columns reorder the rows already on screen, which
// is how the PHP page sorted every column: in memory, with usort().
const COLUMNS = [
  { field: 'materialName', label: 'Material', server: false },
  { field: 'type', label: 'Movement', server: false },
  { field: 'quantity', label: 'Quantity', server: false, numeric: true },
  { field: 'movementDate', label: 'Date', server: true },
  { field: 'loggedByName', label: 'Logged By', server: false },
];

function sortHeader(column) {
  const active = sort.field === column.field;
  const arrow = active
    ? `<span class="cb-sort-arrow">${sort.direction === 'asc' ? '&#9650;' : '&#9660;'}</span>`
    : '';

  return `
    <button type="button" class="cb-sort${active ? ' is-active' : ''}" data-sort="${column.field}">
      ${esc(column.label)}${arrow}
    </button>`;
}

function table(rows) {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            ${COLUMNS.map((column) => `<th class="${column.numeric ? 'cb-num' : ''}">${sortHeader(column)}</th>`).join('')}
            <th>Details</th>
            <th>Receipt</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row).join('')}
        </tbody>
      </table>
    </div>`;
}

function row(movement) {
  const isIn = movement.type === 'in';
  const isAdjust = movement.type === 'adjust';
  const quantity = Number(movement.quantity) || 0;
  const difference = Number(movement.difference) || 0;

  // The sign on the badge. An adjustment can go either way, so it follows
  // the difference rather than the type.
  const sign = isAdjust ? (difference > 0 ? '+' : '-') : isIn ? '+' : '-';
  const badgeClass = isAdjust ? 'is-adjust' : isIn ? 'is-in' : 'is-out';

  // Reason, reference and notes are three separate fields now. The LAN
  // version joined them into the notes column with pipes, so the migration
  // splits the old text back out and this shows them properly.
  const details = [
    movement.reason ? reasonLabel(movement.reason) : '',
    movement.reference ? (isIn ? `Ref: ${movement.reference}` : `Project: ${movement.reference}`) : '',
    movement.notes || '',
  ].filter(Boolean);

  return `
    <tr>
      <td class="cb-cell-name">${esc(movement.materialName)}</td>
      <td>
        <span class="cb-move ${badgeClass}">
          ${esc(movementTypeLabel(movement.type))}
          <span class="cb-move-qty">${sign}${quantity}</span>
        </span>
      </td>
      <td class="cb-num">${quantity}</td>
      <td class="text-muted" title="${esc(longDateTime(movement.createdAt))}">
        ${esc(shortDate(movement.movementDate))}
      </td>
      <td>${esc(movement.loggedByName || '')}</td>
      <td class="text-muted" style="max-width:260px;">
        ${details.length > 0 ? esc(details.join(' · ')) : '-'}
        ${beforeAfterNote(movement)}
      </td>
      <td>
        ${
          movement.receiptId
            ? `<button type="button" class="cb-btn cb-btn-outline cb-btn-sm"
                 data-receipt="${esc(movement.receiptId)}"
                 data-material="${esc(movement.materialName)}">View</button>`
            : '<span class="text-muted">-</span>'
        }
      </td>
    </tr>`;
}

// The before and after figures, described for what they actually are.
//
// For a stock-in or stock-out these are what the person was looking at when
// they typed the entry, not the arithmetic the server performed. The server
// applies the change as a delta, so an entry made while the connection was
// down still applies correctly, and these two numbers may not match the
// running total at the moment it finally landed. Saying "on screen" is the
// honest label: anything else would read as though the system had
// calculated a total it never calculated.
//
// For an adjustment they are exact. An adjustment is only accepted while
// the figure counted from is still the figure on the server, so before and
// after are precisely the totals either side of it.
function beforeAfterNote(movement) {
  if (movement.beforeQty === undefined || movement.afterQty === undefined) return '';

  const before = Number(movement.beforeQty);
  const after = Number(movement.afterQty);

  if (movement.type === 'adjust') {
    return `<div class="cb-cell-sub">System said ${before}, counted ${after}</div>`;
  }

  return `<div class="cb-cell-sub">${before} to ${after} on screen</div>`;
}

function pager() {
  const atStart = pageIndex === 0;

  return `
    <div class="cb-card-foot d-flex justify-content-between align-items-center">
      <span class="cb-help mb-0">
        ${PAGE_SIZE} per page. Material, quantity and user reorder the rows on
        this page; use the filters to search the whole history.
      </span>
      <div class="d-flex gap-2">
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="mvPrev"${atStart ? ' disabled' : ''}>
          Previous
        </button>
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="mvNext"${page.hasMore ? '' : ' disabled'}>
          Next
        </button>
      </div>
    </div>`;
}

// ============================================================
// THE RECEIPT VIEWER
//
// The image is fetched only when View is clicked. A page of 50 movements
// would otherwise pull every receipt's base64 down just to draw a column of
// buttons, which on this plan is both slow and a waste of the read quota.
// ============================================================

function receiptModal() {
  return `
    <div class="modal fade" id="mvReceiptModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title">Receipt</h5>
              <p class="cb-modal-sub" id="mvReceiptSub"></p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body text-center" id="mvReceiptBody">
            <p class="cb-help">Loading the image...</p>
          </div>
        </div>
      </div>
    </div>`;
}

async function showReceipt(receiptId, materialName) {
  const body = $('#mvReceiptBody', container);
  const subtitle = $('#mvReceiptSub', container);

  subtitle.textContent = materialName;
  body.innerHTML = '<p class="cb-help">Loading the image...</p>';

  window.bootstrap.Modal.getOrCreateInstance(document.querySelector('#mvReceiptModal')).show();

  try {
    const receipt = await loadReceipt(receiptId);

    if (!receipt) {
      body.innerHTML = alertHtml('danger', 'That receipt image could not be found.');
      return;
    }

    body.innerHTML = `
      <img src="${receipt.dataUrl}" alt="Receipt for ${esc(materialName)}"
           style="max-width:100%;height:auto;border:1px solid var(--cb-border);border-radius:8px;">
      <p class="cb-help mt-3 mb-0">
        ${formatSize(receipt.sizeBytes)} &middot; uploaded ${esc(longDateTime(receipt.createdAt))}
      </p>`;
  } catch (error) {
    body.innerHTML = alertHtml('danger', friendlyError(error));
  }
}

// ============================================================
// BEHAVIOUR
// ============================================================

function wire() {
  const form = $('#mvFilters', container);
  form?.addEventListener('submit', (event) => event.preventDefault());

  $$('select, input[type="date"]', form).forEach((control) => {
    control.addEventListener('change', () => {
      const field = {
        type: 'type',
        material: 'materialId',
        from: 'dateFrom',
        to: 'dateTo',
      }[control.name];

      filters[field] = control.value;
      syncUrl();
      reload();
    });
  });

  $('#mvClear', container)?.addEventListener('click', () => {
    filters = { type: '', materialId: '', dateFrom: '', dateTo: '' };
    syncUrl();
    reload();
  });

  $$('[data-sort]', container).forEach((button) => {
    button.addEventListener('click', () => {
      const field = button.dataset.sort;
      const column = COLUMNS.find((c) => c.field === field);

      if (sort.field === field) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sort.field = field;
        sort.direction = field === 'movementDate' ? 'desc' : 'asc';
      }

      syncUrl();

      // Date ordering is done by Firestore, so that one needs a fresh query.
      // The rest only reorder what is already here.
      if (column?.server) reload();
      else draw();
    });
  });

  $('#mvNext', container)?.addEventListener('click', () => goToPage(pageIndex + 1));
  $('#mvPrev', container)?.addEventListener('click', () => goToPage(pageIndex - 1));

  $$('[data-receipt]', container).forEach((button) => {
    button.addEventListener('click', () =>
      showReceipt(button.dataset.receipt, button.dataset.material)
    );
  });
}

function syncUrl() {
  setQuery({
    type: filters.type,
    material: filters.materialId,
    from: filters.dateFrom,
    to: filters.dateTo,
    sort: sort.field === 'movementDate' ? '' : sort.field,
    dir: sort.direction === 'desc' ? '' : sort.direction,
  });
}

// Reloads from the first page, used whenever the filters change
async function reload() {
  cursors = [];
  pageIndex = 0;

  try {
    page = await loadMovements({ ...filters });
  } catch (error) {
    messages = [{ kind: 'danger', text: friendlyError(error) }];
  }

  draw();
}

async function goToPage(target) {
  if (target < 0) return;

  try {
    if (target > pageIndex) {
      // Moving forward: remember where this page started so Previous can
      // return to it, then continue after the last row shown.
      cursors[pageIndex] = page.lastDoc;
      page = await loadMovements({ ...filters, cursor: page.lastDoc });
    } else {
      // Moving back: Firestore cannot page backwards, so the page before is
      // fetched from the cursor that was kept on the way forward.
      const cursor = target === 0 ? null : cursors[target - 1];
      page = await loadMovements({ ...filters, cursor });
    }

    pageIndex = target;
  } catch (error) {
    messages = [{ kind: 'danger', text: friendlyError(error) }];
  }

  draw();
}
