// Movement history
//
// A port of app/views/movements/index.php, with the filters the brief asked
// for added. The PHP page could only sort; filtering by date, type and
// material was available on the movement report but not here, which meant
// finding one withdrawal from last month involved scrolling.
//
// Both roles may open this page. A movement records quantities and who moved
// them, with no cost or supplier anywhere in it, so there is nothing on it a
// production staff member may not see. The Google Sheets export, which adds
// unit cost and value, is offered to managers only.
//
// Filters: type, category, material, project, keyword and a date range. The
// first three that Firestore can index are applied by the query; category,
// project and keyword are checked in the browser while paging. See READING
// in lib/movements.js for why, and for the cap on how much one page reads.

import {
  esc,
  render,
  $,
  $$,
  shortDate,
  longDateTime,
  alertHtml,
  friendlyError,
  personName,
} from '../lib/dom.js';
import {
  loadMovements,
  loadAllMovements,
  movementMatcher,
  movementTotals,
  sortMovementsInPage,
  reasonLabel,
  movementTypeLabel,
  projectOf,
  loadProjectSuggestions,
  MOVEMENT_EXPORT_CEILING,
} from '../lib/movements.js';
import { loadMaterials, loadCosts, lowStockOf, categoriesOf } from '../lib/materials.js';
import { loadReceipt, formatSize } from '../lib/receipts.js';
import { allQueryParams, setQuery } from '../lib/router.js';
import { isManager } from '../lib/session.js';
import { auditedWrite } from '../lib/audit.js';
import { toCsv } from '../lib/auditTrail.js';
import {
  canExportToSheets,
  exportToSheets,
  downloadCsv,
  SheetsDeclined,
  SheetsNotEnabled,
} from '../lib/sheets.js';
import { movementExportRows, movementExportTitle } from '../lib/movementExport.js';
import { categoryLabel, signedCount, signedNet } from '../lib/format.js';
import { countHeading, describeRange, shopToday } from '../lib/dates.js';
import { updateAlerts } from '../ui/shell.js';
import { dateRangeHtml, wireDateRange } from '../ui/date-range.js';
import { sortableTh } from '../ui/sort-header.js';
import { takeStockMessages } from './stock.js';
import { PAGE_SIZE } from '../lib/config.js';

const NO_FILTERS = {
  type: '',
  category: '',
  materialId: '',
  project: '',
  keyword: '',
  dateFrom: '',
  dateTo: '',
};

let container = null;
let materials = [];
let projects = [];
let page = { movements: [], hasMore: false, lastDoc: null, capped: false };
let filters = { ...NO_FILTERS };
let sort = { field: 'movementDate', direction: 'desc' };
let messages = [];
let notice = null;

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
  notice = null;

  const params = allQueryParams();
  filters = {
    type: ['in', 'out', 'adjust'].includes(params.type) ? params.type : '',
    category: params.category || '',
    materialId: params.material || '',
    project: params.project || '',
    keyword: params.q || '',
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
    // The material list feeds the category and material filters and is
    // small enough to read in full, unlike the movement history itself.
    materials = await loadMaterials();
    updateAlerts(lowStockOf(materials));
    page = await loadMovements(queryFilters());
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Movement History</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  draw();

  // Suggestions for the Project filter. Best effort, after the page is up.
  loadProjectSuggestions()
    .then((list) => {
      projects = list;
      const datalist = $('#mvProjectList', container);
      if (datalist) datalist.innerHTML = projectOptions();
    })
    .catch((error) => console.warn('Could not load project suggestions:', error));
}

// What the query is given: the indexed filters as they are, and the rest
// folded into one browser-side check
function queryFilters() {
  const inCategory = filters.category
    ? new Set(materials.filter((m) => m.category === filters.category).map((m) => m.id))
    : null;

  return {
    type: filters.type,
    materialId: filters.materialId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    // With a material chosen the category adds nothing, so it is left out
    // and the plain indexed query does the work
    match: movementMatcher({
      materialIds: filters.materialId ? null : inCategory,
      project: filters.project,
      keyword: filters.keyword,
    }),
  };
}

function hasFilters() {
  return Object.keys(NO_FILTERS).some((key) => filters[key]);
}

// ============================================================
// DRAWING
// ============================================================

function draw() {
  const rows = sortMovementsInPage(page.movements, sort.field, sort.direction);
  const totals = movementTotals(page.movements);
  const exportable = isManager();

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Movement History</h1>
        <p class="cb-page-sub">${esc(describeCount())}</p>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        ${
          exportable
            ? `<button type="button" class="cb-btn cb-btn-outline" id="mvExportSheets">
                 Export to Google Sheets
               </button>`
            : ''
        }
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
    <div id="mvNotice">${noticeHtml()}</div>

    ${totalsStrip(totals)}

    ${filterBar()}

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${rows.length === 0 ? emptyState() : table(rows)}
      </div>
      ${rows.length === 0 && pageIndex === 0 && !page.hasMore ? '' : pager()}
    </div>

    ${receiptModal()}
  `);

  messages = [];
  wire();
}

// "42 movements from Nov 1 to Nov 2, 2026", with the page when there is
// more than one
function describeCount() {
  const heading = countHeading(page.movements.length, 'movement', filters.dateFrom, filters.dateTo);
  const paged = pageIndex > 0 || page.hasMore ? ` (page ${pageIndex + 1})` : '';
  const filtered = hasFilters() && !filters.dateFrom && !filters.dateTo ? ' matching your filters' : '';
  return `${heading}${filtered}${paged}`;
}

// The figures above the table. They describe the movements currently
// listed, which is what the PHP page's totals did.
function totalsStrip(totals) {
  const adjustedNet = totals.adjustedUp - totals.adjustedDown;

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
          <div class="cb-kpi-value">${signedCount(totals.totalIn, '+')}</div>
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
          <div class="cb-kpi-value">${signedCount(totals.totalOut, '-')}</div>
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
          <div class="cb-kpi-value">${signedNet(adjustedNet)}</div>
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
          <div class="cb-kpi-value">${signedNet(totals.net)}</div>
          <div class="cb-kpi-foot">units overall</div>
        </div>
      </div>
    </div>`;
}

function projectOptions() {
  return projects.map((project) => `<option value="${esc(project)}"></option>`).join('');
}

// Choosing a category narrows the material list to that category
function materialsInFilter() {
  return filters.category ? materials.filter((m) => m.category === filters.category) : materials;
}

function filterBar() {
  return `
    <form class="cb-filters mb-3" id="mvFilters">
      <div class="cb-search">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
        <input type="search" name="q" class="cb-input" value="${esc(filters.keyword)}"
               placeholder="Search material, reason, project, notes" aria-label="Search movements">
      </div>

      <select name="type" class="cb-select" aria-label="Movement type">
        <option value="">All Movements</option>
        <option value="in"${filters.type === 'in' ? ' selected' : ''}>Stock In only</option>
        <option value="out"${filters.type === 'out' ? ' selected' : ''}>Stock Out only</option>
        <option value="adjust"${filters.type === 'adjust' ? ' selected' : ''}>Adjustments only</option>
      </select>

      <select name="category" class="cb-select" aria-label="Category">
        <option value="">All Categories</option>
        ${categoriesOf(materials)
          .map(
            (category) =>
              `<option value="${esc(category)}"${filters.category === category ? ' selected' : ''}>${esc(categoryLabel(category))}</option>`
          )
          .join('')}
      </select>

      <select name="material" class="cb-select" aria-label="Material">
        <option value="">All Materials</option>
        ${materialsInFilter()
          .map(
            (material) =>
              `<option value="${esc(material.id)}"${filters.materialId === material.id ? ' selected' : ''}>${esc(material.name)}</option>`
          )
          .join('')}
      </select>

      <input type="search" name="project" class="cb-input cb-filter-project" value="${esc(filters.project)}"
             list="mvProjectList" placeholder="Project" aria-label="Project" autocomplete="off">
      <datalist id="mvProjectList">${projectOptions()}</datalist>

      ${dateRangeHtml({ from: filters.dateFrom, to: filters.dateTo, idPrefix: 'mv' })}

      ${hasFilters() ? '<button type="button" class="cb-btn cb-btn-outline" id="mvClear">Clear</button>' : ''}
    </form>`;
}

function emptyState() {
  const filtered = hasFilters();
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
      </div>
      <div class="cb-empty-title">${filtered ? 'No movements match these filters' : 'No movements logged yet'}</div>
      <p class="cb-empty-text">
        ${
          page.capped
            ? `None of the ${esc(String(1000))} movements read for this page match. Use Next to keep searching further back, or narrow the dates.`
            : filtered
              ? 'Try widening the date range, or clearing the filters above.'
              : 'Use Stock In or Stock Out to record your first transaction.'
        }
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

function table(rows) {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            ${COLUMNS.map((column) => sortableTh(column, sort, { className: column.numeric ? 'cb-num' : '' })).join('')}
            <th>Project</th>
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

  const project = projectOf(movement);

  // Reason, reference and notes are separate fields. A stock-out saved
  // before the project field existed kept its project in reference, which
  // now shows in the Project column, so it is not repeated here.
  const reference = movement.project || movement.type !== 'out' ? movement.reference : '';
  const details = [
    movement.reason ? reasonLabel(movement.reason) : '',
    reference ? `Ref: ${reference}` : '',
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
      <td>${esc(personName(movement.loggedByName))}</td>
      <td>${project ? esc(project) : '<span class="text-muted">—</span>'}</td>
      <td class="text-muted" style="max-width:260px;">
        ${details.length > 0 ? esc(details.join(' · ')) : '-'}
        ${stockChange(movement)}
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

// The stock figure either side of the movement, as "Stock 4 → 9".
//
// For a stock-in or stock-out these are what the person's screen showed
// when they entered it. The server applies the change as a delta, so an
// entry made offline still lands correctly even if the total moved in the
// meantime, and on such an entry these two figures may not be the totals
// either side of the moment it synced. The tooltip says so.
//
// For an adjustment they are exact, since one is only accepted while the
// counted-from figure is still the server's, so it reads as what it is.
export function stockChange(movement) {
  if (movement.beforeQty === undefined || movement.afterQty === undefined) return '';

  const before = Number(movement.beforeQty);
  const after = Number(movement.afterQty);

  if (movement.type === 'adjust') {
    return `<div class="cb-cell-sub">System said ${before}, counted ${after}</div>`;
  }

  // A movement brought across from the LAN version, whose figures were
  // worked out during the migration, backwards from the stock it held
  if (movement.source === 'lan-migration') {
    return `<div class="cb-cell-sub" title="Worked out from the LAN records during the migration">Stock ${before} &rarr; ${after}</div>`;
  }

  return `<div class="cb-cell-sub" title="As shown on screen when this was entered">Stock ${before} &rarr; ${after}</div>`;
}

function pager() {
  const atStart = pageIndex === 0;

  return `
    <div class="cb-card-foot d-flex justify-content-between align-items-center gap-3">
      <span class="cb-help mb-0">
        ${
          page.capped
            ? 'This page stopped after reading 1,000 movements to stay within the free plan. Next continues the search.'
            : `${PAGE_SIZE} per page. Material, quantity and user reorder the rows on this page; use the filters to search the whole history.`
        }
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
// EXPORT TO GOOGLE SHEETS
//
// Managers and the webmaster only, since the export adds unit cost and
// value. Uses the filters on screen, reads every matching movement rather
// than only this page, and records itself in the audit trail as
// movements.export with the filters and the number of rows.
// ============================================================

function noticeHtml() {
  if (!notice) return '';

  if (notice.kind === 'sheets-done') {
    return `
      <div class="cb-alert is-success">
        <div>
          <strong>${notice.rowCount.toLocaleString('en-PH')} movements exported to Google Sheets.</strong>
          ${notice.truncated ? `<br>The export stopped at ${MOVEMENT_EXPORT_CEILING.toLocaleString('en-PH')} movements. Narrow the dates to export the rest.` : ''}
          <div class="mt-2">
            <a class="cb-btn cb-btn-primary cb-btn-sm" href="${esc(notice.url)}" target="_blank" rel="noopener">
              Open in Sheets
            </a>
          </div>
        </div>
      </div>`;
  }

  if (notice.kind === 'offer-csv') {
    return `
      <div class="cb-alert is-info">
        <div>
          ${esc(notice.text)}
          <div class="mt-2">
            <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="mvOfferCsv">
              Download CSV instead
            </button>
          </div>
        </div>
      </div>`;
  }

  return alertHtml(notice.kind, notice.text);
}

function showNotice(next) {
  notice = next;
  const target = $('#mvNotice', container);
  if (target) target.innerHTML = noticeHtml();
  $('#mvOfferCsv', container)?.addEventListener('click', () => runExport('csv'));
}

// The filters in words, for the audit entry
function describedFilters() {
  const described = {};
  const material = materials.find((m) => m.id === filters.materialId);
  if (filters.type) described.type = movementTypeLabel(filters.type);
  if (filters.category) described.category = categoryLabel(filters.category);
  if (material) described.material = material.name;
  if (filters.project) described.project = filters.project;
  if (filters.keyword) described.keyword = filters.keyword;
  const range = describeRange(filters.dateFrom, filters.dateTo);
  if (range) described.dates = range;
  return described;
}

async function runExport(destination) {
  // No Google sign-in means no Drive to save into, so go straight to the offer
  if (destination === 'sheets' && !canExportToSheets()) {
    showNotice({
      kind: 'offer-csv',
      text:
        'You signed in with an email and password, so there is no Google Drive to save a spreadsheet in. ' +
        'Download the movements as a CSV file instead, or sign in with Google to export to Sheets.',
    });
    return;
  }

  const button = $('#mvExportSheets', container);
  if (button) button.disabled = true;
  showNotice({ kind: 'info', text: 'Reading the movement history...' });

  let result;
  let costs;
  try {
    [result, costs] = await Promise.all([
      loadAllMovements(queryFilters(), {
        onProgress: (count) =>
          showNotice({ kind: 'info', text: `Reading the movement history... ${count.toLocaleString('en-PH')} so far.` }),
      }),
      loadCosts(),
    ]);
  } catch (error) {
    showNotice({ kind: 'danger', text: friendlyError(error) });
    if (button) button.disabled = false;
    return;
  }

  const { movements, truncated } = result;

  if (movements.length === 0) {
    showNotice({ kind: 'info', text: 'There are no movements matching these filters to export.' });
    if (button) button.disabled = false;
    return;
  }

  const sorted = sortMovementsInPage(movements, 'movementDate', 'desc');
  const rows = movementExportRows(sorted, {
    materialsById: new Map(materials.map((m) => [m.id, m])),
    costsById: costs,
  });

  try {
    if (destination === 'sheets') {
      showNotice({ kind: 'info', text: 'Waiting for Google. A window will ask to let the system create the spreadsheet in your Drive.' });
      const sheet = await exportToSheets({
        title: movementExportTitle(filters.dateFrom, filters.dateTo),
        rows,
        tab: 'Movement History',
      });
      await recordExport('Google Sheets', movements.length, truncated, sheet.spreadsheetId);
      showNotice({ kind: 'sheets-done', url: sheet.spreadsheetUrl, rowCount: movements.length, truncated });
    } else {
      downloadCsv(`cornerblock-movements-${shopToday()}.csv`, toCsv(rows));
      await recordExport('CSV download', movements.length, truncated, null);
      showNotice({ kind: 'success', text: `${movements.length.toLocaleString('en-PH')} movements downloaded as a CSV file.` });
    }
  } catch (error) {
    if (error instanceof SheetsDeclined || error instanceof SheetsNotEnabled) {
      showNotice({ kind: 'offer-csv', text: error.message });
    } else {
      showNotice({ kind: 'danger', text: friendlyError(error) });
    }
  }

  if (button) button.disabled = false;
}

async function recordExport(destination, rowCount, truncated, spreadsheetId) {
  const described = describedFilters();

  await auditedWrite([], {
    action: 'movements.export',
    entity: 'stock_movements',
    entityId: spreadsheetId,
    after: {
      destination,
      rowCount,
      filters: Object.keys(described).length > 0 ? described : { scope: 'all movements' },
      ...(spreadsheetId ? { spreadsheetId } : {}),
      ...(truncated ? { truncated: true } : {}),
    },
    summary:
      `Exported ${rowCount.toLocaleString('en-PH')} movement${rowCount === 1 ? '' : 's'} to ${destination}` +
      (Object.keys(described).length > 0 ? ' (filtered)' : ''),
  });
}

// ============================================================
// BEHAVIOUR
// ============================================================

function wire() {
  const form = $('#mvFilters', container);
  form?.addEventListener('submit', (event) => event.preventDefault());

  $$('select', form).forEach((control) => {
    control.addEventListener('change', () => {
      const field = { type: 'type', category: 'category', material: 'materialId' }[control.name];
      filters[field] = control.value;

      // A material outside the newly chosen category no longer applies
      if (field === 'category' && filters.materialId) {
        const material = materials.find((m) => m.id === filters.materialId);
        if (filters.category && material?.category !== filters.category) filters.materialId = '';
      }

      applyFilters();
    });
  });

  // Typing waits for a pause, so a search is not run on every keystroke.
  // A suggestion picked from the project list applies straight away.
  let typingTimer = null;
  ['q', 'project'].forEach((name) => {
    const input = form?.elements[name];
    if (!input) return;
    const field = name === 'q' ? 'keyword' : 'project';

    input.addEventListener('input', () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (filters[field] === input.value.trim()) return;
        filters[field] = input.value.trim();
        applyFilters({ keepFocus: name });
      }, 400);
    });
  });

  wireDateRange(container, ({ from, to }) => {
    filters.dateFrom = from;
    filters.dateTo = to;
    applyFilters();
  });

  $('#mvClear', container)?.addEventListener('click', () => {
    filters = { ...NO_FILTERS };
    applyFilters();
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
      $(`[data-sort="${field}"]`, container)?.focus();
    });
  });

  $('#mvNext', container)?.addEventListener('click', () => goToPage(pageIndex + 1));
  $('#mvPrev', container)?.addEventListener('click', () => goToPage(pageIndex - 1));

  $('#mvExportSheets', container)?.addEventListener('click', () => runExport('sheets'));
  $('#mvOfferCsv', container)?.addEventListener('click', () => runExport('csv'));

  $$('[data-receipt]', container).forEach((button) => {
    button.addEventListener('click', () =>
      showReceipt(button.dataset.receipt, button.dataset.material)
    );
  });
}

async function applyFilters({ keepFocus = null } = {}) {
  notice = null;
  syncUrl();
  await reload();

  // Redrawing replaces the text box being typed in, so the cursor is put back
  if (keepFocus) {
    const input = $(`#mvFilters [name="${keepFocus}"]`, container);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function syncUrl() {
  setQuery({
    type: filters.type,
    category: filters.category,
    material: filters.materialId,
    project: filters.project,
    q: filters.keyword,
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
    page = await loadMovements(queryFilters());
  } catch (error) {
    messages = [{ kind: 'danger', text: friendlyError(error) }];
    page = { movements: [], hasMore: false, lastDoc: null, capped: false };
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
      page = await loadMovements({ ...queryFilters(), cursor: page.lastDoc });
    } else {
      // Moving back: Firestore cannot page backwards, so the page before is
      // fetched from the cursor that was kept on the way forward.
      const cursor = target === 0 ? null : cursors[target - 1];
      page = await loadMovements({ ...queryFilters(), cursor });
    }

    pageIndex = target;
  } catch (error) {
    messages = [{ kind: 'danger', text: friendlyError(error) }];
  }

  draw();
}
